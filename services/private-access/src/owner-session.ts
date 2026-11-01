import {createHash,randomBytes} from "node:crypto";
import {ElapsedBudget} from "../../../shared/time/elapsed-budget.js";
import {isPrivateOwnerRequest,parsePrivateOwnerArn} from "../../controller/src/private-owner.js";

// Local implementation only. No deployed handler, SDK, file access or fallback.
export const OWNER_SESSION_LIMITS=Object.freeze({ticketSeconds:60,sessionSeconds:300,requests:64,storeMs:2000});
export const OWNER_SESSION_COOKIE="__Host-gmai-session";
export interface AccessRecord {hash:string;ownerArn:string;origin:string;issuedAt:number;expiresAt:number}
export interface SessionRecord extends AccessRecord {uses:number}
export interface OwnerSessionStore {
  /** Require a new hash and at most one outstanding ticket per owner/origin;
   * do not reuse an existing record or replace a still-valid ticket. */
  createTicket(record:AccessRecord,signal:AbortSignal):Promise<void>;
  /** Atomically consume one unexpired matching ticket and insert one new session.
   * Reject missing/reused/foreign tickets and hash collisions; never overwrite. */
  exchangeTicket(hash:string,ownerArn:string,origin:string,now:number,session:SessionRecord,signal:AbortSignal):Promise<{ticketExpiresAt:number}|null>;
  /** Atomically require unexpired matching session and uses<64, then increment.
   * Return the post-increment record; revoke/expiry must win future admissions. */
  consumeSession(hash:string,ownerArn:string,origin:string,now:number,signal:AbortSignal):Promise<SessionRecord|null>;
  revokeSession(hash:string,ownerArn:string,origin:string,signal:AbortSignal):Promise<void>;
}
export class OwnerSessionDenied extends Error {constructor(){super("OWNER_SESSION_DENIED");}}
const deny=():never=>{throw new OwnerSessionDenied();};
export function privateBrowserOrigin(value:unknown):string {
  if(typeof value!=="string"||value.length>253)return deny();
  let u:URL;try{u=new URL(value)}catch{return deny()}
  if(u.protocol!=="https:"||u.origin!==value||u.port||u.username||u.password||u.search||u.hash||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname)||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname))return deny();
  return value;
}
function opaque(value:unknown):string {
  if(typeof value!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(value)||Buffer.from(value,"base64url").toString("base64url")!==value)return deny();
  return value;
}
export function accessHash(value:unknown):string {return createHash("sha256").update(opaque(value)).digest("hex");}
export function ownerSessionCookie(token:string):string {return `${OWNER_SESSION_COOKIE}=${opaque(token)}; Path=/; Secure; HttpOnly; SameSite=Strict`;}
export const OWNER_SESSION_CLEAR_COOKIE=`${OWNER_SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
export function readOwnerSessionCookie(value:unknown):string {
  if(typeof value!=="string"||value.length>8192||/[\r\n\0]/.test(value))return deny();
  const pairs=value.split(";");if(pairs.length>8)return deny();const seen=new Set<string>();let token:string|undefined;
  for(const pair of pairs){const item=pair.trim(),split=item.indexOf("=");if(split<1)return deny();
    const name=item.slice(0,split),body=item.slice(split+1);
    if(seen.has(name)||!/^[-!#$%&'*+.^_`|~A-Za-z0-9]+$/.test(name)||!body||/[\s,;"\\]/.test(body))return deny();seen.add(name);
    if(name===OWNER_SESSION_COOKIE)token=opaque(body);
    else if(!["CloudFront-Policy","CloudFront-Signature","CloudFront-Key-Pair-Id","CloudFront-Hash-Algorithm"].includes(name))return deny();
  }
  return token??deny();
}
export interface BrowserRequest {origin?:string;fetchSite?:string;method:string;path:string}
function browserRequest(request:BrowserRequest,origin:string,action:"redeem"|"read"|"logout") {
  if(request.fetchSite!=="same-origin"||request.origin!==undefined&&request.origin!==origin)return deny();
  if(action==="read"){
    if(request.method!=="GET"||!/^\/private\/v1\/(assets|health|jobs\/job_[a-f0-9]{48})$/.test(request.path))return deny();
  }else if(request.method!=="POST"||request.path!==`/private/session/${action}`||request.origin!==origin)return deny();
}
/** Ports must implement the atomic semantics above. Expiry is checked in code,
 * never delegated to eventual database TTL deletion. Tokens are bearer secrets;
 * never place them in logs, query strings, localStorage or source artifacts. */
export class OwnerSessionService {
  private readonly owner:string;
  private readonly origin:string;
  private previous=0;
  constructor(private readonly store:OwnerSessionStore,ownerArn:string,clusterArn:string,origin:string,
    private readonly clock:()=>number=()=>Math.floor(Date.now()/1000),private readonly entropy:()=>Buffer=()=>randomBytes(32)){
    this.owner=(()=>{try{return parsePrivateOwnerArn(ownerArn,clusterArn)??deny()}catch{return deny()}})();
    this.origin=privateBrowserOrigin(origin);
  }
  private now(){try{const n=this.clock();if(!Number.isSafeInteger(n)||n<1||n>253402300499||n<this.previous)return deny();this.previous=n;return n;}catch{return deny()}}
  private token(){try{const b=this.entropy();if(!Buffer.isBuffer(b)||b.length!==32)return deny();return b.toString("base64url");}catch{return deny()}}
  private async bounded<T>(op:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    const budget=new ElapsedBudget(OWNER_SESSION_LIMITS.storeMs);
    try{return await budget.call(op)}catch{return deny()}finally{budget.dispose()}
  }
  async issue(event:unknown){
    const e=event as Record<string,unknown>|null;
    if(!isPrivateOwnerRequest(event,this.owner)||e?.routeKey!=="POST /v1/private-session"||e.rawPath!=="/v1/private-session"||
      e.rawQueryString!==undefined&&e.rawQueryString!==""||e.body!==undefined&&e.body!=="")return deny();
    const now=this.now(),ticket=this.token(),record:AccessRecord={hash:accessHash(ticket),ownerArn:this.owner,origin:this.origin,issuedAt:now,expiresAt:now+60};
    await this.bounded(signal=>this.store.createTicket(record,signal));
    if(this.now()>=record.expiresAt)return deny();
    return{ticket,expiresAt:record.expiresAt};
  }
  async redeem(ticket:unknown,request:BrowserRequest){
    browserRequest(request,this.origin,"redeem");const hash=accessHash(ticket),now=this.now(),token=this.token();
    const record:SessionRecord={hash:accessHash(token),ownerArn:this.owner,origin:this.origin,issuedAt:now,expiresAt:now+300,uses:0};
    if(record.hash===hash)return deny();
    const ack=await this.bounded(signal=>this.store.exchangeTicket(hash,this.owner,this.origin,now,record,signal));
    if(!ack||Object.keys(ack).join(",")!=="ticketExpiresAt"||!Number.isSafeInteger(ack.ticketExpiresAt)||
      ack.ticketExpiresAt<=now||ack.ticketExpiresAt>now+60||this.now()>=ack.ticketExpiresAt||this.now()>=record.expiresAt)return deny();
    return{setCookie:ownerSessionCookie(token),expiresAt:record.expiresAt};
  }
  async authorize(cookie:unknown,request:BrowserRequest){
    browserRequest(request,this.origin,"read");const hash=accessHash(readOwnerSessionCookie(cookie)),now=this.now();
    const record=await this.bounded(signal=>this.store.consumeSession(hash,this.owner,this.origin,now,signal));
    if(!record||Object.keys(record).sort().join(",")!=="expiresAt,hash,issuedAt,origin,ownerArn,uses"||record.hash!==hash||record.ownerArn!==this.owner||record.origin!==this.origin||
      !Number.isSafeInteger(record.issuedAt)||record.issuedAt<1||record.issuedAt>now||!Number.isSafeInteger(record.expiresAt)||record.expiresAt-record.issuedAt!==300||
      record.expiresAt<=this.now()||!Number.isSafeInteger(record.uses)||record.uses<1||record.uses>64)return deny();
    return{ownerVerified:true as const,expiresAt:record.expiresAt,remainingRequests:64-record.uses};
  }
  async logout(cookie:unknown,request:BrowserRequest){
    browserRequest(request,this.origin,"logout");const hash=accessHash(readOwnerSessionCookie(cookie));this.now();
    await this.bounded(signal=>this.store.revokeSession(hash,this.owner,this.origin,signal));
    return{setCookie:OWNER_SESSION_CLEAR_COOKIE};
  }
}

import assert from "node:assert/strict";
import {test} from "node:test";
import {randomBytes} from "node:crypto";
import {OwnerSessionService,accessHash,readOwnerSessionCookie,privateBrowserOrigin,ownerSessionCookie,OWNER_SESSION_CLEAR_COOKIE,
  type OwnerSessionStore,type AccessRecord,type SessionRecord,type BrowserRequest} from "../src/owner-session.js";
const account="000000000000",owner=`arn:aws:iam::${account}:user/local-owner`,cluster=`arn:aws:ecs:ap-northeast-1:${account}:cluster/practice`,origin="https://practice.example.com";
const event=()=>({version:"2.0",routeKey:"POST /v1/private-session",rawPath:"/v1/private-session",requestContext:{accountId:account,authorizer:{iam:{accountId:account,userArn:owner}}}});
const read=():BrowserRequest=>({method:"GET",path:"/private/v1/health",fetchSite:"same-origin"});
const redeem=():BrowserRequest=>({method:"POST",path:"/private/session/redeem",origin,fetchSite:"same-origin"});
const logout=():BrowserRequest=>({method:"POST",path:"/private/session/logout",origin,fetchSite:"same-origin"});
function setup(){
  let time=1792910000,calls=0;const tickets=new Map<string,AccessRecord>(),sessions=new Map<string,SessionRecord>();
  const store:OwnerSessionStore={
    async createTicket(r){calls++;if(tickets.has(r.hash)||[...tickets.values()].some(t=>t.ownerArn===r.ownerArn&&t.origin===r.origin&&t.expiresAt>time))throw Error("PRIVATE_SENTINEL");tickets.set(r.hash,{...r});},
    async exchangeTicket(hash,o,site,now,r){calls++;const t=tickets.get(hash);
      if(!t||t.ownerArn!==o||t.origin!==site||t.issuedAt>now||t.expiresAt<=now||t.expiresAt-t.issuedAt!==60||sessions.has(r.hash))return null;
      tickets.delete(hash);sessions.set(r.hash,{...r});return{ticketExpiresAt:t.expiresAt};},
    async consumeSession(hash,o,site,now){calls++;const s=sessions.get(hash);
      if(!s||s.ownerArn!==o||s.origin!==site||s.expiresAt<=now||s.issuedAt>now||s.uses>=64)return null;
      s.uses++;return{...s};},
    async revokeSession(hash,o,site){calls++;const s=sessions.get(hash);if(s?.ownerArn===o&&s.origin===site)sessions.delete(hash);},
  };
  const service=new OwnerSessionService(store,owner,cluster,origin,()=>time);
  const ready=async()=>{const t=await service.issue(event()),r=await service.redeem(t.ticket,redeem());return{ticket:t.ticket,cookie:r.setCookie.split(";")[0]!};};
  return{service,store,tickets,sessions,ready,time:()=>time,advance:(seconds:number)=>{time+=seconds},calls:()=>calls};
}
test("owner ticket is redeemed once, hashes only persist, and logout revokes subsequent admission",async()=>{
  const s=setup(),r=await s.ready();assert.equal(s.tickets.size,0);assert.equal(s.sessions.size,1);
  assert.equal((await s.service.authorize(r.cookie,read())).remainingRequests,63);
  assert.equal(JSON.stringify([...s.sessions.values()]).includes(readOwnerSessionCookie(r.cookie)),false);
  await assert.rejects(()=>s.service.redeem(r.ticket,redeem()),{message:"OWNER_SESSION_DENIED"});
  assert.deepEqual(await s.service.logout(r.cookie,logout()),{setCookie:OWNER_SESSION_CLEAR_COOKIE});
  assert.equal(s.sessions.size,0);await assert.rejects(()=>s.service.authorize(r.cookie,read()),{message:"OWNER_SESSION_DENIED"});
});
test("concurrent redemption has one winner and admission count cannot exceed 64",async()=>{
  const s=setup(),t=await s.service.issue(event());
  const results=await Promise.allSettled(Array.from({length:8},()=>s.service.redeem(t.ticket,redeem())));
  const winners=results.filter((r):r is PromiseFulfilledResult<{setCookie:string;expiresAt:number}>=>r.status==="fulfilled");
  assert.equal(winners.length,1);assert.equal(s.sessions.size,1);
  const cookie=winners[0]!.value.setCookie.split(";")[0]!;
  const admissions=await Promise.allSettled(Array.from({length:80},()=>s.service.authorize(cookie,read())));
  assert.equal(admissions.filter(r=>r.status==="fulfilled").length,64);
});
test("ticket/session expiry is enforced even when database records have not been removed",async()=>{
  const s=setup(),t=await s.service.issue(event());s.advance(60);
  await assert.rejects(()=>s.service.redeem(t.ticket,redeem()),{message:"OWNER_SESSION_DENIED"});assert.equal(s.tickets.size,1);
  const q=setup(),r=await q.ready();q.advance(300);
  await assert.rejects(()=>q.service.authorize(r.cookie,read()),{message:"OWNER_SESSION_DENIED"});assert.equal(q.sessions.size,1);
});
test("forged owner/route/body/query and cross-site requests do not reach persistence",async()=>{
  const s=setup();
  for(const e of [{},null,{...event(),body:"{}"},{...event(),rawQueryString:"token=private"},{...event(),routeKey:"GET /v1/assets"},
    {...event(),rawPath:"/v1/private-session/"},{...event(),requestContext:{accountId:account,authorizer:{iam:{accountId:account,userArn:owner+"other"}}}}])
    await assert.rejects(()=>s.service.issue(e),{message:"OWNER_SESSION_DENIED"});
  assert.equal(s.calls(),0);const token=randomBytes(32).toString("base64url");
  for(const request of [{...redeem(),origin:"https://foreign.example.com"},{...redeem(),fetchSite:"same-site"},{...redeem(),origin:undefined},
    {...redeem(),method:"GET"},{...redeem(),path:"/private/session/redeem?token=x"}] as BrowserRequest[])
    await assert.rejects(()=>s.service.redeem(token,request),{message:"OWNER_SESSION_DENIED"});
  assert.equal(s.calls(),0);
  for(const request of [{...read(),method:"POST",path:"/private/v1/jobs"},{...read(),fetchSite:"cross-site"},{...read(),path:"/private/v1/jobs/../health"},{...read(),path:"/private/v1/health?x=1"}])
    await assert.rejects(()=>s.service.authorize(ownerSessionCookie(token).split(";")[0],request),{message:"OWNER_SESSION_DENIED"});
  assert.equal(s.calls(),0);
});
test("cookie scope rejects ambiguous/foreign headers and never exposes raw input in errors",()=>{
  const token=randomBytes(32).toString("base64url"),cookie=`__Host-gmai-session=${token}`;
  assert.equal(readOwnerSessionCookie(cookie),token);assert.equal(readOwnerSessionCookie(`${cookie}; CloudFront-Key-Pair-Id=test`),token);
  assert.match(ownerSessionCookie(token),/; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  assert.doesNotMatch(ownerSessionCookie(token),/Domain=|Max-Age=|Expires=/);
  for(const value of [null,{},cookie+"; "+cookie,cookie+"\r\nPRIVATE_SENTINEL",cookie+"; foreign=value",cookie+"; CloudFront-Policy=a,b",cookie+"; empty=",cookie.replace(token,"a".repeat(42)),"a".repeat(8193)])
    assert.throws(()=>readOwnerSessionCookie(value),{message:"OWNER_SESSION_DENIED"});
});
test("record drift, foreign owner, extra secrets and future timestamps are rejected",async()=>{
  for(const mutate of [(r:any)=>{r.ownerArn+="other"},(r:any)=>{r.origin="https://foreign.example.com"},(r:any)=>{r.issuedAt+=100;r.expiresAt+=100},
    (r:any)=>{r.expiresAt+=1},(r:any)=>{r.hash="x"},(r:any)=>{r.extra="PRIVATE_SENTINEL"},(r:any)=>{r.uses=-2}]){
    const s=setup(),r=await s.ready();mutate([...s.sessions.values()][0]);
    await assert.rejects(()=>s.service.authorize(r.cookie,read()),{message:"OWNER_SESSION_DENIED"});
  }
});
test("origin/config and local dependency failures are fail-closed and sanitized",async()=>{
  for(const bad of ["http://practice.example.com","https://user:pass@example.com","https://example.com/","https://example.com:444","https://127.0.0.1","https://a.local","https://example.com?x=1",""])
    assert.throws(()=>privateBrowserOrigin(bad),{message:"OWNER_SESSION_DENIED"});
  const s=setup();assert.throws(()=>new OwnerSessionService(s.store,"",cluster,origin),{message:"OWNER_SESSION_DENIED"});
  for(const clock of [()=>NaN,()=>Infinity,()=>Number.MAX_SAFE_INTEGER,()=>{throw Error("PRIVATE_SENTINEL")}]){
    const q=new OwnerSessionService(s.store,owner,cluster,origin,clock);
    await assert.rejects(()=>q.issue(event()),{message:"OWNER_SESSION_DENIED"});
  }
  for(const entropy of [()=>Buffer.alloc(1),()=>{throw Error("PRIVATE_SENTINEL")}]){
    const q=new OwnerSessionService(s.store,owner,cluster,origin,s.time,entropy);
    await assert.rejects(()=>q.issue(event()),{message:"OWNER_SESSION_DENIED"});
  }
  const r=await s.ready();s.advance(-1);await assert.rejects(()=>s.service.authorize(r.cookie,read()),{message:"OWNER_SESSION_DENIED"});
});
test("ambiguous persistence failure never retries, reflects details or returns a session",async()=>{
  const s=setup(),ticket=await s.service.issue(event());let attempts=0;
  s.store.exchangeTicket=async()=>{attempts++;throw Error("PRIVATE_SENTINEL")};
  await assert.rejects(()=>s.service.redeem(ticket.ticket,redeem()),{message:"OWNER_SESSION_DENIED"});assert.equal(attempts,1);
  const q=setup(),r=await q.ready();q.store.revokeSession=async()=>{throw Error("PRIVATE_SENTINEL")};
  await assert.rejects(()=>q.service.logout(r.cookie,logout()),{message:"OWNER_SESSION_DENIED"});assert.equal(q.sessions.size,1);
});
test("slow persistence is bounded and cancellation is not claimed as rollback",async()=>{
  const s=setup();let calls=0,aborted=false;
  s.store.createTicket=async(_r,signal)=>{calls++;signal.addEventListener("abort",()=>{aborted=true});await new Promise(()=>{});};
  await assert.rejects(()=>s.service.issue(event()),{message:"OWNER_SESSION_DENIED"});assert.equal(calls,1);assert.equal(aborted,true);
});
test("redemption acknowledged after ticket expiry cannot return a cookie even if the write committed",async()=>{
  const s=setup(),t=await s.service.issue(event()),exchange=s.store.exchangeTicket.bind(s.store);
  s.store.exchangeTicket=async(...args)=>{const result=await exchange(...args);s.advance(60);return result;};
  await assert.rejects(()=>s.service.redeem(t.ticket,redeem()),{message:"OWNER_SESSION_DENIED"});
  assert.equal(s.sessions.size,1); // No invented rollback; unreturned secret expires independently.
});

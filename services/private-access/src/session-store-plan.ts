import {createHash} from "node:crypto";
import type {AttributeValue,TransactWriteItemsCommandInput,UpdateItemCommandInput,DeleteItemCommandInput,GetItemCommandInput} from "@aws-sdk/client-dynamodb";
import {OwnerSessionDenied,privateBrowserOrigin,type AccessRecord,type SessionRecord} from "./owner-session.js";
import {parsePrivateOwnerArn} from "../../controller/src/private-owner.js";

// Command plans only. No SDK client, credentials, transport, table or IAM changes.
const TABLE="global-market-ai-insight-dev-jobs";
const fail=():never=>{throw new OwnerSessionDenied();};
const hash=(v:unknown):string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v)?v:fail();
const epoch=(v:unknown):number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=253402300499?v:fail();
const key=(kind:"ticket"|"session",digest:string)=>({jobId:{S:`auth_${kind}_${hash(digest)}`}});
const ownerKey=(owner:string,origin:string)=>({jobId:{S:`auth_owner_${createHash("sha256").update(JSON.stringify([owner,origin])).digest("hex")}`}});
function ownerOrigin(owner:string,origin:string){
  const account=/^arn:aws:iam::([0-9]{12}):user\//.exec(owner)?.[1];
  try{if(!account||parsePrivateOwnerArn(owner,`arn:aws:ecs:ap-northeast-1:${account}:cluster/private-practice`)!==owner)fail();
    privateBrowserOrigin(origin);}catch{fail();}
}
function access(r:AccessRecord,lifetime:number){
  if(!r||typeof r!=="object"||Object.keys(r).sort().join(",")!=="expiresAt,hash,issuedAt,origin,ownerArn")fail();
  hash(r.hash);ownerOrigin(r.ownerArn,r.origin);epoch(r.issuedAt);epoch(r.expiresAt);
  if(r.expiresAt-r.issuedAt!==lifetime)fail();
}
function session(r:SessionRecord){
  if(!r||typeof r!=="object"||Object.keys(r).sort().join(",")!=="expiresAt,hash,issuedAt,origin,ownerArn,uses"||r.uses!==0)fail();
  const {uses,...a}=r;access(a,300);
}
function item(r:AccessRecord,kind:"ticket"|"session"):Record<string,AttributeValue>{return{...key(kind,r.hash),
  kind:{S:kind==="ticket"?"AUTH_TICKET":"AUTH_SESSION"},ownerArn:{S:r.ownerArn},origin:{S:r.origin},issuedAt:{N:String(r.issuedAt)},expiresAt:{N:String(r.expiresAt)}};}
const aliases={"#pk":"jobId","#owner":"ownerArn","#origin":"origin","#expires":"expiresAt"};

export function createTicketPlan(r:AccessRecord):TransactWriteItemsCommandInput {
  access(r,60);
  return{TransactItems:[
    {Put:{TableName:TABLE,Item:{...ownerKey(r.ownerArn,r.origin),kind:{S:"AUTH_TICKET_OWNER"},ownerArn:{S:r.ownerArn},origin:{S:r.origin},
      activeHash:{S:r.hash},expiresAt:{N:String(r.expiresAt)}},
      ConditionExpression:"attribute_not_exists(#pk) OR (#kind = :kind AND #owner = :owner AND #origin = :origin AND #expires <= :now)",
      ExpressionAttributeNames:{...aliases,"#kind":"kind"},ExpressionAttributeValues:{":kind":{S:"AUTH_TICKET_OWNER"},":owner":{S:r.ownerArn},":origin":{S:r.origin},":now":{N:String(r.issuedAt)}}}},
    {Put:{TableName:TABLE,Item:item(r,"ticket"),ConditionExpression:"attribute_not_exists(#pk)",ExpressionAttributeNames:{"#pk":"jobId"}}},
  ]};
}
export function readTicketPlan(digest:string):GetItemCommandInput{return{TableName:TABLE,Key:key("ticket",digest),ConsistentRead:true};}

/** Decode a strict consistent-read ticket before exchange; the transaction
 * repeats these exact values so a race cannot substitute a different record. */
export function decodeTicketItem(value:unknown,digest:string,owner:string,origin:string,now:number):AccessRecord {
  hash(digest);ownerOrigin(owner,origin);epoch(now);
  const v=value as Record<string,AttributeValue>|null;
  if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).sort().join(",")!=="expiresAt,issuedAt,jobId,kind,origin,ownerArn")return fail();
  for(const name of ["jobId","kind","origin","ownerArn"])if(Object.keys(v[name]??{}).join(",")!=="S")return fail();
  for(const name of ["issuedAt","expiresAt"])if(Object.keys(v[name]??{}).join(",")!=="N"||!/^[1-9][0-9]{0,11}$/.test(v[name]?.N??""))return fail();
  if(v.jobId?.S!==`auth_ticket_${digest}`||v.kind?.S!=="AUTH_TICKET"||v.ownerArn?.S!==owner||v.origin?.S!==origin)return fail();
  const r={hash:digest,ownerArn:owner,origin,issuedAt:Number(v.issuedAt?.N),expiresAt:Number(v.expiresAt?.N)};
  access(r,60);if(r.issuedAt>now||r.expiresAt<=now)return fail();return r;
}
export function exchangeTicketPlan(ticket:AccessRecord,next:SessionRecord,now:number):TransactWriteItemsCommandInput {
  access(ticket,60);session(next);epoch(now);
  if(ticket.hash===next.hash||ticket.ownerArn!==next.ownerArn||ticket.origin!==next.origin||ticket.issuedAt>now||ticket.expiresAt<=now||next.issuedAt!==now)fail();
  return{TransactItems:[
    {Delete:{TableName:TABLE,Key:key("ticket",ticket.hash),
      ConditionExpression:"#kind = :kind AND #owner = :owner AND #origin = :origin AND #issued = :issued AND #expires = :expires AND #expires > :now",
      ExpressionAttributeNames:{"#kind":"kind","#owner":"ownerArn","#origin":"origin","#issued":"issuedAt","#expires":"expiresAt"},
      ExpressionAttributeValues:{":kind":{S:"AUTH_TICKET"},":owner":{S:ticket.ownerArn},":origin":{S:ticket.origin},":issued":{N:String(ticket.issuedAt)},":expires":{N:String(ticket.expiresAt)},":now":{N:String(now)}}}},
    {Delete:{TableName:TABLE,Key:ownerKey(ticket.ownerArn,ticket.origin),
      ConditionExpression:"#kind = :kind AND #owner = :owner AND #origin = :origin AND #active = :active",
      ExpressionAttributeNames:{"#kind":"kind","#owner":"ownerArn","#origin":"origin","#active":"activeHash"},
      ExpressionAttributeValues:{":kind":{S:"AUTH_TICKET_OWNER"},":owner":{S:ticket.ownerArn},":origin":{S:ticket.origin},":active":{S:ticket.hash}}}},
    {Put:{TableName:TABLE,Item:{...item(next,"session"),uses:{N:"0"}},ConditionExpression:"attribute_not_exists(#pk)",ExpressionAttributeNames:{"#pk":"jobId"}}},
  ]};
}
export function consumeSessionPlan(digest:string,owner:string,origin:string,now:number):UpdateItemCommandInput {
  hash(digest);ownerOrigin(owner,origin);epoch(now);
  return{TableName:TABLE,Key:key("session",digest),UpdateExpression:"SET #uses = #uses + :one",ReturnValues:"ALL_NEW",
    ConditionExpression:"#kind = :kind AND #owner = :owner AND #origin = :origin AND #issued <= :now AND #expires > :now AND #uses >= :zero AND #uses < :limit",
    ExpressionAttributeNames:{"#kind":"kind","#owner":"ownerArn","#origin":"origin","#issued":"issuedAt","#expires":"expiresAt","#uses":"uses"},
    ExpressionAttributeValues:{":kind":{S:"AUTH_SESSION"},":owner":{S:owner},":origin":{S:origin},":now":{N:String(now)},":zero":{N:"0"},":one":{N:"1"},":limit":{N:"64"}}};
}
export function revokeSessionPlan(digest:string,owner:string,origin:string):DeleteItemCommandInput {
  hash(digest);ownerOrigin(owner,origin);
  return{TableName:TABLE,Key:key("session",digest),
    ConditionExpression:"attribute_not_exists(#pk) OR (#kind = :kind AND #owner = :owner AND #origin = :origin)",
    ExpressionAttributeNames:{"#pk":"jobId","#kind":"kind","#owner":"ownerArn","#origin":"origin"},
    ExpressionAttributeValues:{":kind":{S:"AUTH_SESSION"},":owner":{S:owner},":origin":{S:origin}}};
}

export function decodeSessionItem(value:unknown,digest:string,owner:string,origin:string,now:number):SessionRecord {
  hash(digest);ownerOrigin(owner,origin);epoch(now);
  const v=value as Record<string,AttributeValue>|null;
  if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).sort().join(",")!=="expiresAt,issuedAt,jobId,kind,origin,ownerArn,uses")return fail();
  for(const name of ["jobId","kind","origin","ownerArn"])if(Object.keys(v[name]??{}).join(",")!=="S")return fail();
  for(const name of ["issuedAt","expiresAt","uses"])if(Object.keys(v[name]??{}).join(",")!=="N"||!/^[1-9][0-9]{0,11}$/.test(v[name]?.N??""))return fail();
  if(v.jobId?.S!==`auth_session_${digest}`||v.kind?.S!=="AUTH_SESSION"||v.ownerArn?.S!==owner||v.origin?.S!==origin)return fail();
  const r={hash:digest,ownerArn:owner,origin,issuedAt:Number(v.issuedAt?.N),expiresAt:Number(v.expiresAt?.N)};
  access(r,300);const uses=Number(v.uses?.N);if(r.issuedAt>now||r.expiresAt<=now||uses<1||uses>64)return fail();
  return{...r,uses};
}

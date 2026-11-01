import assert from "node:assert/strict";
import {test} from "node:test";
import {GetItemCommand,TransactWriteItemsCommand,UpdateItemCommand,DeleteItemCommand} from "@aws-sdk/client-dynamodb";
import {DynamoOwnerSessionStore,type SessionDynamoSender} from "../src/session-store.js";
import {createTicketPlan,exchangeTicketPlan} from "../src/session-store-plan.js";
const owner="arn:aws:iam::000000000000:user/test-owner",origin="https://practice.example.com",now=1792910000;
const ticket={hash:"a".repeat(64),ownerArn:owner,origin,issuedAt:now,expiresAt:now+60};
const next={hash:"b".repeat(64),ownerArn:owner,origin,issuedAt:now+1,expiresAt:now+301,uses:0};
const signal=()=>new AbortController().signal;
const ticketItem=()=>createTicketPlan(ticket).TransactItems![1]!.Put!.Item!;
const sessionItem=()=>({...exchangeTicketPlan(ticket,next,now+1).TransactItems![2]!.Put!.Item!,uses:{N:"1"}});
test("injected adapter emits bounded atomic plans only, with no credential discovery",async()=>{
  const calls:unknown[]=[];
  const client:SessionDynamoSender={send:async(c,o)=>{calls.push(c);assert.equal(o.abortSignal.aborted,false);
    return c instanceof GetItemCommand?{Item:ticketItem()}:c instanceof UpdateItemCommand?{Attributes:sessionItem()}:{};}};
  const store=new DynamoOwnerSessionStore(client,owner,origin);assert.equal(calls.length,0);
  await store.createTicket(ticket,signal());assert.deepEqual(await store.exchangeTicket(ticket.hash,owner,origin,now+1,next,signal()),{ticketExpiresAt:ticket.expiresAt});
  assert.deepEqual(await store.consumeSession(next.hash,owner,origin,now+2,signal()),{...next,uses:1});
  await store.revokeSession(next.hash,owner,origin,signal());
  assert.deepEqual(calls.map(c=>(c as object).constructor.name),["TransactWriteItemsCommand","GetItemCommand","TransactWriteItemsCommand","UpdateItemCommand","DeleteItemCommand"]);
  assert.equal((calls[2] as TransactWriteItemsCommand).input.TransactItems?.length,3);
});
test("missing ticket, wrong scope or unsafe next record cannot create a session",async()=>{
  let calls=0;const store=new DynamoOwnerSessionStore({send:async()=>{calls++;return{}}},owner,origin);
  assert.equal(await store.exchangeTicket(ticket.hash,owner,origin,now+1,next,signal()),null);assert.equal(calls,1);
  await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner+"other",origin,now+1,next,signal()),{message:"OWNER_SESSION_DENIED"});
  await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner,origin,now+1,{...next,uses:1},signal()),{message:"OWNER_SESSION_DENIED"});
  await assert.rejects(()=>store.revokeSession(next.hash,owner,"https://foreign.example.com",signal()),{message:"OWNER_SESSION_DENIED"});assert.equal(calls,1);
});
test("changed or expired ticket read cannot lead to transaction",async()=>{
  for(const item of [{...ticketItem(),expiresAt:{N:String(now)}},{...ticketItem(),secret:{S:"PRIVATE_SENTINEL"}},{...ticketItem(),ownerArn:{S:owner+"other"}}]){
    let calls=0;const store=new DynamoOwnerSessionStore({send:async()=>{calls++;return{Item:item}}},owner,origin);
    await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner,origin,now+1,next,signal()),{message:"OWNER_SESSION_DENIED"});assert.equal(calls,1);
  }
});
test("ambiguous or conditional transaction failure is never retried or called success",async()=>{
  let writes=0;const store=new DynamoOwnerSessionStore({send:async c=>{if(c instanceof GetItemCommand)return{Item:ticketItem()};writes++;throw Error("PRIVATE_SENTINEL")}},owner,origin);
  await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner,origin,now+1,next,signal()),{message:"OWNER_SESSION_DENIED"});assert.equal(writes,1);
});
test("unexpected session response and failed revocation remain fail-closed",async()=>{
  for(const item of [undefined,{...sessionItem(),uses:{N:"65"}},{...sessionItem(),uses:{N:"1.5"}},{...sessionItem(),expiresAt:{N:String(now)}},{...sessionItem(),hash:{S:"PRIVATE_SENTINEL"}}]){
    const store=new DynamoOwnerSessionStore({send:async()=>({Attributes:item})},owner,origin);
    await assert.rejects(()=>store.consumeSession(next.hash,owner,origin,now+2,signal()),{message:"OWNER_SESSION_DENIED"});
  }
  const failed=new DynamoOwnerSessionStore({send:async()=>{throw Error("PRIVATE_SENTINEL")}},owner,origin);
  await assert.rejects(()=>failed.revokeSession(next.hash,owner,origin,signal()),{message:"OWNER_SESSION_DENIED"});
});
test("pre-aborted read performs no calls and a late ticket read cannot launch a write",async()=>{
  let calls=0,resolveRead:(v:unknown)=>void=()=>{};
  const store=new DynamoOwnerSessionStore({send:async()=>{calls++;return new Promise(resolve=>{resolveRead=resolve})}},owner,origin);
  const stopped=new AbortController();stopped.abort();
  await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner,origin,now+1,next,stopped.signal),{message:"OWNER_SESSION_DENIED"});assert.equal(calls,0);
  await assert.rejects(()=>store.exchangeTicket(ticket.hash,owner,origin,now+1,next,signal()),{message:"OWNER_SESSION_DENIED"});assert.equal(calls,1);
  resolveRead({Item:ticketItem()});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
});

import assert from "node:assert/strict";
import {test} from "node:test";
import {createTicketPlan,readTicketPlan,decodeTicketItem,exchangeTicketPlan,consumeSessionPlan,revokeSessionPlan} from "../src/session-store-plan.js";
const owner="arn:aws:iam::000000000000:user/test-owner",origin="https://practice.example.com",now=1792910000;
const ticket=()=>({hash:"a".repeat(64),ownerArn:owner,origin,issuedAt:now,expiresAt:now+60});
const session=()=>({hash:"b".repeat(64),ownerArn:owner,origin,issuedAt:now+1,expiresAt:now+301,uses:0});
test("ticket issuance is one two-item transaction with no overwrite and bounded owner slot",()=>{
  const p=createTicketPlan(ticket());assert.equal(p.TransactItems?.length,2);
  const [slot,record]=p.TransactItems!;assert.match(slot!.Put!.Item!.jobId!.S!,/^auth_owner_[a-f0-9]{64}$/);
  assert.equal(record!.Put!.Item!.jobId!.S!,`auth_ticket_${"a".repeat(64)}`);
  assert.equal(slot!.Put!.ExpressionAttributeValues![":now"]!.N,String(now));
  assert.match(slot!.Put!.ConditionExpression!,/#expires <= :now/);assert.match(slot!.Put!.ConditionExpression!,/#kind = :kind/);
  assert.equal(record!.Put!.ConditionExpression,"attribute_not_exists(#pk)");
  for(const r of p.TransactItems!){assert.equal(r.Put!.TableName,"global-market-ai-insight-dev-jobs");assert.equal(r.Put!.ReturnValuesOnConditionCheckFailure,undefined)}
  slot!.Put!.ExpressionAttributeNames!["#owner"]="mutated";
  assert.equal(createTicketPlan(ticket()).TransactItems![0]!.Put!.ExpressionAttributeNames!["#owner"],"ownerArn");
});
test("exchange deletes exact ticket and matching owner slot, then inserts unique session atomically",()=>{
  const p=exchangeTicketPlan(ticket(),session(),now+1),items=p.TransactItems!;assert.equal(items.length,3);
  const keys=items.map(x=>(x.Delete?.Key??x.Put?.Item)?.jobId?.S);assert.equal(new Set(keys).size,3);
  assert.match(items[0]!.Delete!.ConditionExpression!,/#issued = :issued AND #expires = :expires AND #expires > :now/);
  assert.equal(items[0]!.Delete!.ExpressionAttributeValues![":expires"]!.N,String(now+60));
  assert.match(items[1]!.Delete!.ConditionExpression!,/#active = :active/);
  assert.equal(items[1]!.Delete!.ExpressionAttributeValues![":active"]!.S,ticket().hash);
  assert.equal(items[2]!.Put!.ConditionExpression,"attribute_not_exists(#pk)");assert.equal(items[2]!.Put!.Item!.uses!.N,"0");
  assert.equal(p.ClientRequestToken,undefined); // Caller must not auto-retry ambiguous writes.
});
test("consistent ticket read and strict decoder reject expiry, type ambiguity and scope drift",()=>{
  const p=readTicketPlan(ticket().hash);assert.equal(p.ConsistentRead,true);assert.equal(p.Key?.jobId?.S,`auth_ticket_${ticket().hash}`);
  const item=createTicketPlan(ticket()).TransactItems![1]!.Put!.Item!;
  assert.deepEqual(decodeTicketItem(item,ticket().hash,owner,origin,now+1),ticket());
  for(const mutate of [(v:any)=>{v.expiresAt.N=String(now)},(v:any)=>{v.expiresAt.N=String(now+600)},(v:any)=>{v.issuedAt.N="01"},
    (v:any)=>{v.ownerArn.S+="other"},(v:any)=>{v.jobId.S="job_other"},(v:any)=>{v.kind.S="AUTH_SESSION"},
    (v:any)=>{v.origin={S:origin,N:"1"}},(v:any)=>{v.extra={S:"PRIVATE_SENTINEL"}}]){
    const v=structuredClone(item);mutate(v);assert.throws(()=>decodeTicketItem(v,ticket().hash,owner,origin,now+1),{message:"OWNER_SESSION_DENIED"});
  }
  assert.throws(()=>decodeTicketItem(item,ticket().hash,owner,origin,now-1),{message:"OWNER_SESSION_DENIED"});
});
test("session admission uses atomic count/expiry conditions and logout cannot delete another owner",()=>{
  const p=consumeSessionPlan(session().hash,owner,origin,now+2);
  assert.equal(p.UpdateExpression,"SET #uses = #uses + :one");assert.equal(p.ReturnValues,"ALL_NEW");
  for(const part of ["#kind = :kind","#owner = :owner","#origin = :origin","#issued <= :now","#expires > :now","#uses >= :zero","#uses < :limit"])assert.ok(p.ConditionExpression!.includes(part));
  assert.equal(p.ExpressionAttributeValues![":limit"]!.N,"64");
  const revoke=revokeSessionPlan(session().hash,owner,origin);assert.equal(revoke.Key?.jobId?.S,`auth_session_${session().hash}`);
  assert.match(revoke.ConditionExpression!,/attribute_not_exists\(#pk\) OR \(#kind = :kind AND #owner = :owner AND #origin = :origin\)/);
});
test("invalid digests, lifetimes and mismatched exchanges cannot produce commands",()=>{
  for(const digest of ["","*","job_id","A".repeat(64),"x".repeat(65)]){
    assert.throws(()=>readTicketPlan(digest),{message:"OWNER_SESSION_DENIED"});
    assert.throws(()=>consumeSessionPlan(digest,owner,origin,now),{message:"OWNER_SESSION_DENIED"});
  }
  for(const mutate of [(v:any)=>{v.expiresAt++},(v:any)=>{v.issuedAt=NaN},(v:any)=>{v.ownerArn="PRIVATE_SENTINEL"},(v:any)=>{v.secret="PRIVATE_SENTINEL"}]){
    const v=ticket();mutate(v);assert.throws(()=>createTicketPlan(v),{message:"OWNER_SESSION_DENIED"});
  }
  for(const mutate of [(v:any)=>{v.ownerArn+="other"},(v:any)=>{v.hash=ticket().hash},(v:any)=>{v.uses=1},(v:any)=>{v.issuedAt++;v.expiresAt++},(v:any)=>{v.origin="https://foreign.example.com"}]){
    const v=session();mutate(v);assert.throws(()=>exchangeTicketPlan(ticket(),v,now+1),{message:"OWNER_SESSION_DENIED"});
  }
  assert.throws(()=>exchangeTicketPlan(ticket(),session(),now+60),{message:"OWNER_SESSION_DENIED"});
});

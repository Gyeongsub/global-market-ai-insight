import assert from "node:assert/strict";
import {test} from "node:test";
import {executeOwnerUpdate,reviewOwnerPostState,stableOwnerStack,type OwnerSnapshot,type OwnerExecutionPorts} from "../private-owner-execution.js";
import {ownerFixture} from "./fixtures/owner-review.js";
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const started=Date.parse("2026-10-25T06:00:00Z"),name=`gmai-owner-${"a".repeat(32)}`,zip="b".repeat(64);
function setup(options:{ambiguous?:boolean;rollback?:boolean;drift?:boolean;neverTerminal?:boolean;readFailure?:boolean}={}){
  const f=ownerFixture(),before:OwnerSnapshot={...f,account:f.identity.Account,fingerprint:"before",core:{compute:{internalJobsEnabled:false},circuit:{verifiedOpen:true,version:11},occupiedSlots:0},refs:{referencesVerified:true,referenceFingerprint:"refs"},otherStacks:["unchanged"]};
  const after=clone(before);after.stack.ChangeSetId=f.draft.ChangeSetId;after.stack.LastUpdatedTime=new Date(started+10000).toISOString();
  if(!options.rollback){after.live=clone(f.proposed);after.runtime.CodeSha256=Buffer.from(zip,"hex").toString("base64");after.runtime.Environment.Variables.PRIVATE_OWNER_USER_ARN=f.identity.Arn;}
  let clock=started+10000,executions=0,uploads=0,reads=0,snapshots=0,sourceChecks=0;const calls:string[]=[];
  const io:OwnerExecutionPorts={now:()=>clock,sleep:async ms=>{clock+=ms},assertSource:()=>{sourceChecks++},upload:()=>{uploads++},
    snapshot:()=>{snapshots++;return snapshots===1?{...before,fingerprint:options.drift?"changed":"before"}:after},
    query:(_service,op,args)=>{calls.push(op);
      if(op==="describe-change-set")return f.draft;
      if(op==="execute-change-set"){executions++;assert.ok(args.includes("--no-disable-rollback"));if(options.ambiguous)throw Error("PRIVATE_SENTINEL");return{};}
      if(op==="describe-stacks"){reads++;if(options.readFailure&&reads===1)throw Error("PRIVATE_SENTINEL");
        return{Stacks:[{...after.stack,StackStatus:options.neverTerminal?"UPDATE_IN_PROGRESS":options.rollback?"UPDATE_ROLLBACK_COMPLETE":"UPDATE_COMPLETE"}]};}
      throw Error("unexpected operation");}};
  return{before,after,f,io,counts:()=>({executions,uploads,reads,snapshots,sourceChecks,calls})};
}
test("one owner rollout verifies terminal stack and runtime without launching work",async()=>{
  const s=setup(),p=await executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip);
  assert.equal(p.outcome,"updated");assert.equal(p.liveOwnerAcceptanceVerified,false);assert.equal(p.workloadCalls,0);
  assert.equal(s.counts().executions,1);assert.equal(s.counts().uploads,1);assert.equal(s.counts().sourceChecks,3);
  assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);
});
test("ambiguous execution acknowledgment is not repeated and a transient read is reconciled",async()=>{
  const s=setup({ambiguous:true,readFailure:true});const p=await executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip);
  assert.equal(p.executionAcknowledgementAmbiguous,true);assert.equal(p.outcome,"updated");assert.equal(s.counts().executions,1);assert.equal(s.counts().reads,2);
});
test("rollback verifies original bytes/configuration and never reports deployed owner acceptance",async()=>{
  const s=setup({rollback:true}),p=await executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip);
  assert.equal(p.outcome,"rolled-back");assert.equal(p.terminalStateIndependentlyVerified,true);assert.equal(p.liveOwnerAcceptanceVerified,false);
});
test("fresh baseline drift prevents execution even after the one bounded asset upload",async()=>{
  const s=setup({drift:true});await assert.rejects(()=>executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip),/PRE_EXECUTION_DRIFT/);
  assert.equal(s.counts().executions,0);
});
test("unresolved execution has bounded polling, no mutation retry and no success claim",async()=>{
  const s=setup({neverTerminal:true});await assert.rejects(()=>executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip),/RECONCILIATION_UNVERIFIED/);
  assert.equal(s.counts().executions,1);assert.equal(s.counts().reads,60);
});
test("post-check rejects circuit, unrelated stack, code, identity and runtime drift",()=>{
  for(const mutate of [(s:any)=>{s.after.core.circuit.version++},(s:any)=>{s.after.otherStacks.push("new")},(s:any)=>{s.after.runtime.Role+="foreign"},
    (s:any)=>{s.after.identity.Arn+="foreign"},(s:any)=>{s.after.live.Resources.Other0.Properties.Marker++},(s:any)=>{s.after.core.occupiedSlots=1}]){
    const s=setup();mutate(s);assert.throws(()=>reviewOwnerPostState(s.before,s.after,s.f.proposed,zip),/^Error: PRIVATE_OWNER_/);
  }
});
test("operation history may change while every stack configuration field remains strict",async()=>{
  const s=setup();
  s.before.stack.LastOperations=[{OperationId:"old-operation",OperationType:"UPDATE_STACK"}];
  s.after.stack.LastOperations=[{OperationId:"new-operation",OperationType:"UPDATE_STACK"}];
  assert.equal((await executeOwnerUpdate(s.io,s.before,s.f.proposed,s.f.draft,name,started,zip)).outcome,"updated");
  for(const field of ["DeploymentConfig","DisableRollback","EnableTerminationProtection","RoleARN","Tags","Outputs","Parameters","UnknownFutureField"]){
    const v=clone(s.after.stack);v[field]={changed:true};
    assert.notDeepEqual(stableOwnerStack(s.before.stack),stableOwnerStack(v));
  }
  for(const bad of [null,{},[{OperationId:"private/sentinel",OperationType:"UPDATE_STACK"}],[{OperationId:"id",OperationType:"UNKNOWN"}],[{OperationId:"id",OperationType:"UPDATE_STACK",Extra:true}]]){
    assert.throws(()=>stableOwnerStack({...s.after.stack,LastOperations:bad}),/OPERATION_METADATA_INVALID/);
  }
});

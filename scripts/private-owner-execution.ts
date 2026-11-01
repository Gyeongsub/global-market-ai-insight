import { OWNER_STACK, OWNER_REGION, ownerDigest, reviewOwnerDraft, reviewOwnerRuntime } from "./private-owner-review.js";
import { stableControllerStack } from "./controller-policy-review.js";

type Json = Record<string, any>;
export interface OwnerSnapshot {identity:Json;runtime:Json;stack:Json;live:Json;account:string;fingerprint:string;core:Json;refs:Json;otherStacks?:unknown}
export interface OwnerExecutionPorts {
  query(service:string,operation:string,args:string[],closing?:boolean):Json;
  snapshot(rollback?:Json):OwnerSnapshot;
  upload():void;
  assertSource():void;
  now():number;
  sleep(ms:number):Promise<void>;
}
function fail(code:string):never{throw new Error(`PRIVATE_OWNER_${code}`);}
const same=(a:unknown,b:unknown)=>ownerDigest(a)===ownerDigest(b);

/** LastOperations describes the most recent operation, not stack configuration.
 * It changes on every update. Validate its documented shape before excluding it;
 * retain DeploymentConfig, rollback, role, outputs, tags and all unknown fields. */
export function stableOwnerStack(value:Json) {
  const result=stableControllerStack(value);
  if(value.StackName!==OWNER_STACK) return result;
  if(value.LastOperations!==undefined){
    if(!Array.isArray(value.LastOperations)||value.LastOperations.length>20||value.LastOperations.some((entry:Json)=>
      !entry||typeof entry!=="object"||Array.isArray(entry)||Object.keys(entry).some(key=>!["OperationId","OperationType"].includes(key))||
      typeof entry.OperationId!=="string"||!/^[a-zA-Z0-9-]{1,128}$/.test(entry.OperationId)||
      !["CREATE_STACK","UPDATE_STACK","DELETE_STACK","CONTINUE_ROLLBACK","ROLLBACK","CREATE_CHANGESET"].includes(entry.OperationType)))fail("OPERATION_METADATA_INVALID");
    delete result.LastOperations;
  }
  return result;
}

export function ownerExecuteArguments(id:string,before:OwnerSnapshot,name:string) {
  if(!/^gmai-owner-[a-f0-9]{32}$/.test(name)||
    !new RegExp(`^arn:aws:cloudformation:${OWNER_REGION}:${before.account}:changeSet/${name}/[A-Za-z0-9-]+$`).test(id)||
    before.stack.StackName!==OWNER_STACK||before.stack.StackStatus!=="UPDATE_COMPLETE")fail("EXECUTE_OWNER_INVALID");
  return ["--stack-name",before.stack.StackId,"--change-set-name",id,"--client-request-token",name,"--no-disable-rollback","--no-retain-except-on-create"];
}

export function reviewOwnerPostState(before:OwnerSnapshot,after:OwnerSnapshot,proposed:Json,zipSha256:string,rollback=false) {
  if(!same(before.identity,after.identity)||!same(after.live,rollback?before.live:proposed)||
    !same(before.core.compute,after.core.compute)||!same(before.core.circuit,after.core.circuit)||
    after.core.occupiedSlots!==0||after.refs.referencesVerified!==true||before.refs.referenceFingerprint!==after.refs.referenceFingerprint||
    !same(before.otherStacks,after.otherStacks)||!same(stableOwnerStack(before.stack),stableOwnerStack(after.stack)))fail("POST_STATE_CHANGED");
  if(rollback){
    // Revision and update timestamps change during restoration. The old bytes,
    // role, configuration and all other runtime properties must be restored.
    const normalized=(v:Json)=>Object.fromEntries(Object.entries(v).filter(([key])=>!["RevisionId","LastModified","LastUpdateStatusReason","LastUpdateStatusReasonCode"].includes(key)));
    if(!same(normalized(before.runtime),normalized(after.runtime)))fail("ROLLBACK_UNVERIFIED");
    return {restoredOriginalCodeAndConfiguration:true};
  }
  return reviewOwnerRuntime(before.runtime,after.runtime,before.identity,zipSha256);
}

/** Execution is one-shot. An ambiguous API acknowledgement is reconciled by
 * independently reading this exact change set/stack; never submit twice. */
export async function executeOwnerUpdate(io:OwnerExecutionPorts,before:OwnerSnapshot,proposed:Json,draft:Json,
  name:string,started:number,zipSha256:string) {
  const id=draft.ChangeSetId;
  reviewOwnerDraft(draft,before.stack,before.identity,name,started,io.now(),before.live,proposed,before.runtime,zipSha256);
  io.assertSource();io.upload();
  const fresh=io.snapshot();if(fresh.fingerprint!==before.fingerprint)fail("PRE_EXECUTION_DRIFT");
  const latest=io.query("cloudformation","describe-change-set",["--stack-name",before.stack.StackId,"--change-set-name",id,"--include-property-values"]);
  if(latest.ChangeSetId!==id)fail("PRE_EXECUTION_DRAFT_CHANGED");
  reviewOwnerDraft(latest,before.stack,before.identity,name,started,io.now(),before.live,proposed,before.runtime,zipSha256);
  io.assertSource();const args=ownerExecuteArguments(id,before,name),executionStarted=io.now();
  let acknowledgementAmbiguous=false;
  try{io.query("cloudformation","execute-change-set",args);}catch{acknowledgementAmbiguous=true;}
  let terminal:Json|undefined;
  // Reserve reconciliation separately from preflight; each poll is bounded.
  for(let n=0;n<60;n++){
    let response:Json;
    try{response=io.query("cloudformation","describe-stacks",["--stack-name",before.stack.StackId],true);}
    catch{if(n===59)fail("RECONCILIATION_UNVERIFIED");await io.sleep(5000);continue;}
    const current=response.Stacks?.[0];
    if(response.NextToken!=null||response.Stacks?.length!==1||current?.StackId!==before.stack.StackId||current.DisableRollback===true)fail("RECONCILIATION_OWNER_INVALID");
    if(["UPDATE_COMPLETE","UPDATE_ROLLBACK_COMPLETE"].includes(current.StackStatus)&&current.ChangeSetId===id){
      const time=Date.parse(current.LastUpdatedTime);
      if(!Number.isFinite(time)||time<executionStarted-1000||time>io.now())fail("TERMINAL_TIME_INVALID");
      if(!same(stableOwnerStack(before.stack),stableOwnerStack({...current,StackStatus:"UPDATE_COMPLETE"})))fail("TERMINAL_STACK_CHANGED");
      terminal=current;break;
    }
    if(!["UPDATE_COMPLETE","UPDATE_IN_PROGRESS","UPDATE_COMPLETE_CLEANUP_IN_PROGRESS","UPDATE_ROLLBACK_IN_PROGRESS","UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS"].includes(current.StackStatus))fail("STACK_NOT_TERMINAL");
    await io.sleep(5000);
  }
  if(!terminal)fail("RECONCILIATION_UNVERIFIED");
  const rollback=terminal.StackStatus==="UPDATE_ROLLBACK_COMPLETE",after=io.snapshot(rollback?terminal:undefined);
  const proof=reviewOwnerPostState(before,after,proposed,zipSha256,rollback);
  io.assertSource();
  return{mode:"private-owner-controller-update",outcome:rollback?"rolled-back":"updated",executionAcknowledgementAmbiguous:acknowledgementAmbiguous,
    changeSetsExecuted:1,rollbackDisabled:false,terminalStateIndependentlyVerified:true,...proof,
    jobsEnabled:false,displayEnabled:false,circuitOpen:true,occupiedSlots:0,runningTasks:0,pendingTasks:0,services:0,
    iamChanged:false,workerChanged:false,workloadCalls:0,liveOwnerAcceptanceVerified:false,publicationPerformed:false};
}

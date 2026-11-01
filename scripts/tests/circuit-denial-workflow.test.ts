import assert from "node:assert/strict";
import test from "node:test";
import { ApiResponseError } from "../../services/operations/api-smoke/src/signed-api-client.js";
import { runCircuitDenialWorkflow, type DenialDependencies, type DenialInvariant } from "../circuit-denial-workflow.js";

function harness(){
  const initial:DenialInvariant={ownedResourcesVerified:true,budgetWithinLimit:true,sourceAndImageVerified:true,jobsEnabled:false,displayEnabled:false,
    circuitOpen:true,circuitVersion:11,runningTasks:0,pendingTasks:0,services:0,occupiedSlots:0,stableFingerprint:"a".repeat(64)};
  let enabled=false, clock=1000000;const events:string[]=[],requests:string[]=[],jobIds:string[]=[];
  const deps:DenialDependencies={now:()=>clock,readInvariant:async()=>{events.push("read");return{...initial,jobsEnabled:enabled};},
    enableAdmission:async()=>{events.push("enable");enabled=true;},restoreDisabledAdmission:async()=>{events.push("restore");enabled=false;},
    exactJobAbsent:async(id)=>{assert.match(id,/^job_[a-f0-9]{48}$/);jobIds.push(id);events.push("job-read");return true;},
    assertSameOpenCircuit:async(version)=>{assert.equal(version,11);events.push("circuit-read");},
    emergencyOwnedCleanup:async()=>{events.push("emergency");},request:{request:async(method,path,body,headers)=>{
      requests.push(method);if(method==="GET"){assert.equal(path,"v1/health");return{status:"ok",circuit:"OPEN",jobCreationEnabled:true};}
      assert.equal(path,"v1/jobs");assert.deepEqual(body,{operation:"PRICE",symbol:"QLD",locale:"ko"});
      assert.match(headers!["idempotency-key"]!,/^[a-f0-9-]{36}$/);throw new ApiResponseError(503,"CIRCUIT_OPEN");
    }}};
  return{initial,deps,events,requests,jobIds,setClock:(n:number)=>{clock=n;},enabled:()=>enabled};
}
test("one genuine denial has independent exact-job and empty-inventory proof after restore",async()=>{
  const run=harness();const report=await runCircuitDenialWorkflow(run.deps);
  assert.equal(report.internalExecutionRestored,true);assert.deepEqual(run.requests,["GET","POST"]);
  assert.equal(run.jobIds.length,2);assert.equal(run.jobIds[0],run.jobIds[1]);
  assert.equal(run.enabled(),false);assert.ok(run.events.indexOf("restore")<run.events.lastIndexOf("job-read"));
  assert.equal(JSON.stringify(report).includes(run.jobIds[0]!),false);
});
test("unsafe baseline or changed enabled fingerprint cannot submit an API request",async()=>{
  for(const mutate of [(run:ReturnType<typeof harness>)=>{run.initial.runningTasks=1;},
    (run:ReturnType<typeof harness>)=>{run.initial.budgetWithinLimit=false;},
    (run:ReturnType<typeof harness>)=>{run.initial.sourceAndImageVerified=false;},
    (run:ReturnType<typeof harness>)=>{run.deps.enableAdmission=async()=>{run.initial.stableFingerprint="b".repeat(64);run.initial.jobsEnabled=true;};}]){
    const run=harness();mutate(run);await assert.rejects(runCircuitDenialWorkflow(run.deps));assert.equal(run.requests.length,0);
  }
});
test("an ambiguous enable still attempts restoration, with no request or enable retry",async()=>{
  const run=harness();run.deps.enableAdmission=async()=>{run.events.push("enable");throw Error("PRIVATE_SENTINEL");};
  await assert.rejects(runCircuitDenialWorkflow(run.deps),/INCOMPLETE_AFTER_VERIFIED_RESTORE/);
  assert.equal(run.events.filter(x=>x==="restore").length,1);assert.equal(run.requests.length,0);
});
test("success, transport ambiguity, unrelated errors and disabled health cannot masquerade as denial",async()=>{
  for(const behavior of ["success","timeout","other","disabled"]){const run=harness();
    run.deps.request.request=async(method)=>{run.requests.push(method);if(method==="GET")return{status:"ok",circuit:"OPEN",jobCreationEnabled:behavior!=="disabled"};
      if(behavior==="success")return{jobId:"PRIVATE_SENTINEL"};if(behavior==="timeout")throw Error("PRIVATE_SENTINEL");throw new ApiResponseError(503,"DATA_UNAVAILABLE");};
    await assert.rejects(runCircuitDenialWorkflow(run.deps),/INCOMPLETE_AFTER_VERIFIED_RESTORE/);
    assert.equal(run.enabled(),false);assert.ok(run.requests.filter(x=>x==="POST").length<=1);assert.ok(run.events.includes("emergency"));
  }
});
test("preexisting exact job or changed persisted circuit prevents the one POST",async()=>{
  for(const bad of ["job","circuit"]){const run=harness();if(bad==="job")run.deps.exactJobAbsent=async()=>false;
    else run.deps.assertSameOpenCircuit=async()=>{throw Error("PRIVATE_SENTINEL");};
    await assert.rejects(runCircuitDenialWorkflow(run.deps));assert.deepEqual(run.requests,["GET"]);assert.equal(run.enabled(),false);
  }
});
test("a late result or three-minute admission window triggers restoration, never more requests",async()=>{
  const run=harness();const request=run.deps.request.request;run.deps.request.request=async(...args)=>{run.setClock(1180000);return request(...args);};
  await assert.rejects(runCircuitDenialWorkflow(run.deps));assert.deepEqual(run.requests,["GET"]);assert.equal(run.enabled(),false);
});
test("missing restoration, closing inventory or exact-job absence is an explicit unsafe-stop failure",async()=>{
  for(const bad of ["restore","inventory","job"]){const run=harness();
    if(bad==="restore")run.deps.restoreDisabledAdmission=async()=>{throw Error("PRIVATE_SENTINEL");};
    if(bad==="inventory"){const restore=run.deps.restoreDisabledAdmission;run.deps.restoreDisabledAdmission=async()=>{await restore();run.initial.occupiedSlots=1;};}
    if(bad==="job"){let reads=0;run.deps.exactJobAbsent=async()=>++reads===1;}
    await assert.rejects(runCircuitDenialWorkflow(run.deps),/SAFE_STOP_UNVERIFIED/);
  }
});

import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import test from "node:test";
import {localWorkerAcceptancePlan,ownedDesktopStopArguments,runLocalWorkerAcceptance,safeLocalWorkerAcceptanceResult} from "../local-worker-acceptance.mjs";
import {workerSessionCandidate,workerSessionRuntime} from "./fixtures/worker-session-results.mjs";

const lease={rootPid:12345,startedAtUtc:"2026-10-18T00:00:00.0000000Z"};
function portsFixture(){const calls=[],build={mode:"recorded-local-worker-build",completed:true,passed:true,runId:"00000000-0000-4000-8000-000000000001",proof:workerSessionCandidate()},
  runtime={mode:"recorded-worker-runtime-smoke",completed:true,passed:true,runId:"00000000-0000-4000-8000-000000000002",proof:workerSessionRuntime()};
  const ports={now:()=>0,inspectStopped:()=>({stopped:true,signaturesVerified:true}),
    backupSockets:()=>({completed:true,filesDeleted:0,imagesAndVolumesModified:false,globalSettingsChanged:false,recoverableDirectories:2,backupScope:"d".repeat(32)}),
    captureSource:()=>structuredClone(build.proof.sourceFingerprint),startHidden:()=>({...lease}),waitReady:()=>true,verifyOwner:()=>true,
    recoverOwnedStart:()=>({...lease}),runningContainers:()=>0,buildBundles:()=>{},buildScan:()=>structuredClone(build),runtimeSmoke:()=>structuredClone(runtime),
    stopOwned:()=>true,verifyStopped:()=>true};
  for(const name of Object.keys(ports).filter(n=>n!=="now")){const op=ports[name];ports[name]=(...args)=>{calls.push({name,args});return op(...args);};}
  return {ports,calls,build,runtime};
}
test("acceptance import/default are zero-action and private extra CLI selectors fail before effects",()=>{
  const p=localWorkerAcceptancePlan();for(const name of ["awsCalls","dockerCalls","processStarts","reportFilesWritten"])assert.equal(p[name],0);
  assert.equal(p.existingDockerAdoptionAllowed,false);assert.equal(p.imagesAndVolumesDeleted,false);assert.throws(()=>localWorkerAcceptancePlan(["PRIVATE_SENTINEL"]));
  for(const args of [[],["--image","PRIVATE_SENTINEL"]]){const r=spawnSync(process.execPath,["scripts/local-worker-acceptance.mjs",...args],
    {encoding:"utf8",windowsHide:true,timeout:10000});assert.equal(r.status,args.length?1:0);assert.equal((r.stdout+r.stderr).includes("PRIVATE_SENTINEL"),false);}
  const r=spawnSync(process.execPath,["--input-type=module","-e",'await import("./scripts/local-worker-acceptance.mjs");console.log("INERT");'],
    {encoding:"utf8",windowsHide:true,timeout:10000});assert.equal(r.status,0);assert.equal(r.stdout.trim(),"INERT");
});
test("one successful flow preserves source/image binding and stops only after independent ownership/empty checks",async()=>{
  const {ports,calls}=portsFixture(),phases=[];const p=await runLocalWorkerAcceptance(ports,v=>phases.push(v.phase));
  assert.equal(p.passed,true);assert.equal(p.cleanupVerified,true);assert.equal(p.stopMethod,"normal");assert.equal(p.existingDockerAdopted,false);
  assert.equal(safeLocalWorkerAcceptanceResult(p),true);
  assert.equal(p.awsCalls,0);assert.equal(p.imagePushes,0);assert.equal(p.readyForDeployment,false);
  for(const name of ["startHidden","buildScan","runtimeSmoke","stopOwned"])assert.equal(calls.filter(c=>c.name===name).length,1);
  assert.equal(calls.filter(c=>c.name==="backupSockets").length,2);
  const stopped=calls.findIndex(c=>c.name==="stopOwned");assert.deepEqual(calls.slice(stopped-2,stopped).map(c=>c.name),["verifyOwner","runningContainers"]);
  assert.deepEqual(calls[stopped].args,[false]);assert.equal(phases.at(-1),"source-closing");
  assert.equal(JSON.stringify(p).includes("12345"),false);
});
test("preexisting/untrusted Docker never reaches backup, launch, adoption or stop",async()=>{
  for(const inspect of [()=>{throw new Error("PRIVATE_SENTINEL");},()=>({stopped:false,signaturesVerified:true}),()=>({stopped:true,signaturesVerified:false})]){
    const {ports,calls}=portsFixture();ports.inspectStopped=inspect;const p=await runLocalWorkerAcceptance(ports);
    assert.equal(p.passed,false);assert.equal(p.startAttempted,false);assert.equal(p.cleanupVerified,false);
    for(const name of ["backupSockets","startHidden","stopOwned"])assert.equal(calls.some(c=>c.name===name),false);
    assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);
  }
});
test("failed producer, mismatched image/source/module or incomplete child proof cannot pass or skip cleanup",async()=>{
  for(const mutate of [p=>p.build.passed=false,p=>p.build.passed="true",p=>p.build.completed="true",p=>p.runtime.completed="true",p=>p.runtime.passed="true",p=>p.build.proof.sourceFingerprint.sha256="e".repeat(64),p=>p.build.proof.ownedScannerAbsent=false,
    p=>p.runtime.passed=false,p=>p.runtime.proof.sourceFingerprint.sha256="e".repeat(64),p=>p.runtime.proof.localImageId=`sha256:${"e".repeat(64)}`,
    p=>p.runtime.proof.applicationModuleSha256="e".repeat(64),p=>p.runtime.proof.result.entrypoint.allChildrenExited=false]){
    const f=portsFixture();mutate(f);const p=await runLocalWorkerAcceptance(f.ports);assert.equal(p.passed,false);assert.equal(p.cleanupVerified,true);
    assert.equal(f.calls.filter(c=>c.name==="stopOwned").length,1);
  }
});
test("foreign active containers or a changed process owner block Desktop stop rather than disrupting user work",async()=>{
  for(const change of [p=>p.runningContainers=()=>1,p=>p.verifyOwner=()=>false,p=>p.verifyOwner=()=>{throw new Error("PRIVATE_SENTINEL");}]){
    const {ports,calls}=portsFixture();change(ports);const p=await runLocalWorkerAcceptance(ports);
    assert.equal(p.passed,false);assert.equal(p.cleanupVerified,false);assert.equal(calls.some(c=>c.name==="stopOwned"),false);
    assert.equal(calls.some(c=>c.name==="buildScan"),false);
  }
});

test("durable session proof rejects private fields, truthy flags and unverified lease claims",async()=>{
  const p=await runLocalWorkerAcceptance(portsFixture().ports);assert.equal(safeLocalWorkerAcceptanceResult(p),true);
  for(const mutate of [p=>p.private="PRIVATE_SENTINEL",p=>p.sourceFingerprint.private="PRIVATE_SENTINEL",p=>p.passed="true",
    p=>p.cleanupVerified=false,p=>p.ownedProcessLeaseVerified=false,p=>p.stopMethod="forced-owned-startup",p=>p.stage="PRIVATE_SENTINEL",
    p=>p.awsCalls=1,p=>p.credentialsPassed=true,p=>p.readyForDeployment=true,p=>p.buildRunId="PRIVATE_SENTINEL"]){
    const bad=structuredClone(p);mutate(bad);assert.equal(safeLocalWorkerAcceptanceResult(bad),false);
  }
  const {ports}=portsFixture();ports.verifyOwner=()=>false;const refused=await runLocalWorkerAcceptance(ports);
  assert.equal(refused.ownedProcessLeaseVerified,false);assert.equal(safeLocalWorkerAcceptanceResult(refused),true);
});
test("only a positively owned failed startup may use official force stop, never a healthy producer failure",async()=>{
  const {ports,calls}=portsFixture();ports.waitReady=()=>false;const p=await runLocalWorkerAcceptance(ports);
  assert.equal(p.passed,false);assert.equal(p.cleanupVerified,true);assert.equal(p.stopMethod,"forced-owned-startup");
  assert.deepEqual(calls.find(c=>c.name==="stopOwned").args,[true]);assert.equal(calls.some(c=>c.name==="buildScan"),false);
});
test("ambiguous startup output must recover the original lease or refuse to stop an unknown instance",async()=>{
  for(const recoverable of [true,false]){const {ports,calls}=portsFixture();ports.startHidden=()=>{throw new Error("PRIVATE_SENTINEL");};
    ports.recoverOwnedStart=()=>recoverable?{...lease}:null;ports.verifyStopped=()=>recoverable;
    const p=await runLocalWorkerAcceptance(ports);assert.equal(p.passed,false);assert.equal(p.cleanupVerified,recoverable);
    assert.equal(calls.some(c=>c.name==="stopOwned"),recoverable);assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);
  }
});
test("unknown source fields never persist and timeout/failed stop cannot become clean closure",async()=>{
  const f=portsFixture();f.ports.captureSource=()=>({files:1,bytes:1,sha256:"a".repeat(64),path:"PRIVATE_SENTINEL"});
  const p=await runLocalWorkerAcceptance(f.ports);assert.equal(p.passed,false);assert.equal(p.sourceFingerprint,null);
  assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"),false);assert.equal(f.calls.some(c=>c.name==="startHidden"),false);
  for(const name of ["stopOwned","verifyStopped"]){const f=portsFixture();f.ports[name]=()=>false;const p=await runLocalWorkerAcceptance(f.ports);
    assert.equal(p.passed,false);assert.equal(p.cleanupVerified,false);}
});
test("source changes and exhausted monotonic admission budget fail without another work phase",async()=>{
  const f=portsFixture();let reads=0;f.ports.captureSource=()=>({...workerSessionCandidate().sourceFingerprint,sha256:(reads++?"b":"a").repeat(64)});
  const p=await runLocalWorkerAcceptance(f.ports);assert.equal(p.passed,false);assert.equal(p.cleanupVerified,true);
  const g=portsFixture();let ticks=0;g.ports.now=()=>ticks++===0?0:900000;const q=await runLocalWorkerAcceptance(g.ports);
  assert.equal(q.passed,false);assert.equal(g.calls.some(c=>c.name==="startHidden"),false);assert.equal(g.calls.some(c=>c.name==="buildScan"),false);
});
test("Windows bridge has exact source ownership, vendor signatures and hidden startup but no deletion/security bypass",()=>{
  const source=readFileSync("scripts/docker-local-session.ps1","utf8");
  assert.match(source,/Get-AuthenticodeSignature/);assert.match(source,/CreationDate/);assert.match(source,/ParentProcessId/);
  assert.match(source,/Start-Process -FilePath \$taskInstall.Desktop -WindowStyle Hidden -PassThru/);
  assert.equal(/Remove-Item|Stop-Process|Set-ExecutionPolicy|factory-reset|wsl --shutdown/.test(source),false);
  assert.match(source,/resources\\cli-plugins\\docker-desktop\.exe/);
});

test("empty-auth Docker sessions use the signed bundled stop plugin, never user plugin discovery or an implicit force",()=>{
  assert.deepEqual(ownedDesktopStopArguments(false),["desktop","stop","--timeout","25"]);
  assert.deepEqual(ownedDesktopStopArguments(true),["desktop","stop","--force","--timeout","25"]);
  for(const value of [undefined,null,0,1,"true","--force",{},[]])assert.throws(()=>ownedDesktopStopArguments(value));
  const source=readFileSync("scripts/local-worker-acceptance.mjs","utf8");
  assert.match(source,/spawnSync\(stopPlugin,\["--config",config,\.\.\.ownedDesktopStopArguments\(force\)\]/);
});

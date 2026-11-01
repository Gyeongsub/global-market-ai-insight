import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { OWNER_ZIP_SCRIPT, ownerCreateArguments, privateOwnerDraftPlan, safeOwnerDirectory, reviewOwnerGateReceipt } from "../private-owner-draft.js";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

test("owner draft defaults to zero effects and cannot execute or upload assets",()=>{
  const p=privateOwnerDraftPlan();assert.equal(p.awsCalls,0);assert.equal(p.changeSetsExecuted,0);assert.equal(p.assetsUploaded,0);
  assert.equal(p.iamChanges,0);assert.equal(p.workloadCalls,0);
  assert.throws(()=>privateOwnerDraftPlan(["--execute"]));
  const r=spawnSync(process.execPath,[resolve("node_modules/tsx/dist/cli.mjs"),resolve("scripts/private-owner-draft.ts")],{
    env:cleanSourceChildEnvironment(process.env),encoding:"utf8",timeout:15000,windowsHide:true});
  assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),p);
});
test("create arguments preserve stack settings and never include execution or upload",()=>{
  const stack={StackId:"PRIVATE_SENTINEL",RoleARN:"ROLE",Tags:[{Key:"Project",Value:"Fixture"}]};
  const args=ownerCreateArguments(stack,resolve("candidate.json"),`gmai-owner-${"a".repeat(32)}`);
  assert.equal(args[1],stack.StackId);assert.ok(args.includes("--no-include-nested-stacks"));
  assert.equal(args.includes("--disable-rollback"),false);assert.equal(args.includes("execute-change-set"),false);
  assert.throws(()=>ownerCreateArguments(stack,"relative.json",`gmai-owner-${"a".repeat(32)}`));
  assert.throws(()=>ownerCreateArguments(stack,resolve("candidate.json"),"foreign"));
});
test("temporary owner scope rejects broad paths and sibling directories",()=>{
  const base=realpathSync(tmpdir()),dir=mkdtempSync(join(base,"gmai-owner-review-"));
  try{assert.equal(safeOwnerDirectory(base,dir,base),true);assert.equal(safeOwnerDirectory(base,base,base),false);
    assert.equal(safeOwnerDirectory(base,dir,join(base,"wrong")),false);
  }finally{rmSync(dir,{recursive:true});}
});
test("owner zip is deterministic and rejects changed bytes before packaging",{skip:process.platform!=="win32"},()=>{
  const base=realpathSync(tmpdir()),dir=mkdtempSync(join(base,"gmai-owner-review-"));
  try{
    mkdirSync(join(dir,"licenses"));
    const records=["main.mjs","THIRD_PARTY_NOTICES.md","licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"].map(name=>{
      const bytes=Buffer.from(`synthetic ${name}`);writeFileSync(join(dir,name),bytes);return{name,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};});
    const invoke=(name:string)=>spawnSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",OWNER_ZIP_SCRIPT],{
      env:{...cleanSourceChildEnvironment(process.env),GMAI_OWNER_FILES:JSON.stringify(records),GMAI_OWNER_ZIP:join(dir,name),GMAI_OWNER_BUNDLE:dir},
      encoding:"utf8",timeout:15000,windowsHide:true});
    assert.equal(invoke("a.zip").status,0);assert.equal(invoke("b.zip").status,0);
    assert.deepEqual(readFileSync(join(dir,"a.zip")),readFileSync(join(dir,"b.zip")));
    writeFileSync(join(dir,"main.mjs"),"changed");assert.notEqual(invoke("bad.zip").status,0);
  }finally{assert.equal(safeOwnerDirectory(base,dir,base),true);rmSync(dir,{recursive:true});}
});
test("execution requires a recent completed full gate matching current source, not a caller ready flag",()=>{
  const runId="12345678-1234-1234-1234-123456789abc",now=Date.parse("2026-10-25T08:00:00Z"),fp={files:655,bytes:6000000,sha256:"a".repeat(64)};
  const r:any={runId,mode:"current-installation-local-gate",schemaVersion:2,completed:true,passed:true,sourceUnchanged:true,
    completedAt:new Date(now-1000).toISOString(),awsCalls:0,externalNetworkCalls:0,httpServersClosed:true,
    stepTimings:{failedSteps:0,recordsValid:true},sourceFingerprint:fp};
  assert.equal(reviewOwnerGateReceipt(r,fp,runId,now).currentSourceFullGateVerified,true);
  for(const patch of [{passed:false},{completed:false},{sourceUnchanged:false},{awsCalls:1},{httpServersClosed:false},
    {completedAt:new Date(now-3_600_001).toISOString()},{completedAt:new Date(now+1).toISOString()},
    {sourceFingerprint:{...fp,sha256:"b".repeat(64)}},{stepTimings:{failedSteps:1,recordsValid:true}}])
    assert.throws(()=>reviewOwnerGateReceipt({...r,...patch},fp,runId,now),/LOCAL_GATE_UNVERIFIED/);
});

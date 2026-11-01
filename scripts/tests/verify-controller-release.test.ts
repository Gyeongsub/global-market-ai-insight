import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync,realpathSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import test from "node:test";
import { controllerProofCodeKey, controllerReleaseProofPlan, safeControllerProofDirectory, VERIFY_ZIP, verifyControllerZipHash } from "../verify-controller-release.js";
test("controller proof defaults to zero AWS/downloads and rejects deploy alternatives",()=>{
  const p=controllerReleaseProofPlan();assert.equal(p.awsCalls,0);assert.equal(p.cloudMutations,0);assert.equal(p.codeExecuted,false);assert.throws(()=>controllerReleaseProofPlan(["--deploy"]));
  const r=spawnSync(process.execPath,[resolve("node_modules/tsx/dist/cli.mjs"),resolve("scripts/verify-controller-release.ts")],{encoding:"utf8"});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).awsCalls,0);
});
test("private ZIP bytes must match the exact Lambda CodeSha256, not just a plausible S3 key",()=>{
  const bytes=Buffer.from("PRIVATE_SENTINEL_CANONICAL_ZIP_BYTES"),hash=createHash("sha256").update(bytes).digest("base64");
  assert.equal(verifyControllerZipHash(bytes,hash).deployedZipHashMatched,true);
  assert.throws(()=>verifyControllerZipHash(Buffer.concat([bytes,Buffer.from("x")]),hash));assert.throws(()=>verifyControllerZipHash(bytes,"PRIVATE_SENTINEL"));
});
test("only the exact controller's immutable standard asset key is accepted",()=>{
  const value:any={Resources:{ControllerFunctionC25B79B1:{Properties:{Code:{S3Bucket:"PRIVATE_SENTINEL",S3Key:`${"a".repeat(64)}.zip`}}}}};
  assert.equal(controllerProofCodeKey(value),`${"a".repeat(64)}.zip`);value.Resources.ControllerFunctionC25B79B1.Properties.Code.S3Key="latest.zip";assert.throws(()=>controllerProofCodeKey(value));
  value.Resources.ControllerFunctionC25B79B1.Properties.Code.S3Key=`${"a".repeat(64)}.zip`;value.Resources.ControllerFunctionC25B79B1.Properties.Code.ImageUri="PRIVATE_SENTINEL";assert.throws(()=>controllerProofCodeKey(value));
});
test("ZIP inspection is bounded in memory, checks every exact source file and never extracts or executes code",()=>{
  assert.match(VERIFY_ZIP,/taskZip\.Entries\.Count -gt 4/);assert.match(VERIFY_ZIP,/taskReadTotal -gt 2000000/);assert.match(VERIFY_ZIP,/taskSeen\.ContainsKey/);
  assert.match(VERIFY_ZIP,/taskHash -cne/);assert.equal(/ExtractTo|Invoke-Expression|Start-Process|Remove-Item|Expand-Archive/.test(VERIFY_ZIP),false);
});
test("controller proof cleanup cannot select a broad or foreign temporary target",()=>{
  const base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-controller-proof-"));try{
    assert.equal(safeControllerProofDirectory(base,directory,physical),true);assert.equal(safeControllerProofDirectory(base,base,physical),false);
    assert.equal(safeControllerProofDirectory(base,directory,`${physical}-other`),false);
  }finally{rmSync(directory,{recursive:true});}
});

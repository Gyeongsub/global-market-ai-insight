import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {assertNodeSecurityBaseline,nodeSecurityBaselineSatisfied} from "../node-security-baseline.mjs";
import {cleanSourceChildEnvironment} from "../local-proof-environment.mjs";

test("only normalized supported LTS versions meeting the dated security baseline are admitted",()=>{
  for(const v of ["22.23.4","22.23.5","22.24.0","24.22.1","24.22.2","24.23.0"]){
    assert.equal(nodeSecurityBaselineSatisfied(v),true);assert.doesNotThrow(()=>assertNodeSecurityBaseline(v));
  }
  for(const v of ["22.23.3","22.22.99","24.19.0","24.22.0","20.99.99","26.12.1","v24.22.1","24.22.1-rc.1",
    "24.022.1","24.22.1\n","24.22.1000",null,24,{},["24.22.1"],"PRIVATE_SENTINEL"]){
    assert.equal(nodeSecurityBaselineSatisfied(v),false);
    assert.throws(()=>assertNodeSecurityBaseline(v),/^Error: PROJECT_NODE_SECURITY_BASELINE_REQUIRED$/);
  }
});

test("loading guards is inert; old-runtime public/fresh execution fails before network or root access",()=>{
  const program='import fs from"node:fs";import{syncBuiltinESMExports}from"node:module";let calls=0;'+
    'fs.mkdtempSync=()=>{calls++;throw Error("UNEXPECTED_FS")};syncBuiltinESMExports();'+
    'globalThis.fetch=()=>{calls++;throw Error("UNEXPECTED_NETWORK")};'+
    'const{collectPublicBaseNoticeProof:p}=await import("./scripts/public-base-notice-proof.mjs");'+
    'const{runFreshInstallProof:f}=await import("./scripts/fresh-install-proof.mjs");'+
    'const{collectRegistryAdvisoryProof:g}=await import("./scripts/registry-advisory-proof.mjs");'+
    'fs.readFileSync=()=>{calls++;throw Error("UNEXPECTED_FS_READ")};syncBuiltinESMExports();'+
    'Object.defineProperty(process.versions,"node",{value:"24.19.0"});'+
    'for(const [i,op]of[()=>p("NONEXISTENT_ROOT",async()=>{calls++;}),()=>f(),()=>g("NONEXISTENT_ROOT")].entries()){'+
    'try{await op();throw Error("UNEXPECTED_SUCCESS")}catch(e){if(i===0?(e.message!=="PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE"||e.proofStage!=="runtime-security-baseline"):e.message!==(i===1?"PROJECT_NODE_SECURITY_BASELINE_REQUIRED":"REGISTRY_ADVISORY_PROOF_INCOMPLETE"))throw Error("UNEXPECTED_REASON");}}'+
    'if(calls)throw Error("UNEXPECTED_NETWORK");console.log("BLOCKED_BEFORE_EFFECTS");';
  const r=spawnSync(process.execPath,["--input-type=module","--eval",program],{encoding:"utf8",timeout:5000,windowsHide:true,
    env:cleanSourceChildEnvironment(process.env),maxBuffer:2000});
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),"BLOCKED_BEFORE_EFFECTS");assert.equal(r.stderr,"");
});

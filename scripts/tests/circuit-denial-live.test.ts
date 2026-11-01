import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import test from "node:test";
import {denialControllerStableValue,denialLivePlan,safeDenialTemporaryDirectory} from "../circuit-denial-live.js";
const PREFIX="global-market-ai-insight-dev",ACCOUNT="123456789012";
function controller(){return{FunctionName:`${PREFIX}-controller`,FunctionArn:`arn:aws:lambda:ap-northeast-1:${ACCOUNT}:function:${PREFIX}-controller`,
  Role:`arn:aws:iam::${ACCOUNT}:role/ControllerRole`,Runtime:"nodejs22.x",Handler:"main.handler",Architectures:["x86_64"],MemorySize:128,Timeout:15,
  CodeSha256:"a".repeat(43)+"=",RevisionId:"a".repeat(8)+"-aaaa-aaaa-aaaa-"+"a".repeat(12),Environment:{Variables:{
    JOBS_TABLE_NAME:`${PREFIX}-jobs`,WORKER_CLUSTER:`arn:aws:ecs:ap-northeast-1:${ACCOUNT}:cluster/${PREFIX}-worker`,
    WORKER_TASK_DEFINITION:`arn:aws:ecs:ap-northeast-1:${ACCOUNT}:task-definition/${PREFIX}-worker:10`,WORKER_SUBNET_IDS:"subnet-12345678,subnet-87654321",
    WORKER_SECURITY_GROUP_ID:"sg-12345678",JOB_TIMEOUT_SECONDS:"90",JOB_TTL_SECONDS:"86400",MAX_JOBS_PER_MINUTE:"5",MAX_ACTIVE_JOBS:"2",
    CIRCUIT_STATE:"CLOSED",API_AUTH_MODE:"AWS_IAM",ENABLE_PROVIDER_BACKED_JOBS:"false",ENABLE_LIVE_RESULT_DISPLAY:"false",PRIVATE_OWNER_USER_ARN:`arn:aws:iam::${ACCOUNT}:user/aws-admin-user`}}};}
test("the only mutable admission flag is excluded from an otherwise exact controller fingerprint",()=>{
  const c=controller(),before=denialControllerStableValue(c);c.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true";
  assert.equal(denialControllerStableValue(c),before);c.CodeSha256="b".repeat(43)+"=";assert.notEqual(denialControllerStableValue(c),before);
});
test("unknown secret/config fields, foreign identities, display enablement and unsafe runtime scope fail before a write",()=>{
  for(const mutate of [(c:any)=>{c.Environment.Variables.PRIVATE_TOKEN="PRIVATE_SENTINEL";},(c:any)=>{c.FunctionArn=c.FunctionArn.replace(ACCOUNT,"999999999999");},
    (c:any)=>{c.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY="true";},(c:any)=>{c.Environment.Variables.CIRCUIT_STATE="OPEN";},
    (c:any)=>{c.Environment.Variables.JOBS_TABLE_NAME="other-table";},(c:any)=>{c.Timeout=900;},(c:any)=>{c.Role=c.Role.replace(ACCOUNT,"999999999999");},
    (c:any)=>{c.MemorySize=10240;},(c:any)=>{c.RevisionId="PRIVATE_SENTINEL";}]){const c=controller();mutate(c);assert.throws(()=>denialControllerStableValue(c));}
});
test("owner-private drills cannot omit, change, clear or widen the owner restriction",()=>{
  for(const value of [undefined,"",`arn:aws:iam::${ACCOUNT}:user/other`,`arn:aws:iam::999999999999:user/aws-admin-user`,`arn:aws:iam::${ACCOUNT}:root`]){
    const c:any=controller();if(value===undefined)delete c.Environment.Variables.PRIVATE_OWNER_USER_ARN;else c.Environment.Variables.PRIVATE_OWNER_USER_ARN=value;
    assert.throws(()=>denialControllerStableValue(c));
  }
});
test("the private environment cleanup cannot delete broad, nested, redirected or unrelated directories",()=>{
  const base=resolve(tmpdir()),physical=realpathSync(base),directory=mkdtempSync(join(base,"gmai-circuit-denial-"));
  try{assert.equal(safeDenialTemporaryDirectory(base,directory,physical),true);mkdirSync(join(directory,"nested"));
    for(const path of [base,join(directory,"nested"),resolve(".")])assert.equal(safeDenialTemporaryDirectory(base,path,physical),false);
    assert.equal(safeDenialTemporaryDirectory(base,directory,physical+"other"),false);
  }finally{rmSync(directory,{recursive:true});}
});
test("default and imports cannot query AWS or enable admission, and arbitrary flags stay private",()=>{
  assert.equal(denialLivePlan().awsCalls,0);assert.equal(denialLivePlan().cloudMutations,0);assert.equal(denialLivePlan().jobPostsMax,1);
  assert.throws(()=>denialLivePlan(["--execute"]));
  for(const args of [[],["PRIVATE_SENTINEL"],["--execute-one-circuit-denial","PRIVATE_SENTINEL"]]){
    const r=spawnSync(process.execPath,["--import","tsx","scripts/circuit-denial-live.ts",...args],{encoding:"utf8",timeout:5000});
    assert.equal(r.status,args.length?1:0);assert.equal(`${r.stdout}${r.stderr}`.includes("PRIVATE_SENTINEL"),false);
  }
  const r=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",'await import("./scripts/circuit-denial-live.ts");'],{encoding:"utf8",timeout:5000});
  assert.equal(r.status,0);assert.equal(r.stdout,"");assert.equal(r.stderr,"");
});

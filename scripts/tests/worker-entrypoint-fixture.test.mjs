import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {workerEntrypointCases,verifyWorkerEntrypointOutcome,runWorkerEntrypointSequence} from "../fixtures/worker-entrypoint-fixture.mjs";

function outcome(row){const base={timestamp:"2026-10-18T00:00:00.000Z",level:"info",service:"worker",environment:row.logEnvironment,
  ...(row.logJob?{jobId:"01LOCALBOOT0000000000000000"}:{})};
  return {status:row.exit,signal:null,stdout:JSON.stringify({...base,status:"STARTING"})+"\n"+JSON.stringify({...base,
    level:row.exit===0?"info":"error",status:row.exit===0?"SUCCEEDED":"FAILED",
    ...(row.exit===0?{operation:row.operation,durationMs:1}:{errorCode:"WORKER_CONFIGURATION_ERROR"})})+"\n",stderr:""};}

test("entrypoint fixture import is inert and its fresh synthetic cases never inherit the caller environment",()=>{
  const r=spawnSync(process.execPath,["--input-type=module","-e",'await import("./scripts/fixtures/worker-entrypoint-fixture.mjs");console.log("INERT");'],
    {encoding:"utf8",windowsHide:true,timeout:10000});assert.equal(r.status,0);assert.equal(r.stdout.trim(),"INERT");
  const rows=workerEntrypointCases();assert.equal(rows.length,18);assert.equal(rows.filter(r=>r.exit===0).length,6);
  assert.equal(new Set(rows.map(r=>r.name)).size,18);
  const allowed=new Set(["APP_ENV","JOB_ID","LOCAL_JOB_FIXTURE_JSON","AWS_REGION","NODE_ENV","NODE_DISABLE_COMPILE_CACHE",
    "AWS_EC2_METADATA_DISABLED","AWS_MAX_ATTEMPTS","AWS_IGNORE_CONFIGURED_ENDPOINT_URLS"]);
  for(const row of rows){assert.ok(Object.keys(row.environment).every(k=>allowed.has(k)));
    assert.equal(row.environment.AWS_EC2_METADATA_DISABLED,"true");assert.equal(row.environment.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS,"true");}
  rows[0].environment.APP_ENV="PRIVATE_SENTINEL";assert.equal(workerEntrypointCases()[0].environment.APP_ENV,"local");
});

test("normal and negative process outputs require the exact stable schema and exit status",()=>{
  for(const row of workerEntrypointCases())assert.deepEqual(verifyWorkerEntrypointOutcome(outcome(row),row),{exitedAsExpected:true,logsSanitized:true});
  const row=workerEntrypointCases()[0];
  for(const mutate of [r=>r.status=1,r=>r.signal="SIGKILL",r=>r.error={message:"PRIVATE_SENTINEL"},r=>r.stderr="PRIVATE_SENTINEL",
    r=>r.stdout="",r=>r.stdout="x".repeat(16385),r=>r.stdout+=r.stdout,r=>r.stdout=r.stdout.replace("local","PRIVATE_BOOT_ENV"),
    r=>r.stdout=r.stdout.replace('"worker"','"foreign"'),r=>r.stdout=r.stdout.replace('"PRICE"','"ANALYSIS"'),
    r=>r.stdout=r.stdout.replace('"durationMs":1','"durationMs":5001'),r=>r.stdout=r.stdout.replace('"status":"STARTING"','"status":"STARTING","message":"PRIVATE_SENTINEL"')]){
    const r=outcome(row);mutate(r);assert.throws(()=>verifyWorkerEntrypointOutcome(r,row),/^Error: WORKER_ENTRYPOINT_FIXTURE_INCOMPLETE$/);
  }
});

test("all fixed entrypoints run one-at-a-time with no shell, source selector, credentials or unbounded process",()=>{
  const rows=workerEntrypointCases();let calls=0;
  const p=runWorkerEntrypointSequence((executable,args,options)=>{
    assert.equal(executable,"/nodejs/bin/node");assert.deepEqual(args,["/app/main.mjs"]);assert.equal(options.cwd,"/app");
    assert.equal(options.shell,undefined);assert.equal(options.timeout,5000);assert.equal(options.killSignal,"SIGKILL");assert.equal(options.maxBuffer,16384);
    assert.deepEqual(options.env,rows[calls].environment);return outcome(rows[calls++]);
  },()=>0);
  assert.equal(calls,18);assert.equal(p.totalCases,18);assert.equal(p.normalCases,6);assert.equal(p.negativeCases,12);
  assert.equal(p.childProcessesStarted,18);assert.equal(p.maxConcurrentChildren,1);assert.equal(p.allChildrenExited,true);
  assert.equal(p.awsCalls,0);assert.equal(p.credentialFieldsPassed,false);
});

test("first process timeout, failure or budget exhaustion stops the sequence without a retry",()=>{
  const first=workerEntrypointCases()[0];
  for(const result of [{...outcome(first),status:null,error:{code:"ETIMEDOUT",message:"PRIVATE_SENTINEL"}},
    {...outcome(first),status:137},outcome(first)]){
    let calls=0,ticks=0;
    assert.throws(()=>runWorkerEntrypointSequence(()=>{calls++;return result;},()=>[0,0,26000][Math.min(ticks++,2)]),/^Error: WORKER_ENTRYPOINT_FIXTURE_INCOMPLETE$/);
    assert.equal(calls,1);
  }
  let calls=0;assert.throws(()=>runWorkerEntrypointSequence(()=>{calls++;return outcome(first);},()=>NaN));assert.equal(calls,0);
});

test("remaining monotonic budget, never a new full timeout, bounds the next child",()=>{
  let calls=0,ticks=0;
  const clock=()=>[0,24000,25001][Math.min(ticks++,2)];
  assert.throws(()=>runWorkerEntrypointSequence((_executable,_args,options)=>{
    calls++;assert.equal(options.timeout,1000);return outcome(workerEntrypointCases()[0]);
  },clock),/^Error: WORKER_ENTRYPOINT_FIXTURE_INCOMPLETE$/);assert.equal(calls,1);
});

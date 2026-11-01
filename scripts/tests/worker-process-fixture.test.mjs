import assert from "node:assert/strict";
import test from "node:test";
import {runWorkerProcessDeadlineSequence} from "../fixtures/worker-process-fixture.mjs";
import {workerProcessDeadlineResult} from "./fixtures/worker-session-results.mjs";

function reply(args){const program=args[2],normal=program.includes('process.stdout.write("NATURAL")');return {status:normal?0:1,signal:null,
  stdout:normal?"NATURAL":program.includes("PRIVATE_WATCHDOG_REASON")?"":"CAPPED",stderr:""};}

test("three fixed child probes preserve no-credential limits and distinguish natural exit from retained I/O",()=>{
  let calls=0;
  const result=runWorkerProcessDeadlineSequence((executable,args,options)=>{
    calls++;assert.equal(executable,"/nodejs/bin/node");assert.deepEqual(args.slice(0,2),["--input-type=module","--eval"]);
    assert.ok(args[2].includes('from"/app/main.mjs"'));assert.ok(args[2].includes("limitMs:100"));
    assert.equal(options.cwd,"/app");assert.equal(options.timeout,3000);assert.equal(options.killSignal,"SIGKILL");
    assert.deepEqual(options.env,{NODE_ENV:"production",NODE_DISABLE_COMPILE_CACHE:"1",AWS_EC2_METADATA_DISABLED:"true"});
    return reply(args);
  },()=>0);
  assert.equal(calls,3);assert.deepEqual(result,workerProcessDeadlineResult());
});

test("timeout, signal, private output or wrong exit fail instead of crediting the parent's forced termination",()=>{
  for(const change of [r=>({...r,status:null,error:{code:"ETIMEDOUT"}}),r=>({...r,signal:"SIGKILL"}),
    r=>({...r,stdout:"PRIVATE_REASON"}),r=>({...r,stderr:"PRIVATE_REASON"}),r=>({...r,status:2})]){
    let calls=0;assert.throws(()=>runWorkerProcessDeadlineSequence((_executable,args)=>{calls++;return change(reply(args));},()=>0));
    assert.equal(calls,1);
  }
});

test("invalid or expired sequence clocks cannot start a child",()=>{
  for(const value of [NaN,Infinity,-1]){let calls=0;assert.throws(()=>runWorkerProcessDeadlineSequence(()=>{calls++;},()=>value));assert.equal(calls,0);}
  let reads=0,calls=0;assert.throws(()=>runWorkerProcessDeadlineSequence(()=>{calls++;},()=>reads++?10000:0));assert.equal(calls,0);
});

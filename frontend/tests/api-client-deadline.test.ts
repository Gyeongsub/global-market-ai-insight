import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { MarketApiClient, MarketApiError } from "../src/api/jobs.js";

const jobId="job_0123456789abcdef0123456789abcdef0123456789abcdef";
const accepted={jobId,status:"QUEUED" as const,statusUrl:`/v1/jobs/${jobId}`,expiresAt:"2026-09-06T00:00:00.000Z"};
function deferred<T>() {
  let resolve!: (value:T)=>void,reject!: (error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function within<T>(pending:Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([pending,new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>reject(Error("TEST_LOCAL_ACKNOWLEDGEMENT_DID_NOT_SETTLE")),2500);
  })]);}finally{if(timer!==undefined)clearTimeout(timer);}
}
const safeAbort=(error:unknown)=>error instanceof DOMException&&error.name==="AbortError"&&!error.message.includes("PRIVATE_SENTINEL");

test("cancelled submissions never start a POST", async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort("PRIVATE_SENTINEL");
  const client = new MarketApiClient("https://api.example.test", async () => {
    calls++; return new Response(JSON.stringify(accepted), { status: 202, headers: { "content-type": "application/json" } });
  });
  await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" },
    "018f1c2a-b3d4-7e5f-8a90-123456789abc", controller.signal), safeAbort);
  assert.equal(calls, 0);
});

test("already-aborted requests do not start transport or reflect a private abort reason",async()=>{
  let calls=0;const controller=new AbortController();controller.abort("PRIVATE_SENTINEL");
  const client=new MarketApiClient("https://api.example.test",async()=>{calls++;throw Error("PRIVATE_SENTINEL");});
  await assert.rejects(within(client.getJob(jobId,controller.signal)),safeAbort);
  assert.equal(calls,0);assert.equal(getEventListeners(controller.signal,"abort").length,0);
});

test("caller abort settles despite an uncooperative fetch and removes both levels of abort listeners",async()=>{
  const ready=deferred<void>(),controller=new AbortController();let transportSignal:AbortSignal|null|undefined,calls=0;
  const client=new MarketApiClient("https://api.example.test",(_url,init)=>{
    calls++;transportSignal=init?.signal;ready.resolve(undefined);return new Promise<Response>(()=>{});
  });
  const pending=client.getJob(jobId,controller.signal);await ready.promise;controller.abort("PRIVATE_SENTINEL");
  await assert.rejects(within(pending),safeAbort);assert.equal(calls,1);assert.equal(transportSignal?.aborted,true);
  assert.equal(getEventListeners(controller.signal,"abort").length,0);
  assert.equal(getEventListeners(transportSignal!,"abort").length,0);
});

test("the existing polling deadline settles an ignored fetch with no retry, status callback or remote-stop claim",async()=>{
  let calls=0,statusCalls=0;const client=new MarketApiClient("https://api.example.test",()=>{
    calls++;return new Promise<Response>(()=>{});
  });
  await assert.rejects(within(client.pollJob(accepted,{maxDurationMs:1000,onStatus:()=>{statusCalls++;}})),
    error=>error instanceof MarketApiError&&error.code==="POLL_TIMEOUT"&&!error.message.includes("PRIVATE_SENTINEL"));
  assert.equal(calls,1);assert.equal(statusCalls,0);
});

test("a response arriving after abort is discarded and its body cancellation cannot hold acknowledgement open",async()=>{
  const ready=deferred<void>(),transport=deferred<Response>(),cancelled=deferred<void>(),controller=new AbortController();let cancels=0;
  const client=new MarketApiClient("https://api.example.test",()=>{ready.resolve(undefined);return transport.promise;});
  const pending=client.getJob(jobId,controller.signal);await ready.promise;controller.abort();
  await assert.rejects(within(pending),safeAbort);
  transport.resolve(new Response(new ReadableStream<Uint8Array>({cancel(){cancels++;cancelled.resolve(undefined);return new Promise<void>(()=>{});}}),
    {headers:{"content-type":"application/json"}}));
  await within(cancelled.promise);assert.equal(cancels,1);
});

test("late private transport rejection is consumed instead of becoming an unhandled rejection",async()=>{
  const ready=deferred<void>(),transport=deferred<Response>(),controller=new AbortController();const unhandled:unknown[]=[];
  const listener=(error:unknown)=>{unhandled.push(error);};process.on("unhandledRejection",listener);
  try{
    const client=new MarketApiClient("https://api.example.test",()=>{ready.resolve(undefined);return transport.promise;});
    const pending=client.getJob(jobId,controller.signal);await ready.promise;controller.abort();
    await assert.rejects(within(pending),safeAbort);transport.reject(Error("PRIVATE_SENTINEL"));
    await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);
  }finally{process.removeListener("unhandledRejection",listener);}
});

test("pending custom reads settle on abort even when cancel hangs or throws; cleanup never reflects private errors",async()=>{
  for(const mode of ["hang","throw"]){
    const reading=deferred<void>(),controller=new AbortController();let cancels=0,releases=0,reads=0;
    const reader={read(){reads++;reading.resolve(undefined);return new Promise<ReadableStreamReadResult<Uint8Array>>(()=>{});},
      cancel(){cancels++;if(mode==="throw")throw Error("PRIVATE_SENTINEL");return new Promise<void>(()=>{});},
      releaseLock(){releases++;throw Error("PRIVATE_SENTINEL");}};
    const response={ok:true,status:200,headers:new Headers({"content-type":"application/json"}),body:{getReader:()=>reader}} as unknown as Response;
    const client=new MarketApiClient("https://api.example.test",async()=>response);
    const pending=client.getJob(jobId,controller.signal);await reading.promise;controller.abort("PRIVATE_SENTINEL");
    await assert.rejects(within(pending),safeAbort);assert.equal(reads,1);assert.equal(cancels,1);assert.equal(releases,1);
    assert.equal(getEventListeners(controller.signal,"abort").length,0);
  }
});

test("late stream bytes cannot resume JSON parsing or polling callbacks after abort",async()=>{
  const reading=deferred<void>(),chunk=deferred<ReadableStreamReadResult<Uint8Array>>(),controller=new AbortController();let reads=0,cancels=0,statuses=0;
  const reader={read(){reads++;reading.resolve(undefined);return chunk.promise;},cancel(){cancels++;return Promise.resolve();},releaseLock(){}};
  const response={ok:true,status:200,headers:new Headers({"content-type":"application/json"}),body:{getReader:()=>reader}} as unknown as Response;
  const client=new MarketApiClient("https://api.example.test",async()=>response);
  const pending=client.pollJob(accepted,{signal:controller.signal,onStatus:()=>{statuses++;}});
  await reading.promise;controller.abort();await assert.rejects(within(pending),safeAbort);
  chunk.resolve({done:false,value:new TextEncoder().encode("PRIVATE_SENTINEL")});
  await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,1);assert.equal(cancels,1);assert.equal(statuses,0);
});

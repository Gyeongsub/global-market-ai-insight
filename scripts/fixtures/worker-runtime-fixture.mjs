import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Synthetic facts only. This inert module is evaluated inside an isolated
// local image by the explicit operator, never fetched or installed at runtime.
export async function runWorkerRuntimeScenarios(worker) {
  for (const key of ["runOneShotWorker","TwelveDataProvider","BedrockAnalysisAdapter","safeWorkerLogError"])
    assert.equal(typeof worker[key],"function");
  const hash = text => createHash("sha256").update(text).digest("hex");
  const origin = Date.parse("2026-10-18T00:00:00Z");
  const deadlineMessage = "JOB_DEADLINE_EXCEEDED";
  const quoteBody = symbol => ({symbol,name:symbol === "SPCX" ? "Space Exploration Technologies Corp." : "Synthetic security",
    exchange:"NASDAQ",currency:"USD",timestamp:1_760_724_000,close:"100",change:"1",percent_change:"1",is_market_open:false});
  const modelResponse = symbol => ({stopReason:"tool_use",output:{message:{content:[{toolUse:{name:"select_grounded_insights",input:{
    observationIds:["QUOTE_SNAPSHOT","QUOTE_CHANGE"],riskIds:["MARKET_PRICE_RISK",...(symbol==="QLD"?["QLD_LEVERAGED_DOWNSIDE","QLD_PATH_DEPENDENCY"]:[])],
    specialConsiderationIds:["DATA_PROVENANCE",...(symbol==="QLD"?["QLD_DAILY_RESET"]:[])],uncertaintyId:"SINGLE_QUOTE_NO_FORECAST",
  }}}]}},usage:{inputTokens:500,outputTokens:100,totalTokens:600}});
  let sequence=0,normalCases=0,negativeCases=0,providerRequests=0,modelRequests=0;
  function setup({symbol="QLD",locale="en",operation="ANALYZE",stage="normal"}={}) {
    const index=++sequence,jobId=`01LOCALRUNTIME${String(index).padStart(12,"0")}`;
    let clock=origin;const counts={provider:0,model:0,abortObserved:false,backoffCancelled:false};
    let job={jobId,symbol,locale,operation,status:"QUEUED",idempotencyKeyHash:hash("synthetic-key"),requestHash:hash(`${operation}|${symbol}|${locale}`),
      createdAt:new Date(origin).toISOString(),updatedAt:new Date(origin).toISOString(),deadlineAt:new Date(origin+90_000).toISOString(),
      expiresAt:Math.floor(origin/1000)+86_400,attemptCount:0,version:1,schemaVersion:"1.0.0"};
    if(stage==="expired") job={...job,deadlineAt:new Date(origin).toISOString()};
    const stalled=["uncooperative-provider","uncooperative-model","stalled-body-cancel","stalled-backoff"];
    if(["active-provider","active-model","retry","late-model",...stalled].includes(stage)) job={...job,deadlineAt:new Date(origin+30).toISOString()};
    const transitions=[];
    const repository={async load(id){assert.equal(id,jobId);return job;},async transition(input){
      assert.equal(input.current.status,job.status);assert.equal(input.current.version,job.version);
      assert.ok(["QUEUED","RUNNING"].includes(job.status));
      transitions.push(input.next);
      job={...job,status:input.next,version:job.version+1,updatedAt:input.now.toISOString(),
        attemptCount:input.next==="RUNNING"?job.attemptCount+1:job.attemptCount,
        ...(input.next==="SUCCEEDED"?{result:input.result}:input.next==="FAILED"||input.next==="TIMED_OUT"?{errorCode:input.errorCode,errorMessage:input.errorMessage}:{})};
      if(stage==="claim"&&input.next==="RUNNING") clock=Date.parse(job.deadlineAt);
      return job;
    }};
    const timers=new Set(),lateCompletions=[];
    const ignoreAbort=signal=>new Promise((resolve,reject)=>{
      assert.equal(signal instanceof AbortSignal,true);
      const fallback=setTimeout(()=>{timers.delete(fallback);reject(new Error("SYNTHETIC_UNCOOPERATIVE_FIXTURE_EXCEEDED"));},1500);timers.add(fallback);
      signal.addEventListener("abort",()=>{counts.abortObserved=true;},{once:true});
      lateCompletions.push(()=>{clearTimeout(fallback);timers.delete(fallback);resolve();});
    });
    const waitForAbort=signal=>new Promise((resolve,reject)=>{
      assert.equal(signal instanceof AbortSignal,true);
      const fallback=setTimeout(()=>{timers.delete(fallback);reject(new Error("SYNTHETIC_FIXTURE_ABORT_MISSING"));},1500);timers.add(fallback);
      const done=()=>{clearTimeout(fallback);timers.delete(fallback);counts.abortObserved=true;
        if(["late-model","adapter-provider","adapter-model"].includes(stage)) resolve();else reject(Object.assign(new Error("PRIVATE_FIXTURE_REASON"),{name:"AbortError"}));};
      if(signal.aborted)done();else signal.addEventListener("abort",done,{once:true});
    });
    const provider=new worker.TwelveDataProvider({apiKey:"fixture-key",now:()=>new Date(origin),
      ...(stage==="stalled-backoff"?{sleep:async(_delay,signal)=>{await ignoreAbort(signal);}}:{}),
      ...(stage==="adapter-provider"?{timeoutMs:100,maxAttempts:1}:{}),fetchImpl:async(url,options)=>{
      const parsed=new URL(url);assert.equal(parsed.origin,"https://api.twelvedata.com");assert.equal(parsed.searchParams.get("symbol"),symbol);
      assert.equal(options.headers.Authorization,"apikey fixture-key");assert.equal(options.credentials,"omit");assert.equal(options.redirect,"error");
      counts.provider++;providerRequests++;
      if(["active-provider","adapter-provider"].includes(stage)) await waitForAbort(options.signal);
      if(stage==="uncooperative-provider") await ignoreAbort(options.signal);
      if(stage==="stalled-body-cancel")return new Response(new ReadableStream({cancel:()=>ignoreAbort(options.signal)}),{status:429});
      if(stage==="stalled-backoff")return new Response(null,{status:429,headers:{"retry-after":"0"}});
      if(stage==="provider") clock=Date.parse(job.deadlineAt);
      if(stage==="retry") {
        options.signal.addEventListener("abort",()=>{counts.backoffCancelled=true;},{once:true});
        return new Response(null,{status:429,headers:{"retry-after":"2"}});
      }
      return new Response(JSON.stringify(quoteBody(symbol)),{headers:{"content-type":"application/json"}});
    }});
    const engine=new worker.BedrockAnalysisAdapter({modelId:"amazon.nova-lite-v1:0",...(stage==="adapter-model"?{timeoutMs:500}:{}),transport:{async converse(request,options){
      counts.model++;modelRequests++;assert.equal(request.inferenceConfig.maxTokens,512);
      if(["active-model","late-model","adapter-model"].includes(stage)) await waitForAbort(options.abortSignal);
      if(stage==="uncooperative-model") await ignoreAbort(options.abortSignal);
      if(stage==="invalid-model") return {...modelResponse(symbol),stopReason:"SYNTHETIC_PRIVATE_CONTENT"};
      return modelResponse(symbol);
    }}});
    return {jobId,counts,transitions,repository,marketDataProvider:provider,analysisEngine:engine,now:()=>new Date(clock),
      job:()=>job,cleanup(){lateCompletions.forEach(finish=>finish());for(const timer of timers)clearTimeout(timer);timers.clear();}};
  }
  for(const symbol of ["VOO","QLD","TSLA","SPCX","GOOG"]) for(const locale of ["en","ja","ko"]) for(const operation of ["PRICE","ANALYZE"]) {
    const context=setup({symbol,locale,operation});
    try {
      const result=await worker.runOneShotWorker(context.jobId,context);
      assert.equal(result.status,"SUCCEEDED");assert.equal(result.result.symbol,symbol);assert.equal(context.counts.provider,1);
      assert.equal(context.counts.model,operation==="ANALYZE"?1:0);assert.deepEqual(context.transitions,["RUNNING","SUCCEEDED"]);
      if(operation==="ANALYZE") {assert.equal(result.result.locale,locale);assert.ok(result.result.disclaimer.length>0);}
      normalCases++;
    } finally {context.cleanup();}
  }
  for(const stage of ["expired","claim","provider","active-provider","active-model","retry","late-model",
    "uncooperative-provider","uncooperative-model","stalled-body-cancel","stalled-backoff"]) {
    const context=setup({stage});
    try {
      await assert.rejects(worker.runOneShotWorker(context.jobId,context),error=>error?.code===deadlineMessage&&!/PRIVATE/.test(error.message));
      assert.equal(context.job().status,"TIMED_OUT");assert.equal(context.job().result,undefined);
      assert.equal(context.counts.provider,["expired","claim"].includes(stage)?0:1);
      assert.equal(context.counts.model,["active-model","late-model","uncooperative-model"].includes(stage)?1:0);
      if(["active-provider","active-model","late-model","uncooperative-provider","uncooperative-model","stalled-body-cancel","stalled-backoff"].includes(stage))assert.equal(context.counts.abortObserved,true);
      if(stage==="retry")assert.equal(context.counts.backoffCancelled,true);
      negativeCases++;
    } finally {context.cleanup();}
  }
  for(const stage of ["adapter-provider","adapter-model"]) {
    const context=setup({stage});
    try {
      await assert.rejects(worker.runOneShotWorker(context.jobId,context),error=>error?.code===(stage==="adapter-provider"?"PROVIDER_ERROR":"MODEL_ERROR"));
      assert.equal(context.job().status,"FAILED");assert.equal(context.job().result,undefined);assert.equal(context.counts.abortObserved,true);
      assert.equal(context.counts.provider,1);assert.equal(context.counts.model,stage==="adapter-model"?1:0);negativeCases++;
    } finally {context.cleanup();}
  }
  const duplicate=setup({operation:"PRICE"});
  try {
    await worker.runOneShotWorker(duplicate.jobId,duplicate);
    await assert.rejects(worker.runOneShotWorker(duplicate.jobId,duplicate),error=>error?.code==="JOB_NOT_CLAIMABLE");
    assert.equal(duplicate.counts.provider,1);assert.equal(duplicate.counts.model,0);negativeCases++;
  } finally {duplicate.cleanup();}
  const invalid=setup({stage:"invalid-model"});
  try {
    await assert.rejects(worker.runOneShotWorker(invalid.jobId,invalid),error=>error?.code==="MODEL_ERROR"&&!/PRIVATE/.test(error.message));
    assert.equal(invalid.job().status,"FAILED");assert.equal(invalid.job().result,undefined);
    assert.equal(invalid.counts.provider,1);assert.equal(invalid.counts.model,1);
    assert.equal(JSON.stringify(invalid.job()).includes("SYNTHETIC_PRIVATE_CONTENT"),false);negativeCases++;
  } finally {invalid.cleanup();}
  return {schemaVersion:1,mode:"offline-worker-runtime-fixture",normalCases,negativeCases,totalCases:normalCases+negativeCases,
    mockedProviderRequests:providerRequests,mockedModelRequests:modelRequests,realProviderRequests:0,realModelRequests:0,awsCalls:0,
    realDataCoverageClaimed:false,remoteCancellationOrBillingAcceptanceClaimed:false};
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { runLocalFixture, runWorkerEntry, safeLogJobId, safeWorkerFailureLogFields, safeWorkerLogError } from "../src/main.js";
import { WorkerLifecycleError } from "../src/worker-lifecycle.js";

const fixture = JSON.stringify({
  operation: "ANALYZE",
  symbol: "QLD",
  locale: "en",
  quote: {
    symbol: "QLD",
    price: 138.17,
    currency: "USD",
    marketTimestamp: "2026-08-07T20:00:00Z",
    retrievedAt: "2026-08-08T00:00:00Z",
    marketState: "CLOSED",
    freshness: "LATEST_AVAILABLE",
    source: "local-contract-fixture"
  }
});

// Only OS bootstrap variables, never developer credentials, endpoint overrides,
// preload/coverage flags or the user's profile are inherited by process fixtures.
function childEnvironment(extra: Record<string,string>) {
  const env: Record<string,string>={NODE_DISABLE_COMPILE_CACHE:"1",NODE_TLS_REJECT_UNAUTHORIZED:"1"};
  for(const key of ["PATH","Path","SystemRoot","SYSTEMROOT","WINDIR","ComSpec","TEMP","TMP"]){
    const value=process.env[key];if(value!==undefined)env[key]=value;
  }
  return {...env,...extra};
}
function entry(extra: Record<string,string>) {
  return spawnSync(process.execPath,["--import","tsx",resolve("services/worker/src/main.ts")],{
    encoding:"utf8",windowsHide:true,timeout:15000,maxBuffer:32768,env:childEnvironment(extra),
  });
}

test("an unrecognized environment is a fixed log label, never the supplied private value",()=>{
  const result=entry({APP_ENV:"PRIVATE_ENV_SENTINEL",JOB_ID:"01J00000000000000000000000"});
  assert.equal(result.status,1);assert.equal(result.signal,null);assert.equal(result.error,undefined);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_ENV_SENTINEL/);
  const logs=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.deepEqual(logs.map(row=>row.environment),["unknown","unknown"]);
  assert.deepEqual(logs.map(row=>row.status),["STARTING","FAILED"]);
});

test("entry rejects invalid correlation IDs before even the local operation begins",async()=>{
  for(const jobId of ["short","unsafe\nPRIVATE_ID_SENTINEL","x".repeat(65),"", " space padded id "]){
    await assert.rejects(runWorkerEntry({APP_ENV:"local",JOB_ID:jobId,LOCAL_JOB_FIXTURE_JSON:fixture}),/JOB_ID/);
  }
});

for(const [locale,language] of [["en",/dated snapshot/],["ja",/日時付きスナップショット/],["ko",/날짜 표시 스냅샷/]] as const)
  test(`local analysis fixture uses the same grounded ${locale} renderer rather than English-only text`,()=>{
    const input={...JSON.parse(fixture),locale};
    const result=runLocalFixture("01J00000000000000000000000",JSON.stringify(input));
    assert.equal(result.kind,"ANALYSIS");if(result.kind!=="ANALYSIS")throw new Error("EXPECTED_ANALYSIS");
    assert.equal(result.locale,locale);assert.match(result.summary,language);assert.equal(result.opportunities.length,0);
    assert.equal(result.risks.length,3);assert.equal(result.specialConsiderations.length,2);
    assert.equal(result.modelId,"local-fixture-model");assert.equal(result.dataAsOf,input.quote.marketTimestamp.replace("Z",".000Z"));
  });

test("the actual local analysis entry logs ANALYZE, not the result kind ANALYSIS",()=>{
  const result=entry({APP_ENV:"local",JOB_ID:"01J00000000000000000000000",LOCAL_JOB_FIXTURE_JSON:fixture});
  assert.equal(result.status,0);assert.equal(result.stderr,"");
  const logs=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.equal(logs.at(-1).operation,"ANALYZE");assert.doesNotMatch(result.stdout,/local-contract-fixture|138\.17|summary|disclaimer/);
});

test("runs a mocked ANALYZE operation without AWS or a live provider", () => {
  const result = runLocalFixture("01J00000000000000000000000", fixture);
  assert.equal(result.kind, "ANALYSIS");
  if (result.kind === "ANALYSIS") {
    assert.equal(result.promptVersion, "grounded-v1");
    assert.match(result.summary, /2x daily/);
  }
});

test("worker log mapping never emits arbitrary error details", () => {
  const privateDetail = "AKIAEXAMPLE bearer-secret https://169.254.170.2/private";
  const arbitrary = Object.assign(new Error(privateDetail), { stack: privateDetail, credentials: privateDetail });
  assert.deepEqual(safeWorkerLogError(arbitrary), {
    errorCode: "WORKER_CONFIGURATION_ERROR",
    message: "Worker execution could not start.",
  });

  const classified = safeWorkerLogError(new WorkerLifecycleError(
    "INTERNAL_ERROR",
    "Worker repository operation failed.",
    "REPOSITORY_NETWORK_ERROR",
  ));
  assert.deepEqual(classified, {
    errorCode: "INTERNAL_ERROR",
    message: "Worker repository operation failed.",
    diagnosticCategory: "REPOSITORY_NETWORK_ERROR",
  });
  assert.doesNotMatch(JSON.stringify({ arbitrary: safeWorkerLogError(arbitrary), classified }), /AKIAEXAMPLE|bearer-secret|169\.254\.170\.2/i);
});

test("worker failure telemetry omits even the stable human-readable message", () => {
  const fields = safeWorkerFailureLogFields(new WorkerLifecycleError(
    "INTERNAL_ERROR",
    "Worker repository operation failed.",
    "REPOSITORY_TIMEOUT",
  ));
  assert.deepEqual(fields, {
    errorCode: "INTERNAL_ERROR",
    diagnosticCategory: "REPOSITORY_TIMEOUT",
  });
  assert.doesNotMatch(JSON.stringify(fields), /message|repository operation failed/i);
});

test("worker logs only a bounded job identifier for correlation", () => {
  assert.equal(safeLogJobId("01J00000000000000000000000"), "01J00000000000000000000000");
  assert.equal(safeLogJobId("job_0123456789abcdef0123456789abcdef0123456789abcdef"), "job_0123456789abcdef0123456789abcdef0123456789abcdef");
  assert.equal(safeLogJobId("\nsecret-token"), undefined);
  assert.equal(safeLogJobId("x".repeat(65)), undefined);
  assert.equal(safeLogJobId(undefined), undefined);
});

test("failed local entry logs the job ID but never the invalid fixture or unsafe ID", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("services/worker/src/main.ts");
  const fixture = "private-fixture-marker";
  const run = (jobId: string) => spawnSync(process.execPath, [cli, entry], {
    encoding: "utf8",
    env: childEnvironment({ APP_ENV: "local", JOB_ID: jobId, LOCAL_JOB_FIXTURE_JSON: fixture }),
    windowsHide:true,timeout:15000,maxBuffer:32768,
  });
  const valid = run("01J00000000000000000000000");
  assert.equal(valid.status, 1);
  assert.match(valid.stdout, /"jobId":"01J00000000000000000000000","status":"FAILED"/);
  assert.doesNotMatch(valid.stdout, /"message":/);
  assert.doesNotMatch(valid.stdout + valid.stderr, /private-fixture-marker/);

  const unsafe = run("unsafe-id\nprivate-job-marker");
  assert.equal(unsafe.status, 1);
  assert.doesNotMatch(unsafe.stdout + unsafe.stderr, /private-job-marker|"jobId":/);
});

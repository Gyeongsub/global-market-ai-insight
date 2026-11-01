import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { startLocalFixtureApi, validateLocalFixtureRequest, LOCAL_FIXTURE_LIMITS } from "../src/fixture-api.js";
import { MarketApiClient, type JobRequest } from "../../../frontend/src/api/jobs.js";
import { createJobSession } from "../../../frontend/src/api/job-session.js";
import { getAsset } from "../../../frontend/src/data/assets.js";

const intent: JobRequest = { operation: "ANALYZE", symbol: "QLD", locale: "ko" };
const syntheticRequest = () => ({ method: "GET", url: "/v1/health", headers: { host: "127.0.0.1:4174" }, rawHeaders: ["Host", "127.0.0.1:4174"] });

test("local API has fixed resource ceilings and no arbitrary listening host/port", async () => {
  assert.equal(LOCAL_FIXTURE_LIMITS.lifetimeMs, 300000); assert.equal(LOCAL_FIXTURE_LIMITS.jobs, 32);
  assert.equal(LOCAL_FIXTURE_LIMITS.activeJobs, 1); assert.equal(LOCAL_FIXTURE_LIMITS.requests, 512);
  for (const port of [-1, 80, 443, 5173, NaN, Infinity]) await assert.rejects(startLocalFixtureApi(port));
  assert.throws(() => getAsset("PRIVATE_SENTINEL" as never));
});

test("HTTP request guard rejects external origins, credentials, routes, encoding and duplicate headers", () => {
  assert.equal(validateLocalFixtureRequest(syntheticRequest(), "http://127.0.0.1:4174").routeKey, "GET /v1/health");
  type SyntheticRequest = ReturnType<typeof syntheticRequest> & { headers: Record<string, string> };
  const changes: Array<(request: SyntheticRequest) => void> = [request => { request.headers.host = "example.invalid"; }, request => { request.headers.origin = "https://example.invalid"; },
    request => { request.headers.authorization = "PRIVATE_SENTINEL"; }, request => { request.headers.cookie = "PRIVATE_SENTINEL"; },
    request => { request.headers["x-amz-security-token"] = "PRIVATE_SENTINEL"; }, request => { request.headers["transfer-encoding"] = "chunked"; },
    request => { request.headers["x-local-fixture-scenario"] = "PRIVATE_SENTINEL"; }, request => { request.url = "/v1/health?secret=PRIVATE_SENTINEL"; },
    request => { request.url = "/%2e%2e/.aws/credentials"; }, request => { request.url = "/.git/config"; },
    request => { request.method = "DELETE"; }, request => { request.rawHeaders.push("HOST", "127.0.0.1:4174"); }];
  for (const change of changes) {
    const request = syntheticRequest() as SyntheticRequest;
    change(request); assert.throws(() => validateLocalFixtureRequest(request, "http://127.0.0.1:4174"));
  }
});

test("real loopback HTTP carries controller acceptance, async result validation and no private job fields", async () => {
  const app = await startLocalFixtureApi(0);
  try {
    const client = new MarketApiClient(app.origin), session = createJobSession(client, () => {});
    await session.start(intent); const state = session.getState();
    if (state.status !== "SUCCEEDED") assert.fail(JSON.stringify(state));
    assert.equal(state.resultAvailable, true); assert.equal(state.job.result?.locale, "ko");
    assert.equal(state.job.result?.modelId, "local-contract-fixture-no-model-called");
    assert.doesNotMatch(JSON.stringify(state.job), /taskArn|requestHash|idempotencyKeyHash|local-fixture-task/);
    assert.equal(app.snapshot().launches, 1); assert.equal(app.snapshot().awsCalls, 0);
    const health = await fetch(app.origin + "/v1/health").then(response => response.json());
    assert.equal(health.status, "ok"); assert.equal(app.snapshot().launches, 1);
  } finally { await app.close(); }
  assert.equal(app.snapshot().listening, false); assert.equal(app.snapshot().jobsRetained, 0); assert.equal(app.snapshot().timersRetained, 0);
  await app.close();
});

test("real same-key HTTP replay preserves one launch and conflicting intent is rejected", async () => {
  const app = await startLocalFixtureApi(0), key = randomUUID();
  try {
    const client = new MarketApiClient(app.origin), first = createJobSession(client, () => {});
    await first.start(intent, key);
    const replay = createJobSession(client, () => {}); await replay.start(intent, key);
    assert.equal(replay.getState().status, "SUCCEEDED"); assert.equal(app.snapshot().launches, 1);
    const conflict = createJobSession(client, () => {}); await conflict.start({ ...intent, symbol: "TSLA" }, key);
    const state = conflict.getState(); if (state.status !== "FAILED") assert.fail();
    assert.equal(state.code, "IDEMPOTENCY_CONFLICT"); assert.equal(app.snapshot().launches, 1);
  } finally { await app.close(); }
});

test("SPCX cannot become a fabricated successful result through the default HTTP scenario", async () => {
  const app = await startLocalFixtureApi(0);
  try {
    const client = new MarketApiClient(app.origin);
    for (const operation of ["PRICE", "ANALYZE"] as const) {
      const session = createJobSession(client, () => {});
      await session.start({ operation, symbol: "SPCX", locale: "ko" });
      const state = session.getState();
      if (state.status !== "FAILED") assert.fail();
      assert.equal(state.code, "DATA_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(state), /SpaceX|133\.11|15\.83|"result"/);
      session.dispose();
    }
    assert.equal(app.snapshot().awsCalls, 0); assert.equal(app.snapshot().activeJobs, 0);
  } finally { await app.close(); }
  assert.equal(app.snapshot().jobsRetained, 0); assert.equal(app.snapshot().timersRetained, 0);
});

test("real local circuit and launch failures never start an AWS task or expose a private cause", async t => {
  t.mock.method(console, "warn", () => {});
  for (const [scenario, code] of [["circuit", "CIRCUIT_OPEN"], ["launch-failure", "TASK_LAUNCH_FAILED"]] as const) {
    const app = await startLocalFixtureApi(0);
    try {
      const client = new MarketApiClient(app.origin, (input, init) => fetch(input, { ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), "x-local-fixture-scenario": scenario } }));
      const session = createJobSession(client, () => {}); await session.start(intent);
      const state = session.getState(); if (state.status !== "FAILED") assert.fail();
      assert.equal(state.code, code); assert.equal(app.snapshot().launches, 0);
      assert.equal(await session.start(intent), false);
    } finally { await app.close(); }
  }
});

test("HTTP boundary refuses private headers and oversized bodies without storing work", async () => {
  const app = await startLocalFixtureApi(0);
  try {
    for (const headers of [{ authorization: "PRIVATE_SENTINEL" }, { cookie: "PRIVATE_SENTINEL" }, { origin: "https://example.invalid" }]) {
      const response = await fetch(app.origin + "/v1/health", { headers }); assert.equal(response.status, 400);
      assert.doesNotMatch(await response.text(), /PRIVATE_SENTINEL|example.invalid/);
    }
    const response = await fetch(app.origin + "/v1/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(4097) });
    assert.equal(response.status, 400); assert.equal(app.snapshot().admitted, 0);
  } finally { await app.close(); }
});

test("server-side unavailable and timeout fixtures preserve their typed terminal states", async t => {
  t.mock.method(console, "warn", () => {});
  // Mirror the worker's stored deadline code. It is not an HTTP envelope code;
  // the browser retains its typed TIMED_OUT state and redacted code fallback.
  for (const [scenario, status, code] of [["unavailable", "FAILED", "DATA_UNAVAILABLE"], ["timeout", "TIMED_OUT", "REQUEST_FAILED"]] as const) {
    const app = await startLocalFixtureApi(0);
    try {
      const client = new MarketApiClient(app.origin, (input, init) => fetch(input, { ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers).entries()), "x-local-fixture-scenario": scenario } }));
      const session = createJobSession(client, () => {}); await session.start(intent);
      const state = session.getState(); assert.equal(state.status, status);
      if (state.status !== "FAILED" && state.status !== "TIMED_OUT") assert.fail();
      assert.equal(state.code, code); assert.equal(app.snapshot().launches, 1); assert.equal(app.snapshot().activeJobs, 0);
      assert.equal(state.remoteMayContinue, true);
    } finally { await app.close(); }
  }
});

test("closing with work in flight clears memory/timers and never completes a later callback", async () => {
  const app = await startLocalFixtureApi(0), client = new MarketApiClient(app.origin);
  try { await client.createJob(intent); } finally { await app.close(); }
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual({ retained: app.snapshot().jobsRetained, timers: app.snapshot().timersRetained, active: app.snapshot().activeJobs }, { retained: 0, timers: 0, active: 0 });
  assert.equal(app.snapshot().closed, true); assert.equal(app.snapshot().listening, false);
});

test("CORS permits only the exact loopback dev origin and fixed credential-free methods/headers", async () => {
  const app = await startLocalFixtureApi(0);
  try {
    const headers = { origin: "http://127.0.0.1:5173", "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,idempotency-key,x-local-fixture-scenario" };
    const response = await fetch(app.origin + "/v1/jobs", { method: "OPTIONS", headers });
    assert.equal(response.status, 204); assert.equal(response.headers.get("access-control-allow-origin"), headers.origin);
    assert.equal(response.headers.get("access-control-allow-credentials"), null); assert.equal(app.snapshot().admitted, 0);
    for (const change of [{ origin: "https://example.invalid" }, { "access-control-request-method": "DELETE" },
      { "access-control-request-headers": "authorization" }]) {
      const rejected = await fetch(app.origin + "/v1/jobs", { method: "OPTIONS", headers: { ...headers, ...change } });
      assert.equal(rejected.status, 400); assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    }
  } finally { await app.close(); }
});

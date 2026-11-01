import assert from "node:assert/strict";
import test from "node:test";
import { MarketApiClient, type JobRequest } from "../src/api/jobs.js";
import { createJobSession, JOB_SESSION_TIMEOUT_MS, type JobSessionState } from "../src/api/job-session.js";
import { canonicalDisclaimer } from "../../shared/schemas/disclaimer.js";

const jobId = "job_0123456789abcdef0123456789abcdef0123456789abcdef";
const key = "018f1c2a-b3d4-7e5f-8a90-123456789abc";
const date = "2026-10-24T00:00:00.000Z", expiry = "2026-10-25T00:00:00.000Z";
const accepted = { jobId, status: "QUEUED", statusUrl: `/v1/jobs/${jobId}`, expiresAt: expiry };
const request: JobRequest = { operation: "PRICE", symbol: "QLD", locale: "ko" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function result(input: JobRequest) {
  return input.operation === "PRICE" ? { kind: "PRICE", symbol: input.symbol, price: 1, currency: "USD",
    marketTimestamp: date, retrievedAt: date, marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "local-contract-test" } :
    { kind: "ANALYSIS", symbol: input.symbol, locale: input.locale, summary: "Local contract fixture only.", observations: [], opportunities: [],
      risks: ["Price uncertainty."], specialConsiderations: [], uncertainty: "No live market or model call.", dataAsOf: date,
      modelId: "local-fixture", promptVersion: "grounded-v1", disclaimer: canonicalDisclaimer(input.locale) };
}
function completed(input: JobRequest = request) {
  return { jobId, ...input, status: "SUCCEEDED", createdAt: date, updatedAt: date, expiresAt: expiry, schemaVersion: "1.0.0", result: result(input) };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); }
async function within<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("TEST_DID_NOT_SETTLE")), 2500); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function harness(response: unknown = completed()) {
  const calls: { method: string; url: string; body?: string | null; signal?: AbortSignal | null }[] = [];
  const client = new MarketApiClient("https://api.example.test", async (url, init) => {
    assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store"); assert.equal(init?.redirect, "error");
    calls.push({ method: init!.method!, url: String(url), body: init?.body as string, signal: init?.signal });
    return init?.method === "POST" ? json(accepted, 202) : json(response);
  });
  const states: JobSessionState[] = [], session = createJobSession(client, state => states.push(state));
  return { calls, states, session };
}

test("all 30 symbol/locale/operation combinations use one POST and checked terminal results", async () => {
  for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
    for (const locale of ["en", "ja", "ko"] as const)
      for (const operation of ["PRICE", "ANALYZE"] as const) {
        const input = { symbol, locale, operation }, h = harness(completed(input));
        assert.equal(await h.session.start(input, key), true);
        assert.deepEqual(h.calls.map(c => c.method), ["POST", "GET"]);
        assert.deepEqual(JSON.parse(h.calls[0].body!), input);
        const state = h.session.getState(); assert.equal(state.status, "SUCCEEDED");
        if (state.status !== "SUCCEEDED") assert.fail();
        assert.equal(state.resultAvailable, true); assert.deepEqual(state.request, input);
        assert.deepEqual(state.job.result, result(input)); assert.equal(h.session.isActive(), false);
        assert.equal(h.session.cancel(), false); assert.equal(await h.session.start(input, key), false);
        assert.equal(h.calls.length, 2);
      }
});

test("a valid result for another operation/symbol/locale never produces a terminal success", async () => {
  for (const input of [{ ...request, symbol: "TSLA" }, { ...request, locale: "en" }, { ...request, operation: "ANALYZE" }] as JobRequest[]) {
    const h = harness(completed(input)); await h.session.start(request, key);
    const state = h.session.getState(); assert.equal(state.status, "FAILED");
    if (state.status !== "FAILED") assert.fail();
    assert.equal(state.code, "INVALID_RESPONSE"); assert.equal(state.remoteMayContinue, true);
    assert.equal(h.states.some(s => s.status === "SUCCEEDED"), false);
    assert.equal("job" in state, false); assert.equal("result" in state, false);
  }
});

test("redacted success remains unavailable with no local fixture or inferred insight", async () => {
  const h = harness({ ...completed(), result: undefined }); await h.session.start(request, key);
  const state = h.session.getState(); if (state.status !== "SUCCEEDED") assert.fail();
  assert.equal(state.resultAvailable, false); assert.equal(state.job.result, undefined);
  assert.equal("hasInsight" in state, false);
});

test("request context is snapshotted; callers cannot relabel the response while awaiting it", async () => {
  const input = { ...request }, h = harness(); const pending = h.session.start(input, key);
  input.symbol = "TSLA"; input.locale = "ja"; input.operation = "ANALYZE";
  await pending;
  assert.deepEqual(JSON.parse(h.calls[0].body!), request);
  const state = h.session.getState(); if (state.status !== "SUCCEEDED") assert.fail();
  assert.deepEqual(state.request, request); assert.equal(Object.isFrozen(state.request), true);
  assert.equal(Object.isFrozen(state), true); assert.equal(Object.isFrozen(state.job), true);
  assert.equal(Object.isFrozen(state.job.result), true);
});

test("double starts and cancellation during an ignored POST cannot submit twice or publish late success", async () => {
  const ready = deferred<void>(), transport = deferred<Response>(); let posts = 0;
  const client = new MarketApiClient("https://api.example.test", () => { posts++; ready.resolve(); return transport.promise; });
  const states: JobSessionState[] = [], session = createJobSession(client, s => states.push(s));
  const pending = session.start(request, key); await ready.promise;
  assert.equal(await session.start(request, key), false); assert.equal(session.cancel(), true);
  assert.equal(await within(pending), true); assert.equal(posts, 1);
  transport.resolve(json(accepted, 202)); await flush();
  const state = session.getState(); assert.equal(state.status, "CANCELLED");
  if (state.status !== "CANCELLED") assert.fail(); assert.equal(state.remoteMayContinue, true);
  assert.deepEqual(states.map(s => s.status), ["SUBMITTING", "CANCELLED"]);
  assert.equal(await session.start(request, key), false); assert.equal(posts, 1);
});

test("reentrant cancellation before POST starts no transport and reports no possible remote start", async () => {
  let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async () => { calls++; return json(accepted, 202); });
  const session = createJobSession(client, state => { if (state.status === "SUBMITTING") session.cancel(); });
  await session.start(request, key);
  const state = session.getState(); if (state.status !== "CANCELLED") assert.fail();
  assert.equal(state.remoteMayContinue, false); assert.equal(calls, 0); assert.equal(session.isActive(), false);
});

test("cancellation after 202 keeps the known job id, makes no poll, and never claims remote task stop", async () => {
  let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async () => { calls++; return json(accepted, 202); });
  const session = createJobSession(client, state => { if (state.status === "QUEUED") session.cancel(); });
  await session.start(request, key);
  const state = session.getState(); if (state.status !== "CANCELLED") assert.fail();
  assert.equal(state.jobId, jobId); assert.equal(state.remoteMayContinue, true); assert.equal(calls, 1);
});

test("dispose while polling prevents all later notifications, retry and result publication", async () => {
  const ready = deferred<void>(), transport = deferred<Response>(); let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async (_url, init) => {
    calls++; if (init?.method === "POST") return json(accepted, 202);
    ready.resolve(); return transport.promise;
  });
  const states: JobSessionState[] = [], session = createJobSession(client, s => states.push(s));
  const pending = session.start(request, key); await ready.promise; const count = states.length;
  session.dispose(); assert.equal(await within(pending), true);
  transport.resolve(json(completed())); await flush();
  assert.equal(states.length, count); assert.equal(calls, 2); assert.equal(await session.start(request, key), false);
  assert.equal(session.isActive(), false);
});

test("remote failure prose and unknown error codes never become view data", async () => {
  for (const code of ["MODEL_ERROR", "PRIVATE_SENTINEL"]) {
    const h = harness({ ...completed(), status: "FAILED", result: undefined, errorCode: code, errorMessage: "PRIVATE_SENTINEL" });
    await h.session.start(request, key);
    const state = h.session.getState(); if (state.status !== "FAILED") assert.fail();
    assert.equal(state.code, code === "MODEL_ERROR" ? "MODEL_ERROR" : "REQUEST_FAILED");
    assert.equal(state.remoteMayContinue, true, "a terminal job record alone is not worker-termination proof");
    assert.doesNotMatch(JSON.stringify(h.states), /PRIVATE_SENTINEL/);
  }
});

test("terminal replay metadata is not trusted before a checked GET; terminal observers cannot cancel it", async () => {
  let calls = 0; const states: JobSessionState[] = [];
  const client = new MarketApiClient("https://api.example.test", async () => ++calls === 1 ? json({ ...accepted, status: "SUCCEEDED" }, 202) : json(completed()));
  const session = createJobSession(client, state => {
    states.push(state);
    if (state.status === "SUCCEEDED") assert.equal(session.cancel(), false);
  });
  await session.start(request, key);
  assert.deepEqual(states.map(s => s.status), ["SUBMITTING", "QUEUED", "SUCCEEDED"]); assert.equal(calls, 2);
});

test("observer errors cannot resubmit a job or leak private prose into session state", async () => {
  let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async () => ++calls === 1 ? json(accepted, 202) : json(completed()));
  const session = createJobSession(client, () => { throw Error("PRIVATE_SENTINEL"); });
  await session.start(request, key);
  assert.equal(calls, 2); assert.equal(session.getState().status, "SUCCEEDED");
  assert.doesNotMatch(JSON.stringify(session.getState()), /PRIVATE_SENTINEL/);
});

test("invalid requests fail before notification/transport and do not consume the intent", async () => {
  const h = harness();
  await assert.rejects(h.session.start({ ...request, privateField: "PRIVATE_SENTINEL" } as JobRequest, key));
  assert.equal(h.calls.length, 0); assert.equal(h.states.length, 0); assert.equal(h.session.getState().status, "IDLE");
  await h.session.start(request, key); assert.equal(h.session.getState().status, "SUCCEEDED");
});

test("known API rejection is localized by code, not remote text; it is never retried", async () => {
  let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async () => { calls++; return json({ error: {
    code: "CIRCUIT_OPEN", message: "PRIVATE_SENTINEL", requestId: "test-fixture" } }, 503); });
  const states: JobSessionState[] = [], session = createJobSession(client, s => states.push(s)); await session.start(request, key);
  const state = session.getState(); if (state.status !== "FAILED") assert.fail();
  assert.equal(state.code, "CIRCUIT_OPEN"); assert.equal(calls, 1); assert.equal(await session.start(request, key), false);
  assert.doesNotMatch(JSON.stringify(states), /PRIVATE_SENTINEL/);
});

test("a whole intent has one fixed deadline, not a fresh full polling window after slow acceptance", async t => {
  let now = 0, pollLimit = 0;
  t.mock.method(performance, "now", () => now);
  const client = new MarketApiClient("https://api.example.test", async () => { now = 89_500; return json(accepted, 202); });
  t.mock.method(client, "pollJob", async () => { pollLimit++; return completed() as never; });
  const session = createJobSession(client, () => {}); await session.start(request, key);
  const state = session.getState(); if (state.status !== "TIMED_OUT") assert.fail();
  assert.equal(JOB_SESSION_TIMEOUT_MS, 90_000); assert.equal(state.code, "POLL_TIMEOUT"); assert.equal(pollLimit, 0);
  assert.equal(state.remoteMayContinue, true); assert.equal(session.isActive(), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { MarketApiClient, type JobRequest } from "../src/api/jobs.js";
import { createJobSession, type JobSessionState } from "../src/api/job-session.js";
import { contractDemoResult } from "../src/data/contract-demo.js";
import { ControllerService, type ControllerJobRepository } from "../../services/controller/src/controller-service.js";
import { createHandler } from "../../services/controller/src/http-handler.js";
import { assertIdempotentReplay, createQueuedJob, transitionJob } from "../../services/controller/src/job.js";
import type { JobRecord } from "../../services/controller/src/contracts.js";

const id = "job_0123456789abcdef0123456789abcdef0123456789abcdef", key = "018f1c2a-b3d4-7e5f-8a90-123456789abc";
const now = new Date("2026-10-24T00:00:00.000Z");
const request: JobRequest = { operation: "PRICE", symbol: "QLD", locale: "ko" };

// Actual controller routing/validation/projection, but all persistence/task
// effects are deterministic in-memory fixtures. No SDK method or HTTP server.
function harness(options: { circuit?: "OPEN" | "CLOSED"; display?: boolean; enabled?: boolean; launchFailure?: boolean; expiredWindow?: boolean } = {}) {
  let stored: JobRecord | undefined;
  const calls = { create: 0, launch: 0, attach: 0, failed: 0, requests: 0 };
  const wire: string[] = [];
  const repository: ControllerJobRepository = {
    async create(input, idempotencyKey, at) {
      calls.create++;
      if (stored) return { job: assertIdempotentReplay(stored, input), created: false };
      stored = createQueuedJob({ request: input, idempotencyKey, jobId: id, now: at, timeoutSeconds: 90, ttlSeconds: 86400 });
      return { job: stored, created: true };
    },
    async get() { return stored ?? null; },
    async attachTaskArn(_id, taskArn) { calls.attach++; stored = { ...stored!, taskArn }; },
    async markLaunchFailed(job, at) {
      calls.failed++; stored = { ...transitionJob(job, "FAILED", at), errorCode: "TASK_LAUNCH_FAILED", errorMessage: "PRIVATE_SENTINEL" }; return stored;
    },
  };
  const service = new ControllerService(repository, { async launch() {
    calls.launch++;
    if (options.launchFailure) throw Error("PRIVATE_SENTINEL");
    const running = transitionJob(stored!, "RUNNING", now);
    stored = running.symbol === "SPCX" ?
      { ...transitionJob(running, "FAILED", now), errorCode: "DATA_UNAVAILABLE", errorMessage: "Unverified fixture identity." } :
      { ...transitionJob(running, "SUCCEEDED", now), result: contractDemoResult(running) };
    return { taskArn: "private-task-fixture" };
  } }, { state: async () => options.circuit ?? "CLOSED" },
  { jobCreationEnabled: options.enabled ?? true, liveResultDisplayEnabled: options.display ?? true,
    admissionWindow: options.expiredWindow ? { startsAtMs: now.getTime() - 300000, expiresAtMs: now.getTime() } :
      { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300000 } }, { write() {} }, () => now);
  const handler = createHandler(service);
  const client = new MarketApiClient("https://fixture.invalid", async (input, init) => {
    calls.requests++;
    const url = new URL(input); assert.equal(url.origin, "https://fixture.invalid");
    const post = init?.method === "POST";
    assert.equal(url.pathname, post ? "/v1/jobs" : `/v1/jobs/${id}`);
    const response = await handler({ routeKey: post ? "POST /v1/jobs" : "GET /v1/jobs/{jobId}",
      headers: Object.fromEntries(new Headers(init?.headers).entries()), body: post ? init?.body as string : undefined,
      pathParameters: post ? undefined : { jobId: id }, requestContext: { requestId: "local-fixture" } });
    wire.push(response.body);
    return new Response(response.body, { status: response.statusCode, headers: response.headers });
  });
  const newSession = () => {
    const states: JobSessionState[] = []; return { session: createJobSession(client, state => states.push(state)), states };
  };
  return { calls, wire, newSession };
}

test("actual controller HTTP projection and browser session agree for all 30 fixture requests", async t => {
  let external = 0; t.mock.method(globalThis, "fetch", async () => { external++; throw Error("FORBIDDEN"); });
  for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
    for (const locale of ["en", "ja", "ko"] as const) for (const operation of ["PRICE", "ANALYZE"] as const) {
      const h = harness(), s = h.newSession(); await s.session.start({ operation, symbol, locale }, key);
      const state = s.session.getState();
      if (symbol === "SPCX") {
        if (state.status !== "FAILED") assert.fail();
        assert.equal(state.code, "DATA_UNAVAILABLE"); assert.doesNotMatch(h.wire.join(""), /133\.11|SpaceX|"result"/);
      } else {
        if (state.status !== "SUCCEEDED") assert.fail();
        assert.equal(state.resultAvailable, true); assert.deepEqual(state.job.result, contractDemoResult({ operation, symbol, locale }));
      }
      assert.deepEqual(h.calls, { create: 1, launch: 1, attach: 1, failed: 0, requests: 2 });
      assert.doesNotMatch(h.wire.join(""), /taskArn|private-task|requestHash|idempotencyKeyHash/);
    }
  assert.equal(external, 0);
});

test("actual disabled display projection remains result-free across the browser boundary", async () => {
  const h = harness({ display: false }), s = h.newSession(); await s.session.start(request, key);
  const state = s.session.getState(); if (state.status !== "SUCCEEDED") assert.fail();
  assert.equal(state.resultAvailable, false); assert.equal(state.job.result, undefined);
  assert.doesNotMatch(h.wire.join(""), /local-contract-fixture|marketTimestamp|"price"/);
});

test("actual OPEN/disabled admission rejects before in-memory persistence/launch, and no resubmission occurs", async t => {
  t.mock.method(console, "warn", () => {});
  for (const [options, expected] of [[{ circuit: "OPEN" }, "CIRCUIT_OPEN"], [{ enabled: false }, "DATA_UNAVAILABLE"],
    [{ expiredWindow: true }, "DATA_UNAVAILABLE"]] as const) {
    const h = harness(options), s = h.newSession(); await s.session.start(request, key);
    const state = s.session.getState(); if (state.status !== "FAILED") assert.fail();
    assert.equal(state.code, expected); assert.equal(h.calls.create, 0); assert.equal(h.calls.launch, 0);
    assert.equal(await s.session.start(request, key), false); assert.equal(h.calls.requests, 1);
  }
});

test("explicit same-key replay in a separate session reuses the controller job instead of launching again", async t => {
  t.mock.method(console, "warn", () => {});
  const h = harness(); await h.newSession().session.start(request, key);
  const replay = h.newSession(); await replay.session.start(request, key);
  assert.equal(replay.session.getState().status, "SUCCEEDED"); assert.equal(h.calls.launch, 1); assert.equal(h.calls.create, 2);
  const conflict = h.newSession(); await conflict.session.start({ ...request, symbol: "TSLA" }, key);
  const state = conflict.session.getState(); if (state.status !== "FAILED") assert.fail();
  assert.equal(state.code, "IDEMPOTENCY_CONFLICT"); assert.equal(h.calls.launch, 1);
});

test("actual launch compensation and public error mapping do not leak the fixture's private cause or retry", async t => {
  t.mock.method(console, "warn", () => {});
  const h = harness({ launchFailure: true }), s = h.newSession(); await s.session.start(request, key);
  const state = s.session.getState(); if (state.status !== "FAILED") assert.fail();
  assert.equal(state.code, "TASK_LAUNCH_FAILED"); assert.equal(h.calls.failed, 1); assert.equal(h.calls.launch, 1);
  assert.equal(await s.session.start(request, key), false);
  assert.doesNotMatch(JSON.stringify(s.states) + h.wire.join(""), /PRIVATE_SENTINEL|private-task/);
  // The initial POST has a safe error, but a same-key replay then reads the
  // stored failed job. The actual HTTP bytes, not just UI sanitization, matter.
  const replay = h.newSession(); await replay.session.start(request, key);
  const replayState = replay.session.getState(); if (replayState.status !== "FAILED") assert.fail();
  assert.equal(replayState.code, "TASK_LAUNCH_FAILED"); assert.equal(h.calls.launch, 1);
  assert.doesNotMatch(h.wire.join(""), /PRIVATE_SENTINEL|private-task/);
});

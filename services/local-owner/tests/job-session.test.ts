import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerJobSession, OWNER_JOB_LIMITS, OwnerJobSessionError, type OwnerJobTransport } from "../src/job-session.js";
import { deterministicJobId } from "../../controller/src/aws-job-repository.js";
import type { JobRequest } from "../../../frontend/src/api/jobs.js";
import { canonicalDisclaimer } from "../../../shared/schemas/disclaimer.js";

const base = Date.parse("2026-10-25T00:00:00.000Z"), stamp = new Date(base).toISOString();
const expiry = "2026-10-26T00:00:00.000Z";
const window = { startsAtMs: base, expiresAtMs: base + 300000 };
const request: JobRequest = { operation: "PRICE", symbol: "QLD", locale: "ko" };
const code = (expected: string) => (error: unknown) => error instanceof OwnerJobSessionError && error.code === expected;
function harness(options: { input?: JobRequest; window?: typeof window | null; at?: number;
  onPost?: (value: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onRead?: (value: Record<string, unknown>, index: number) => Promise<Record<string, unknown>> } = {}) {
  let elapsed = 0, id = "", readIndex = 0;
  const input = options.input ?? request, wire: { method: string; path: string; body?: Record<string, unknown>; key?: string; signal?: AbortSignal }[] = [];
  const transport: OwnerJobTransport = { async request(method, path, body, headers, signal) {
    wire.push({ method, path, ...(body ? { body } : {}), ...(headers?.["idempotency-key"] ? { key: headers["idempotency-key"] } : {}), ...(signal ? { signal } : {}) });
    if (method === "POST") {
      id = deterministicJobId(headers!["idempotency-key"]!);
      const value = { jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry };
      return options.onPost ? options.onPost(value) : value;
    }
    const value = { jobId: id, ...input, status: "SUCCEEDED", createdAt: stamp, updatedAt: stamp, expiresAt: expiry, schemaVersion: "1.0.0" };
    return options.onRead ? options.onRead(value, ++readIndex) : value;
  } };
  const session = createOwnerJobSession(transport, input, options.window === undefined ? window : options.window,
    { wall: () => options.at ?? base, elapsed: () => elapsed });
  return { session, wire, advance(ms: number) { elapsed += ms; }, setElapsed(ms: number) { elapsed = ms; } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve };
}

test("all thirty intents have one pinned POST and exact-job metadata read, never a result or cleanup claim", async () => {
  for (const operation of ["PRICE", "ANALYZE"] as const) for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
    for (const locale of ["en", "ja", "ko"] as const) {
      const input = { operation, symbol, locale }, h = harness({ input });
      try {
        const accepted = await h.session.start(); assert.equal(accepted.jobId, h.session.expectedJobId);
        assert.deepEqual(h.wire[0]?.body, input); assert.equal(h.session.snapshot().keyRetained, false);
        const observed = await h.session.poll(); assert.equal(observed.status, "SUCCEEDED"); assert.equal(observed.result, undefined);
        assert.equal(h.wire[1]?.path, `v1/jobs/${accepted.jobId}`); assert.equal(h.wire[1]?.key, undefined);
        assert.equal(h.session.snapshot().status, "TERMINAL"); assert.equal(h.session.snapshot().timerActive, false);
        assert.equal(h.session.snapshot().remoteMayContinue, true); assert.equal(h.session.snapshot().independentClosureRequired, true);
        await assert.rejects(h.session.start(), code("NOT_READY")); await assert.rejects(h.session.poll(), code("NOT_READY"));
        assert.equal(h.wire.length, 2);
      } finally { h.session.close(); }
    }
});

test("invalid local input and missing/future/expired admission cannot dispatch", async () => {
  let calls = 0;
  assert.throws(() => createOwnerJobSession({ async request() { calls++; return {}; } },
    { ...request, privateField: "PRIVATE_SENTINEL" } as JobRequest, window), /job request is invalid/);
  assert.equal(calls, 0);
  for (const options of [{ window: null }, { at: base - 1 }, { at: base + 285000 }]) {
    const h = harness(options);
    try { await assert.rejects(h.session.start(), code("UNAVAILABLE")); assert.equal(h.wire.length, 0);
      assert.equal(h.session.snapshot().remoteMayContinue, false); assert.equal(h.session.snapshot().keyRetained, false); }
    finally { h.session.close(); }
  }
});

test("one consumed POST is never retried after a lost or invalid acknowledgement", async () => {
  for (const onPost of [async () => { throw Error("PRIVATE_SENTINEL"); }, async value => ({ ...value, jobId: `job_${"b".repeat(48)}` }),
    async value => ({ ...value, statusUrl: "https://private.invalid/" }), async value => ({ ...value, privateField: "PRIVATE_SENTINEL" })] as ((v: Record<string, unknown>) => Promise<Record<string, unknown>>)[]) {
    const h = harness({ onPost });
    try {
      await assert.rejects(h.session.start(), code("UNAVAILABLE"));
      await assert.rejects(h.session.start(), code("NOT_READY")); await assert.rejects(h.session.poll(), code("NOT_READY"));
      assert.equal(h.wire.length, 1); assert.equal(h.session.expectedJobId, deterministicJobId(h.wire[0]!.key!));
      assert.equal(h.session.snapshot().remoteMayContinue, true); assert.equal(h.session.snapshot().status, "UNVERIFIED");
      assert.doesNotMatch(JSON.stringify(h.session.snapshot()), /PRIVATE_SENTINEL|idempotency/);
    } finally { h.session.close(); }
  }
});

test("concurrent starts and overlapping polls cannot multiply effects", async () => {
  const post = deferred<void>(), read = deferred<void>();
  const h = harness({ onPost: async value => { await post.promise; return value; }, onRead: async value => { await read.promise; return value; } });
  try {
    const starting = h.session.start(); await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(h.session.start(), code("NOT_READY")); await assert.rejects(h.session.poll(), code("BUSY"));
    post.resolve(); await starting;
    const polling = h.session.poll(); await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(h.session.poll(), code("BUSY")); read.resolve(); await polling;
    assert.equal(h.wire.length, 2);
  } finally { post.resolve(); read.resolve(); h.session.close(); }
});

test("rapid polls and the sixteenth-read ceiling never silently reset or open another job", async () => {
  const h = harness({ onRead: async value => ({ ...value, status: "RUNNING" }) });
  try {
    await h.session.start(); await h.session.poll();
    await assert.rejects(h.session.poll(), code("POLL_TOO_EARLY")); assert.equal(h.wire.length, 2);
    for (let index = 1; index < OWNER_JOB_LIMITS.reads; index++) { h.advance(4000); await h.session.poll(); }
    h.advance(4000); await assert.rejects(h.session.poll(), code("LIMIT_REACHED"));
    assert.equal(h.wire.length, 17); assert.equal(h.session.snapshot().statusReadAttempts, 16);
    assert.equal(h.session.snapshot().status, "UNVERIFIED"); assert.equal(h.session.snapshot().timerActive, false);
  } finally { h.session.close(); }
});

test("malformed, foreign, private and licensed result payloads cannot cross the metadata-only boundary", async () => {
  const overrides: Record<string, unknown>[] = [{ jobId: `job_${"c".repeat(48)}` }, { operation: "ANALYZE" }, { symbol: "TSLA" }, { locale: "en" },
    { expiresAt: "2026-10-27T00:00:00.000Z" }, { createdAt: "2026-10-25T00:00:01.000Z" }, { taskArn: "PRIVATE_SENTINEL" },
    { status: "FAILED", errorCode: "PRIVATE_SENTINEL", errorMessage: "PRIVATE_SENTINEL" },
    { result: { kind: "PRICE", symbol: "QLD", price: 1, currency: "USD", marketTimestamp: stamp, retrievedAt: stamp,
      marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "local-fixture" } }];
  for (const change of overrides) {
    const h = harness({ onRead: async value => ({ ...value, ...change }) });
    try { await h.session.start(); await assert.rejects(h.session.poll(), code("UNAVAILABLE")); assert.equal(h.wire.length, 2);
      assert.equal(h.session.snapshot().status, "UNVERIFIED"); }
    finally { h.session.close(); }
  }
  const h = harness({ input: { ...request, operation: "ANALYZE" }, onRead: async value => ({ ...value,
    result: { kind: "ANALYSIS", symbol: "QLD", locale: "ko", summary: "Fixture", observations: [], opportunities: [], risks: ["Risk"],
      specialConsiderations: [], uncertainty: "Fixture only", dataAsOf: stamp, modelId: "local-fixture", promptVersion: "grounded-v1", disclaimer: canonicalDisclaimer("ko") } }) });
  try { await h.session.start(); await assert.rejects(h.session.poll(), code("UNAVAILABLE")); }
  finally { h.session.close(); }
});

test("metadata cannot regress status, timestamps or creation identity between polls", async () => {
  for (const change of [{ status: "QUEUED" }, { updatedAt: "2026-10-24T23:59:59.000Z" }, { createdAt: "2026-10-24T23:59:59.000Z" }]) {
    const h = harness({ onRead: async (value, index) => ({ ...value, status: "RUNNING", ...(index === 2 ? change : {}) }) });
    try { await h.session.start(); await h.session.poll(); h.advance(4000); await assert.rejects(h.session.poll(), code("UNAVAILABLE")); assert.equal(h.wire.length, 3); }
    finally { h.session.close(); }
  }
});

test("fixed terminal errors are safe metadata, not proof that a task has stopped", async () => {
  const h = harness({ onRead: async value => ({ ...value, status: "TIMED_OUT", errorCode: "JOB_DEADLINE_EXCEEDED", errorMessage: "PRIVATE_SENTINEL" }) });
  try {
    await h.session.start(); const result = await h.session.poll();
    assert.equal(result.errorCode, "JOB_DEADLINE_EXCEEDED"); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL/);
    assert.equal(h.session.snapshot().remoteMayContinue, true);
  } finally { h.session.close(); }
});

test("explicit close during an uncooperative POST or GET discards late results without resurrection", async () => {
  for (const stage of ["post", "get"] as const) {
    const delayed = deferred<void>();
    const h = harness({ ...(stage === "post" ? { onPost: async (value: Record<string, unknown>) => { await delayed.promise; return value; } } :
      { onRead: async (value: Record<string, unknown>) => { await delayed.promise; return value; } }) });
    try {
      if (stage === "get") await h.session.start();
      const pending = stage === "post" ? h.session.start() : h.session.poll();
      const rejected = assert.rejects(pending, code("UNAVAILABLE")); await new Promise(resolve => setImmediate(resolve));
      h.session.close(); await rejected; delayed.resolve(); await new Promise(resolve => setImmediate(resolve));
      assert.equal(h.session.snapshot().status, "CLOSED"); assert.equal(h.session.snapshot().timerActive, false);
      assert.equal(h.wire.at(-1)?.signal?.aborted, true); assert.equal(h.wire.length, stage === "post" ? 1 : 2);
      await assert.rejects(h.session.start(), code("NOT_READY"));
    } finally { delayed.resolve(); h.session.close(); }
  }
});

test("elapsed expiry and clock reversal prevent another dispatch even before timer callbacks", async () => {
  for (const next of [120000, -1, NaN, Infinity]) {
    const h = harness();
    try { await h.session.start(); h.setElapsed(next); await assert.rejects(h.session.poll(), code("UNAVAILABLE")); assert.equal(h.wire.length, 1); }
    finally { h.session.close(); }
  }
});

test("real lifetime timer bounds an uncooperative POST; late completion cannot issue polling", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const delayed = deferred<void>(), h = harness({ onPost: async value => { await delayed.promise; return value; } });
  try {
    const pending = h.session.start(), rejected = assert.rejects(pending, code("UNAVAILABLE"));
    await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(120000); await rejected;
    delayed.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.session.snapshot().status, "UNVERIFIED"); assert.equal(h.wire.length, 1);
  } finally { delayed.resolve(); h.session.close(); }
});

test("an unused session expires without retaining its idempotency key or contacting transport", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness();
  try {
    t.mock.timers.tick(120000);
    assert.equal(h.session.snapshot().status, "CLOSED"); assert.equal(h.session.snapshot().keyRetained, false);
    assert.equal(h.session.snapshot().timerActive, false); assert.equal(h.wire.length, 0);
    await assert.rejects(h.session.start(), code("NOT_READY"));
  } finally { h.session.close(); }
});

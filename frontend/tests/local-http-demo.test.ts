import assert from "node:assert/strict";
import test from "node:test";
import { createLocalHttpDemoRunner, isLocalHttpDemoLocation } from "../src/data/local-http-demo.js";
import { contractDemoResult, type ContractDemoStep } from "../src/data/contract-demo.js";
import type { DemoClock } from "../src/data/demo-runner.js";
import errorSchema from "../../shared/schemas/error.schema.json" with { type: "json" };
const clock: DemoClock = { set() { throw Error("Local HTTP runner cannot fabricate a browser timeline."); }, clear() {} };
const request = { operation: "ANALYZE", symbol: "QLD", locale: "ko" } as const;
const id = "job_0123456789abcdef0123456789abcdef0123456789abcdef";
const date = "2026-10-24T00:00:00.000Z", expiry = "2026-10-25T00:00:00.000Z";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("only the exact loopback development route can select local HTTP mode", () => {
  assert.equal(isLocalHttpDemoLocation("http://127.0.0.1:5173/http-demo"), true);
  assert.equal(isLocalHttpDemoLocation("http://127.0.0.1:5173/http-demo#main-content"), true);
  for (const url of ["https://example.invalid/http-demo", "http://127.0.0.1:4173/http-demo", "http://localhost:5173/http-demo",
    "http://127.0.0.1:5173/", "http://127.0.0.1:5173/http-demo?url=https://example.invalid", "http://127.0.0.1:5173/http-demo#x",
    "http://private@127.0.0.1:5173/http-demo", "PRIVATE_SENTINEL"]) assert.equal(isLocalHttpDemoLocation(url), false);
});

test("local HTTP uses the existing session, one exact POST, no credentials and only matching fixture results", { timeout: 5000 }, async t => {
  const steps: ContractDemoStep[] = []; let calls = 0, finished!: () => void;
  const done = new Promise<void>(resolve => { finished = resolve; });
  const runner = createLocalHttpDemoRunner(clock, step => { steps.push(step); if (step.status === "SUCCEEDED") finished(); }, async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, "http://127.0.0.1:4174");
    assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error"); assert.equal(init?.referrerPolicy, "no-referrer");
    assert.equal(new Headers(init?.headers).get("x-local-fixture-scenario"), "success"); calls++;
    if (init?.method === "POST") return json({ jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry }, 202);
    return json({ jobId: id, ...request, status: "SUCCEEDED", createdAt: date, updatedAt: date, expiresAt: expiry, schemaVersion: "1.0.0", result: contractDemoResult(request) });
  });
  t.after(() => runner.cancel());
  assert.equal(runner.start(request, "success", true), true); assert.equal(runner.start(request, "success", true), false);
  await done; assert.equal(calls, 2); assert.equal(steps.at(-1)?.hasInsight, true); runner.cancel();
});

test("a schema-valid but different source/result is rejected rather than labelled as a fixture", { timeout: 5000 }, async t => {
  let final!: ContractDemoStep, finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const runner = createLocalHttpDemoRunner(clock, step => { if (step.status === "FAILED") { final = step; finish(); } }, async (_input, init) => {
    if (init?.method === "POST") return json({ jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry }, 202);
    return json({ jobId: id, ...request, status: "SUCCEEDED", createdAt: date, updatedAt: date, expiresAt: expiry, schemaVersion: "1.0.0",
      result: { ...contractDemoResult(request), modelId: "not-the-reviewed-fixture" } });
  });
  t.after(() => runner.cancel());
  runner.start(request, "success", true); await done;
  assert.equal(final.error, "INVALID_RESPONSE"); assert.equal(final.job, undefined); assert.equal(final.hasInsight, false); runner.cancel();
});

test("unverified SPCX forces unavailable fixture input and refuses a spoofed success result", { timeout: 5000 }, async t => {
  let finish!: () => void, final!: ContractDemoStep, calls = 0;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const intent = { ...request, symbol: "SPCX" } as const;
  const runner = createLocalHttpDemoRunner(clock, step => {
    if (step.status === "FAILED") { final = step; finish(); }
  }, async (_input, init) => {
    calls++; assert.equal(new Headers(init?.headers).get("x-local-fixture-scenario"), "unavailable");
    if (init?.method === "POST") return json({ jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry }, 202);
    // Structurally valid, but not an approved fixture for this unverified symbol.
    return json({ jobId: id, ...intent, status: "SUCCEEDED", createdAt: date, updatedAt: date, expiresAt: expiry,
      schemaVersion: "1.0.0", result: { ...contractDemoResult(request), symbol: "SPCX" } });
  });
  t.after(() => runner.cancel()); runner.start(intent, "success", true); await done;
  assert.equal(calls, 2); assert.equal(final.error, "INVALID_RESPONSE");
  assert.equal(final.job, undefined); assert.equal(final.hasInsight, false);
});

test("invalid intent/scenario cannot trigger HTTP, and cancellation suppresses late callbacks", async () => {
  let calls = 0, deliver!: (response: Response) => void; const steps: ContractDemoStep[] = [];
  const runner = createLocalHttpDemoRunner(clock, step => steps.push(step), async () => { calls++; return new Promise<Response>(resolve => { deliver = resolve; }); });
  assert.throws(() => runner.start({ ...request, symbol: "PRIVATE_SENTINEL" } as never, "success", true));
  assert.throws(() => runner.start(request, "PRIVATE_SENTINEL" as never, true)); assert.equal(calls, 0);
  runner.start(request, "success", true); await new Promise<void>(resolve => setImmediate(resolve)); runner.cancel(); const count = steps.length;
  deliver(json({ jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry }, 202));
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(steps.length, count); assert.equal(calls, 1);
});

test("known rejection codes survive HTTP session mapping without raw prose or automatic resubmission", { timeout: 5000 }, async t => {
  for (const code of errorSchema.properties.error.properties.code.enum) {
    let calls = 0, finish!: () => void; const steps: ContractDemoStep[] = [];
    const done = new Promise<void>(resolve => { finish = resolve; });
    const runner = createLocalHttpDemoRunner(clock, step => { steps.push(step); if (step.status === "FAILED") finish(); }, async () => {
      calls++; return json({ error: { code, message: "PRIVATE_SENTINEL", requestId: "local-fixture" } }, 503);
    });
    t.after(() => runner.cancel()); runner.start(request, "success", true); await done;
    assert.equal(steps.at(-1)?.error, code); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(steps), /PRIVATE_SENTINEL/); assert.equal(runner.isActive(), false); runner.cancel();
  }
});

test("transport failure is not missing market data and does not silently retry", { timeout: 5000 }, async t => {
  let calls = 0, finish!: () => void, final!: ContractDemoStep;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const runner = createLocalHttpDemoRunner(clock, step => { if (step.status === "FAILED") { final = step; finish(); } }, async () => {
    calls++; throw Error("PRIVATE_SENTINEL");
  });
  t.after(() => runner.cancel()); runner.start(request, "success", true); await done;
  assert.equal(final.error, "REQUEST_FAILED"); assert.equal(final.job, undefined); assert.equal(final.hasInsight, false);
  assert.equal(calls, 1); assert.doesNotMatch(JSON.stringify(final), /PRIVATE_SENTINEL/); runner.cancel();
});

test("late completion from a stopped intent cannot replace a newer asset/language result", { timeout: 5000 }, async t => {
  for (const rejection of [false, true]) {
    let deliver!: (response: Response) => void, reject!: (error: Error) => void, finish!: () => void, calls = 0;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const steps: ContractDemoStep[] = [];
    const nextRequest = { operation: "PRICE", symbol: "GOOG", locale: "ja" } as const;
    const nextId = `job_${"b".repeat(48)}`;
    const runner = createLocalHttpDemoRunner(clock, step => { steps.push(step); if (step.status === "SUCCEEDED") finish(); }, async (_input, init) => {
      if (++calls === 1) return new Promise<Response>((yes, no) => { deliver = yes; reject = no; });
      if (init?.method === "POST") return json({ jobId: nextId, status: "QUEUED", statusUrl: `/v1/jobs/${nextId}`, expiresAt: expiry }, 202);
      return json({ jobId: nextId, ...nextRequest, status: "SUCCEEDED", createdAt: date, updatedAt: date, expiresAt: expiry,
        schemaVersion: "1.0.0", result: contractDemoResult(nextRequest) });
    });
    t.after(() => runner.cancel()); runner.start(request, "success", true);
    await new Promise<void>(resolve => setImmediate(resolve)); runner.cancel();
    assert.equal(runner.start(nextRequest, "success", true), true); await done;
    const count = steps.length, last = steps.at(-1)!;
    if (rejection) reject(Error("PRIVATE_SENTINEL"));
    else deliver(json({ jobId: id, status: "QUEUED", statusUrl: `/v1/jobs/${id}`, expiresAt: expiry }, 202));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(steps.length, count); assert.equal(last.job?.symbol, "GOOG"); assert.equal(last.job?.locale, "ja");
    assert.equal(last.hasInsight, false); assert.equal(calls, 3);
    assert.doesNotMatch(JSON.stringify(steps), /PRIVATE_SENTINEL/); runner.cancel();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { AwsCallBudget, AwsCallTimeoutError, boundedAwsCall } from "./bounded-aws-call.js";

test("several calls share one budget and a disposed budget can never resume", async () => {
  let elapsed = 0, calls = 0;
  const budget = new AwsCallBudget(12000, () => elapsed);
  try {
    await budget.call(async () => { calls++; elapsed = 7000; });
    await budget.call(async () => { calls++; elapsed = 11999; });
    elapsed = 12000;
    await assert.rejects(budget.call(async () => { calls++; }), AwsCallTimeoutError);
    assert.equal(calls, 2);
  } finally { budget.dispose(); }
  elapsed = 0; assert.equal(budget.active(), false);
  await assert.rejects(budget.call(async () => { calls++; }), AwsCallTimeoutError);
  assert.equal(calls, 2);
});

test("parent cancellation reaches an uncooperative child and disconnects its listener", async () => {
  const parent = new AbortController(); let signal: AbortSignal | undefined, lateResolve: ((value: number) => void) | undefined;
  const pending = boundedAwsCall(async current => { signal = current; return new Promise<number>(resolve => { lateResolve = resolve; }); }, 3000, () => 0, parent.signal);
  const rejected = assert.rejects(pending, AwsCallTimeoutError);
  await Promise.resolve(); assert.equal(getEventListeners(parent.signal, "abort").length, 1);
  parent.abort(); await rejected;
  assert.equal(signal?.aborted, true); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  lateResolve!(7); await new Promise(resolve => setImmediate(resolve));
  let calls = 0;
  await assert.rejects(boundedAwsCall(async () => { calls++; }, 3000, () => 0, parent.signal), AwsCallTimeoutError);
  assert.equal(calls, 0); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("in-budget acknowledgement is returned once and its abort listener/timer are disposed", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, elapsed = 100, signal: AbortSignal | undefined;
  const result = await boundedAwsCall(async current => { calls++; signal = current; elapsed = 349; return 7; }, 250, () => elapsed);
  assert.equal(result, 7); assert.equal(calls, 1); assert.equal(signal?.aborted, true);
  assert.equal(getEventListeners(signal!, "abort").length, 0);
  context.mock.timers.tick(15000);
});

test("elapsed exhaustion rejects normal completion even when the event loop has not run its timer", async () => {
  let elapsed = 0, calls = 0;
  await assert.rejects(boundedAwsCall(async () => { calls++; elapsed = 250; return 7; }, 250, () => elapsed), AwsCallTimeoutError);
  assert.equal(calls, 1);
});

test("invalid or backwards clocks cannot admit a request or revive a late acknowledgement", async () => {
  for (const value of [NaN, Infinity, -1]) {
    let calls = 0;
    await assert.rejects(boundedAwsCall(async () => { calls++; }, 250, () => value), AwsCallTimeoutError);
    assert.equal(calls, 0);
  }
  for (const value of [NaN, Infinity, 99]) {
    let elapsed = 100;
    await assert.rejects(boundedAwsCall(async () => { elapsed = value; }, 250, () => elapsed), AwsCallTimeoutError);
  }
  let calls = 0, reads = 0;
  await assert.rejects(boundedAwsCall(async () => { calls++; }, 250, () => reads++ ? 250 : 0), AwsCallTimeoutError);
  assert.equal(calls, 0);
});

test("an uncooperative pending sender is bounded and its late rejection remains observed", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let lateReject: ((reason: Error) => void) | undefined, signal: AbortSignal | undefined, calls = 0;
  const pending = boundedAwsCall(async current => {
    calls++; signal = current;
    return new Promise((_resolve, reject) => { lateReject = reject; });
  }, 250, () => 0);
  const rejected = assert.rejects(pending, AwsCallTimeoutError);
  await Promise.resolve(); context.mock.timers.tick(250); await rejected;
  assert.equal(signal?.aborted, true); assert.equal(calls, 1);
  assert.equal(getEventListeners(signal!, "abort").length, 0);
  lateReject!(new Error("synthetic-private-rejection"));
  await new Promise(resolve => setImmediate(resolve));
});

test("in-budget transport errors are not retried, relabelled or wrapped with private data", async () => {
  const original = new Error("synthetic-private-error"); let calls = 0, signal: AbortSignal | undefined;
  await assert.rejects(boundedAwsCall(async current => { signal = current; calls++; throw original; }, 250, () => 0), error => error === original);
  assert.equal(calls, 1); assert.equal(signal?.aborted, true); assert.equal(getEventListeners(signal!, "abort").length, 0);
});

test("invalid configured budgets cannot start a sender", async () => {
  for (const limit of [0, -1, 249, 15001, Infinity, NaN, 250.5]) {
    let calls = 0;
    await assert.rejects(boundedAwsCall(async () => { calls++; }, limit), { message: "Invalid AWS call budget." });
    assert.equal(calls, 0);
  }
});

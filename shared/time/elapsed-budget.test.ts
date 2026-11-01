import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { ElapsedBudget, ElapsedBudgetTimeoutError } from "./elapsed-budget.js";

test("elapsed budgets accept only the bounded worker interval and preserve the AWS-specific boundary separately", async () => {
  for (const limit of [0, -1, 300_001, Infinity, NaN, 1.5]) assert.throws(() => new ElapsedBudget(limit), /Invalid elapsed budget/);
  for (const limit of [1, 100, 20_000, 120_000, 300_000]) {
    let clock = 0, calls = 0;
    const budget = new ElapsedBudget(limit, () => clock);
    try {
      assert.equal(await budget.call(async () => { calls++; clock = limit - 1; return "ok"; }), "ok");
      clock = limit;
      await assert.rejects(budget.call(async () => { calls++; }), ElapsedBudgetTimeoutError);
      assert.equal(calls, 1);
    } finally { budget.dispose(); }
  }
});

test("concurrent children share one cancellation budget and release all abort listeners", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController(), signals: AbortSignal[] = [];
  const late: Array<(reason: Error) => void> = [];
  const budget = new ElapsedBudget(20_000, () => 0, parent.signal);
  const send = async (signal: AbortSignal) => {
    signals.push(signal); return new Promise<never>((_resolve, reject) => late.push(reject));
  };
  try {
    const a = assert.rejects(budget.call(send), ElapsedBudgetTimeoutError);
    const b = assert.rejects(budget.call(send), ElapsedBudgetTimeoutError);
    await Promise.resolve(); context.mock.timers.tick(20_000); await Promise.all([a, b]);
    assert.equal(signals.length, 2); assert.equal(signals[0], signals[1]); assert.equal(signals[0]?.aborted, true);
    assert.equal(getEventListeners(signals[0]!, "abort").length, 0);
    late.forEach(reject => reject(new Error("PRIVATE_LATE_REASON")));
    await new Promise(resolve => setImmediate(resolve));
  } finally { budget.dispose(); }
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("invalid, backwards or throwing elapsed clocks permanently close an existing budget", async () => {
  for (const invalid of [NaN, Infinity, 99, "throw"] as const) {
    let clock: number | "throw" = 100;
    const budget = new ElapsedBudget(300_000, () => { if (clock === "throw") throw new Error("PRIVATE_CLOCK_REASON"); return clock; });
    try {
      await assert.rejects(budget.call(async () => { clock = invalid; return "late"; }), error =>
        error instanceof ElapsedBudgetTimeoutError && !error.message.includes("PRIVATE"));
      clock = 100; let calls = 0;
      await assert.rejects(budget.call(async () => { calls++; }), ElapsedBudgetTimeoutError);
      assert.equal(calls, 0);
    } finally { budget.dispose(); }
  }
});

test("pre-cancelled parents and disposed budgets never dispatch, even with a private parent reason", async () => {
  const parent = new AbortController(); parent.abort(new Error("PRIVATE_PARENT_REASON"));
  const budget = new ElapsedBudget(20_000, () => 0, parent.signal); let calls = 0;
  try { await assert.rejects(budget.call(async () => { calls++; }), ElapsedBudgetTimeoutError); }
  finally { budget.dispose(); }
  await assert.rejects(budget.call(async () => { calls++; }), ElapsedBudgetTimeoutError);
  assert.equal(calls, 0); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

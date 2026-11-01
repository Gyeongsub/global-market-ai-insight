import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { MaintenanceCallBudget } from "../src/maintenance-call-budget.js";

test("normal work shares one elapsed budget; a disposed budget cannot admit more work", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let elapsed = 100;
  const budget = new MaintenanceCallBudget(10_000, undefined, () => elapsed);
  let signal: AbortSignal | undefined;
  assert.equal(await budget.call(async current => { signal = current; elapsed = 10_099; return 7; }), 7);
  budget.dispose();
  context.mock.timers.tick(10_000);
  assert.equal(signal?.aborted, true);
  await assert.rejects(budget.call(async () => { throw new Error("must not run"); }), /budget exhausted/);
});

test("the fixed elapsed timer bounds a sender that ignores its signal", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const budget = new MaintenanceCallBudget(20_000, undefined, () => 0);
  let signal: AbortSignal | undefined;
  const pending = budget.call(async current => { signal = current; return new Promise<never>(() => {}); });
  const rejected = assert.rejects(pending, { message: "Maintenance call budget exhausted." });
  await Promise.resolve();
  context.mock.timers.tick(20_000);
  await rejected;
  assert.equal(signal?.aborted, true);
  assert.equal(budget.active(), false);
  budget.dispose();
});

test("expired or invalid initial clocks and pre-cancelled parents cannot call a sender", async () => {
  const abort = new AbortController(); abort.abort();
  for (const [clock, parent] of [[() => Number.NaN, undefined], [() => -1, undefined], [() => Infinity, undefined],
    [() => 0, abort.signal]] as const) {
    let calls = 0;
    const budget = new MaintenanceCallBudget(10_000, parent, clock);
    try {
      await assert.rejects(budget.call(async () => { calls++; return {}; }), /budget exhausted/);
      assert.equal(calls, 0);
    } finally { budget.dispose(); }
  }
});

test("backwards time remains exhausted after the clock recovers", async () => {
  let elapsed = 100;
  const budget = new MaintenanceCallBudget(10_000, undefined, () => elapsed);
  try {
    elapsed = 99;
    assert.equal(budget.active(), false);
    elapsed = 101;
    assert.equal(budget.active(), false);
    await assert.rejects(budget.call(async () => { throw new Error("must not run"); }), /budget exhausted/);
  } finally { budget.dispose(); }
});

test("dispose disconnects its parent listener without changing the parent's state", async () => {
  const abort = new AbortController();
  const budget = new MaintenanceCallBudget(10_000, abort.signal);
  assert.equal(getEventListeners(abort.signal, "abort").length, 1);
  let signal: AbortSignal | undefined;
  await budget.call(async current => { signal = current; });
  budget.dispose();
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  assert.equal(abort.signal.aborted, false);
  abort.abort();
  assert.equal(signal?.aborted, true);
});

test("a runtime caller cannot widen either fixed budget", () => {
  for (const value of [0, -1, 30_000, Infinity, Number.NaN, "10000"])
    assert.throws(() => new MaintenanceCallBudget(value as 10_000), { message: "Invalid maintenance call budget." });
});

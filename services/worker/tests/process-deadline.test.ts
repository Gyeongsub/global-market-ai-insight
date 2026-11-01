import assert from "node:assert/strict";
import test from "node:test";
import { armWorkerProcessDeadline, WORKER_PROCESS_CEILING_MS } from "../src/process-deadline.js";

test("the process ceiling is fixed at the existing maximum job interval and cannot be disabled or enlarged", () => {
  assert.equal(WORKER_PROCESS_CEILING_MS, 300_000);
  for (const limitMs of [0, -1, NaN, Infinity, 1.5, 300_001]) {
    let exits = 0;
    assert.throws(() => armWorkerProcessDeadline(() => {}, {limitMs, terminate: () => { exits++; }}));
    assert.equal(exits, 0);
  }
});

for (const reportThrows of [false, true]) test(`a retained-I/O ceiling exits once even when reporting ${reportThrows ? "throws" : "succeeds"}`, async context => {
  context.mock.timers.enable({apis:["setTimeout"]});
  let reports = 0; const exits: number[] = [];
  const dispose = armWorkerProcessDeadline(() => { reports++; if (reportThrows) throw new Error("PRIVATE_REPORT_REASON"); },
    {limitMs: 100, terminate: code => { exits.push(code); }});
  context.mock.timers.tick(99); assert.equal(reports, 0);
  context.mock.timers.tick(1); assert.equal(reports, 1); assert.deepEqual(exits, [1]);
  context.mock.timers.tick(300_000); dispose(); dispose(); assert.equal(reports, 1); assert.deepEqual(exits, [1]);
});

test("explicit test cleanup is idempotent and does not report or terminate", context => {
  context.mock.timers.enable({apis:["setTimeout"]});
  let effects = 0;
  const dispose = armWorkerProcessDeadline(() => { effects++; }, {limitMs: 100, terminate: () => { effects++; }});
  dispose(); dispose(); context.mock.timers.tick(300_000); assert.equal(effects, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createDemoRunner, type DemoClock } from "../src/data/demo-runner.js";
import { demoScenarios, demoTiming, type DemoStep } from "../src/data/demo-job.js";
import { assets } from "../src/data/assets.js";
import { getInsight } from "../src/data/insights.js";

function fakeClock() {
  let next = 0;
  const scheduled = new Map<number, { callback: () => void; delay: number }>();
  const clock: DemoClock = {
    set(callback, delay) { const handle = ++next; scheduled.set(handle, { callback, delay }); return handle; },
    clear(handle) { scheduled.delete(handle); },
  };
  return {
    clock, scheduled,
    flush() {
      for (const [handle, item] of [...scheduled].sort((a, b) => a[1].delay - b[1].delay)) {
        if (scheduled.delete(handle)) item.callback();
      }
    },
  };
}

test("rapid starts schedule one local run; completion unlocks the next run", () => {
  const fake = fakeClock();
  const seen: DemoStep[] = [];
  const runner = createDemoRunner(fake.clock, step => seen.push(step));
  assert.equal(runner.start("ANALYZE", "success", true), true);
  for (let i = 0; i < 20; i++) assert.equal(runner.start("PRICE", "timeout", true), false);
  assert.equal(runner.isActive(), true);
  assert.equal(fake.scheduled.size, 2);
  assert.deepEqual([...fake.scheduled.values()].map(item => item.delay), [demoTiming.runningMs, demoTiming.terminalMs]);
  fake.flush();
  assert.deepEqual(seen.map(step => step.status), ["QUEUED", "RUNNING", "SUCCEEDED"]);
  assert.equal(runner.isActive(), false);
  assert.equal(fake.scheduled.size, 0);
  assert.equal(runner.start("PRICE", "success", true), true);
  assert.equal(seen.at(-1)!.hasInsight, false);
  fake.flush();
  assert.equal(seen.at(-1)!.hasInsight, false);
});

test("cleanup cancels timers and rejects already-queued stale callbacks", () => {
  const fake = fakeClock();
  const seen: DemoStep[] = [];
  const runner = createDemoRunner(fake.clock, step => seen.push(step));
  runner.start("ANALYZE", "success", true);
  const stale = [...fake.scheduled.values()];
  runner.cancel();
  runner.cancel();
  assert.equal(fake.scheduled.size, 0);
  assert.equal(runner.isActive(), false);
  assert.equal(runner.start("PRICE", "timeout", true), true);
  for (const item of stale) item.callback();
  assert.deepEqual(seen.map(step => step.status), ["QUEUED", "QUEUED"]);
  assert.equal(runner.isActive(), true);
  fake.flush();
  assert.equal(seen.at(-1)!.status, "TIMED_OUT");
  assert.equal(seen.at(-1)!.hasInsight, false);
});

test("circuit rejection schedules nothing and does not lock normal recovery", () => {
  const fake = fakeClock();
  const seen: DemoStep[] = [];
  const runner = createDemoRunner(fake.clock, step => seen.push(step));
  runner.start("ANALYZE", "circuit", true);
  assert.equal(fake.scheduled.size, 0);
  assert.equal(runner.isActive(), false);
  assert.equal(seen[0].error, "CIRCUIT_OPEN");
  runner.start("ANALYZE", "success", true);
  fake.flush();
  assert.equal(seen.at(-1)!.error, null);
  assert.equal(seen.at(-1)!.hasInsight, true);
});

test("invalid input neither schedules work nor poisons the runner", () => {
  const fake = fakeClock();
  const runner = createDemoRunner(fake.clock, () => {});
  assert.throws(() => runner.start("INVALID" as "PRICE", "success", true), /Invalid demo plan/);
  assert.equal(fake.scheduled.size, 0);
  assert.equal(runner.isActive(), false);
  assert.equal(runner.start("PRICE", "circuit", true), true);
});

test("cleanup during the initial notification prevents subsequent scheduling", () => {
  const fake = fakeClock();
  const seen: DemoStep[] = [];
  const runner = createDemoRunner(fake.clock, step => { seen.push(step); runner.cancel(); });
  runner.start("PRICE", "success", true);
  assert.equal(seen.length, 1);
  assert.equal(fake.scheduled.size, 0);
  assert.equal(runner.isActive(), false);
});

for (const locale of ["en", "ja", "ko"] as const) {
  for (const asset of assets) {
    test(`local fixture/runner matrix ${asset.symbol}/${locale} (not browser E2E)`, () => {
      if (asset.available) {
        const insight = getInsight(asset.symbol, locale);
        assert.ok(insight.summary.length > 20);
        assert.equal(insight.items.length, 3);
        assert.ok(insight.items.every(item => item.title.length > 0 && item.body.length > 10));
        assert.ok(insight.risk.length > 20);
      } else {
        assert.equal(asset.symbol, "SPCX");
        assert.throws(() => getInsight(asset.symbol, locale), /FIXTURE_UNAVAILABLE/);
      }
      for (const operation of ["PRICE", "ANALYZE"] as const) {
        for (const scenario of demoScenarios) {
          const fake = fakeClock();
          const seen: DemoStep[] = [];
          const runner = createDemoRunner(fake.clock, step => seen.push(step));
          runner.start(operation, scenario, asset.available);
          fake.flush();
          const final = seen.at(-1)!;
          assert.equal(final.hasInsight, operation === "ANALYZE" && scenario === "success" && asset.available);
          assert.equal(runner.isActive(), false);
          assert.equal(fake.scheduled.size, 0);
          if (scenario !== "success") assert.notEqual(final.error, null);
          if (!asset.available && ["success", "unavailable"].includes(scenario)) {
            assert.equal(final.status, "FAILED");
            assert.equal(final.error, "DATA_UNAVAILABLE");
          }
        }
      }
    });
  }
}

test("generic insight does not contradict a negative TSLA fixture with a positive-change claim", () => {
  assert.ok(assets.find(asset => asset.symbol === "TSLA")!.changePercent! < 0);
  for (const locale of ["en", "ja", "ko"] as const) {
    assert.doesNotMatch(getInsight("TSLA", locale).items[0].body, /positive|プラス|양수/);
  }
});

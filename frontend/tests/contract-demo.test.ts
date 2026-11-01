import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createContractDemoRunner, contractDemoResult, type ContractDemoStep } from "../src/data/contract-demo.js";
import AnalysisResult from "../src/components/AnalysisResult.js";
import type { DemoClock } from "../src/data/demo-runner.js";
import type { JobRequest } from "../src/api/jobs.js";
import { storedResultValid } from "../../shared/schemas/result-validation.js";
import en from "../src/locales/en.json" with { type: "json" };
import ja from "../src/locales/ja.json" with { type: "json" };
import ko from "../src/locales/ko.json" with { type: "json" };

async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); }
const immediateClock: DemoClock = { set(callback) { queueMicrotask(callback); return 1; }, clear() {} };
function finishRunner(request: JobRequest, scenario: "success" | "unavailable" | "timeout" | "circuit" = "success") {
  const steps: ContractDemoStep[] = [];
  let done!: () => void;
  const completed = new Promise<void>(resolve => { done = resolve; });
  const runner = createContractDemoRunner(immediateClock, step => {
    steps.push(step);
    if (["SUCCEEDED", "FAILED", "TIMED_OUT"].includes(step.status)) done();
  });
  return { runner, steps, completed, start: () => runner.start(request, scenario, true) };
}

test("the dashboard's complete 30-combination fixture flow uses the actual client/session with zero native fetch calls", async t => {
  let nativeCalls = 0; t.mock.method(globalThis, "fetch", async () => { nativeCalls++; throw Error("NATIVE_NETWORK_FORBIDDEN"); });
  for (const symbol of ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const)
    for (const locale of ["en", "ja", "ko"] as const)
      for (const operation of ["PRICE", "ANALYZE"] as const) {
        const request = { symbol, locale, operation }, h = finishRunner(request);
        assert.equal(h.start(), true); assert.equal(h.start(), false);
        await h.completed;
        const last = h.steps.at(-1)!;
        if (symbol === "SPCX") {
          assert.equal(last.status, "FAILED"); assert.equal(last.error, "DATA_UNAVAILABLE");
          assert.equal(last.hasInsight, false); assert.equal(last.job, undefined);
          assert.throws(() => contractDemoResult(request), /FIXTURE_UNAVAILABLE/);
          assert.equal(h.runner.isActive(), false); h.runner.cancel(); continue;
        }
        assert.equal(last.status, "SUCCEEDED"); assert.equal(last.error, null);
        assert.equal(last.hasInsight, operation === "ANALYZE"); assert.ok(last.job);
        assert.equal(storedResultValid(last.job.result, request), true);
        assert.deepEqual(last.job.result, contractDemoResult(request));
        assert.equal(h.runner.isActive(), false); h.runner.cancel();
      }
  assert.equal(nativeCalls, 0);
});

test("all three locales retain bounded circuit/unavailable/timeout paths without model or provider calls", async t => {
  let nativeCalls = 0; t.mock.method(globalThis, "fetch", async () => { nativeCalls++; throw Error("FORBIDDEN"); });
  for (const locale of ["en", "ja", "ko"] as const) for (const scenario of ["circuit", "unavailable", "timeout"] as const) {
    const h = finishRunner({ operation: "ANALYZE", symbol: "SPCX", locale }, scenario); h.start(); await h.completed;
    const last = h.steps.at(-1)!;
    assert.equal(last.status, scenario === "timeout" ? "TIMED_OUT" : "FAILED");
    assert.equal(last.error, scenario === "circuit" ? "CIRCUIT_OPEN" : scenario === "timeout" ? "TIMED_OUT" : "DATA_UNAVAILABLE");
    assert.equal(last.hasInsight, false); assert.equal(last.job, undefined); h.runner.cancel();
  }
  assert.equal(nativeCalls, 0);
});

test("unmount/cancellation suppresses every late fixture update and clears scheduled timeline work", async () => {
  let handle = 0; const callbacks = new Map<number, () => void>(), steps: ContractDemoStep[] = [];
  const runner = createContractDemoRunner({ set(callback) { callbacks.set(++handle, callback); return handle; }, clear(id) { callbacks.delete(id); } }, s => steps.push(s));
  runner.start({ operation: "ANALYZE", symbol: "QLD", locale: "ja" }, "success", true); await flush();
  const count = steps.length; assert.equal(callbacks.size, 2); runner.cancel();
  assert.equal(callbacks.size, 0); await flush(); assert.equal(steps.length, count); assert.equal(runner.isActive(), false);
});

test("real local timers expose QUEUED then RUNNING then checked SUCCEEDED, not an instant model result", async () => {
  const clock: DemoClock = { set: (callback, delay) => setTimeout(callback, delay) as unknown as number, clear: handle => clearTimeout(handle) };
  const steps: ContractDemoStep[] = []; let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const runner = createContractDemoRunner(clock, step => { steps.push(step); if (step.status === "SUCCEEDED") finish(); });
  const guard = setTimeout(() => finish(), 6000);
  try {
    runner.start({ operation: "PRICE", symbol: "TSLA", locale: "ko" }, "success", true); await done;
    assert.deepEqual([...new Set(steps.map(s => s.status))], ["QUEUED", "RUNNING", "SUCCEEDED"]);
  } finally { clearTimeout(guard); runner.cancel(); }
});

test("the three-language analysis renderer keeps all contract sections, uncertainty and provenance; React escapes content", () => {
  for (const [locale, labels] of [["en", en], ["ja", ja], ["ko", ko]] as const) {
    const result = { ...contractDemoResult({ operation: "ANALYZE", symbol: "QLD", locale }),
      summary: '<img src="private-marker" onerror="alert(1)">', opportunities: ["Opportunity fixture"], observations: ["Observation fixture"] };
    const html = renderToStaticMarkup(createElement(AnalysisResult, { result, symbol: "QLD", locale, labels: labels.analysisLabels }));
    for (const heading of Object.values(labels.analysisLabels)) assert.ok(html.includes(heading), heading);
    assert.match(html, /local-contract-fixture-no-model-called/); assert.match(html, /grounded-v1/); assert.match(html, /2026-08-07T20:00:00.000Z/);
    assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img|<script/);
    assert.ok(html.includes(result.disclaimer as string));
    for (const invalid of [{ ...result, locale: locale === "en" ? "ja" : "en" }, { ...result, symbol: "TSLA" }, { ...result, extraPrivateField: "PRIVATE_SENTINEL" }])
      assert.equal(renderToStaticMarkup(createElement(AnalysisResult, { result: invalid, symbol: "QLD", locale, labels: labels.analysisLabels })), "");
  }
});

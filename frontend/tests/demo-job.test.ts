import assert from "node:assert/strict";
import test from "node:test";
import { demoScenarios, isDemoScenario, planDemoJob } from "../src/data/demo-job.js";

for (const operation of ["PRICE", "ANALYZE"] as const) {
  for (const scenario of demoScenarios) {
    test(`${operation} demo: ${scenario} is bounded and honest`, () => {
      const steps = planDemoJob(operation, scenario, true);
      const terminal = steps.at(-1)!;
      assert.equal(steps[0].afterMs, 0);
      assert.ok(steps.every((step, index) => step.afterMs <= 1850 && (index === 0 || step.afterMs > steps[index - 1].afterMs)));
      assert.ok(steps.slice(0, -1).every(step => !step.hasInsight && step.error === null));
      if (scenario === "circuit") {
        assert.deepEqual(steps, [{ afterMs: 0, status: "FAILED", error: "CIRCUIT_OPEN", hasInsight: false }]);
      } else {
        assert.deepEqual(steps.slice(0, 2).map(step => step.status), ["QUEUED", "RUNNING"]);
        assert.equal(terminal.status, scenario === "success" ? "SUCCEEDED" : scenario === "timeout" ? "TIMED_OUT" : "FAILED");
        assert.equal(terminal.error, scenario === "success" ? null : scenario === "timeout" ? "TIMED_OUT" : "DATA_UNAVAILABLE");
        assert.equal(terminal.hasInsight, operation === "ANALYZE" && scenario === "success");
      }
    });
  }
}

test("unavailable assets never acquire a fabricated successful result", () => {
  for (const operation of ["PRICE", "ANALYZE"] as const) {
    for (const scenario of demoScenarios) {
      const result = planDemoJob(operation, scenario, false).at(-1)!;
      assert.notEqual(result.status, "SUCCEEDED");
      assert.equal(result.hasInsight, false);
      assert.notEqual(result.error, null);
    }
  }
});

test("invalid demo input is rejected instead of interpreted", () => {
  for (const value of [null, undefined, "", "__proto__", "<script>", {}, 1]) assert.equal(isDemoScenario(value), false);
  assert.throws(() => planDemoJob("DELETE" as "PRICE", "success", true), /Invalid demo plan/);
  assert.throws(() => planDemoJob("PRICE", "unexpected" as "success", true), /Invalid demo plan/);
  assert.throws(() => planDemoJob("PRICE", "success", "true" as unknown as boolean), /Invalid demo plan/);
});

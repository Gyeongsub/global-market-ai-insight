import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardJobReducer as reduce, initialDashboardJobState as initial } from "../src/data/dashboard-state.js";
import { contractDemoResult, sessionDemoStep, type ContractDemoStep } from "../src/data/contract-demo.js";
import type { PublicJob } from "../src/api/jobs.js";
import { localDemoJobId } from "../src/data/local-demo-job-id.js";

const id = "job_1234567890abcdef1234567890abcdef";
const request = { operation: "PRICE", symbol: "VOO", locale: "en" } as const;
const job: PublicJob = { ...request, jobId: id, status: "SUCCEEDED", schemaVersion: "1.0.0",
  createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z", expiresAt: "2026-10-25T00:00:00.000Z", result: contractDemoResult(request) };
const step = (status: ContractDemoStep["status"], extra: Partial<ContractDemoStep> = {}): ContractDemoStep =>
  ({ status, afterMs: 0, hasInsight: false, error: null, ...extra });

test("accepted/failed UI context carries only our local fixture ID shapes, never remote prose", () => {
  assert.equal(localDemoJobId(`job_${"a".repeat(48)}`), `job_${"a".repeat(48)}`);
  for (const status of ["QUEUED", "RUNNING", "FAILED", "TIMED_OUT"] as const) {
    const mapped = sessionDemoStep(status === "FAILED" || status === "TIMED_OUT"
      ? { status, request, jobId: id, code: "DATA_UNAVAILABLE", remoteMayContinue: true }
      : { status, request, jobId: id });
    assert.ok(mapped); assert.equal(mapped.jobId, id);
    assert.equal(reduce(initial, { type: "step", step: mapped }).jobId, id);
    assert.equal(mapped.job, undefined);
  }
  for (const bad of ["PRIVATE_SENTINEL", "<script>alert(1)</script>", "https://example.invalid/private", "a".repeat(65)]) {
    const mapped = sessionDemoStep({ status: "FAILED", request, jobId: bad, code: "DATA_UNAVAILABLE", remoteMayContinue: true });
    assert.ok(mapped); assert.equal(mapped.jobId, undefined);
    assert.equal(reduce(initial, { type: "step", step: step("FAILED", { jobId: bad }) }).jobId, null);
  }
});

test("stop waiting is local IDLE presentation, not terminal success or remote task stop", () => {
  const running = reduce(initial, { type: "step", step: step("RUNNING", { jobId: id }) });
  const stopped = reduce(running, { type: "stop-waiting" });
  assert.equal(stopped.status, "IDLE"); assert.equal(stopped.waitingStopped, true); assert.equal(stopped.jobId, id);
  assert.equal(stopped.hasInsight, false); assert.equal(stopped.completed, null); assert.equal(stopped.error, null);
  for (const late of [step("FAILED"), step("SUCCEEDED", { job, hasInsight: true })]) {
    assert.equal(reduce(stopped, { type: "step", step: late }), stopped);
  }
  assert.equal(reduce(initial, { type: "stop-waiting" }), initial);
});

test("submission is busy but never presented as accepted before the POST acknowledgement", () => {
  const submitting = sessionDemoStep({ status: "SUBMITTING", request });
  assert.ok(submitting); assert.equal(submitting.submitting, true); assert.equal(submitting.jobId, undefined);
  const view = reduce(initial, { type: "step", step: submitting });
  assert.equal(view.status, "QUEUED"); assert.equal(view.submitting, true); assert.equal(view.jobId, null);
  const accepted = reduce(view, { type: "step", step: step("QUEUED", { jobId: id }) });
  assert.equal(accepted.submitting, false); assert.equal(accepted.jobId, id);
  const stopped = reduce(view, { type: "stop-waiting" });
  assert.equal(stopped.submitting, false); assert.equal(stopped.waitingStopped, true); assert.equal(stopped.jobId, null);
  assert.equal(reduce(view, { type: "step", step: step("FAILED", { error: "REQUEST_FAILED" }) }).submitting, false);
});

test("an explicit new intent resets stopped presentation and old IDs; selection resets retained quote", () => {
  const completed = reduce(initial, { type: "step", step: step("SUCCEEDED", { job, jobId: id }) });
  assert.equal(completed.priceResult, job.result); assert.equal(reduce(completed, { type: "stop-waiting" }), completed);
  const next = reduce(completed, { type: "begin" });
  assert.equal(next.jobId, null); assert.equal(next.priceResult, job.result); assert.equal(next.completed, null);
  assert.equal(next.waitingStopped, false);
  const running = reduce(next, { type: "step", step: step("RUNNING", { jobId: id }) });
  const stopped = reduce(running, { type: "stop-waiting" });
  assert.equal(stopped.priceResult, job.result);
  assert.equal(reduce(stopped, { type: "reset" }), initial);
  const restarted = reduce(stopped, { type: "begin" });
  assert.equal(reduce(restarted, { type: "step", step: step("QUEUED") }).waitingStopped, false);
});

test("all locales explicitly distinguish local waiting from remote worker/billing cancellation", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const labels = JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`, import.meta.url), "utf8"));
    for (const key of ["stopWaiting", "stopWaitingNote", "waitingStoppedLabel", "waitingStoppedTitle", "waitingStoppedBody", "waitingStoppedRecovery", "demoJobId"]) {
      assert.equal(typeof labels[key], "string"); assert.ok(labels[key].length > 2);
    }
    assert.match(labels.stopWaitingNote, /worker/); assert.match(labels.waitingStoppedBody, /AWS/);
    assert.match(labels.stopWaitingNote, /billing|課金|과금/);
    assert.match(labels.waitingStoppedRecovery, /No automatic retry|自動再試行|자동 재시도/);
  }
});

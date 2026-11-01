import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStaleJob } from "../src/sweeper.js";

const now = new Date("2026-08-08T00:02:00Z");

test("times out only overdue non-terminal jobs", () => {
  assert.deepEqual(evaluateStaleJob({ jobId: "queued", status: "QUEUED", deadlineAt: "2026-08-08T00:01:00Z" }, now), { jobId: "queued", nextStatus: "TIMED_OUT", stopTask: false, reason: "JOB_DEADLINE_EXCEEDED" });
  assert.equal(evaluateStaleJob({ jobId: "future", status: "RUNNING", deadlineAt: "2026-08-08T00:03:00Z", taskArn: "arn:task" }, now), null);
  assert.equal(evaluateStaleJob({ jobId: "done", status: "SUCCEEDED", deadlineAt: "2026-08-08T00:01:00Z" }, now), null);
});

test("requests task stop for overdue running work with a task ARN", () => {
  const decision = evaluateStaleJob({ jobId: "running", status: "RUNNING", deadlineAt: "2026-08-08T00:01:00Z", taskArn: "arn:task" }, now);
  assert.equal(decision?.stopTask, true);
});

test("also stops a launched task that never claimed its queued job", () => {
  assert.equal(evaluateStaleJob({ jobId: "queued", status: "QUEUED", deadlineAt: "2026-08-08T00:01:00Z", taskArn: "arn:task" }, now)?.stopTask, true);
  assert.throws(() => evaluateStaleJob({ jobId: "broken", status: "QUEUED", deadlineAt: "invalid" }, now), /timestamp/);
});

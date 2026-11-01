import assert from "node:assert/strict";
import test from "node:test";
import { PublicError } from "../src/contracts.js";
import { assertIdempotentReplay, createQueuedJob, taskEnvironment, transitionJob } from "../src/job.js";
import { validateCreateJobRequest, validateIdempotencyKey } from "../src/validation.js";

const request = { operation: "ANALYZE", symbol: "QLD", locale: "ko" } as const;
const now = new Date("2026-08-08T00:00:00.000Z");

test("validates strict request enums and additional properties", () => {
  assert.deepEqual(validateCreateJobRequest(request), request);
  assert.throws(() => validateCreateJobRequest({ ...request, symbol: "AAPL" }), (error: unknown) => error instanceof PublicError && error.code === "UNSUPPORTED_SYMBOL");
  assert.throws(() => validateCreateJobRequest({ ...request, prompt: "buy now" }), (error: unknown) => error instanceof PublicError && error.code === "VALIDATION_ERROR");
  assert.equal(validateIdempotencyKey("018f1c2a-b3d4-7e5f-8a90-123456789abc"), "018f1c2a-b3d4-7e5f-8a90-123456789abc");
});

test("creates a bounded queued job without storing the raw idempotency key", () => {
  const job = createQueuedJob({ request, idempotencyKey: "018f1c2a-b3d4-7e5f-8a90-123456789abc", jobId: "01J00000000000000000000000", now, timeoutSeconds: 90, ttlSeconds: 86_400 });
  assert.equal(job.status, "QUEUED");
  assert.equal(job.deadlineAt, "2026-08-08T00:01:30.000Z");
  assert.equal(job.expiresAt, 1_786_233_600);
  assert.equal(job.idempotencyKeyHash.length, 64);
  assert.doesNotMatch(JSON.stringify(job), /018f1c2a-b3d4/);
});

test("enforces the state machine and terminal immutability", () => {
  const queued = createQueuedJob({ request, idempotencyKey: "018f1c2a-b3d4-7e5f-8a90-123456789abc", jobId: "01J00000000000000000000000", now, timeoutSeconds: 90, ttlSeconds: 86_400 });
  const running = transitionJob(queued, "RUNNING", new Date("2026-08-08T00:00:01.000Z"));
  const succeeded = transitionJob(running, "SUCCEEDED", new Date("2026-08-08T00:00:02.000Z"));
  assert.equal(running.attemptCount, 1);
  assert.equal(succeeded.version, 3);
  assert.throws(() => transitionJob(succeeded, "FAILED", now), /Invalid job transition/);
  assert.throws(() => transitionJob(queued, "SUCCEEDED", now), /Invalid job transition/);
});

test("prevents conflicting idempotent replays", () => {
  const queued = createQueuedJob({ request, idempotencyKey: "018f1c2a-b3d4-7e5f-8a90-123456789abc", jobId: "01J00000000000000000000000", now, timeoutSeconds: 90, ttlSeconds: 86_400 });
  assert.equal(assertIdempotentReplay(queued, request), queued);
  assert.throws(() => assertIdempotentReplay(queued, { ...request, locale: "en" }), (error: unknown) => error instanceof PublicError && error.httpStatus === 409);
});

test("allows only JOB_ID in the task override contract", () => {
  assert.deepEqual(taskEnvironment("01J00000000000000000000000"), [{ name: "JOB_ID", value: "01J00000000000000000000000" }]);
});

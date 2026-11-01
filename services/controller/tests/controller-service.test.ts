import assert from "node:assert/strict";
import test from "node:test";
import { PublicError, type CreateJobRequest, type JobRecord } from "../src/contracts.js";
import {
  ControllerService,
  publicJob,
  type ControllerAuditSink,
  type ControllerJobRepository,
  type TaskLauncher,
} from "../src/controller-service.js";
import { createQueuedJob } from "../src/job.js";
import errorSchema from "../../../shared/schemas/error.schema.json" with { type: "json" };

const request: CreateJobRequest = { operation: "PRICE", symbol: "QLD", locale: "ko" };
const key = "018f1c2a-b3d4-7e5f-8a90-123456789abc";
const now = new Date("2026-09-05T00:00:00.000Z");
const admissionWindow = { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300_000 };

function queued(): JobRecord {
  return createQueuedJob({ request, idempotencyKey: key, jobId: "job_0123456789abcdef0123456789abcdef0123456789abcdef", now, timeoutSeconds: 90, ttlSeconds: 86_400 });
}

function harness(input?: { created?: boolean; circuit?: "CLOSED" | "OPEN"; launchError?: boolean }) {
  const calls = { create: 0, get: 0, launch: 0, attach: 0, failed: 0, events: [] as string[] };
  const auditEvents: Parameters<ControllerAuditSink["write"]>[0][] = [];
  const job = queued();
  const repository: ControllerJobRepository = {
    async create() { calls.create += 1; return { job, created: input?.created ?? true }; },
    async get() { calls.get += 1; return job; },
    async attachTaskArn() { calls.attach += 1; },
    async markLaunchFailed(current, at) { calls.failed += 1; return { ...current, status: "FAILED", updatedAt: at.toISOString(), version: 2 }; },
  };
  const launcher: TaskLauncher = {
    async launch() {
      calls.launch += 1;
      if (input?.launchError) throw new Error("raw launch detail must remain internal");
      return { taskArn: "arn:aws:ecs:region:account:task/cluster/task" };
    },
  };
  const audit: ControllerAuditSink = { write(event) { calls.events.push(event.code); auditEvents.push(event); } };
  const service = new ControllerService(
    repository,
    launcher,
    { state: async () => input?.circuit ?? "CLOSED" },
    { jobCreationEnabled: true, liveResultDisplayEnabled: true, admissionWindow },
    audit,
    () => now,
  );
  return { service, calls, auditEvents, job };
}

test("creates one queued job, launches one task, and stores only its internal reference", async () => {
  const { service, calls } = harness();
  const accepted = await service.createJob(request, key);
  assert.equal(accepted.status, "QUEUED");
  assert.match(accepted.statusUrl, /^\/v1\/jobs\/job_/);
  assert.deepEqual(calls, { create: 1, get: 0, launch: 1, attach: 1, failed: 0, events: ["JOB_ACCEPTED"] });
});

test("accepted request audit links one validated request ID to its job", async () => {
  const { service, auditEvents, job } = harness();
  await service.createJob(request, key, "request-123:abc");
  assert.deepEqual(auditEvents, [{
    level: "info",
    code: "JOB_ACCEPTED",
    jobId: job.jobId,
    operation: "PRICE",
    requestId: "request-123:abc",
  }]);
});

test("audit correlation omits an unsafe direct-caller request ID", async () => {
  const { service, auditEvents } = harness();
  await service.createJob(request, key, "unsafe\nprivate-marker");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.requestId, undefined);
  assert.doesNotMatch(JSON.stringify(auditEvents), /private-marker/);
});

test("an idempotent replay returns the stored job without launching another task", async () => {
  const { service, calls } = harness({ created: false });
  await service.createJob(request, key);
  assert.equal(calls.create, 1);
  assert.equal(calls.launch, 0);
  assert.equal(calls.attach, 0);
  assert.deepEqual(calls.events, ["IDEMPOTENT_REPLAY"]);
});

test("an audit transport failure never converts an accepted task into a launch failure", async () => {
  const job = queued();
  let launches = 0;
  let failureTransitions = 0;
  const service = new ControllerService(
    {
      async create() { return { job, created: true }; },
      async get() { return job; },
      async attachTaskArn() {},
      async markLaunchFailed(current) { failureTransitions += 1; return current; },
    },
    { async launch() { launches += 1; return { taskArn: "arn:aws:ecs:region:account:task/cluster/task" }; } },
    { state: async () => "CLOSED" },
    { jobCreationEnabled: true, liveResultDisplayEnabled: true, admissionWindow },
    { write() { throw new Error("audit sink unavailable"); } },
    () => now,
  );
  const result = await service.createJob(request, key);
  assert.equal(result.status, "QUEUED");
  assert.equal(launches, 1);
  assert.equal(failureTransitions, 0);
});

test("rejects invalid input and an open circuit before persistence or task launch", async () => {
  const invalid = harness();
  await assert.rejects(() => invalid.service.createJob({ ...request, symbol: "AAPL" }, key), (error: unknown) => error instanceof PublicError && error.code === "UNSUPPORTED_SYMBOL");
  assert.equal(invalid.calls.create, 0);
  assert.equal(invalid.calls.launch, 0);

  const open = harness({ circuit: "OPEN" });
  await assert.rejects(() => open.service.createJob(request, key), (error: unknown) => error instanceof PublicError && error.code === "CIRCUIT_OPEN");
  assert.equal(open.calls.create, 0);
  assert.equal(open.calls.launch, 0);
});

test("fails closed before persistence when provider-backed API jobs are not approved", async () => {
  const { calls } = harness();
  const repository: ControllerJobRepository = {
    async create() { calls.create += 1; return { job: queued(), created: true }; },
    async get() { return queued(); }, async attachTaskArn() {}, async markLaunchFailed(job) { return job; },
  };
  const service = new ControllerService(
    repository,
    { async launch() { calls.launch += 1; return { taskArn: "arn:task" }; } },
    { state: async () => "CLOSED" },
    { jobCreationEnabled: false, liveResultDisplayEnabled: false, admissionWindow: null },
    { write() {} },
    () => now,
  );
  await assert.rejects(() => service.createJob(request, key), (error: unknown) => error instanceof PublicError && error.code === "DATA_UNAVAILABLE");
  assert.equal(calls.create, 0);
  assert.equal(calls.launch, 0);
});

test("compensates a launch failure and exposes only a stable public error", async () => {
  const { service, calls } = harness({ launchError: true });
  await assert.rejects(() => service.createJob(request, key), (error: unknown) => {
    assert.ok(error instanceof PublicError);
    assert.equal(error.code, "TASK_LAUNCH_FAILED");
    assert.equal(error.httpStatus, 503);
    assert.doesNotMatch(error.message, /raw launch detail/);
    return true;
  });
  assert.equal(calls.launch, 1);
  assert.equal(calls.failed, 1);
  assert.deepEqual(calls.events, ["TASK_LAUNCH_FAILED"]);
});

test("public job projection omits hashes and internal task ARN", () => {
  const projected = publicJob({ ...queued(), taskArn: "arn:internal", result: { kind: "PRICE" } });
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /idempotencyKeyHash|requestHash|taskArn|arn:internal/);
  assert.equal(projected.expiresAt, "2026-09-06T00:00:00.000Z");
});

test("terminal projection preserves stable error codes but never stored error prose or failed payloads", () => {
  for (const includeResult of [false, true]) for (const status of ["FAILED", "TIMED_OUT"] as const)
    for (const code of [...errorSchema.properties.error.properties.code.enum, "JOB_DEADLINE_EXCEEDED"]) {
      const record = { ...queued(), status, errorCode: code, errorMessage: "PRIVATE_SENTINEL",
        result: { privateData: "PRIVATE_SENTINEL" }, taskArn: "private-task-sentinel" };
      const view = publicJob(record, includeResult);
      assert.equal(view.status, status); assert.equal(view.errorCode, code);
      assert.equal(view.errorMessage, "The job did not complete successfully."); assert.equal(view.result, undefined);
      assert.doesNotMatch(JSON.stringify(view), /PRIVATE_SENTINEL|private-task-sentinel|idempotencyKeyHash|requestHash/);
    }
});

test("unknown stored errors are safely classified without reading diagnostic getters", () => {
  for (const code of [undefined, "PRIVATE_SENTINEL", "__proto__", "constructor", "MODEL_ERROR\nPRIVATE_SENTINEL", "x".repeat(1000)]) {
    let reads = 0;
    const record = { ...queued(), status: "FAILED" as const, ...(code === undefined ? {} : { errorCode: code }),
      get errorMessage(): string { reads++; throw Error("PRIVATE_SENTINEL"); } };
    const view = publicJob(record);
    assert.equal(reads, 0); assert.equal(view.errorCode, "INTERNAL_ERROR");
    assert.equal(view.errorMessage, "The job did not complete successfully.");
    assert.doesNotMatch(JSON.stringify(view), /PRIVATE_SENTINEL|__proto__|constructor/);
  }
});

test("nonfailed projections never carry stale diagnostics and only SUCCEEDED may expose a result", () => {
  for (const status of ["QUEUED", "RUNNING", "SUCCEEDED"] as const) {
    const record = { ...queued(), status, errorCode: "PRIVATE_SENTINEL", errorMessage: "PRIVATE_SENTINEL", result: { fixture: true } };
    const view = publicJob(record);
    assert.equal(view.errorCode, undefined); assert.equal(view.errorMessage, undefined);
    assert.deepEqual(view.result, status === "SUCCEEDED" ? record.result : undefined);
    assert.equal(publicJob(record, false).result, undefined);
  }
});

test("terminal status remains observable while licensed result display is disabled", async () => {
  const terminal = { ...queued(), status: "SUCCEEDED" as const, result: { kind: "PRICE", price: "private" }, version: 3 };
  const service = new ControllerService(
    {
      async create() { return { job: terminal, created: false }; },
      async get() { return terminal; },
      async attachTaskArn() {},
      async markLaunchFailed(job) { return job; },
    },
    { async launch() { throw new Error("not used"); } },
    { state: async () => "CLOSED" },
    { jobCreationEnabled: true, liveResultDisplayEnabled: false, admissionWindow },
    { write() {} },
    () => now,
  );

  const observed = await service.getJob(terminal.jobId);
  assert.equal(observed.status, "SUCCEEDED");
  assert.equal(observed.result, undefined);
  assert.doesNotMatch(JSON.stringify(observed), /private|taskArn|requestHash|idempotencyKeyHash/);
});

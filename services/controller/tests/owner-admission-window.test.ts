import assert from "node:assert/strict";
import test from "node:test";
import { ownerAdmissionAllowed, parseOwnerAdmissionWindow } from "../src/owner-admission-window.js";
import { ControllerService, type ControllerExposurePolicy, type ControllerJobRepository } from "../src/controller-service.js";
import { createQueuedJob } from "../src/job.js";
import { PublicError } from "../src/contracts.js";
import { buildAwsHandler } from "../src/http-handler.js";

const start = "2026-10-25T00:00:00.000Z", end = "2026-10-25T00:05:00.000Z";
const base = Date.parse(start), owner = "arn:aws:iam::000000000000:user/local-owner";
const window = parseOwnerAdmissionWindow(start, end, owner)!;
const request = { operation: "PRICE", symbol: "QLD", locale: "en" } as const;
const key = "00000000-0000-4000-8000-000000000000";
const job = createQueuedJob({ request, idempotencyKey: key, jobId: `job_${"a".repeat(48)}`,
  now: new Date(base), timeoutSeconds: 90, ttlSeconds: 86400 });
const denied = (error: unknown) => error instanceof PublicError && error.code === "DATA_UNAVAILABLE" && error.httpStatus === 503;

test("fixed UTC window is immutable, at most five minutes and absent means disabled", () => {
  assert.deepEqual(window, { startsAtMs: base, expiresAtMs: base + 300000 });
  assert.equal(Object.isFrozen(window), true);
  assert.equal(parseOwnerAdmissionWindow(undefined, undefined, null), null);
  for (const [a, b, identity] of [[start, undefined, owner], [undefined, end, owner], ["", "", owner],
    [null, end, owner], [start, end, null], [start, start, owner], [end, start, owner],
    [start, "2026-10-25T00:05:00.001Z", owner], [start, "2026-10-25T00:00:15.000Z", owner],
    ["2026-02-30T00:00:00.000Z", end, owner], [start.replace("Z", "+00:00"), end, owner],
    [start + "\n", end, owner], [{ secret: "PRIVATE_SENTINEL" }, end, owner]]) {
    assert.throws(() => parseOwnerAdmissionWindow(a, b, identity as string | null),
      /^Error: Owner admission window configuration is invalid\.$/);
  }
});

test("missing, invalid, future and expired windows deny; final fifteen seconds are reserved", () => {
  assert.equal(ownerAdmissionAllowed(window, base), true);
  assert.equal(ownerAdmissionAllowed(window, base + 284999), true);
  for (const clock of [base - 1, base + 285000, base + 300000, NaN, Infinity, base + .5])
    assert.equal(ownerAdmissionAllowed(window, clock), false);
  for (const value of [undefined, null, { startsAtMs: base, expiresAtMs: base + 300001 },
    { startsAtMs: base, expiresAtMs: Infinity }, { startsAtMs: base, expiresAtMs: base }])
    assert.equal(ownerAdmissionAllowed(value, base), false);
  // Reconstructing the same config (a cold start) cannot renew the absolute window.
  assert.equal(ownerAdmissionAllowed(parseOwnerAdmissionWindow(start, end, owner), base + 300001), false);
});

function harness(options: { enabled?: boolean; window?: ControllerExposurePolicy["admissionWindow"]; at?: number;
  afterCircuit?: number; afterCreate?: number; afterLaunch?: number; created?: boolean; compensationFails?: boolean } = {}) {
  let at = options.at ?? base;
  const calls = { circuit: 0, create: 0, launch: 0, attach: 0, compensate: 0, audit: [] as string[] };
  const jobs: ControllerJobRepository = {
    async create() { calls.create++; at = options.afterCreate ?? at; return { job, created: options.created ?? true }; },
    async get() { return { ...job, status: "SUCCEEDED", result: { privateData: "PRIVATE_SENTINEL" } }; },
    async attachTaskArn() { calls.attach++; },
    async markLaunchFailed(current) { calls.compensate++; if (options.compensationFails) throw Error("fixture compensation unavailable"); return current; },
  };
  const service = new ControllerService(jobs,
    { async launch() { calls.launch++; at = options.afterLaunch ?? at; return { taskArn: "local-fixture-task" }; } },
    { async state() { calls.circuit++; at = options.afterCircuit ?? at; return "CLOSED"; } },
    { jobCreationEnabled: options.enabled ?? true, liveResultDisplayEnabled: false,
      admissionWindow: options.window === undefined ? window : options.window },
    { write(event) { calls.audit.push(event.code); } }, () => new Date(at));
  return { service, calls };
}

test("enabled flag alone never reads the circuit or creates work without a current window", async () => {
  for (const options of [{ window: null }, { at: base - 1 }, { at: base + 285000 }, { enabled: false }]) {
    const { service, calls } = harness(options);
    await assert.rejects(service.createJob(request, key), denied);
    assert.deepEqual(calls, { circuit: 0, create: 0, launch: 0, attach: 0, compensate: 0, audit: [] });
  }
});

test("expiry or backward clock before admission prevents persistence", async () => {
  for (const afterCircuit of [base - 1, base + 285000]) {
    const { service, calls } = harness({ afterCircuit });
    await assert.rejects(service.createJob(request, key), denied);
    assert.equal(calls.circuit, 1); assert.equal(calls.create, 0); assert.equal(calls.launch, 0);
  }
});

test("expiry after a new admission compensates once and never dispatches a worker", async () => {
  const { service, calls } = harness({ afterCreate: base + 285000 });
  await assert.rejects(service.createJob(request, key), denied);
  assert.deepEqual(calls, { circuit: 1, create: 1, launch: 0, attach: 0, compensate: 1, audit: ["OWNER_ADMISSION_EXPIRED"] });
});

test("expired replay and failed compensation cannot cause a launch or automatic retry", async () => {
  const replay = harness({ afterCreate: base + 285000, created: false });
  await assert.rejects(replay.service.createJob(request, key), denied);
  assert.equal(replay.calls.compensate, 0); assert.equal(replay.calls.launch, 0);
  const failed = harness({ afterCreate: base + 285000, compensationFails: true });
  await assert.rejects(failed.service.createJob(request, key), /fixture compensation unavailable/);
  assert.equal(failed.calls.create, 1); assert.equal(failed.calls.compensate, 1); assert.equal(failed.calls.launch, 0);
});

test("already dispatched work is not rolled back or duplicated when wall time later expires", async () => {
  const { service, calls } = harness({ afterLaunch: base + 300001 });
  assert.equal((await service.createJob(request, key)).jobId, job.jobId);
  assert.equal(calls.launch, 1); assert.equal(calls.attach, 1); assert.equal(calls.compensate, 0);
  assert.equal((await service.health()).jobCreationEnabled, false);
  await assert.rejects(service.createJob(request, key), denied);
  assert.equal(calls.launch, 1);
});

test("health uses effective admission after its await; terminal status remains readable but result stays hidden", async () => {
  const { service } = harness({ afterCircuit: base + 285000 });
  assert.deepEqual(await service.health(), { status: "ok", circuit: "CLOSED", jobCreationEnabled: false });
  const value = await service.getJob(job.jobId);
  assert.equal(value.status, "SUCCEEDED"); assert.equal(value.result, undefined);
  assert.doesNotMatch(JSON.stringify(value), /PRIVATE_SENTINEL/);
});

test("actual AWS factory with owner and enabled flag still denies missing/expired window without SDK calls", async t => {
  t.mock.method(console, "warn", () => {});
  const env = { AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "local-contract-jobs",
    WORKER_CLUSTER: "arn:aws:ecs:ap-northeast-1:000000000000:cluster/local-contract-cluster",
    WORKER_TASK_DEFINITION: "arn:aws:ecs:ap-northeast-1:000000000000:task-definition/local-contract-task:3",
    WORKER_SUBNET_IDS: "subnet-0123456789abcdef0", WORKER_SECURITY_GROUP_ID: "sg-0123456789abcdef0",
    JOB_TIMEOUT_SECONDS: "90", JOB_TTL_SECONDS: "604800", CIRCUIT_STATE: "OPEN", MAX_JOBS_PER_MINUTE: "2", MAX_ACTIVE_JOBS: "2",
    API_AUTH_MODE: "AWS_IAM", PRIVATE_OWNER_USER_ARN: owner, ENABLE_PROVIDER_BACKED_JOBS: "true", ENABLE_LIVE_RESULT_DISPLAY: "false" };
  const event = { version: "2.0", routeKey: "POST /v1/jobs", body: JSON.stringify(request),
    headers: { "content-type": "application/json", "idempotency-key": key },
    requestContext: { accountId: "000000000000", authorizer: { iam: { userArn: owner, accountId: "000000000000" } } } };
  for (const changes of [{}, { OWNER_JOB_WINDOW_START: "2000-01-01T00:00:00.000Z", OWNER_JOB_WINDOW_END: "2000-01-01T00:05:00.000Z" }]) {
    const response = await buildAwsHandler({ ...env, ...changes })(event);
    assert.equal(response.statusCode, 503); assert.equal(JSON.parse(response.body).error.code, "DATA_UNAVAILABLE");
    assert.doesNotMatch(response.body, /arn:|000000000000|WINDOW|2000/);
  }
});

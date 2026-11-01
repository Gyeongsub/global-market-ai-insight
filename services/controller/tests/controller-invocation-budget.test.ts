import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { ControllerService, type ControllerJobRepository } from "../src/controller-service.js";
import { DynamoDbControllerJobRepository, deterministicJobId } from "../src/aws-job-repository.js";
import { createQueuedJob } from "../src/job.js";
import { AwsCallTimeoutError } from "../../../shared/time/bounded-aws-call.js";
import { createHandler } from "../src/http-handler.js";
import { getEventListeners } from "node:events";

const now = new Date("2026-10-19T00:00:00.000Z"), key = "00000000-0000-4000-8000-000000000000";
const request = { operation: "PRICE", symbol: "QLD", locale: "en" } as const;
const job = createQueuedJob({ request, idempotencyKey: key, jobId: deterministicJobId(key), now, timeoutSeconds: 90, ttlSeconds: 86400 });
function repository(create: ControllerJobRepository["create"]): ControllerJobRepository {
  return { create, async get() { return null; }, async attachTaskArn() {}, async markLaunchFailed() { throw new Error("must not compensate after expiry"); } };
}
const exposure = { jobCreationEnabled: true, liveResultDisplayEnabled: false,
  admissionWindow: { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300_000 } };

test("cumulative elapsed admission cannot dispatch a task after the request budget", async () => {
  let elapsed = 0, launches = 0;
  const jobs = repository(async () => { elapsed = 13000; return { job, created: true }; });
  const service = new ControllerService(jobs, { async launch() { launches++; return { taskArn: "synthetic-only" }; } },
    { async state() { return "CLOSED"; } }, exposure, { write() {} }, () => now, () => elapsed);
  await assert.rejects(service.createJob(request, key), AwsCallTimeoutError);
  assert.equal(launches, 0);
});

test("several individually valid repository calls cannot reset the whole admission budget", async () => {
  let elapsed = 0, transactions = 0, calls = 0, launches = 0;
  const circuit = { state: { S: "CLOSED" }, version: { N: "1" }, reason: { S: "test" }, actor: { S: "test" }, updatedAt: { S: now.toISOString() } };
  const jobs = new DynamoDbControllerJobRepository({ tableName: "synthetic-jobs", region: "ap-northeast-1", timeoutSeconds: 90,
    ttlSeconds: 86400, maxActiveJobs: 2, maxJobsPerMinute: 2, elapsedNow: () => elapsed, client: { async send(command) {
      calls++; elapsed += 2750;
      if (command instanceof GetItemCommand) return command.input.Key?.jobId?.S === "control_circuit" ? { Item: circuit } : {};
      assert.ok(command instanceof TransactWriteItemsCommand);
      if (++transactions === 1) throw Object.assign(new Error("synthetic-only"), { name: "TransactionCanceledException",
        CancellationReasons: [{ Code: "None" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }, { Code: "None" }] });
      return {};
    } } });
  const service = new ControllerService(jobs, { async launch() { launches++; return { taskArn: "synthetic-only" }; } },
    { async state() { elapsed += 1500; return "CLOSED"; } }, exposure, { write() {} }, () => now, () => elapsed);
  await assert.rejects(service.createJob(request, key), AwsCallTimeoutError);
  assert.equal(calls, 4); assert.equal(transactions, 2); assert.equal(launches, 0);
});

test("an uncooperative circuit read cannot hold admission open or resume it after timeout", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveRead: ((state: "CLOSED") => void) | undefined, creates = 0, launches = 0;
  const service = new ControllerService(repository(async () => { creates++; return { job, created: true }; }),
    { async launch() { launches++; return { taskArn: "synthetic-only" }; } },
    { async state() { return new Promise<"CLOSED">(resolve => { resolveRead = resolve; }); } }, exposure, { write() {} }, () => now);
  const pending = service.createJob(request, key), rejected = assert.rejects(pending, AwsCallTimeoutError);
  await new Promise(resolve => setImmediate(resolve)); context.mock.timers.tick(12000); await rejected;
  resolveRead!("CLOSED"); await new Promise(resolve => setImmediate(resolve));
  assert.equal(creates, 0); assert.equal(launches, 0);
});

test("an admission finishing after cancellation cannot attach, compensate or launch later", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let resolveCreate: ((value: { job: typeof job; created: boolean }) => void) | undefined;
  let launches = 0, writes = 0, signal: AbortSignal | undefined;
  const jobs = repository(async (_request, _key, _now, current) => {
    signal = current; return new Promise(resolve => { resolveCreate = resolve; });
  });
  jobs.attachTaskArn = async () => { writes++; }; jobs.markLaunchFailed = async () => { writes++; return job; };
  const service = new ControllerService(jobs, { async launch() { launches++; return { taskArn: "synthetic-only" }; } },
    { async state() { return "CLOSED"; } }, exposure, { write() {} }, () => now);
  const pending = service.createJob(request, key), rejected = assert.rejects(pending, AwsCallTimeoutError);
  await new Promise(resolve => setImmediate(resolve)); context.mock.timers.tick(12000); await rejected;
  resolveCreate!({ job, created: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(signal?.aborted, true); assert.equal(launches, 0); assert.equal(writes, 0);
});

test("request timeout becomes a stable private-free HTTP error and does not create work", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let creates = 0;
  const service = new ControllerService(repository(async () => { creates++; return { job, created: true }; }),
    { async launch() { throw new Error("must not launch"); } }, { async state() { return new Promise<"CLOSED">(() => {}); } },
    exposure, { write() {} }, () => now);
  const logs: unknown[] = [];
  context.mock.method(console, "error", (value: unknown) => { assert.equal(typeof value, "string"); logs.push(JSON.parse(value as string)); });
  const pending = createHandler(service)({ routeKey: "POST /v1/jobs", body: JSON.stringify(request),
    headers: { "content-type": "application/json", "idempotency-key": key }, requestContext: { requestId: "request-budget" } });
  await new Promise(resolve => setImmediate(resolve)); context.mock.timers.tick(12000);
  const response = await pending;
  assert.equal(response.statusCode, 500); assert.equal(JSON.parse(response.body).error.code, "INTERNAL_ERROR");
  assert.equal(/TimeoutError|AWS call|stack|PRIVATE_SENTINEL/.test(response.body), false);
  assert.deepEqual(logs, [{ level: "error", service: "controller", code: "REQUEST_FAILED", dependencyCode: "TIMEOUT", requestId: "request-budget" }]);
  assert.equal(creates, 0);
});

test("normal replay disposes its request signal without launching a duplicate or leaving listeners", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined, launches = 0;
  const service = new ControllerService(repository(async (_request, _key, _now, current) => { signal = current; return { job, created: false }; }),
    { async launch() { launches++; return { taskArn: "synthetic-only" }; } }, { async state() { return "CLOSED"; } }, exposure, { write() {} }, () => now);
  assert.equal((await service.createJob(request, key)).jobId, job.jobId);
  assert.equal(launches, 0); assert.equal(signal?.aborted, true); assert.equal(getEventListeners(signal!, "abort").length, 0);
  context.mock.timers.tick(12000);
});

test("expiry after RunTask or task-reference acknowledgement cannot trigger compensation or retry", async () => {
  for (const expiredStage of ["launch", "attach"] as const) {
    let elapsed = 0, launches = 0, attachments = 0, compensation = 0;
    const jobs = repository(async () => ({ job, created: true }));
    jobs.attachTaskArn = async () => { attachments++; elapsed = 12000; };
    jobs.markLaunchFailed = async () => { compensation++; return job; };
    const service = new ControllerService(jobs, { async launch() {
      launches++; if (expiredStage === "launch") elapsed = 12000; return { taskArn: "synthetic-only" };
    } }, { async state() { return "CLOSED"; } }, exposure, { write() {} }, () => now, () => elapsed);
    await assert.rejects(service.createJob(request, key), AwsCallTimeoutError);
    assert.equal(launches, 1); assert.equal(attachments, expiredStage === "attach" ? 1 : 0); assert.equal(compensation, 0);
  }
});

test("an expired launch failure cannot start a fresh compensation budget", async () => {
  let elapsed = 0, compensations = 0;
  const jobs = repository(async () => ({ job, created: true }));
  jobs.markLaunchFailed = async () => { compensations++; return job; };
  const service = new ControllerService(jobs, { async launch() { elapsed = 12000; throw new Error("synthetic-private-failure"); } },
    { async state() { return "CLOSED"; } }, exposure, { write() {} }, () => now, () => elapsed);
  await assert.rejects(service.createJob(request, key), AwsCallTimeoutError);
  assert.equal(compensations, 0);
});

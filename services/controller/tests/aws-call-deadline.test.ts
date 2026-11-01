import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { createQueuedJob } from "../src/job.js";
import { ControllerService } from "../src/controller-service.js";
import { DynamoDbControllerJobRepository, ControllerRepositoryError, deterministicJobId } from "../src/aws-job-repository.js";
import { EcsFargateTaskLauncher, TaskLaunchError } from "../src/ecs-task-launcher.js";
import { DynamoDbJobRepository, JobRepositoryError } from "../../worker/src/repositories/job-repository.js";
import { runOneShotWorker, WorkerLifecycleError } from "../../worker/src/worker-lifecycle.js";

const now = new Date("2026-10-19T00:00:00.000Z"), key = "00000000-0000-4000-8000-000000000000";
const request = { operation: "PRICE", symbol: "QLD", locale: "en" } as const;
const job = createQueuedJob({ request, idempotencyKey: key, jobId: deterministicJobId(key), now, timeoutSeconds: 90, ttlSeconds: 86400 });
const circuit = { state: { S: "CLOSED" }, version: { N: "1" }, reason: { S: "test" }, actor: { S: "test" }, updatedAt: { S: now.toISOString() } };
const controllerOptions = { tableName: "synthetic-jobs", region: "ap-northeast-1", timeoutSeconds: 90, ttlSeconds: 86400, maxActiveJobs: 2, maxJobsPerMinute: 2, operationTimeoutMs: 250 };
function item() {
  return Object.fromEntries(Object.entries(job).map(([name, value]) => [name, typeof value === "number" ? { N: String(value) } : { S: value }]));
}

test("a late admission acknowledgement cannot start a task or retry the write", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, launches = 0;
  const repository = new DynamoDbControllerJobRepository({ ...controllerOptions, client: { async send(command) {
    calls++;
    if (command instanceof GetItemCommand) return { Item: circuit };
    context.mock.timers.tick(250); return {};
  } } });
  const service = new ControllerService(repository, { async launch() { launches++; return { taskArn: "synthetic-task" }; } },
    { async state() { return "CLOSED"; } }, { jobCreationEnabled: true, liveResultDisplayEnabled: false,
      admissionWindow: { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300_000 } }, { write() {} }, () => now);
  await assert.rejects(service.createJob(request, key), error => error instanceof ControllerRepositoryError && error.code === "TIMEOUT");
  assert.equal(calls, 2); assert.equal(launches, 0);
});

test("a controller read resolving normally after cancellation is TIMEOUT, not a returned job", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const repository = new DynamoDbControllerJobRepository({ ...controllerOptions, client: { async send() {
    calls++; context.mock.timers.tick(250); return { Item: item() };
  } } });
  await assert.rejects(repository.get(job.jobId), error => error instanceof ControllerRepositoryError && error.code === "TIMEOUT");
  assert.equal(calls, 1);
});

test("a late worker claim acknowledgement cannot begin provider or model work", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0, providerCalls = 0, modelCalls = 0;
  const repository = new DynamoDbJobRepository({ tableName: "synthetic-jobs", region: "ap-northeast-1", operationTimeoutMs: 250,
    client: { async send(command) {
      calls++; if (command instanceof GetItemCommand) return { Item: item() };
      context.mock.timers.tick(250); return {};
    } } });
  await assert.rejects(runOneShotWorker(job.jobId, { repository, now: () => now,
    marketDataProvider: { async getQuote() { providerCalls++; throw new Error("synthetic-only"); } },
    analysisEngine: { async analyze() { modelCalls++; throw new Error("synthetic-only"); } },
  }), error => error instanceof WorkerLifecycleError && error.diagnosticCategory === "REPOSITORY_TIMEOUT");
  assert.equal(calls, 2); assert.equal(providerCalls, 0); assert.equal(modelCalls, 0);
});

test("a late worker read acknowledgement is discarded without another request", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const repository = new DynamoDbJobRepository({ tableName: "synthetic-jobs", region: "ap-northeast-1", operationTimeoutMs: 250,
    client: { async send() { calls++; context.mock.timers.tick(250); return { Item: item() }; } } });
  await assert.rejects(repository.load(job.jobId), error => error instanceof JobRepositoryError && error.code === "REPOSITORY_TIMEOUT");
  assert.equal(calls, 1);
});

test("a delayed timer cannot bless elapsed repository evidence on either side of the application", async () => {
  let elapsed = 0, calls = 0;
  const controller = new DynamoDbControllerJobRepository({ ...controllerOptions, elapsedNow: () => elapsed,
    client: { async send() { calls++; elapsed = 250; return { Item: item() }; } } });
  await assert.rejects(controller.get(job.jobId), error => error instanceof ControllerRepositoryError && error.code === "TIMEOUT");
  assert.equal(calls, 1); elapsed = 0;
  const worker = new DynamoDbJobRepository({ tableName: "synthetic-jobs", region: "ap-northeast-1", operationTimeoutMs: 250,
    elapsedNow: () => elapsed, client: { async send() { calls++; elapsed = 250; return { Item: item() }; } } });
  await assert.rejects(worker.load(job.jobId), error => error instanceof JobRepositoryError && error.code === "REPOSITORY_TIMEOUT");
  assert.equal(calls, 2);
});

test("late RunTask acknowledgement is ambiguous TIMEOUT, never a verified launch or second request", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  // Invented local-only account/resource shapes, never live targets.
  const cluster = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/local-contract-cluster";
  const definition = "arn:aws:ecs:ap-northeast-1:000000000000:task-definition/local-contract-task:3";
  let calls = 0;
  const launcher = new EcsFargateTaskLauncher({ region: "ap-northeast-1", cluster, taskDefinition: definition,
    subnetIds: ["subnet-0123456789abcdef0"], securityGroupId: "sg-0123456789abcdef0", operationTimeoutMs: 500,
    client: { async send() { calls++; context.mock.timers.tick(500); return { failures: [], tasks: [{
      taskArn: cluster.replace(":cluster/", ":task/") + "/" + "a".repeat(32), clusterArn: cluster, taskDefinitionArn: definition,
      launchType: "FARGATE", enableExecuteCommand: false, startedBy: job.jobId.slice(0, 36),
      overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: job.jobId }] }] },
    }] }; } } });
  await assert.rejects(launcher.launch(job.jobId), error => error instanceof TaskLaunchError && error.code === "TIMEOUT");
  assert.equal(calls, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { PublicError } from "../src/contracts.js";
import { ControllerRepositoryError, DynamoDbControllerJobRepository, controllerDynamoConfig, deterministicJobId, type ControllerDynamoSender } from "../src/aws-job-repository.js";
import { createQueuedJob } from "../src/job.js";

const request = { operation: "PRICE", symbol: "QLD", locale: "ko" } as const;
const key = "018f1c2a-b3d4-7e5f-8a90-123456789abc";
const now = new Date("2026-09-05T00:00:00.000Z");
const circuitItem = { state: { S: "CLOSED" }, version: { N: "1" }, reason: { S: "test" }, actor: { S: "operator" }, updatedAt: { S: now.toISOString() } };
const options = { tableName: "jobs-table", region: "ap-northeast-1", timeoutSeconds: 90, ttlSeconds: 86_400, maxJobsPerMinute: 2, maxActiveJobs: 2 };

function item() {
  const job = createQueuedJob({ request, idempotencyKey: key, jobId: deterministicJobId(key), now, timeoutSeconds: 90, ttlSeconds: 86_400 });
  return {
    jobId: { S: job.jobId }, operation: { S: job.operation }, symbol: { S: job.symbol }, locale: { S: job.locale },
    status: { S: job.status }, idempotencyKeyHash: { S: job.idempotencyKeyHash }, requestHash: { S: job.requestHash },
    createdAt: { S: job.createdAt }, updatedAt: { S: job.updatedAt }, deadlineAt: { S: job.deadlineAt },
    expiresAt: { N: String(job.expiresAt) }, attemptCount: { N: "0" }, version: { N: "1" }, schemaVersion: { S: "1.0.0" },
  };
}

test("uses a deterministic bounded job ID and a single-attempt SDK client", () => {
  assert.match(deterministicJobId(key), /^job_[a-f0-9]{48}$/);
  assert.equal(controllerDynamoConfig("ap-northeast-1").maxAttempts, 1);
});

test("conditionally creates a job without persisting the raw idempotency key", async () => {
  const commands: unknown[] = [];
  const client: ControllerDynamoSender = { async send(command) { commands.push(command); return command instanceof GetItemCommand ? { Item: circuitItem } : {}; } };
  const repository = new DynamoDbControllerJobRepository({ ...options, client });
  const result = await repository.create(request, key, now);
  assert.equal(result.created, true);
  assert.equal(commands.length, 2);
  assert.ok(commands[1] instanceof TransactWriteItemsCommand);
  const input = (commands[1] as TransactWriteItemsCommand).input;
  assert.equal(input.TransactItems?.[0]?.Put?.ConditionExpression, "attribute_not_exists(#jobId)");
  assert.equal(input.TransactItems?.[3]?.Update?.ConditionExpression, "attribute_not_exists(#windowCount) OR #windowCount < :limit");
  assert.equal(input.TransactItems?.[3]?.Update?.ExpressionAttributeValues?.[":limit"]?.N, "2");
  assert.equal(input.TransactItems?.[2]?.Put?.Item?.expiresAt, undefined);
  assert.equal(input.TransactItems?.[1]?.ConditionCheck?.ExpressionAttributeValues?.[":version"]?.N, "1");
  assert.equal(input.ClientRequestToken, undefined);
  assert.doesNotMatch(JSON.stringify(input), /018f1c2a-b3d4/);
});

test("loads a conditional replay consistently and launches no repository-side work", async () => {
  let call = 0;
  const commands: unknown[] = [];
  const client: ControllerDynamoSender = {
    async send(command) {
      commands.push(command);
      if (command instanceof GetItemCommand && command.input.Key?.jobId?.S === "control_circuit") return { Item: circuitItem };
      call += 1;
      if (call === 1) throw Object.assign(new Error("private detail"), { name: "TransactionCanceledException" });
      return { Item: item() };
    },
  };
  const repository = new DynamoDbControllerJobRepository({ ...options, client });
  const result = await repository.create(request, key, now);
  assert.equal(result.created, false);
  assert.ok(commands[1] instanceof TransactWriteItemsCommand);
  assert.ok(commands[2] instanceof GetItemCommand);
  assert.equal((commands[2] as GetItemCommand).input.ConsistentRead, true);
});

test("maps a full atomic rate window to RATE_LIMITED without creating a job", async () => {
  let call = 0;
  const client: ControllerDynamoSender = {
    async send(command) {
      if (command instanceof GetItemCommand && command.input.Key?.jobId?.S === "control_circuit") return { Item: circuitItem };
      call += 1;
      if (call === 1) throw Object.assign(new Error("private cancellation detail"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "None" }, { Code: "None" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }] });
      return {};
    },
  };
  const repository = new DynamoDbControllerJobRepository({ ...options, client });
  await assert.rejects(() => repository.create(request, key, now), (error: unknown) => error instanceof PublicError && error.code === "RATE_LIMITED" && error.httpStatus === 429);
  assert.equal(call, 2);
});

test("uses status and version conditions for launch-failure compensation", async () => {
  const commands: unknown[] = [];
  const client: ControllerDynamoSender = { async send(command) { commands.push(command); return {}; } };
  const repository = new DynamoDbControllerJobRepository({ ...options, client });
  const job = createQueuedJob({ request, idempotencyKey: key, jobId: deterministicJobId(key), now, timeoutSeconds: 90, ttlSeconds: 86_400 });
  const failed = await repository.markLaunchFailed(job, new Date("2026-09-05T00:00:02.000Z"));
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.version, 2);
  const command = commands[0] as UpdateItemCommand;
  assert.equal(command.input.ConditionExpression, "#status = :queued AND #version = :expectedVersion");
  assert.equal(command.input.ExpressionAttributeValues?.[":errorCode"]?.S, "TASK_LAUNCH_FAILED");
});

test("rejects mismatched or oversized stored results before returning a public job", async () => {
  const price = {
    kind: "PRICE", symbol: "QLD", price: 1, currency: "USD",
    marketTimestamp: "2026-09-05T00:00:00.000Z", retrievedAt: "2026-09-05T00:00:01.000Z",
    marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "test-fixture",
  };
  const good = {
    ...item(),
    status: { S: "SUCCEEDED" },
    resultJson: { S: JSON.stringify(price) },
  };
  const load = (record: typeof good) => new DynamoDbControllerJobRepository({
    ...options,
    client: { async send() { return { Item: record }; } },
  }).get(good.jobId.S);

  const loaded = await load(good);
  assert.equal(loaded?.status, "SUCCEEDED");
  assert.deepEqual(loaded?.result, price);
  for (const record of [
    { ...good, resultJson: { S: JSON.stringify({ ...price, kind: "ANALYSIS" }) } },
    { ...good, resultJson: { S: JSON.stringify({ ...price, symbol: "TSLA" }) } },
    { ...good, resultJson: { S: JSON.stringify({ ...price, source: "\u3000\t " }) } },
    { ...good, resultJson: { S: JSON.stringify({ ...price, rawProviderResponse: "private" }) } },
    { ...good, resultJson: { S: "x".repeat(32_769) } },
    { ...good, resultJson: { S: '{"symbol":"TSLA",' + JSON.stringify(price).slice(1) } },
    { ...good, resultJson: { S: '{"pr\\u0069ce":999999,' + JSON.stringify(price).slice(1) } },
    { ...good, status: { S: "RUNNING" } },
  ]) {
    await assert.rejects(() => load(record), (error: unknown) => error instanceof ControllerRepositoryError && error.code === "INVALID_RECORD");
  }
});

test("accepts the ANALYZE operation's ANALYSIS result kind", async () => {
  const analysis = {
    kind: "ANALYSIS", symbol: "QLD", locale: "ko", summary: "예시 시장 상황입니다.",
    observations: [], opportunities: [], risks: ["손실 위험이 있습니다."], specialConsiderations: [],
    uncertainty: "미래 성과는 알 수 없습니다.", dataAsOf: "2026-09-05T00:00:00.000Z",
    modelId: "amazon.nova-lite-v1:0", promptVersion: "grounded-v1",
    disclaimer: "교육 목적의 시장 인사이트이며 금융 자문이 아닙니다.",
  };
  const stored = { ...item(), operation: { S: "ANALYZE" }, status: { S: "SUCCEEDED" }, resultJson: { S: JSON.stringify(analysis) } };
  const repository = new DynamoDbControllerJobRepository({
    ...options,
    client: { async send() { return { Item: stored }; } },
  });
  assert.deepEqual((await repository.get(stored.jobId.S))?.result, analysis);
});

test("rejects terminal records missing their result or safe error", async () => {
  for (const status of ["SUCCEEDED", "FAILED", "TIMED_OUT"] as const) {
    const stored = { ...item(), status: { S: status } };
    const repository = new DynamoDbControllerJobRepository({
      ...options,
      client: { async send() { return { Item: stored }; } },
    });
    await assert.rejects(
      () => repository.get(stored.jobId.S),
      (error: unknown) => error instanceof ControllerRepositoryError && error.code === "INVALID_RECORD",
    );
  }
});

test("rejects malformed stored error metadata instead of reflecting it", async () => {
  const good = { ...item(), status: { S: "FAILED" }, errorCode: { S: "PROVIDER_ERROR" }, errorMessage: { S: "Provider request failed." } };
  const load = (record: typeof good) => new DynamoDbControllerJobRepository({
    ...options,
    client: { async send() { return { Item: record }; } },
  }).get(good.jobId.S);

  assert.equal((await load(good))?.errorCode, "PROVIDER_ERROR");
  for (const record of [
    { ...good, errorCode: { S: "bad-code" } },
    { ...good, errorMessage: { S: "internal\ndetail" } },
    { ...good, errorMessage: { S: "x".repeat(301) } },
    { ...good, status: { S: "SUCCEEDED" } },
  ]) {
    await assert.rejects(() => load(record), (error: unknown) => error instanceof ControllerRepositoryError && error.code === "INVALID_RECORD");
  }
});

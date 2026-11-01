import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { createQueuedJob } from "../../controller/src/job.js";
import { canonicalDisclaimer } from "../../../shared/schemas/disclaimer.js";
import {
  buildDynamoDbClientConfig,
  classifyRepositoryError,
  DynamoDbJobRepository,
  JobRepositoryError,
  type DynamoCommandSender,
} from "../src/repositories/job-repository.js";

const queued = createQueuedJob({
  request: { operation: "ANALYZE", symbol: "QLD", locale: "ko" },
  idempotencyKey: "00000000-0000-4000-8000-000000000000",
  jobId: "01J00000000000000000000000",
  now: new Date("2026-08-23T00:00:00.000Z"),
  timeoutSeconds: 90,
  ttlSeconds: 86_400,
});

const analysisResult = {
  kind: "ANALYSIS", symbol: "QLD", locale: "ko",
  summary: "QLD는 2배 레버리지 ETF입니다.",
  observations: ["현재 가격은 별도로 검증된 시세에 기반합니다."],
  opportunities: [], risks: ["2배 레버리지로 손실이 확대될 수 있습니다."],
  specialConsiderations: [], uncertainty: "미래 수익률은 알 수 없습니다.",
  dataAsOf: "2026-08-23T00:00:00.000Z", modelId: "amazon.nova-lite-v1:0",
  promptVersion: "grounded-v1", disclaimer: canonicalDisclaimer("ko"),
} as const;

function item() {
  return {
    jobId: { S: queued.jobId },
    operation: { S: queued.operation },
    symbol: { S: queued.symbol },
    locale: { S: queued.locale },
    status: { S: queued.status },
    idempotencyKeyHash: { S: queued.idempotencyKeyHash },
    requestHash: { S: queued.requestHash },
    createdAt: { S: queued.createdAt },
    updatedAt: { S: queued.updatedAt },
    deadlineAt: { S: queued.deadlineAt },
    expiresAt: { N: String(queued.expiresAt) },
    attemptCount: { N: String(queued.attemptCount) },
    version: { N: String(queued.version) },
    schemaVersion: { S: queued.schemaVersion },
  };
}

function assertNoUnusedExpressionPlaceholders(command: UpdateItemCommand) {
  const expressions = `${command.input.ConditionExpression ?? ""} ${command.input.UpdateExpression ?? ""}`;
  for (const placeholder of Object.keys(command.input.ExpressionAttributeNames ?? {})) {
    assert.equal(expressions.includes(placeholder), true, `unused expression name: ${placeholder}`);
  }
  for (const placeholder of Object.keys(command.input.ExpressionAttributeValues ?? {})) {
    assert.equal(expressions.includes(placeholder), true, `unused expression value: ${placeholder}`);
  }
}

test("stored result JSON rejects duplicate identities before returning a job", async () => {
  for (const prefix of ['"symbol":"TSLA",', '"summ\\u0061ry":"PRIVATE_SENTINEL",']) {
    const record = { ...item(), status: { S: "SUCCEEDED" }, resultJson: { S: "{" + prefix + JSON.stringify(analysisResult).slice(1) } };
    const repository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1",
      client: { async send() { return { Item: record }; } } });
    await assert.rejects(repository.load(queued.jobId), error => error instanceof JobRepositoryError &&
      error.code === "INVALID_JOB_RECORD" && !/PRIVATE_SENTINEL|TSLA/.test(error.message));
  }
});

test("pins DynamoDB to one SDK attempt without embedded credentials", () => {
  const config = buildDynamoDbClientConfig("ap-northeast-1");
  assert.equal(config.region, "ap-northeast-1");
  assert.equal(config.maxAttempts, 1);
  assert.equal("credentials" in config, false);
  assert.throws(() => buildDynamoDbClientConfig("invalid"), /region is invalid/);
});

test("loads one job with a consistent keyed read", async () => {
  let captured: GetItemCommand | undefined;
  const client: DynamoCommandSender = {
    async send(command) {
      assert.ok(command instanceof GetItemCommand);
      captured = command;
      return { Item: item(), $metadata: {} };
    },
  };
  const repository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client });
  const actual = await repository.load(queued.jobId);
  assert.deepEqual(actual, queued);
  assert.equal(captured?.input.TableName, "gmai-dev-jobs");
  assert.equal(captured?.input.ConsistentRead, true);
  assert.deepEqual(captured?.input.Key, { jobId: { S: queued.jobId } });
});

test("claims and completes only the expected status and version", async () => {
  const commands: UpdateItemCommand[] = [];
  const client: DynamoCommandSender = {
    async send(command) {
      assert.ok(command instanceof UpdateItemCommand);
      commands.push(command);
      return { $metadata: {} };
    },
  };
  const repository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client });
  const running = await repository.transition({ current: queued, next: "RUNNING", now: new Date("2026-08-23T00:00:01.000Z") });
  const result = analysisResult;
  const succeeded = await repository.transition({ current: running, next: "SUCCEEDED", now: new Date("2026-08-23T00:00:02.000Z"), result });

  assert.equal(running.status, "RUNNING");
  assert.equal(running.attemptCount, 1);
  assert.equal(running.version, 2);
  assert.equal(succeeded.status, "SUCCEEDED");
  assert.equal(succeeded.version, 3);
  assert.deepEqual(succeeded.result, result);
  assert.equal(commands.length, 2);
  for (const command of commands) {
    assert.equal(command.input.ConditionExpression, "attribute_exists(#jobId) AND #status = :expectedStatus AND #version = :expectedVersion");
    assert.equal(command.input.ReturnValues, "NONE");
  }
  assert.equal(commands[0]?.input.ExpressionAttributeValues?.[":expectedStatus"]?.S, "QUEUED");
  assert.equal(commands[0]?.input.ExpressionAttributeValues?.[":expectedVersion"]?.N, "1");
  assert.equal(commands[1]?.input.ExpressionAttributeValues?.[":resultJson"]?.S, JSON.stringify(result));
  assert.match(commands[1]?.input.UpdateExpression ?? "", /REMOVE #errorCode, #errorMessage/);
});

test("uses every DynamoDB expression placeholder in each transition branch", async () => {
  const commands: UpdateItemCommand[] = [];
  const client: DynamoCommandSender = {
    async send(command) {
      assert.ok(command instanceof UpdateItemCommand);
      commands.push(command);
      return { $metadata: {} };
    },
  };
  const repository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client });
  const running = await repository.transition({ current: queued, next: "RUNNING", now: new Date("2026-08-23T00:00:01.000Z") });
  await repository.transition({ current: running, next: "SUCCEEDED", now: new Date("2026-08-23T00:00:02.000Z"), result: analysisResult });
  await repository.transition({
    current: queued,
    next: "TIMED_OUT",
    now: new Date("2026-08-23T00:00:03.000Z"),
    errorCode: "JOB_DEADLINE_EXCEEDED",
    errorMessage: "Job deadline expired before worker execution began.",
  });

  assert.equal(commands.length, 3);
  commands.forEach(assertNoUnusedExpressionPlaceholders);
  assert.equal("#attemptCount" in (commands[2]?.input.ExpressionAttributeNames ?? {}), false);
});

test("rejects a mismatched or incomplete worker result before any write", async () => {
  let writes = 0;
  const client: DynamoCommandSender = { async send() { writes += 1; return { $metadata: {} }; } };
  const repository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client });
  const running = { ...queued, status: "RUNNING" as const, version: 2, attemptCount: 1 };
  for (const result of [{ kind: "PRICE", symbol: "QLD" }, { ...analysisResult, locale: "en" }]) {
    await assert.rejects(
      repository.transition({ current: running, next: "SUCCEEDED", now: new Date("2026-08-23T00:00:02.000Z"), result }),
      (error: unknown) => error instanceof JobRepositoryError && error.code === "INVALID_JOB_RECORD",
    );
  }
  assert.equal(writes, 0);
});

test("maps conditional conflicts, timeouts, and invalid stored records to safe errors", async () => {
  const conflictClient: DynamoCommandSender = {
    async send() {
      throw Object.assign(new Error("internal table detail"), { name: "ConditionalCheckFailedException" });
    },
  };
  const conflictRepository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client: conflictClient });
  await assert.rejects(
    conflictRepository.transition({ current: queued, next: "RUNNING", now: new Date("2026-08-23T00:00:01.000Z") }),
    (error: unknown) => error instanceof JobRepositoryError && error.code === "CONDITIONAL_CONFLICT" && !error.message.includes("internal table detail"),
  );

  const timeoutClient: DynamoCommandSender = {
    async send(_command, options) {
      return await new Promise((_resolve, reject) => options.abortSignal.addEventListener("abort", () => {
        reject(Object.assign(new Error("private timeout detail"), { name: "AbortError" }));
      }, { once: true }));
    },
  };
  const timeoutRepository = new DynamoDbJobRepository({
    tableName: "gmai-dev-jobs",
    region: "ap-northeast-1",
    client: timeoutClient,
    operationTimeoutMs: 250,
  });
  await assert.rejects(timeoutRepository.load(queued.jobId), (error: unknown) => (
    error instanceof JobRepositoryError && error.code === "REPOSITORY_TIMEOUT" && !error.message.includes("private timeout detail")
  ));

  const invalidClient: DynamoCommandSender = { async send() { return { Item: { ...item(), version: { N: "0" } } }; } };
  const invalidRepository = new DynamoDbJobRepository({ tableName: "gmai-dev-jobs", region: "ap-northeast-1", client: invalidClient });
  await assert.rejects(invalidRepository.load(queued.jobId), (error: unknown) => error instanceof JobRepositoryError && error.code === "INVALID_JOB_RECORD");
});

test("classifies only allowlisted repository failure identities without leaking raw details", () => {
  const privateDetail = "AKIAEXAMPLE https://169.254.170.2/private bearer-secret";
  const cases: Array<[unknown, string]> = [
    [Object.assign(new Error(privateDetail), { name: "CredentialsProviderError", stack: privateDetail }), "REPOSITORY_CREDENTIALS_ERROR"],
    [Object.assign(new Error(privateDetail), { name: "AccessDeniedException" }), "REPOSITORY_ACCESS_DENIED"],
    [Object.assign(new Error(privateDetail), { code: "ENOTFOUND" }), "REPOSITORY_NETWORK_ERROR"],
    [Object.assign(new Error(privateDetail), { name: "TimeoutError" }), "REPOSITORY_TIMEOUT"],
    [Object.assign(new Error(privateDetail), { name: "ValidationException" }), "REPOSITORY_REQUEST_INVALID"],
    [Object.assign(new Error(privateDetail), { name: "ResourceNotFoundException" }), "REPOSITORY_RESOURCE_NOT_FOUND"],
    [Object.assign(new Error(privateDetail), { name: "UnknownPrivateFailure" }), "REPOSITORY_ERROR"],
    [Object.assign(new Error(privateDetail), { cause: { code: "EAI_AGAIN", message: privateDetail } }), "REPOSITORY_NETWORK_ERROR"],
  ];

  for (const [source, expectedCode] of cases) {
    const classified = classifyRepositoryError(source);
    assert.equal(classified.code, expectedCode);
    assert.doesNotMatch(JSON.stringify({ code: classified.code, message: classified.message }), /AKIAEXAMPLE|169\.254\.170\.2|bearer-secret|private/i);
  }
});

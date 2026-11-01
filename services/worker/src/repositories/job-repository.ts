import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClientConfig,
  type GetItemCommandOutput,
} from "@aws-sdk/client-dynamodb";
import { JOB_STATUSES, type JobRecord, type JobStatus } from "../../../controller/src/contracts.js";
import { transitionJob } from "../../../controller/src/job.js";
import { validateCreateJobRequest } from "../../../controller/src/validation.js";
import { storedResultValid } from "../../../../shared/schemas/result-validation.js";
import { boundedAwsCall } from "../../../../shared/time/bounded-aws-call.js";

type RepositoryCommand = GetItemCommand | UpdateItemCommand;

export interface DynamoCommandSender {
  send(command: RepositoryCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

export type JobRepositoryErrorCode =
  | "JOB_NOT_FOUND"
  | "JOB_NOT_CLAIMABLE"
  | "CONDITIONAL_CONFLICT"
  | "INVALID_JOB_RECORD"
  | "REPOSITORY_ACCESS_DENIED"
  | "REPOSITORY_CREDENTIALS_ERROR"
  | "REPOSITORY_NETWORK_ERROR"
  | "REPOSITORY_REQUEST_INVALID"
  | "REPOSITORY_RESOURCE_NOT_FOUND"
  | "REPOSITORY_TIMEOUT"
  | "REPOSITORY_ERROR";

export class JobRepositoryError extends Error {
  constructor(public readonly code: JobRepositoryErrorCode, message: string) {
    super(message);
    this.name = "JobRepositoryError";
  }
}

export type WorkerJobTransition =
  | { current: JobRecord; next: "RUNNING"; now: Date }
  | { current: JobRecord; next: "SUCCEEDED"; now: Date; result: unknown }
  | { current: JobRecord; next: "FAILED" | "TIMED_OUT"; now: Date; errorCode: string; errorMessage: string };

export interface JobRepository {
  load(jobId: string): Promise<JobRecord | null>;
  transition(input: WorkerJobTransition): Promise<JobRecord>;
}

interface DynamoDbJobRepositoryOptions {
  tableName: string;
  region: string;
  client?: DynamoCommandSender;
  operationTimeoutMs?: number;
  elapsedNow?: () => number;
}

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export function buildDynamoDbClientConfig(region: string): DynamoDBClientConfig {
  if (!REGION_PATTERN.test(region)) throw new Error("AWS region is invalid.");
  return {
    region,
    // A lost response must be reconciled by reloading status/version. The SDK
    // must not silently repeat an ambiguous conditional write.
    maxAttempts: 1,
  };
}

function requiredString(item: Record<string, AttributeValue>, key: string): string {
  const value = item[key];
  if (!value || !("S" in value) || typeof value.S !== "string") {
    throw new JobRepositoryError("INVALID_JOB_RECORD", `Stored job has an invalid ${key}.`);
  }
  return value.S;
}

function optionalString(item: Record<string, AttributeValue>, key: string): string | undefined {
  const value = item[key];
  if (value === undefined) return undefined;
  if (!("S" in value) || typeof value.S !== "string") {
    throw new JobRepositoryError("INVALID_JOB_RECORD", `Stored job has an invalid ${key}.`);
  }
  return value.S;
}

function requiredInteger(item: Record<string, AttributeValue>, key: string, minimum: number): number {
  const value = item[key];
  const parsed = value && "N" in value && typeof value.N === "string" ? Number(value.N) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new JobRepositoryError("INVALID_JOB_RECORD", `Stored job has an invalid ${key}.`);
  }
  return parsed;
}

function validIsoTimestamp(value: string, key: string): string {
  if (Number.isNaN(Date.parse(value)) || !value.endsWith("Z")) {
    throw new JobRepositoryError("INVALID_JOB_RECORD", `Stored job has an invalid ${key}.`);
  }
  return value;
}

function decodeJob(item: Record<string, AttributeValue>): JobRecord {
  const request = validateCreateJobRequest({
    operation: requiredString(item, "operation"),
    symbol: requiredString(item, "symbol"),
    locale: requiredString(item, "locale"),
  });
  const jobId = requiredString(item, "jobId");
  const status = requiredString(item, "status");
  const idempotencyKeyHash = requiredString(item, "idempotencyKeyHash");
  const storedRequestHash = requiredString(item, "requestHash");
  const schemaVersion = requiredString(item, "schemaVersion");
  if (!JOB_ID_PATTERN.test(jobId) || !JOB_STATUSES.includes(status as JobStatus)) {
    throw new JobRepositoryError("INVALID_JOB_RECORD", "Stored job identity or status is invalid.");
  }
  if (!HASH_PATTERN.test(idempotencyKeyHash) || !HASH_PATTERN.test(storedRequestHash) || schemaVersion !== "1.0.0") {
    throw new JobRepositoryError("INVALID_JOB_RECORD", "Stored job hash or schema version is invalid.");
  }

  const resultJson = optionalString(item, "resultJson");
  let result: unknown;
  if (resultJson !== undefined) {
    try {
      result = parseUnambiguousJson(resultJson, 32_768);
    }
    catch {
      throw new JobRepositoryError("INVALID_JOB_RECORD", "Stored job result is invalid.");
    }
  }
  const errorCode = optionalString(item, "errorCode");
  const errorMessage = optionalString(item, "errorMessage");

  return {
    ...request,
    jobId,
    status: status as JobStatus,
    idempotencyKeyHash,
    requestHash: storedRequestHash,
    createdAt: validIsoTimestamp(requiredString(item, "createdAt"), "createdAt"),
    updatedAt: validIsoTimestamp(requiredString(item, "updatedAt"), "updatedAt"),
    deadlineAt: validIsoTimestamp(requiredString(item, "deadlineAt"), "deadlineAt"),
    expiresAt: requiredInteger(item, "expiresAt", 0),
    attemptCount: requiredInteger(item, "attemptCount", 0),
    version: requiredInteger(item, "version", 1),
    schemaVersion: "1.0.0",
    ...(result === undefined ? {} : { result }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
  };
}

function safeFailure(errorCode: string, errorMessage: string) {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(errorCode)) throw new Error("Worker failure code is invalid.");
  if (!errorMessage || errorMessage.length > 300 || /[\r\n]/.test(errorMessage)) throw new Error("Worker failure message is invalid.");
  return { errorCode, errorMessage };
}

function resultJson(result: unknown, job: JobRecord): string {
  if (!storedResultValid(result, job)) throw new JobRepositoryError("INVALID_JOB_RECORD", "Worker result does not match the job contract.");
  const serialized = JSON.stringify(result);
  if (serialized.length > 32_768) throw new JobRepositoryError("INVALID_JOB_RECORD", "Worker result exceeds the storage boundary.");
  return serialized;
}

function errorIdentities(error: unknown): Set<string> {
  const identities = new Set<string>();
  let current = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth += 1) {
    const candidate = current as { name?: unknown; code?: unknown; cause?: unknown };
    if (typeof candidate.name === "string" && candidate.name.length <= 80) identities.add(candidate.name);
    if (typeof candidate.code === "string" && candidate.code.length <= 80) identities.add(candidate.code);
    current = candidate.cause;
  }
  return identities;
}

export function classifyRepositoryError(error: unknown): JobRepositoryError {
  if (error instanceof JobRepositoryError) return error;
  const identities = errorIdentities(error);
  if (identities.has("ConditionalCheckFailedException")) {
    return new JobRepositoryError("CONDITIONAL_CONFLICT", "Job status changed before the conditional update completed.");
  }
  if (["AbortError", "TimeoutError", "RequestTimeout", "RequestTimeoutException", "ETIMEDOUT"].some((value) => identities.has(value))) {
    return new JobRepositoryError("REPOSITORY_TIMEOUT", "Job repository request timed out.");
  }
  if (["CredentialsProviderError", "CredentialProviderError", "TokenProviderError", "InvalidClientTokenId", "UnrecognizedClientException", "ExpiredTokenException", "InvalidSignatureException"].some((value) => identities.has(value))) {
    return new JobRepositoryError("REPOSITORY_CREDENTIALS_ERROR", "Job repository credentials were unavailable or invalid.");
  }
  if (["AccessDenied", "AccessDeniedException", "UnauthorizedException"].some((value) => identities.has(value))) {
    return new JobRepositoryError("REPOSITORY_ACCESS_DENIED", "Job repository access was denied.");
  }
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "UnknownEndpoint"].some((value) => identities.has(value))) {
    return new JobRepositoryError("REPOSITORY_NETWORK_ERROR", "Job repository endpoint could not be reached.");
  }
  if (identities.has("ValidationException")) {
    return new JobRepositoryError("REPOSITORY_REQUEST_INVALID", "Job repository request expression was invalid.");
  }
  if (identities.has("ResourceNotFoundException")) {
    return new JobRepositoryError("REPOSITORY_RESOURCE_NOT_FOUND", "Job repository resource was not found.");
  }
  return new JobRepositoryError("REPOSITORY_ERROR", "Job repository request failed.");
}

export class DynamoDbJobRepository implements JobRepository {
  private readonly client: DynamoCommandSender;
  private readonly operationTimeoutMs: number;

  constructor(private readonly options: DynamoDbJobRepositoryOptions) {
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(options.tableName)) throw new Error("DynamoDB table name is invalid.");
    const config = buildDynamoDbClientConfig(options.region);
    this.client = options.client ?? new DynamoDBClient(config);
    this.operationTimeoutMs = options.operationTimeoutMs ?? 3_000;
    if (!Number.isInteger(this.operationTimeoutMs) || this.operationTimeoutMs < 250 || this.operationTimeoutMs > 10_000) {
      throw new Error("Repository timeout must be between 250 and 10000 milliseconds.");
    }
  }

  private async send(command: RepositoryCommand): Promise<unknown> {
    try {
      return await boundedAwsCall(signal => this.client.send(command, { abortSignal: signal }), this.operationTimeoutMs, this.options.elapsedNow);
    }
    catch (error) {
      throw classifyRepositoryError(error);
    }
  }

  async load(jobId: string): Promise<JobRecord | null> {
    if (!JOB_ID_PATTERN.test(jobId)) throw new JobRepositoryError("INVALID_JOB_RECORD", "Job ID is invalid.");
    const output = await this.send(new GetItemCommand({
      TableName: this.options.tableName,
      Key: { jobId: { S: jobId } },
      ConsistentRead: true,
    })) as GetItemCommandOutput;
    return output.Item ? decodeJob(output.Item) : null;
  }

  async transition(input: WorkerJobTransition): Promise<JobRecord> {
    const nextJob = transitionJob(input.current, input.next, input.now);
    const names: Record<string, string> = {
      "#jobId": "jobId",
      "#status": "status",
      "#updatedAt": "updatedAt",
      "#version": "version",
    };
    const values: Record<string, AttributeValue> = {
      ":expectedStatus": { S: input.current.status },
      ":expectedVersion": { N: String(input.current.version) },
      ":nextStatus": { S: input.next },
      ":updatedAt": { S: nextJob.updatedAt },
      ":nextVersion": { N: String(nextJob.version) },
    };
    let updateExpression = "SET #status = :nextStatus, #updatedAt = :updatedAt, #version = :nextVersion";
    let removeExpression = "";
    let returned: JobRecord = nextJob;

    if (input.next === "RUNNING") {
      names["#attemptCount"] = "attemptCount";
      values[":nextAttemptCount"] = { N: String(nextJob.attemptCount) };
      updateExpression += ", #attemptCount = :nextAttemptCount";
    }
    else if (input.next === "SUCCEEDED") {
      names["#resultJson"] = "resultJson";
      names["#errorCode"] = "errorCode";
      names["#errorMessage"] = "errorMessage";
      const serialized = resultJson(input.result, input.current);
      values[":resultJson"] = { S: serialized };
      updateExpression += ", #resultJson = :resultJson";
      removeExpression = " REMOVE #errorCode, #errorMessage";
      returned = { ...nextJob, result: input.result };
    }
    else {
      names["#resultJson"] = "resultJson";
      names["#errorCode"] = "errorCode";
      names["#errorMessage"] = "errorMessage";
      const failure = safeFailure(input.errorCode, input.errorMessage);
      values[":errorCode"] = { S: failure.errorCode };
      values[":errorMessage"] = { S: failure.errorMessage };
      updateExpression += ", #errorCode = :errorCode, #errorMessage = :errorMessage";
      removeExpression = " REMOVE #resultJson";
      returned = { ...nextJob, ...failure };
    }

    await this.send(new UpdateItemCommand({
      TableName: this.options.tableName,
      Key: { jobId: { S: input.current.jobId } },
      ConditionExpression: "attribute_exists(#jobId) AND #status = :expectedStatus AND #version = :expectedVersion",
      UpdateExpression: `${updateExpression}${removeExpression}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "NONE",
    }));
    return returned;
  }
}
import { parseUnambiguousJson } from "../../../../shared/schemas/strict-json.js";

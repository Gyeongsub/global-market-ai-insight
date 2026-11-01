import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  JOB_STATUSES,
  PublicError,
  type CreateJobRequest,
  type JobRecord,
  type JobStatus,
} from "./contracts.js";
import { assertIdempotentReplay, createQueuedJob, stableHash, transitionJob } from "./job.js";
import { validateCreateJobRequest } from "./validation.js";
import { storedResultValid } from "../../../shared/schemas/result-validation.js";
import type { ControllerJobRepository, CreateStoredJobResult } from "./controller-service.js";
import { CIRCUIT_KEY, decodeCircuit } from "../../operations/circuit_control/src/store.js";
import { boundedAwsCall } from "../../../shared/time/bounded-aws-call.js";

type RepositoryCommand = GetItemCommand | TransactWriteItemsCommand | UpdateItemCommand;

export interface ControllerDynamoSender {
  send(command: RepositoryCommand, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

export class ControllerRepositoryError extends Error {
  constructor(public readonly code: "ACCESS_DENIED" | "TIMEOUT" | "UNAVAILABLE" | "INVALID_RECORD") {
    super("Controller job repository operation failed.");
    this.name = "ControllerRepositoryError";
  }
}

interface RepositoryOptions {
  tableName: string;
  region: string;
  timeoutSeconds: number;
  ttlSeconds: number;
  operationTimeoutMs?: number;
  elapsedNow?: () => number;
  maxJobsPerMinute: number;
  maxActiveJobs: number;
  client?: ControllerDynamoSender;
}

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

export function controllerDynamoConfig(region: string): DynamoDBClientConfig {
  if (!REGION_PATTERN.test(region)) throw new Error("AWS region is invalid.");
  return { region, maxAttempts: 1 };
}

export function deterministicJobId(idempotencyKey: string): string {
  return `job_${stableHash(idempotencyKey).slice(0, 48)}`;
}

function toItem(job: JobRecord): Record<string, AttributeValue> {
  return {
    jobId: { S: job.jobId },
    operation: { S: job.operation },
    symbol: { S: job.symbol },
    locale: { S: job.locale },
    status: { S: job.status },
    idempotencyKeyHash: { S: job.idempotencyKeyHash },
    requestHash: { S: job.requestHash },
    createdAt: { S: job.createdAt },
    updatedAt: { S: job.updatedAt },
    deadlineAt: { S: job.deadlineAt },
    expiresAt: { N: String(job.expiresAt) },
    attemptCount: { N: String(job.attemptCount) },
    version: { N: String(job.version) },
    schemaVersion: { S: job.schemaVersion },
  };
}

function requiredString(item: Record<string, AttributeValue>, key: string): string {
  const value = item[key];
  if (!value || !("S" in value) || typeof value.S !== "string") throw new ControllerRepositoryError("INVALID_RECORD");
  return value.S;
}

function optionalString(item: Record<string, AttributeValue>, key: string): string | undefined {
  const value = item[key];
  if (value === undefined) return undefined;
  if (!("S" in value) || typeof value.S !== "string") throw new ControllerRepositoryError("INVALID_RECORD");
  return value.S;
}

function requiredInteger(item: Record<string, AttributeValue>, key: string, minimum: number): number {
  const value = item[key];
  const parsed = value && "N" in value && typeof value.N === "string" ? Number(value.N) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < minimum) throw new ControllerRepositoryError("INVALID_RECORD");
  return parsed;
}

function timestamp(value: string): string {
  if (!value.endsWith("Z") || Number.isNaN(Date.parse(value))) throw new ControllerRepositoryError("INVALID_RECORD");
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
  if (!JOB_ID_PATTERN.test(jobId) || !JOB_STATUSES.includes(status as JobStatus)) throw new ControllerRepositoryError("INVALID_RECORD");
  if (!HASH_PATTERN.test(idempotencyKeyHash) || !HASH_PATTERN.test(storedRequestHash) || schemaVersion !== "1.0.0") {
    throw new ControllerRepositoryError("INVALID_RECORD");
  }

  const resultJson = optionalString(item, "resultJson");
  let result: unknown;
  if (resultJson !== undefined) {
    if (resultJson.length > 32_768 || status !== "SUCCEEDED") throw new ControllerRepositoryError("INVALID_RECORD");
    try {
      result = parseUnambiguousJson(resultJson, 32_768);
      if (!storedResultValid(result, request)) throw new Error("invalid result");
    }
    catch {
      throw new ControllerRepositoryError("INVALID_RECORD");
    }
  }
  if (status === "SUCCEEDED" && result === undefined) throw new ControllerRepositoryError("INVALID_RECORD");
  const taskArn = optionalString(item, "taskArn");
  const errorCode = optionalString(item, "errorCode");
  const errorMessage = optionalString(item, "errorMessage");
  if ((errorCode !== undefined && !/^[A-Z][A-Z0-9_]{2,63}$/.test(errorCode)) ||
      (errorMessage !== undefined && (!errorMessage || errorMessage.length > 300 || /[\r\n]/.test(errorMessage))) ||
      ((errorCode === undefined) !== (errorMessage === undefined)) ||
      ((status === "FAILED" || status === "TIMED_OUT") && errorCode === undefined) ||
      ((errorCode !== undefined || errorMessage !== undefined) && status !== "FAILED" && status !== "TIMED_OUT")) {
    throw new ControllerRepositoryError("INVALID_RECORD");
  }

  return {
    ...request,
    jobId,
    status: status as JobStatus,
    idempotencyKeyHash,
    requestHash: storedRequestHash,
    createdAt: timestamp(requiredString(item, "createdAt")),
    updatedAt: timestamp(requiredString(item, "updatedAt")),
    deadlineAt: timestamp(requiredString(item, "deadlineAt")),
    expiresAt: requiredInteger(item, "expiresAt", 0),
    attemptCount: requiredInteger(item, "attemptCount", 0),
    version: requiredInteger(item, "version", 1),
    schemaVersion: "1.0.0",
    ...(taskArn === undefined ? {} : { taskArn }),
    ...(result === undefined ? {} : { result }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
  };
}

function errorNames(error: unknown): Set<string> {
  const names = new Set<string>();
  let current = error;
  for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth += 1) {
    const value = current as { name?: unknown; code?: unknown; cause?: unknown };
    if (typeof value.name === "string") names.add(value.name);
    if (typeof value.code === "string") names.add(value.code);
    current = value.cause;
  }
  return names;
}

function isConditional(error: unknown): boolean {
  const names = errorNames(error);
  return names.has("ConditionalCheckFailedException") || names.has("TransactionCanceledException");
}

function rateWindowKey(now: Date): string {
  return `control_rate_${now.toISOString().slice(0, 16).replace(/[-:]/g, "")}`;
}

function safeRepositoryError(error: unknown): ControllerRepositoryError {
  const names = errorNames(error);
  if (["AccessDeniedException", "UnrecognizedClientException", "ExpiredTokenException"].some((name) => names.has(name))) {
    return new ControllerRepositoryError("ACCESS_DENIED");
  }
  if (["AbortError", "TimeoutError", "RequestTimeout", "ETIMEDOUT"].some((name) => names.has(name))) {
    return new ControllerRepositoryError("TIMEOUT");
  }
  return new ControllerRepositoryError("UNAVAILABLE");
}

export class DynamoDbControllerJobRepository implements ControllerJobRepository {
  private readonly client: ControllerDynamoSender;
  private readonly operationTimeoutMs: number;

  constructor(private readonly options: RepositoryOptions) {
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(options.tableName)) throw new Error("Jobs table name is invalid.");
    if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 10 || options.timeoutSeconds > 300) throw new Error("Job timeout is invalid.");
    if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < 3_600) throw new Error("Job TTL is invalid.");
    if (!Number.isInteger(options.maxJobsPerMinute) || options.maxJobsPerMinute < 1 || options.maxJobsPerMinute > 10) throw new Error("Job rate limit is invalid.");
    if (!Number.isInteger(options.maxActiveJobs) || options.maxActiveJobs < 1 || options.maxActiveJobs > 5) throw new Error("Active job cap is invalid.");
    this.operationTimeoutMs = options.operationTimeoutMs ?? 3_000;
    if (!Number.isSafeInteger(this.operationTimeoutMs) || this.operationTimeoutMs < 250 || this.operationTimeoutMs > 10_000) throw new Error("Repository timeout is invalid.");
    this.client = options.client ?? (new DynamoDBClient(controllerDynamoConfig(options.region)) as ControllerDynamoSender);
  }

  private async send(command: RepositoryCommand, parent?: AbortSignal): Promise<unknown> {
    return boundedAwsCall(signal => this.client.send(command, { abortSignal: signal }), this.operationTimeoutMs, this.options.elapsedNow, parent);
  }

  async create(request: CreateJobRequest, idempotencyKey: string, now: Date, signal?: AbortSignal): Promise<CreateStoredJobResult> {
    const job = createQueuedJob({
      request,
      idempotencyKey,
      jobId: deterministicJobId(idempotencyKey),
      now,
      timeoutSeconds: this.options.timeoutSeconds,
      ttlSeconds: this.options.ttlSeconds,
    });
    const circuitResponse = await this.send(new GetItemCommand({
      TableName: this.options.tableName, Key: { jobId: { S: CIRCUIT_KEY } }, ConsistentRead: true,
    }), signal).catch(() => ({})) as { Item?: Record<string, AttributeValue> };
    const circuit = decodeCircuit(circuitResponse.Item);
    if (circuit?.state !== "CLOSED") throw new PublicError("CIRCUIT_OPEN", "New jobs are temporarily unavailable.", 503);
    for (let slot = 0; slot < this.options.maxActiveJobs; slot += 1) {
    try {
      await this.send(new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.options.tableName,
              Item: toItem(job),
              ConditionExpression: "attribute_not_exists(#jobId)",
              ExpressionAttributeNames: { "#jobId": "jobId" },
            },
          },
          {
            ConditionCheck: {
              TableName: this.options.tableName, Key: { jobId: { S: CIRCUIT_KEY } },
              ConditionExpression: "#state = :closed AND #version = :version AND attribute_not_exists(#ttl)",
              ExpressionAttributeNames: { "#state": "state", "#version": "version", "#ttl": "expiresAt" },
              ExpressionAttributeValues: { ":closed": { S: "CLOSED" }, ":version": { N: String(circuit.version) } },
            },
          },
          {
            Put: {
              TableName: this.options.tableName,
              Item: { jobId: { S: `control_slot_${slot}` }, ownerJobId: { S: job.jobId }, acquiredAt: { S: now.toISOString() } },
              ConditionExpression: "attribute_not_exists(#pk)", ExpressionAttributeNames: { "#pk": "jobId" },
            },
          },
          {
            Update: {
              TableName: this.options.tableName,
              Key: { jobId: { S: rateWindowKey(now) } },
              UpdateExpression: "SET #expiresAt = :expiresAt ADD #windowCount :one",
              ConditionExpression: "attribute_not_exists(#windowCount) OR #windowCount < :limit",
              ExpressionAttributeNames: { "#expiresAt": "expiresAt", "#windowCount": "windowCount" },
              ExpressionAttributeValues: {
                ":expiresAt": { N: String(Math.floor(now.getTime() / 1_000) + 7_200) },
                ":one": { N: "1" },
                ":limit": { N: String(this.options.maxJobsPerMinute) },
              },
            },
          },
        ],
      }), signal);
      return { job, created: true };
    }
    catch (error) {
      if (!isConditional(error)) throw safeRepositoryError(error);
      const existing = await this.get(job.jobId, signal);
      if (existing) return { job: assertIdempotentReplay(existing, request), created: false };
      const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
      // No blind retries: only a verified occupied slot may try the next one.
      // Transaction order is job, circuit, slot, minute counter.
      if (reasons?.[1]?.Code === "ConditionalCheckFailed") throw new PublicError("CIRCUIT_OPEN", "New jobs are temporarily unavailable.", 503);
      if (reasons?.[3]?.Code === "ConditionalCheckFailed") throw new PublicError("RATE_LIMITED", "The bounded job creation limit has been reached.", 429);
      if (reasons?.[2]?.Code !== "ConditionalCheckFailed" || reasons.some((reason) => reason.Code && !["None", "ConditionalCheckFailed"].includes(reason.Code))) {
        throw safeRepositoryError(error);
      }
    }
    }
    throw new PublicError("RATE_LIMITED", "All secure worker capacity is reserved.", 429);
  }

  async get(jobId: string, signal?: AbortSignal): Promise<JobRecord | null> {
    try {
      const response = await this.send(new GetItemCommand({
        TableName: this.options.tableName,
        Key: { jobId: { S: jobId } },
        ConsistentRead: true,
      }), signal) as { Item?: Record<string, AttributeValue> };
      return response.Item ? decodeJob(response.Item) : null;
    }
    catch (error) {
      if (error instanceof PublicError || error instanceof ControllerRepositoryError) throw error;
      throw safeRepositoryError(error);
    }
  }

  async attachTaskArn(jobId: string, taskArn: string, signal?: AbortSignal): Promise<void> {
    if (!/^arn:[A-Za-z0-9:/_.-]{20,300}$/.test(taskArn)) throw new ControllerRepositoryError("INVALID_RECORD");
    try {
      await this.send(new UpdateItemCommand({
        TableName: this.options.tableName,
        Key: { jobId: { S: jobId } },
        UpdateExpression: "SET #taskArn = :taskArn",
        ConditionExpression: "attribute_exists(#jobId) AND attribute_not_exists(#taskArn)",
        ExpressionAttributeNames: { "#jobId": "jobId", "#taskArn": "taskArn" },
        ExpressionAttributeValues: { ":taskArn": { S: taskArn } },
      }), signal);
    }
    catch (error) {
      throw safeRepositoryError(error);
    }
  }

  async markLaunchFailed(job: JobRecord, now: Date, signal?: AbortSignal): Promise<JobRecord> {
    const failed = transitionJob(job, "FAILED", now);
    try {
      await this.send(new UpdateItemCommand({
        TableName: this.options.tableName,
        Key: { jobId: { S: job.jobId } },
        UpdateExpression: "SET #status = :failed, #updatedAt = :updatedAt, #version = :nextVersion, #errorCode = :errorCode, #errorMessage = :errorMessage",
        ConditionExpression: "#status = :queued AND #version = :expectedVersion",
        ExpressionAttributeNames: {
          "#status": "status",
          "#updatedAt": "updatedAt",
          "#version": "version",
          "#errorCode": "errorCode",
          "#errorMessage": "errorMessage",
        },
        ExpressionAttributeValues: {
          ":failed": { S: "FAILED" },
          ":queued": { S: "QUEUED" },
          ":updatedAt": { S: failed.updatedAt },
          ":nextVersion": { N: String(failed.version) },
          ":expectedVersion": { N: String(job.version) },
          ":errorCode": { S: "TASK_LAUNCH_FAILED" },
          ":errorMessage": { S: "The secure worker could not be started." },
        },
      }), signal);
      return { ...failed, errorCode: "TASK_LAUNCH_FAILED", errorMessage: "The secure worker could not be started." };
    }
    catch (error) {
      throw safeRepositoryError(error);
    }
  }
}
import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";

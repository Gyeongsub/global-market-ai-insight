import { createHash } from "node:crypto";
import {
  PublicError,
  type CreateJobRequest,
  type JobRecord,
  type JobStatus,
} from "./contracts.js";

const allowedTransitions: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  QUEUED: ["RUNNING", "FAILED", "TIMED_OUT"],
  RUNNING: ["SUCCEEDED", "FAILED", "TIMED_OUT"],
  SUCCEEDED: [],
  FAILED: [],
  TIMED_OUT: [],
};

export function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function requestHash(request: CreateJobRequest): string {
  return stableHash(`${request.operation}|${request.symbol}|${request.locale}`);
}

export function createQueuedJob(input: {
  request: CreateJobRequest;
  idempotencyKey: string;
  jobId: string;
  now: Date;
  timeoutSeconds: number;
  ttlSeconds: number;
}): JobRecord {
  if (!Number.isInteger(input.timeoutSeconds) || input.timeoutSeconds < 10 || input.timeoutSeconds > 300) {
    throw new Error("timeoutSeconds must be an integer from 10 through 300.");
  }
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 3600) {
    throw new Error("ttlSeconds must be at least one hour.");
  }

  const createdAt = input.now.toISOString();
  return {
    ...input.request,
    jobId: input.jobId,
    status: "QUEUED",
    idempotencyKeyHash: stableHash(input.idempotencyKey),
    requestHash: requestHash(input.request),
    createdAt,
    updatedAt: createdAt,
    deadlineAt: new Date(input.now.getTime() + input.timeoutSeconds * 1_000).toISOString(),
    expiresAt: Math.floor(input.now.getTime() / 1_000) + input.ttlSeconds,
    attemptCount: 0,
    version: 1,
    schemaVersion: "1.0.0",
  };
}

export function transitionJob(job: JobRecord, next: JobStatus, now: Date): JobRecord {
  if (!allowedTransitions[job.status].includes(next)) {
    throw new Error(`Invalid job transition: ${job.status} -> ${next}`);
  }
  return {
    ...job,
    status: next,
    updatedAt: now.toISOString(),
    attemptCount: next === "RUNNING" ? job.attemptCount + 1 : job.attemptCount,
    version: job.version + 1,
  };
}

export function assertIdempotentReplay(existing: JobRecord, request: CreateJobRequest): JobRecord {
  if (existing.requestHash !== requestHash(request)) {
    throw new PublicError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different request.", 409);
  }
  return existing;
}

export function taskEnvironment(jobId: string): ReadonlyArray<{ name: "JOB_ID"; value: string }> {
  if (!jobId || jobId.length > 64) throw new Error("Invalid jobId.");
  return [{ name: "JOB_ID", value: jobId }];
}

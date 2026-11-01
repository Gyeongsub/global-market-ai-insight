import type { JobRecord } from "../../controller/src/contracts.js";
import { storedResultValid } from "../../../shared/schemas/result-validation.js";
import { OPERATIONAL_FAILURE_CODES } from "../../../shared/observability/operational-failure-codes.js";
import { BedrockAnalysisError } from "./providers/bedrock-analysis-adapter.js";
import { MarketDataProviderError, type MarketDataProvider } from "./providers/market-data-provider.js";
import type { AnalysisEngine } from "./worker-operation.js";
import { assertWorkerOperationDeadline, executeWorkerOperation, WorkerOperationDeadlineError } from "./worker-operation.js";
import { JobRepositoryError, type JobRepository } from "./repositories/job-repository.js";

export type WorkerLifecycleErrorCode =
  | "JOB_NOT_FOUND"
  | "JOB_NOT_CLAIMABLE"
  | "JOB_DEADLINE_EXCEEDED"
  | "JOB_STATE_CONFLICT"
  | "DATA_UNAVAILABLE"
  | (typeof OPERATIONAL_FAILURE_CODES)["provider"]
  | (typeof OPERATIONAL_FAILURE_CODES)["model"]
  | "INTERNAL_ERROR";

export type RepositoryDiagnosticCategory =
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_STATE_CONFLICT"
  | "REPOSITORY_INVALID_RECORD"
  | "REPOSITORY_ACCESS_DENIED"
  | "REPOSITORY_CREDENTIALS_ERROR"
  | "REPOSITORY_NETWORK_ERROR"
  | "REPOSITORY_REQUEST_INVALID"
  | "REPOSITORY_RESOURCE_NOT_FOUND"
  | "REPOSITORY_TIMEOUT"
  | "REPOSITORY_UNKNOWN_ERROR";

export class WorkerLifecycleError extends Error {
  constructor(
    public readonly code: WorkerLifecycleErrorCode,
    message: string,
    public readonly diagnosticCategory?: RepositoryDiagnosticCategory,
  ) {
    super(message);
    this.name = "WorkerLifecycleError";
  }
}

export interface WorkerLifecycleDependencies {
  repository: JobRepository;
  marketDataProvider: MarketDataProvider;
  analysisEngine: AnalysisEngine;
  now?: () => Date;
}

function executionFailure(error: unknown): { code: WorkerLifecycleErrorCode; message: string } {
  if (error instanceof WorkerOperationDeadlineError) return { code: "JOB_DEADLINE_EXCEEDED", message: "Job deadline expired during worker execution." };
  if (error instanceof MarketDataProviderError) {
    return error.code === "DATA_UNAVAILABLE"
      ? { code: "DATA_UNAVAILABLE", message: "Verified market data is unavailable." }
      : { code: OPERATIONAL_FAILURE_CODES.provider, message: "Market data provider request failed." };
  }
  if (error instanceof BedrockAnalysisError) return { code: OPERATIONAL_FAILURE_CODES.model, message: "AI analysis request failed." };
  return { code: "INTERNAL_ERROR", message: "Worker operation failed." };
}

function lifecycleRepositoryError(error: unknown): WorkerLifecycleError {
  if (error instanceof JobRepositoryError) {
    if (error.code === "CONDITIONAL_CONFLICT") return new WorkerLifecycleError("JOB_STATE_CONFLICT", "Job state changed before this worker could update it.", "REPOSITORY_STATE_CONFLICT");
    if (error.code === "JOB_NOT_FOUND") return new WorkerLifecycleError("JOB_NOT_FOUND", "Job was not found.", "REPOSITORY_NOT_FOUND");
    const diagnosticCategory: RepositoryDiagnosticCategory = error.code === "INVALID_JOB_RECORD"
      ? "REPOSITORY_INVALID_RECORD"
      : error.code === "REPOSITORY_ACCESS_DENIED"
        ? "REPOSITORY_ACCESS_DENIED"
        : error.code === "REPOSITORY_CREDENTIALS_ERROR"
          ? "REPOSITORY_CREDENTIALS_ERROR"
          : error.code === "REPOSITORY_NETWORK_ERROR"
            ? "REPOSITORY_NETWORK_ERROR"
            : error.code === "REPOSITORY_REQUEST_INVALID"
              ? "REPOSITORY_REQUEST_INVALID"
              : error.code === "REPOSITORY_RESOURCE_NOT_FOUND"
                ? "REPOSITORY_RESOURCE_NOT_FOUND"
                : error.code === "REPOSITORY_TIMEOUT"
                  ? "REPOSITORY_TIMEOUT"
                  : "REPOSITORY_UNKNOWN_ERROR";
    return new WorkerLifecycleError("INTERNAL_ERROR", "Worker repository operation failed.", diagnosticCategory);
  }
  return new WorkerLifecycleError("INTERNAL_ERROR", "Worker repository operation failed.", "REPOSITORY_UNKNOWN_ERROR");
}

export async function runOneShotWorker(jobId: string, dependencies: WorkerLifecycleDependencies): Promise<JobRecord> {
  const sourceNow = dependencies.now ?? (() => new Date());
  const now = () => {
    const value = sourceNow();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new WorkerLifecycleError("INTERNAL_ERROR", "Worker clock was invalid.");
    return value;
  };
  let loaded: JobRecord | null;
  try {
    loaded = await dependencies.repository.load(jobId);
  }
  catch (error) {
    throw lifecycleRepositoryError(error);
  }
  if (!loaded) throw new WorkerLifecycleError("JOB_NOT_FOUND", "Job was not found.");
  if (loaded.status !== "QUEUED") throw new WorkerLifecycleError("JOB_NOT_CLAIMABLE", "Job is not available for a new worker claim.");

  const claimTime = now();
  if (!Number.isFinite(Date.parse(loaded.deadlineAt))) throw new WorkerLifecycleError("INTERNAL_ERROR", "Stored job deadline was invalid.");
  if (Date.parse(loaded.deadlineAt) <= claimTime.getTime()) {
    try {
      await dependencies.repository.transition({
        current: loaded,
        next: "TIMED_OUT",
        now: claimTime,
        errorCode: "JOB_DEADLINE_EXCEEDED",
        errorMessage: "Job deadline expired before worker execution began.",
      });
    }
    catch (error) {
      throw lifecycleRepositoryError(error);
    }
    throw new WorkerLifecycleError("JOB_DEADLINE_EXCEEDED", "Job deadline expired before worker execution began.");
  }

  let running: JobRecord;
  try {
    running = await dependencies.repository.transition({ current: loaded, next: "RUNNING", now: claimTime });
  }
  catch (error) {
    throw lifecycleRepositoryError(error);
  }

  let result: Awaited<ReturnType<typeof executeWorkerOperation>>;
  let completedAt: Date;
  try {
    result = await executeWorkerOperation({ operation: running.operation, symbol: running.symbol, locale: running.locale }, dependencies, { deadlineAt: running.deadlineAt, now });
    if (!storedResultValid(result, running)) throw new Error("Worker result violates the stored result contract.");
    completedAt = now();
    assertWorkerOperationDeadline({ deadlineAt: running.deadlineAt, now: () => completedAt });
  }
  catch (error) {
    const failedAt = now();
    const failure = executionFailure(Date.parse(running.deadlineAt) <= failedAt.getTime() ? new WorkerOperationDeadlineError() : error);
    try {
      await dependencies.repository.transition({
        current: running,
        next: failure.code === "JOB_DEADLINE_EXCEEDED" ? "TIMED_OUT" : "FAILED",
        now: failedAt,
        errorCode: failure.code,
        errorMessage: failure.message,
      });
    }
    catch (repositoryError) {
      throw lifecycleRepositoryError(repositoryError);
    }
    throw new WorkerLifecycleError(failure.code, failure.message);
  }

  try {
    return await dependencies.repository.transition({ current: running, next: "SUCCEEDED", now: completedAt, result });
  }
  catch (error) {
    throw lifecycleRepositoryError(error);
  }
}

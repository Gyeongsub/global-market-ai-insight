import {
  PublicError,
  type CreateJobRequest,
  type JobRecord,
  type PublicJob,
} from "./contracts.js";
import { OPERATIONAL_FAILURE_CODES } from "../../../shared/observability/operational-failure-codes.js";
import { validateCreateJobRequest, validateIdempotencyKey } from "./validation.js";
import { AwsCallBudget, AwsCallTimeoutError } from "../../../shared/time/bounded-aws-call.js";
import errorSchema from "../../../shared/schemas/error.schema.json" with { type: "json" };
import { ownerAdmissionAllowed, type OwnerAdmissionWindow } from "./owner-admission-window.js";

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const AUDIT_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
// Stored worker diagnostics are not public prose. Preserve the published
// codes and existing deadline code, never arbitrary persisted strings.
const PUBLIC_JOB_ERROR_CODES = new Set<string>([...errorSchema.properties.error.properties.code.enum, "JOB_DEADLINE_EXCEEDED"]);

export interface CreateStoredJobResult {
  job: JobRecord;
  created: boolean;
}

export interface ControllerJobRepository {
  create(request: CreateJobRequest, idempotencyKey: string, now: Date, signal?: AbortSignal): Promise<CreateStoredJobResult>;
  get(jobId: string, signal?: AbortSignal): Promise<JobRecord | null>;
  attachTaskArn(jobId: string, taskArn: string, signal?: AbortSignal): Promise<void>;
  markLaunchFailed(job: JobRecord, now: Date, signal?: AbortSignal): Promise<JobRecord>;
}

export interface TaskLauncher {
  launch(jobId: string, signal?: AbortSignal): Promise<{ taskArn: string }>;
}

export interface CircuitReader {
  state(signal?: AbortSignal): Promise<"CLOSED" | "OPEN">;
}

export interface ControllerAuditSink {
  write(event: {
    level: "info" | "warn" | "error";
    code: string;
    jobId?: string;
    operation?: CreateJobRequest["operation"];
    requestId?: string;
  }): void;
}

export interface AcceptedJob {
  jobId: string;
  status: JobRecord["status"];
  statusUrl: string;
  expiresAt: string;
}

export interface ControllerExposurePolicy {
  jobCreationEnabled: boolean;
  liveResultDisplayEnabled: boolean;
  admissionWindow: OwnerAdmissionWindow | null;
}

export function publicJob(job: JobRecord, includeResult = true): PublicJob {
  const failure = job.status === "FAILED" || job.status === "TIMED_OUT";
  const code = failure && typeof job.errorCode === "string" && PUBLIC_JOB_ERROR_CODES.has(job.errorCode) ? job.errorCode : "INTERNAL_ERROR";
  return {
    jobId: job.jobId,
    operation: job.operation,
    symbol: job.symbol,
    locale: job.locale,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: new Date(job.expiresAt * 1_000).toISOString(),
    schemaVersion: job.schemaVersion,
    ...(includeResult && job.status === "SUCCEEDED" && job.result !== undefined ? { result: job.result } : {}),
    ...(failure ? { errorCode: code, errorMessage: "The job did not complete successfully." } : {}),
  };
}

export class ControllerService {
  constructor(
    private readonly jobs: ControllerJobRepository,
    private readonly tasks: TaskLauncher,
    private readonly circuit: CircuitReader,
    private readonly exposure: ControllerExposurePolicy,
    private readonly audit: ControllerAuditSink,
    private readonly now: () => Date = () => new Date(),
    private readonly elapsedNow?: () => number,
  ) {}

  private auditSafely(event: Parameters<ControllerAuditSink["write"]>[0]): void {
    try {
      this.audit.write(event);
    }
    catch {
      // Audit transport failures must never change the job state or cause a
      // second client attempt after an ECS task was already launched.
    }
  }

  private admissionAllowed(): boolean {
    return this.exposure.jobCreationEnabled && ownerAdmissionAllowed(this.exposure.admissionWindow, this.now().getTime());
  }

  private requireAdmission(): void {
    if (!this.admissionAllowed()) throw new PublicError("DATA_UNAVAILABLE", "Provider-backed jobs are unavailable under the current internal execution policy.", 503);
  }

  async createJob(input: unknown, idempotencyKey: unknown, requestId?: string): Promise<AcceptedJob> {
    // Below the unchanged 15-second Lambda timeout. This one request-local
    // budget never resets on slot fallback, SDK call or compensation. It is
    // not a rollback guarantee for an already accepted admission/RunTask.
    const budget = new AwsCallBudget(12_000, this.elapsedNow);
    try { return await budget.call(() => this.createWithinBudget(input, idempotencyKey, requestId, budget)); }
    finally { budget.dispose(); }
  }

  private async createWithinBudget(input: unknown, idempotencyKey: unknown, requestId: string | undefined,
    budget: AwsCallBudget): Promise<AcceptedJob> {
    const request = validateCreateJobRequest(input);
    const validatedKey = validateIdempotencyKey(idempotencyKey);
    const correlation = typeof requestId === "string" && AUDIT_REQUEST_ID_PATTERN.test(requestId)
      ? { requestId }
      : {};
    this.requireAdmission();
    if (await budget.call(signal => this.circuit.state(signal)) !== "CLOSED") {
      throw new PublicError("CIRCUIT_OPEN", "New jobs are temporarily unavailable.", 503);
    }

    this.requireAdmission();

    const stored = await budget.call(signal => this.jobs.create(request, validatedKey, this.now(), signal));
    if (!this.admissionAllowed()) {
      // A slow admission may have persisted a QUEUED record. Never dispatch ECS
      // after the window. Compensate only this newly admitted job, within the
      // same request budget. Failure leaves reconciliation necessary, not a retry.
      if (stored.created) await budget.call(signal => this.jobs.markLaunchFailed(stored.job, this.now(), signal));
      this.auditSafely({ level: "warn", code: "OWNER_ADMISSION_EXPIRED", ...correlation });
      throw new PublicError("DATA_UNAVAILABLE", "Provider-backed jobs are unavailable under the current internal execution policy.", 503);
    }
    if (stored.created) {
      try {
        const launched = await budget.call(signal => this.tasks.launch(stored.job.jobId, signal));
        try {
          await budget.call(signal => this.jobs.attachTaskArn(stored.job.jobId, launched.taskArn, signal));
        }
        catch {
          if (!budget.active()) throw new AwsCallTimeoutError();
          // The task already exists. Do not turn a successful launch into a
          // client retry that could create duplicate work.
          this.auditSafely({ level: "error", code: "TASK_REFERENCE_PERSIST_FAILED", jobId: stored.job.jobId, operation: request.operation, ...correlation });
        }
        this.auditSafely({ level: "info", code: "JOB_ACCEPTED", jobId: stored.job.jobId, operation: request.operation, ...correlation });
      }
      catch {
        if (!budget.active()) throw new AwsCallTimeoutError();
        await budget.call(signal => this.jobs.markLaunchFailed(stored.job, this.now(), signal));
        this.auditSafely({ level: "error", code: OPERATIONAL_FAILURE_CODES.taskLaunch, jobId: stored.job.jobId, operation: request.operation, ...correlation });
        throw new PublicError(OPERATIONAL_FAILURE_CODES.taskLaunch, "The secure worker could not be started.", 503);
      }
    }
    else {
      this.auditSafely({ level: "info", code: "IDEMPOTENT_REPLAY", jobId: stored.job.jobId, operation: request.operation, ...correlation });
    }

    return {
      jobId: stored.job.jobId,
      status: stored.job.status,
      statusUrl: `/v1/jobs/${stored.job.jobId}`,
      expiresAt: new Date(stored.job.expiresAt * 1_000).toISOString(),
    };
  }

  async getJob(jobId: unknown): Promise<PublicJob> {
    if (typeof jobId !== "string" || !JOB_ID_PATTERN.test(jobId)) {
      throw new PublicError("VALIDATION_ERROR", "Job ID is invalid.", 400);
    }
    const job = await this.jobs.get(jobId);
    if (!job) throw new PublicError("JOB_NOT_FOUND", "The requested job was not found.", 404);
    // Internal IAM-authenticated acceptance tests still need to observe a
    // terminal state. Suppress the licensed provider payload while preserving
    // status, timestamps and stable error metadata.
    return publicJob(job, this.exposure.liveResultDisplayEnabled);
  }

  async health(): Promise<{ status: "ok"; circuit: "CLOSED" | "OPEN"; jobCreationEnabled: boolean }> {
    return { status: "ok", circuit: await this.circuit.state(), jobCreationEnabled: this.admissionAllowed() };
  }
}

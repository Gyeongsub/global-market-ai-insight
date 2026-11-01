export const SUPPORTED_SYMBOLS = ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const;
export const SUPPORTED_LOCALES = ["en", "ja", "ko"] as const;
export const OPERATIONS = ["PRICE", "ANALYZE"] as const;
export const JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"] as const;

export type SymbolCode = (typeof SUPPORTED_SYMBOLS)[number];
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type Operation = (typeof OPERATIONS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface CreateJobRequest {
  operation: Operation;
  symbol: SymbolCode;
  locale: Locale;
}

export interface JobRecord extends CreateJobRequest {
  jobId: string;
  status: JobStatus;
  idempotencyKeyHash: string;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  expiresAt: number;
  attemptCount: number;
  version: number;
  schemaVersion: "1.0.0";
  taskArn?: string;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface PublicJob {
  jobId: string;
  operation: Operation;
  symbol: SymbolCode;
  locale: Locale;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  schemaVersion: "1.0.0";
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export class PublicError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

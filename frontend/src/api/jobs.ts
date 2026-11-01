import type { JobOperation, Locale, SymbolCode } from "../types/market.js";
import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";
import { storedResultValid } from "../../../shared/schemas/result-validation.js";
import errorSchema from "../../../shared/schemas/error.schema.json" with { type: "json" };

export type RemoteJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";

export interface JobRequest { operation: JobOperation; symbol: SymbolCode; locale: Locale }

export interface AcceptedJob {
  jobId: string;
  status: RemoteJobStatus;
  statusUrl: string;
  expiresAt: string;
}

export interface PublicJob {
  jobId: string;
  operation: JobOperation;
  symbol: SymbolCode;
  locale: Locale;
  status: RemoteJobStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  schemaVersion: "1.0.0";
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export class MarketApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "MarketApiError";
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const JOB_ID = /^[A-Za-z0-9_-]{16,64}$/;
const STATUS = new Set<RemoteJobStatus>(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT"]);
const TERMINAL = new Set<RemoteJobStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT"]);
const MAX_RESPONSE_BYTES = 65_536;
const INTERNAL_JOB_FIELDS = ["idempotencyKeyHash", "requestHash", "taskArn"] as const;
const PUBLIC_JOB_KEYS = new Set(["jobId", "operation", "symbol", "locale", "status", "createdAt", "updatedAt", "expiresAt", "schemaVersion", "result", "errorCode", "errorMessage"]);
const PUBLIC_ERROR_CODES = new Set<string>(errorSchema.properties.error.properties.code.enum);
const invalid = (message = "The API returned an invalid response."): never => { throw new MarketApiError("INVALID_RESPONSE", 502, message); };

export function validateJobRequest(request: JobRequest): void {
  if (request === null || typeof request !== "object" || Array.isArray(request) || Object.keys(request).length !== 3 ||
      ["operation", "symbol", "locale"].some(key => !Object.hasOwn(request, key)) ||
      !["PRICE", "ANALYZE"].includes(request.operation) || !["VOO", "QLD", "TSLA", "SPCX", "GOOG"].includes(request.symbol) ||
      !["en", "ja", "ko"].includes(request.locale))
    throw new MarketApiError("VALIDATION_ERROR", 400, "The job request is invalid.");
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MarketApiError("INVALID_RESPONSE", 502, "The API returned an invalid response.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum = 300): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new MarketApiError("INVALID_RESPONSE", 502, `The API returned an invalid ${field}.`);
  return value;
}

function iso(value: unknown, field: string): string {
  const parsed = text(value, field, 40);
  const date = new Date(parsed);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed) || Number.isNaN(date.getTime()) || date.toISOString() !== parsed)
    throw new MarketApiError("INVALID_RESPONSE", 502, `The API returned an invalid ${field}.`);
  return parsed;
}

function baseUrl(value: string): URL {
  const parsed = new URL(value);
  const localHttp = parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !localHttp) throw new Error("API base URL must use HTTPS outside local development.");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("API base URL must not contain credentials, query parameters, or fragments.");
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/`;
  return parsed;
}

function cancelUnclaimedResponse(response: Response): void {
  // Best effort only. Cancellation is not remote task rollback or a billing
  // guarantee, and a custom transport may ignore it or never acknowledge it.
  try { void Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* No remote/private prose. */ }
}

/** Bound local acknowledgement even when an injected transport/read ignores
 * AbortSignal. Consume late rejections and dispose late, unclaimed bodies;
 * never resume parsing/status callbacks from an out-of-budget completion. */
function awaitAbortable<T>(start: () => Promise<T>, signal: AbortSignal, late?: (value: T) => void): Promise<T> {
  const aborted = () => new DOMException("The API request was aborted.", "AbortError");
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true; cleanup(); reject(aborted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    void Promise.resolve().then(() => {
      if (settled || signal.aborted) throw aborted();
      return start();
    }).then(value => {
      if (settled || signal.aborted) {
        if (!settled) onAbort();
        try { late?.(value); } catch { /* Late cleanup must not escape. */ }
        return;
      }
      settled = true; cleanup(); resolve(value);
    }, error => {
      if (settled) return;
      if (signal.aborted) { onAbort(); return; }
      settled = true; cleanup(); reject(error);
    });
  });
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader() ?? invalid();
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* A custom reader may throw. */ }
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^[0-9]{1,12}$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) invalid();
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) invalid();
    const chunks: Uint8Array[] = []; let bytes = 0, reads = 0;
    for (;;) {
      const part = await awaitAbortable(() => reader.read(), signal); signal.throwIfAborted();
      if (part.done) break;
      if (++reads > 4096 || !(part.value instanceof Uint8Array) || (bytes += part.value.byteLength) > MAX_RESPONSE_BYTES) invalid();
      chunks.push(new Uint8Array(part.value));
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return parseUnambiguousJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body), MAX_RESPONSE_BYTES);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof MarketApiError) throw error;
    return invalid("The API returned invalid JSON.");
  } finally {
    signal.removeEventListener("abort", cancel); cancel();
    try { reader.releaseLock(); } catch { /* Cancellation may still be resolving an in-flight read. */ }
  }
}

async function checked(response: Response, signal: AbortSignal): Promise<unknown> {
  const body = await readJson(response, signal);
  if (response.ok) return body;
  try {
    const envelope = record(body); exactKeys(envelope, ["error"]);
    const error = record(envelope.error); exactKeys(error, ["code", "message", "requestId"]);
    const code = text(error.code, "error code", 64);
    if (!PUBLIC_ERROR_CODES.has(code)) invalid();
    text(error.message, "error message"); text(error.requestId, "request ID", 100);
    // Even a structurally valid remote error cannot choose public prose or
    // smuggle a URL/key through a known code. UI localization can use the code.
    throw new MarketApiError(code, response.status, "The API request was rejected.");
  }
  catch (caught) {
    if (caught instanceof MarketApiError && caught.code !== "INVALID_RESPONSE") throw caught;
    throw new MarketApiError("API_ERROR", response.status, "The API request failed.");
  }
}

export function acceptedJob(value: unknown): AcceptedJob {
  const input = record(value);
  exactKeys(input, ["jobId", "status", "statusUrl", "expiresAt"]);
  const jobId = text(input.jobId, "job ID", 64);
  const status = text(input.status, "job status", 16) as RemoteJobStatus;
  const statusUrl = text(input.statusUrl, "status URL", 100);
  if (!JOB_ID.test(jobId) || !STATUS.has(status) || statusUrl !== `/v1/jobs/${jobId}`) throw new MarketApiError("INVALID_RESPONSE", 502, "The API returned an invalid accepted job.");
  return { jobId, status, statusUrl, expiresAt: iso(input.expiresAt, "expiry") };
}

export function publicJob(value: unknown): PublicJob {
  const input = record(value);
  if (INTERNAL_JOB_FIELDS.some((field) => field in input) || Object.keys(input).some(key => !PUBLIC_JOB_KEYS.has(key))) {
    throw new MarketApiError("INVALID_RESPONSE", 502, "The API returned internal job data.");
  }
  const jobId = text(input.jobId, "job ID", 64);
  const operation = text(input.operation, "operation", 16) as JobOperation;
  const symbol = text(input.symbol, "symbol", 8) as SymbolCode;
  const locale = text(input.locale, "locale", 2) as Locale;
  const status = text(input.status, "job status", 16) as RemoteJobStatus;
  if (!JOB_ID.test(jobId) || !["PRICE", "ANALYZE"].includes(operation) || !["VOO", "QLD", "TSLA", "SPCX", "GOOG"].includes(symbol) || !["en", "ja", "ko"].includes(locale) || !STATUS.has(status)) {
    throw new MarketApiError("INVALID_RESPONSE", 502, "The API returned an invalid job.");
  }
  const result = input.result === undefined ? undefined : record(input.result);
  // Disabled live display intentionally permits SUCCEEDED metadata without a
  // result. If data is present, it must be a matching successful result.
  if (result !== undefined && (status !== "SUCCEEDED" || !storedResultValid(result, { operation, symbol, locale }))) invalid();
  const failure = status === "FAILED" || status === "TIMED_OUT";
  if (failure ? typeof input.errorCode !== "string" || !/^[A-Z][A-Z0-9_]{2,63}$/.test(input.errorCode) ||
      typeof input.errorMessage !== "string" || input.errorMessage.length < 1 || input.errorMessage.length > 300 || /[\r\n]/.test(input.errorMessage)
    : input.errorCode !== undefined || input.errorMessage !== undefined) invalid();
  return {
    jobId, operation, symbol, locale, status,
    createdAt: iso(input.createdAt, "created timestamp"),
    updatedAt: iso(input.updatedAt, "updated timestamp"),
    expiresAt: iso(input.expiresAt, "expiry"),
    schemaVersion: text(input.schemaVersion, "schema version", 16) === "1.0.0" ? "1.0.0" : (() => { throw new MarketApiError("INVALID_RESPONSE", 502, "The API returned an unsupported schema."); })(),
    ...(result === undefined ? {} : { result }),
    ...(failure ? { errorCode: input.errorCode as string, errorMessage: "The job did not complete successfully." } : {}),
  };
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Polling aborted.", "AbortError"));
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Polling aborted.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class MarketApiClient {
  private readonly base: URL;

  constructor(base: string, private readonly fetcher: FetchLike = fetch) {
    this.base = baseUrl(base);
  }

  private async request(path: string, init: RequestInit, expectedStatus = 200): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    init.signal?.addEventListener("abort", onAbort, { once: true });
    if (init.signal?.aborted) controller.abort();
    const timer = setTimeout(onAbort, 10_000);
    try {
    controller.signal.throwIfAborted();
    const response = await awaitAbortable(() => this.fetcher(new URL(path.replace(/^\//, ""), this.base), {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    }), controller.signal, cancelUnclaimedResponse);
    if (response.ok && response.status !== expectedStatus) { cancelUnclaimedResponse(response); invalid(); }
    return await checked(response, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new DOMException("The API request was aborted.", "AbortError");
      if (error instanceof MarketApiError) throw error;
      throw new MarketApiError("API_ERROR", 502, "The API request failed.");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    }
  }

  async createJob(request: JobRequest, idempotencyKey: string = crypto.randomUUID(), signal?: AbortSignal): Promise<AcceptedJob> {
    validateJobRequest(request);
    const { operation, symbol, locale } = request;
    if (typeof idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))
      throw new MarketApiError("VALIDATION_ERROR", 400, "The job request is invalid.");
    return acceptedJob(await this.request("v1/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ operation, symbol, locale }),
      ...(signal ? { signal } : {}),
    }, 202));
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<PublicJob> {
    if (typeof jobId !== "string" || !JOB_ID.test(jobId)) throw new MarketApiError("VALIDATION_ERROR", 400, "Job ID is invalid.");
    const result = publicJob(await this.request(`v1/jobs/${jobId}`, { method: "GET", ...(signal ? { signal } : {}) }));
    if (result.jobId !== jobId) invalid(); return result;
  }

  async pollJob(accepted: AcceptedJob, options?: { signal?: AbortSignal; maxDurationMs?: number; onStatus?: (status: RemoteJobStatus) => void }): Promise<PublicJob> {
    const expected = acceptedJob(accepted), signal = options?.signal, onStatus = options?.onStatus;
    const maximum = options?.maxDurationMs ?? 90_000;
    if (!Number.isInteger(maximum) || maximum < 1_000 || maximum > 120_000) throw new Error("Polling duration must be bounded from 1 through 120 seconds.");
    const started = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, maximum);
    let delay = 1_000;
    try {
    while (Date.now() - started < maximum) {
      controller.signal.throwIfAborted();
      const job = await this.getJob(expected.jobId, controller.signal);
      onStatus?.(job.status);
      if (TERMINAL.has(job.status)) return job;
      await pause(Math.min(delay, Math.max(0, maximum - (Date.now() - started))), controller.signal);
      delay = Math.min(4_000, Math.ceil(delay * 1.6));
    }
    throw new MarketApiError("POLL_TIMEOUT", 408, "The bounded job polling window expired.");
    } catch (error) {
      if (timedOut) throw new MarketApiError("POLL_TIMEOUT", 408, "The bounded job polling window expired.");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

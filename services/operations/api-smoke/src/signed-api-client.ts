import { createHash, createHmac, randomUUID, type BinaryLike } from "node:crypto";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { SignatureV4 } from "@smithy/signature-v4";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS, type Locale, type SymbolCode } from "../../../controller/src/contracts.js";
import { parseUnambiguousJson } from "../../../../shared/schemas/strict-json.js";
import { ElapsedBudget } from "../../../../shared/time/elapsed-budget.js";

const REGION = "ap-northeast-1";
const JOB_ID = /^job_[a-f0-9]{48}$/;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT"]);
const MAX_RESPONSE_BYTES = 65_536;
const MAX_RESPONSE_CHUNKS = 4_096;
const PUBLIC_ERROR_CODES = new Set([
  "ACCESS_DENIED",
  "VALIDATION_ERROR", "UNSUPPORTED_SYMBOL", "UNSUPPORTED_LOCALE", "RATE_LIMITED",
  "CIRCUIT_OPEN", "JOB_NOT_FOUND", "DATA_UNAVAILABLE", "PROVIDER_ERROR",
  "MODEL_ERROR", "TASK_LAUNCH_FAILED", "INTERNAL_ERROR",
]);

type CredentialProvider = () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }>;
type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type AcceptanceTransport = Pick<AwsIamApiClient, "request">;

class AcceptanceProtocolError extends Error {}

function bytes(value: ArrayBuffer | ArrayBufferView): Buffer {
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength);
  return Buffer.from(value);
}

// SignatureV4 needs the same constructor for SHA-256 and HMAC-SHA-256.
class Sha256 {
  private readonly checksum;
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    const key = typeof secret === "string" ? secret : secret === undefined ? undefined : bytes(secret);
    this.checksum = key === undefined ? createHash("sha256") : createHmac("sha256", key);
  }
  update(data: string | ArrayBuffer | ArrayBufferView): void {
    const value: BinaryLike = typeof data === "string" ? data : bytes(data);
    this.checksum.update(value);
  }
  async digest(): Promise<Uint8Array> { return this.checksum.digest(); }
}

function endpoint(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("The acceptance endpoint must be the Tokyo HTTPS execute-api endpoint."); }
  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !/^[a-z0-9]{1,128}\.execute-api\.ap-northeast-1\.amazonaws\.com$/.test(parsed.hostname) || parsed.pathname !== "/" ||
      value !== `https://${parsed.hostname}` && value !== `https://${parsed.hostname}/`) {
    throw new Error("The acceptance endpoint must be the Tokyo HTTPS execute-api endpoint.");
  }
  return parsed;
}

// Best effort only: cleanup cannot hold local acknowledgement open and is not
// remote cancellation, task rollback, or evidence that billing has stopped.
function cancelResponse(response: Response): void {
  try { void Promise.resolve(response.body?.cancel()).catch(() => {}); } catch { /* Do not reflect remote prose. */ }
}

async function json(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    cancelResponse(response);
    throw new AcceptanceProtocolError("API response exceeded the bounded size.");
  }
  if (!response.body) throw new AcceptanceProtocolError("API returned invalid JSON.");
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Custom cleanup may throw. */ }
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Buffer[] = [];
  let size = 0, reads = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (++reads > MAX_RESPONSE_CHUNKS) throw new AcceptanceProtocolError("API response exceeded the bounded chunk limit.");
      if (!(value instanceof Uint8Array)) throw new AcceptanceProtocolError("API returned invalid JSON.");
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new AcceptanceProtocolError("API response exceeded the bounded size.");
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener("abort", cancel); cancel();
    try { reader.releaseLock(); } catch { /* A cancelled custom read may still be pending. */ }
  }
  signal.throwIfAborted();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); }
  catch { throw new AcceptanceProtocolError("API returned invalid JSON."); }
  let value: unknown;
  try { value = parseUnambiguousJson(text, MAX_RESPONSE_BYTES); } catch { throw new AcceptanceProtocolError("API returned invalid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AcceptanceProtocolError("API returned an invalid object.");
  return value as Record<string, unknown>;
}

/** Retains only a fixed public code and status, never the remote message/body. */
export class ApiResponseError extends Error {
  constructor(public readonly httpStatus: number, public readonly publicCode: string) {
    if (!Number.isInteger(httpStatus) || httpStatus < 400 || httpStatus > 599 || !PUBLIC_ERROR_CODES.has(publicCode)) {
      throw new Error("API error response is outside the public contract.");
    }
    super(`API_${httpStatus}_${publicCode}`);
    this.name = "ApiResponseError";
  }
}

export class AwsIamApiClient {
  private readonly base: URL;
  private readonly signer: SignatureV4;
  constructor(baseUrl: string, credentials: CredentialProvider = defaultProvider({ profile: "gmai-admin" }), private readonly fetcher: FetchLike = fetch,
    private readonly requestTimeoutMs = 10_000) {
    this.base = endpoint(baseUrl);
    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 10_000) throw new Error("API timeout must remain within ten seconds.");
    this.signer = new SignatureV4({ credentials, region: REGION, service: "execute-api", sha256: Sha256 });
  }

  async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>, requestHeaders: Record<string, string> = {}, parent?: AbortSignal): Promise<Record<string, unknown>> {
    if (!(method === "GET" && /^v1\/(health|assets|jobs\/job_[a-f0-9]{48})$/.test(path)) && !(method === "POST" && path === "v1/jobs")) {
      throw new Error("API path is outside the acceptance allowlist.");
    }
    const headerNames = Object.keys(requestHeaders);
    if (method === "GET" ? body !== undefined || headerNames.length !== 0 :
      !body || Object.keys(body).sort().join(",") !== "locale,operation,symbol" ||
      !["PRICE", "ANALYZE"].includes(body.operation as string) || !SUPPORTED_SYMBOLS.includes(body.symbol as SymbolCode) ||
      !SUPPORTED_LOCALES.includes(body.locale as Locale) || headerNames.length !== 1 || headerNames[0] !== "idempotency-key" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestHeaders["idempotency-key"] ?? "")) {
      throw new Error("Request body or headers are outside the acceptance allowlist.");
    }
    const url = new URL(path, this.base);
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { host: url.host, accept: "application/json", ...requestHeaders };
    if (serialized !== undefined) headers["content-type"] = "application/json";
    const budget = new ElapsedBudget(this.requestTimeoutMs, undefined, parent,
      () => new AcceptanceProtocolError("API request timed out."));
    try {
      return await budget.call(async signal => {
        const signed = await this.signer.sign({ method, protocol: url.protocol, hostname: url.hostname, path: url.pathname, headers, ...(serialized === undefined ? {} : { body: serialized }) });
        // A late credential resolution after timeout must never submit a POST.
        signal.throwIfAborted();
        if (!budget.active()) throw new AcceptanceProtocolError("API request timed out.");
        const response = await this.fetcher(url, { method, headers: signed.headers, ...(serialized === undefined ? {} : { body: serialized }), signal, redirect: "error", cache: "no-store" });
        if (!budget.active()) { cancelResponse(response); throw new AcceptanceProtocolError("API request timed out."); }
        if (response.url && response.url !== url.href) {
          cancelResponse(response);
          throw new AcceptanceProtocolError("API response destination changed.");
        }
        if (response.ok && response.status !== (method === "POST" ? 202 : 200)) {
          cancelResponse(response);
          throw new AcceptanceProtocolError("API response status is outside the public contract.");
        }
        const payload = await json(response, signal);
        if (!response.ok) {
          const error = payload.error;
          if (Object.keys(payload).join(",") !== "error" || !error || typeof error !== "object" || Array.isArray(error) ||
              Object.keys(error).some(key => !["code", "message", "requestId"].includes(key)) ||
              !PUBLIC_ERROR_CODES.has(String((error as Record<string, unknown>).code))) {
            throw new AcceptanceProtocolError("API error response is outside the public contract.");
          }
          throw new ApiResponseError(response.status, (error as { code: string }).code);
        }
        return payload;
      });
    } catch (error) {
      if (error instanceof ApiResponseError || error instanceof AcceptanceProtocolError) throw error;
      throw new Error("SIGNED_API_TRANSPORT_UNVERIFIED");
    } finally { budget.dispose(); }
  }
}

/** Stage C preparation only: an HTTP denial does not establish cloud cleanup. */
export async function runOneCircuitDenial(client: AcceptanceTransport): Promise<{
  apiCalls: 2; denialResponseVerified: true; taskCountIndependentlyVerified: false;
  slotCountIndependentlyVerified: false; internalExecutionRestored: false;
}> {
  let health: Record<string, unknown>;
  try { health = await client.request("GET", "v1/health"); }
  catch { throw new Error("CIRCUIT_DENIAL_HEALTH_UNVERIFIED"); }
  if (health.status !== "ok" || health.circuit !== "OPEN" || health.jobCreationEnabled !== true ||
      Object.keys(health).sort().join(",") !== "circuit,jobCreationEnabled,status") {
    throw new Error("CIRCUIT_DENIAL_GATE_NOT_READY");
  }
  // Exactly one POST, never a retry or polling of an accepted/guessed job.
  try {
    await client.request("POST", "v1/jobs", { operation: "PRICE", symbol: "QLD", locale: "ko" }, { "idempotency-key": randomUUID() });
  } catch (error) {
    if (error instanceof ApiResponseError && error.httpStatus === 503 && error.publicCode === "CIRCUIT_OPEN") {
      return { apiCalls: 2, denialResponseVerified: true, taskCountIndependentlyVerified: false,
        slotCountIndependentlyVerified: false, internalExecutionRestored: false };
    }
    throw new Error("CIRCUIT_DENIAL_RESPONSE_UNVERIFIED");
  }
  throw new Error("CIRCUIT_DENIAL_UNEXPECTED_ACCEPTANCE");
}

export interface AcceptanceOutcome {
  jobId: string;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  apiCalls: number;
}

export async function runOnePriceAcceptance(
  client: AcceptanceTransport,
  options: { symbol: "QLD"; locale: "ko"; sleep?: (ms: number) => Promise<void>; maxStatusReads?: number } = { symbol: "QLD", locale: "ko" },
): Promise<AcceptanceOutcome> {
  return runOneJobAcceptance(client, { ...options, operation: "PRICE" });
}

function assertNoResultExposure(job: Record<string, unknown>): void {
  if (["result", "taskArn", "requestHash", "idempotencyKeyHash"].some((field) => field in job)) {
    throw new Error("RESULT_EXPOSURE_GATE_FAILED");
  }
}

export async function runOneJobAcceptance(
  client: AcceptanceTransport,
  options: { operation: "PRICE" | "ANALYZE"; symbol: SymbolCode; locale: Locale; sleep?: (ms: number) => Promise<void>; maxStatusReads?: number },
): Promise<AcceptanceOutcome> {
  if (!["PRICE", "ANALYZE"].includes(options.operation) || !SUPPORTED_SYMBOLS.includes(options.symbol) || !SUPPORTED_LOCALES.includes(options.locale)) {
    throw new Error("Acceptance requires an allowlisted operation, symbol and locale.");
  }
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxStatusReads = options.maxStatusReads ?? 16;
  if (!Number.isInteger(maxStatusReads) || maxStatusReads < 1 || maxStatusReads > 16) throw new Error("Status reads must remain between 1 and 16.");
  let apiCalls = 1;
  const health = await client.request("GET", "v1/health");
  if (health.circuit !== "CLOSED" || health.jobCreationEnabled !== true) throw new Error("ACCEPTANCE_GATE_NOT_READY");

  apiCalls += 1;
  // Deliberately no automatic retry: an ambiguous POST must never launch a
  // second task. The idempotency key exists only in process memory.
  const accepted = await client.request("POST", "v1/jobs", { operation: options.operation, symbol: options.symbol, locale: options.locale }, { "idempotency-key": randomUUID() });
  assertNoResultExposure(accepted);
  const jobId = accepted.jobId;
  if (typeof jobId !== "string" || !JOB_ID.test(jobId)) throw new Error("API returned an invalid job ID.");

  for (let read = 0; read < maxStatusReads; read += 1) {
    if (read > 0) await sleep(6_000);
    apiCalls += 1;
    const job = await client.request("GET", `v1/jobs/${jobId}`);
    assertNoResultExposure(job);
    if (job.jobId !== jobId) throw new Error("API returned a mismatched job ID.");
    if (typeof job.status !== "string" || !["QUEUED", "RUNNING", ...TERMINAL].includes(job.status)) throw new Error("API returned an invalid job status.");
    if (typeof job.status === "string" && TERMINAL.has(job.status)) return { jobId, status: job.status as AcceptanceOutcome["status"], apiCalls };
  }
  throw new Error(`BOUNDED_POLL_TIMEOUT:${jobId}`);
}

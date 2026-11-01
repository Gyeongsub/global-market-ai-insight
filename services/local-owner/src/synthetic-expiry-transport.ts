import { Agent, request } from "node:https";
import type { IncomingMessage } from "node:http";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "./synthetic-read-denial-transport.js";
import { createSyntheticAnalysisSession, SYNTHETIC_LAB } from "./synthetic-analysis.js";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";

export type ExpiryCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken: string };
export type ExpiryEnvelope = { status: number; body: string; serverDate: string; errorType?: string };
// Match the pinned SDK's URI-label encoding before SigV4 canonicalization.
export const EXPIRY_ENDPOINT = "https://bedrock-runtime.ap-northeast-1.amazonaws.com/model/amazon.nova-lite-v1%3A0/converse";
type FailureStage = "LIMIT" | "REQUEST_BUILD" | "CREDENTIALS" | "SIGNING" | "WIRE" | "STATUS" | "HEADERS" | "BODY" | "ABORTED";
class TransportFailure extends Error {
  readonly httpStatus: number | null;
  constructor(readonly stage: FailureStage, status?: number) {
    super("SYNTHETIC_EXPIRY_TRANSPORT_UNVERIFIED");
    this.httpStatus = Number.isInteger(status) && status! >= 100 && status! <= 599 ? status! : null;
  }
}
const fail = (stage: FailureStage = "LIMIT", status?: number) => new TransportFailure(stage, status);
/** Never project arbitrary Error properties, AWS prose, headers or response bodies. */
export function syntheticExpiryFailureSummary(error: unknown) {
  return error instanceof TransportFailure ? { stage: error.stage, httpStatus: error.httpStatus } : null;
}

/** Capture the existing fixed English synthetic request without a network call.
 * This deliberately does not add arbitrary model/prompt input to the operator. */
export async function syntheticExpiryRequestBody() {
  let body = "", captures = 0;
  const session = createSyntheticAnalysisSession({ async converse(input) {
    if (++captures !== 1 || input.modelId !== SYNTHETIC_LAB.modelId || input.inferenceConfig.maxTokens !== 512) throw fail();
    const { modelId: _model, ...payload } = input;
    body = JSON.stringify(payload);
    throw fail(); // No fabricated successful inference receipt.
  } });
  try { await session.start("en"); }
  finally { session.close(); }
  if (captures !== 1 || !body || Buffer.byteLength(body) > 8192) throw fail();
  return body;
}

export function readSyntheticExpiryResponse(response: IncomingMessage, signal: AbortSignal) {
  return new Promise<ExpiryEnvelope>((resolve, reject) => {
    const chunks: Buffer[] = []; let settled = false, size = 0, count = 0;
    const abort = () => finish(undefined, "ABORTED");
    const finish = (value?: ExpiryEnvelope, stage: FailureStage = "BODY") => {
      if (settled) return; settled = true; chunks.length = 0;
      signal.removeEventListener("abort", abort);
      if (value) resolve(value); else { response.destroy(); reject(fail(stage, response.statusCode)); }
    };
    response.on("error", () => finish()); response.once("aborted", () => finish());
    response.once("close", () => { if (!settled) finish(); });
    const status = response.statusCode, date = response.headers.date, length = response.headers["content-length"];
    const errorType = response.headers["x-amzn-errortype"];
    if (signal.aborted) { finish(undefined, "ABORTED"); return; }
    if (![200, 403].includes(status ?? 0)) { finish(undefined, "STATUS"); return; }
    if (typeof date !== "string" ||
        !Number.isFinite(Date.parse(date)) || new Date(Date.parse(date)).toUTCString() !== date ||
        response.headers.location !== undefined || response.headers["content-encoding"] !== undefined ||
        response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json" ||
        length !== undefined && (!/^\d+$/.test(length) || Number(length) > 16384) ||
        errorType !== undefined && (typeof errorType !== "string" || errorType.length > 256)) { finish(undefined, "HEADERS"); return; }
    signal.addEventListener("abort", abort, { once: true });
    response.on("data", (chunk: Buffer) => {
      if (settled) return;
      if (!Buffer.isBuffer(chunk) || signal.aborted || (size += chunk.byteLength) > 16384 || ++count > 256) { finish(); return; }
      chunks.push(chunk);
    });
    response.once("end", () => {
      if (settled) return;
      try {
        if (signal.aborted || !response.complete || length !== undefined && Number(length) !== size) throw fail();
        const body = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
        finish({ status: status!, body, serverDate: date, ...(errorType === undefined ? {} : { errorType: errorType as string }) });
      } catch { finish(); }
    });
  });
}

export interface ExpiryWire {
  send(headers: Record<string, string>, body: string, signal: AbortSignal): Promise<ExpiryEnvelope>;
  destroy(): void;
}
function nativeWire(): ExpiryWire {
  const agent = new Agent({ keepAlive: false, maxSockets: 1, minVersion: "TLSv1.2", rejectUnauthorized: true });
  let closed = false;
  return { send(headers, body, signal) {
    return new Promise((resolve, reject) => {
      if (closed || signal.aborted) { reject(fail()); return; }
      const req = request(EXPIRY_ENDPOINT, { method: "POST", headers, signal, agent,
        minVersion: "TLSv1.2", rejectUnauthorized: true }, response => {
        void readSyntheticExpiryResponse(response, signal).then(resolve, error => { req.destroy(); reject(error instanceof TransportFailure ? error : fail("BODY")); });
      });
      req.once("error", () => reject(fail(signal.aborted ? "ABORTED" : "WIRE"))); req.end(body);
    });
  }, destroy() { closed = true; agent.destroy(); } };
}

/** Fixed two-request wire, no retries/default credentials/proxies/redirects.
 * Date is AWS response time, not a substitute for local monotonic deadlines. */
export async function createSyntheticExpiryTransport(credentials: () => ExpiryCredentials, wire: ExpiryWire = nativeWire()) {
  let body: string;
  try { body = await syntheticExpiryRequestBody(); }
  catch { wire.destroy(); throw fail("REQUEST_BUILD"); }
  let attempts = 0, closed = false, busy = false;
  const abort = new AbortController();
  function destroy() { if (!closed) { closed = true; abort.abort(); body = ""; wire.destroy(); } }
  async function send(parent: AbortSignal) {
    let budget: ElapsedBudget | undefined;
    let stage: FailureStage = "LIMIT";
    const key: ExpiryCredentials = { accessKeyId: "", secretAccessKey: "", sessionToken: "" };
    try {
      if (closed || busy || attempts >= 2 || parent.aborted) throw fail();
      attempts++; busy = true;
      budget = new ElapsedBudget(20000, undefined, AbortSignal.any([parent, abort.signal]), () => fail("ABORTED"));
      return await budget.call(async signal => {
        stage = "CREDENTIALS"; Object.assign(key, credentials());
        if (!/^ASIA[A-Z0-9]{16}$/.test(key.accessKeyId) || !/^[A-Za-z0-9/+=]{40}$/.test(key.secretAccessKey) ||
            typeof key.sessionToken !== "string" || key.sessionToken.length < 16 || key.sessionToken.length > 20000 || /[\x00-\x20\x7f]/.test(key.sessionToken)) throw fail();
        const url = new URL(EXPIRY_ENDPOINT);
        const signer = new SignatureV4({ region: "ap-northeast-1", service: "bedrock", sha256: Sha256, credentials: key });
        stage = "SIGNING";
        const signed = await signer.sign({ method: "POST", protocol: "https:", hostname: url.hostname, path: url.pathname,
          headers: { host: url.hostname, "content-type": "application/json", accept: "application/json",
            "content-length": String(Buffer.byteLength(body)) }, body });
        signal.throwIfAborted();
        const current = credentials();
        if (closed || !budget!.active() || current.accessKeyId !== key.accessKeyId || current.secretAccessKey !== key.secretAccessKey || current.sessionToken !== key.sessionToken) throw fail();
        stage = "WIRE";
        const response = await wire.send(signed.headers, body, signal);
        signal.throwIfAborted();
        if (closed || !budget!.active()) throw fail();
        return response;
      });
    } catch (error) {
      const safe = error instanceof TransportFailure ? error : fail(stage);
      try { destroy(); } catch { /* sanitized */ } throw safe;
    }
    finally { key.accessKeyId = ""; key.secretAccessKey = ""; key.sessionToken = ""; busy = false; budget?.dispose(); }
  }
  return { send, destroy };
}

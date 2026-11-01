import { createHash, createHmac, type BinaryLike } from "node:crypto";
import { Agent, request as httpsRequest } from "node:https";
import { SignatureV4 } from "@smithy/signature-v4";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";
import { syntheticReadDenialRequests, type SyntheticReadDenialRequest } from "./synthetic-read-denial.js";
import { readSyntheticDenialResponse } from "./synthetic-denial-response.js";

type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken: string };
type Envelope = { status: number; body: string; errorType?: string };
export interface SyntheticReadDenialWire {
  send(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<Envelope>;
  destroy(): void;
}
const fail = () => Error("SYNTHETIC_READ_DENIAL_TRANSPORT_UNVERIFIED");
const bytes = (v: ArrayBuffer | ArrayBufferView) => ArrayBuffer.isView(v)
  ? Buffer.from(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength) : Buffer.from(v);
// The existing project uses this native SHA/HMAC adapter for Smithy's signer;
// signing is delegated to the pinned library, not implemented here.
export class Sha256 {
  private readonly checksum;
  constructor(secret?: string | ArrayBuffer | ArrayBufferView) {
    const key = typeof secret === "string" ? secret : secret === undefined ? undefined : bytes(secret);
    this.checksum = key === undefined ? createHash("sha256") : createHmac("sha256", key);
  }
  update(v: string | ArrayBuffer | ArrayBufferView) { this.checksum.update((typeof v === "string" ? v : bytes(v)) as BinaryLike); }
  async digest(): Promise<Uint8Array> { return this.checksum.digest(); }
}

/** Private TLS sockets only. No global pooled agent, redirects, proxy options,
 * insecure certificate options, logging or acceptance of successful data. */
function nativeWire(): SyntheticReadDenialWire {
  // Do not inherit a process-wide certificate-verification opt-out. Both the
  // private agent and request require verification explicitly; no custom CA or
  // identity-check callback is accepted from the caller.
  const agent = new Agent({ keepAlive: false, maxSockets: 1, minVersion: "TLSv1.2", rejectUnauthorized: true });
  let closed = false;
  return {
    send(url, headers, body, signal) {
      return new Promise((resolve, reject) => {
        if (closed || signal.aborted || !["https://ssm.ap-northeast-1.amazonaws.com/", "https://ecs.ap-northeast-1.amazonaws.com/"].includes(url)) {
          reject(fail()); return;
        }
        const req = httpsRequest(url, { method: "POST", headers, agent, signal, minVersion: "TLSv1.2", rejectUnauthorized: true }, response => {
          void readSyntheticDenialResponse(response, signal).then(resolve, () => { req.destroy(); reject(fail()); });
        });
        req.once("error", () => reject(fail()));
        req.end(body);
      });
    },
    destroy() { closed = true; agent.destroy(); },
  };
}

/** Candidate only: no CLI entry, no default credential provider, no automatic
 * dispatch. Caller must supply the freshly verified restricted lease. Native
 * HTTPS is reached only by request(); tests inject a zero-network wire. */
export function createSyntheticReadDenialTransport(nonce: string, credentials: () => Credentials,
  wire: SyntheticReadDenialWire = nativeWire()) {
  let closed = false, attempts = 0, inFlight = false;
  const controllers = new Set<AbortController>();
  let requests: ReturnType<typeof syntheticReadDenialRequests>;
  try { requests = syntheticReadDenialRequests(nonce); }
  catch { try { wire.destroy(); } catch { /* fixed public error */ } throw fail(); }
  function destroy() {
    if (closed) return;
    closed = true;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    try { wire.destroy(); } catch { throw fail(); }
  }
  async function request(spec: SyntheticReadDenialRequest, parent: AbortSignal): Promise<Envelope> {
    let budget: ElapsedBudget | undefined;
    const controller = new AbortController();
    try {
      const expected = requests[attempts];
      if (closed || inFlight || !expected || !spec || JSON.stringify(Object.keys(spec).sort()) !== JSON.stringify(Object.keys(expected).sort()) ||
          Object.keys(expected).some(k => spec[k as keyof typeof spec] !== expected[k as keyof typeof expected]) || parent.aborted) throw fail();
      attempts++;
      inFlight = true;
      controllers.add(controller);
      budget = new ElapsedBudget(20000, undefined, AbortSignal.any([parent, controller.signal]), fail);
      return await budget.call(async signal => {
        const key = { ...credentials() };
        if (!key || !/^ASIA[A-Z0-9]{16}$/.test(key.accessKeyId) || !/^[A-Za-z0-9/+=]{40}$/.test(key.secretAccessKey) ||
            typeof key.sessionToken !== "string" || key.sessionToken.length < 16 || key.sessionToken.length > 20000 || /[\x00-\x20\x7f]/.test(key.sessionToken)) throw fail();
        const host = new URL(expected.endpoint).hostname;
        const signer = new SignatureV4({ region: expected.region, service: expected.service, sha256: Sha256, credentials: key });
        const signed = await signer.sign({ method: "POST", protocol: "https:", hostname: host, path: "/",
          headers: { host, "content-type": "application/x-amz-json-1.1", "x-amz-target": expected.target,
            "content-length": String(Buffer.byteLength(expected.body)) }, body: expected.body });
        signal.throwIfAborted();
        if (closed || !budget!.active()) throw fail();
        const current = credentials(); // Never send with an expired or changed lease.
        if (current.accessKeyId !== key.accessKeyId || current.secretAccessKey !== key.secretAccessKey ||
            current.sessionToken !== key.sessionToken) throw fail();
        const response = await wire.send(expected.endpoint, signed.headers, expected.body, signal);
        signal.throwIfAborted();
        if (closed || !budget!.active() || !response || ![400, 403].includes(response.status) ||
            typeof response.body !== "string" || Buffer.byteLength(response.body) > 16384 ||
            response.errorType !== undefined && (typeof response.errorType !== "string" || response.errorType.length > 256)) throw fail();
        return response;
      });
    } catch { try { destroy(); } catch { /* still reject with fixed code */ } throw fail(); }
    finally { budget?.dispose(); controllers.delete(controller); inFlight = false; }
  }
  return { request, destroy };
}

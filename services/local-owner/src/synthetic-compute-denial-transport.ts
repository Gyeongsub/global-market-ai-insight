import { Agent, request as httpsRequest } from "node:https";
import { SignatureV4 } from "@smithy/signature-v4";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";
import { syntheticComputeDenialRequest } from "./synthetic-compute-denial.js";
import { Sha256 } from "./synthetic-read-denial-transport.js";
import { readSyntheticDenialResponse } from "./synthetic-denial-response.js";
import { reviewSyntheticDenialResponse } from "./synthetic-denial-evidence.js";

type Scope = Omit<Parameters<typeof syntheticComputeDenialRequest>[0], "nowMs">;
type Keys = { accessKeyId: string; secretAccessKey: string; sessionToken: string };
type Envelope = { status: number; body: string; errorType?: string };
export type SyntheticComputeDenialWire = { send(headers: Record<string, string>, body: string, signal: AbortSignal): Promise<Envelope>; destroy(): void };
const endpoint = "https://ecs.ap-northeast-1.amazonaws.com/";
const fail = () => Error("SYNTHETIC_COMPUTE_DENIAL_TRANSPORT_UNVERIFIED");
function nativeWire(): SyntheticComputeDenialWire {
  const agent = new Agent({ keepAlive: false, maxSockets: 1, minVersion: "TLSv1.2", rejectUnauthorized: true });
  let closed = false;
  return { send(headers, body, signal) {
    return new Promise((resolve, reject) => {
      if (closed || signal.aborted) { reject(fail()); return; }
      const request = httpsRequest(endpoint, { method: "POST", headers, agent, signal, minVersion: "TLSv1.2", rejectUnauthorized: true }, response => {
        // Successful data is deliberately not consumed. A 200 or ambiguous
        // outcome is a failed negative test and still requires task reconciliation.
        void readSyntheticDenialResponse(response, signal).then(resolve, () => { request.destroy(); reject(fail()); });
      });
      request.once("error", () => reject(fail())); request.end(body);
    });
  }, destroy() { closed = true; agent.destroy(); } };
}

/** Candidate only, not a live entry. Fresh source/cloud gates, a verified model
 * role lease and an owner-operated unexpected-task reconciler are prerequisites.
 * No default credentials, custom endpoint, retry, Fargate or successful body. */
export function createSyntheticComputeDenialTransport(input: {
  scope: Scope; credentials: () => Keys; now?: () => number; wire?: SyntheticComputeDenialWire;
}) {
  const wire = input.wire ?? nativeWire(), clock = input.now ?? Date.now;
  let closed = false, wireClosed = false, attempted = false, wireRequests = 0, denialAccepted = false, latest = 0;
  let scope: Scope, body = "";
  const abort = new AbortController();
  function destroy() {
    if (!closed) {
      closed = true; abort.abort(); body = "";
      try { wire.destroy(); wireClosed = true; } catch { throw fail(); }
    }
    if (!wireClosed) throw fail();
  }
  function fresh() {
    const current = clock();
    if (!Number.isSafeInteger(current) || current < latest) throw fail();
    const value = syntheticComputeDenialRequest({ ...scope, nowMs: current }); latest = current; return value;
  }
  try { scope = structuredClone(input.scope); body = JSON.stringify(fresh().request); }
  catch { try { destroy(); } catch { /* fixed error */ } throw fail(); }
  async function request(parent: AbortSignal) {
    let budget: ElapsedBudget | undefined;
    const key: Keys = { accessKeyId: "", secretAccessKey: "", sessionToken: "" };
    try {
      if (closed || attempted || parent.aborted) throw fail();
      attempted = true; fresh();
      budget = new ElapsedBudget(20000, undefined, AbortSignal.any([parent, abort.signal]), fail);
      return await budget.call(async signal => {
        const borrowed = input.credentials();
        key.accessKeyId = borrowed.accessKeyId; key.secretAccessKey = borrowed.secretAccessKey; key.sessionToken = borrowed.sessionToken;
        if (typeof key.accessKeyId !== "string" || !/^ASIA[A-Z0-9]{16}$/.test(key.accessKeyId) ||
            typeof key.secretAccessKey !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(key.secretAccessKey) ||
            typeof key.sessionToken !== "string" || key.sessionToken.length < 16 || key.sessionToken.length > 20000 || /[\x00-\x20\x7f]/.test(key.sessionToken)) throw fail();
        const host = new URL(endpoint).hostname;
        const signer = new SignatureV4({ region: "ap-northeast-1", service: "ecs", sha256: Sha256, credentials: key });
        const signed = await signer.sign({ method: "POST", protocol: "https:", hostname: host, path: "/",
          headers: { host, "content-type": "application/x-amz-json-1.1", "x-amz-target": "AmazonEC2ContainerServiceV20141113.RunTask",
            "content-length": String(Buffer.byteLength(body)) }, body });
        signal.throwIfAborted(); fresh();
        const current = input.credentials();
        if (closed || !budget!.active() || current.accessKeyId !== key.accessKeyId || current.secretAccessKey !== key.secretAccessKey || current.sessionToken !== key.sessionToken) throw fail();
        wireRequests++;
        const response = await wire.send(signed.headers, body, signal);
        signal.throwIfAborted();
        if (closed || !budget!.active()) throw fail();
        const evidence = reviewSyntheticDenialResponse("run-task", response);
        if (!evidence.accepted) throw fail();
        denialAccepted = true;
        return evidence;
      });
    } catch { try { destroy(); } catch { /* fixed diagnostic */ } throw fail(); }
    finally { key.accessKeyId = ""; key.secretAccessKey = ""; key.sessionToken = ""; budget?.dispose(); }
  }
  return { request, destroy, snapshot: () => ({ mode: "synthetic-compute-denial-transport", attempted, wireRequests,
    denialAccepted, closed, wireClosed, automaticRetries: 0, successfulDataConsumed: false, liveAuthorizationVerified: false,
    independentTaskReconciliationRequired: true }) };
}

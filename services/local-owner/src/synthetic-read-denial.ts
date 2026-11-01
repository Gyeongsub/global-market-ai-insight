import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";
import type { acquireSyntheticRoleLease } from "./synthetic-role-acquisition.js";
import { reviewSyntheticDenialResponse } from "./synthetic-denial-evidence.js";

type Lease = ReturnType<typeof acquireSyntheticRoleLease>;
const failure = () => Error("SYNTHETIC_READ_DENIAL_UNVERIFIED");

/** Unsigned, immutable request specifications only. Never accepts an existing
 * parameter/cluster name, caller URL, model request, decryption or RunTask. */
export function syntheticReadDenialRequests(nonce: string) {
  if (typeof nonce !== "string" || !/^[a-f0-9]{32}$/.test(nonce)) throw failure();
  return Object.freeze([
    Object.freeze({ caseName: "parameter-canary" as const, service: "ssm" as const,
      region: "ap-northeast-1" as const, endpoint: "https://ssm.ap-northeast-1.amazonaws.com/",
      target: "AmazonSSM.GetParameter",
      body: JSON.stringify({ Name: `/gmai/synthetic-denial/${nonce}/nonexistent`, WithDecryption: false }) }),
    Object.freeze({ caseName: "cluster-read" as const, service: "ecs" as const,
      region: "ap-northeast-1" as const, endpoint: "https://ecs.ap-northeast-1.amazonaws.com/",
      target: "AmazonEC2ContainerServiceV20141113.DescribeClusters",
      body: JSON.stringify({ clusters: [`gmai-synthetic-denial-${nonce}`] }) }),
  ]);
}
export type SyntheticReadDenialRequest = ReturnType<typeof syntheticReadDenialRequests>[number];
type Factory = (credentials: () => ReturnType<Lease["getCredentials"]>) => {
  request: (request: SyntheticReadDenialRequest, signal: AbortSignal) => Promise<unknown>;
  destroy: () => void;
};

/** Local, injected-transport candidate; NO default AWS client or CLI entry.
 * The future live transport must independently bind signed principal, endpoint
 * and response. Fixtures cannot certify IAM. No administrator fallback/refresh.
 * Random names reduce accidental reads but do not prove resource nonexistence.
 * Any success/missing-resource/ambiguous denial stops the batch immediately. */
export function createSyntheticReadDenialCandidate(input: {
  nonce: string; lease: Lease; factory: Factory; elapsed?: () => number;
}) {
  let requests: ReturnType<typeof syntheticReadDenialRequests>;
  try { requests = syntheticReadDenialRequests(input.nonce); }
  catch { try { input.lease.close(); } catch { /* sanitized below */ } throw failure(); }
  let started = false, closed = false, calls = 0;
  let client: ReturnType<Factory> | undefined, budget: ElapsedBudget | undefined;
  function close() {
    if (closed) return;
    closed = true;
    let failed = false;
    for (const clean of [() => budget?.dispose(), () => input.lease.close(), () => client?.destroy()]) {
      try { clean(); } catch { failed = true; }
    }
    if (failed) throw failure();
  }
  function active() {
    if (closed || !budget?.active()) throw failure();
    input.lease.getCredentials();
    const remaining = input.lease.remainingMs();
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 300000) throw failure();
  }
  async function run() {
    if (started || closed) throw failure();
    started = true;
    try {
      input.lease.getCredentials();
      const remaining = input.lease.remainingMs();
      if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 300000) throw failure();
      budget = new ElapsedBudget(Math.min(40000, remaining), input.elapsed, undefined, failure);
      active();
      client = input.factory(() => { active(); return input.lease.getCredentials(); });
      const accepted: Array<SyntheticReadDenialRequest["caseName"]> = [];
      for (const request of requests) {
        active();
        const perCall = new ElapsedBudget(20000, input.elapsed, undefined, failure);
        try {
          const response = await budget.call(wholeSignal => perCall.call(signal => {
            active();
            // Both elapsed budgets bound acknowledgement; transport must honor
            // cancellation and destroy its sockets. Neither is remote rollback.
            calls++;
            return client!.request(request, AbortSignal.any([wholeSignal, signal]));
          }));
          active();
          if (!reviewSyntheticDenialResponse(request.caseName, response).accepted) throw failure();
          accepted.push(request.caseName);
        } finally { perCall.dispose(); }
      }
      return { mode: "local-synthetic-read-denial-candidate", acceptedCases: accepted,
        requestAttempts: calls, liveAuthorizationVerified: false, runTaskDenialVerified: false,
        serverSideExpiryVerified: false, inferenceCalls: 0, rawDetailsSuppressed: true };
    } catch { throw failure(); }
    finally { close(); }
  }
  return { run, close, snapshot: () => ({ started, closed, requestAttempts: calls,
    liveTransportConnected: false, liveAuthorizationVerified: false }) };
}

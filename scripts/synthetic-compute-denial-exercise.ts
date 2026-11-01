import { acquireSyntheticRoleLease } from "../services/local-owner/src/synthetic-role-acquisition.js";
import { syntheticComputeDenialRequest } from "../services/local-owner/src/synthetic-compute-denial.js";
import { createSyntheticComputeDenialTransport, type SyntheticComputeDenialWire } from "../services/local-owner/src/synthetic-compute-denial-transport.js";
import { reconcileSyntheticComputeDenial } from "./synthetic-compute-denial-reconcile.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";

type Json = Record<string, any>;
type Scope = Parameters<typeof syntheticComputeDenialRequest>[0];
export type ComputeOwnerCall = (service: "lambda" | "ecs", operation: string, args: readonly string[], cleanup: boolean) => unknown;
const fail = () => Error("SYNTHETIC_COMPUTE_DENIAL_EXERCISE_UNVERIFIED");

/** Four bounded owner reads only. Validate references before using them as CLI
 * arguments, then validate the complete immutable snapshot before admission. */
export function collectSyntheticComputeScope(input: {
  identity: Json; nonce: string; now: () => number; call: ComputeOwnerCall;
}) {
  const { account, ownerArn } = reviewOwnerIdentity(input.identity), checkedAtMs = input.now();
  if (!Number.isSafeInteger(checkedAtMs) || checkedAtMs < 0 || !/^[a-f0-9]{32}$/.test(input.nonce)) throw fail();
  const prefix = "global-market-ai-insight-dev", cluster = `arn:aws:ecs:ap-northeast-1:${account}:cluster/${prefix}-worker`;
  const controller: any = input.call("lambda", "get-function-configuration", ["--function-name", `${prefix}-controller`], false);
  const task = controller?.Environment?.Variables?.WORKER_TASK_DEFINITION;
  if (controller?.Environment?.Variables?.WORKER_CLUSTER !== cluster || typeof task !== "string" ||
      !new RegExp(`^arn:aws:ecs:ap-northeast-1:${account}:task-definition/${prefix}-worker:[1-9][0-9]{0,5}$`).test(task)) throw fail();
  const taskDefinition = input.call("ecs", "describe-task-definition", ["--task-definition", task], false);
  const clusters = input.call("ecs", "describe-clusters", ["--clusters", cluster], false);
  const instances = input.call("ecs", "list-container-instances", ["--cluster", cluster], false);
  const scope: Scope = { account, ownerArn, nonce: input.nonce, checkedAtMs, nowMs: input.now(), controller, taskDefinition, clusters, instances };
  syntheticComputeDenialRequest(scope);
  return structuredClone(scope);
}

/** Injected lifecycle. Parent owns the temporary role/stack and must remove it
 * on every result. Restricted keys alone sign one request; owner access is only
 * fresh scope reads and reconciliation of the exact nonce-owned task. */
export async function exerciseSyntheticComputeDenial(input: {
  identity: Json; nonce: string; now: () => number;
  roleCall: Parameters<typeof acquireSyntheticRoleLease>[0]["call"];
  ownerCall: ComputeOwnerCall; wait: () => Promise<void>; record: (state: Json) => void;
  signal?: AbortSignal; wire?: SyntheticComputeDenialWire;
}) {
  let lease: ReturnType<typeof acquireSyntheticRoleLease> | undefined;
  let transport: ReturnType<typeof createSyntheticComputeDenialTransport> | undefined;
  let scope: Scope | undefined, reconcile: Awaited<ReturnType<typeof reconcileSyntheticComputeDenial>> | undefined;
  let assumptionVerified = false, credentialLeaseClosed = false, primaryError = false, cleanupError = false;
  let journalError = false, scopeReads = 0, reconcileState: Json | undefined;
  const signal = input.signal ?? new AbortController().signal;
  function record(stage: string) {
    try { input.record({ stage, assumptionVerified, credentialLeaseClosed, primaryError, cleanupError, journalError,
      scopeReads, ownedRequest: scope ? syntheticComputeDenialRequest(scope).request : undefined,
      transport: transport?.snapshot(), reconcileState, reconciliation: reconcile, inferenceCalls: 0 }); }
    catch { journalError = true; }
  }
  try {
    if (signal.aborted) throw fail();
    lease = acquireSyntheticRoleLease({ identity: input.identity, nonce: input.nonce, call: input.roleCall, now: input.now });
    assumptionVerified = true;
    scope = collectSyntheticComputeScope({ identity: input.identity, nonce: input.nonce, now: input.now,
      call(service, operation, args, cleanup) {
        if (signal.aborted || cleanup || ++scopeReads > 4) throw fail();
        return input.ownerCall(service, operation, args, false);
      } });
    transport = createSyntheticComputeDenialTransport({ scope, credentials: lease.getCredentials, now: input.now, wire: input.wire });
    record("request-intent");
    if (journalError || signal.aborted) throw fail();
    await transport.request(signal);
    if (!transport.snapshot().denialAccepted) throw fail();
  } catch { primaryError = true; }
  finally {
    try { transport?.destroy(); } catch { cleanupError = true; }
    if (lease) {
      try {
        lease.close();
        credentialLeaseClosed = lease.remainingMs() === 0;
        if (!credentialLeaseClosed) cleanupError = true;
      } catch { cleanupError = true; }
    }
    // Cleanup never observes the normal cancellation signal. If a request may
    // have reached AWS, reconcile before allowing parent role/stack teardown.
    if (scope) {
      try {
        const state = transport?.snapshot();
        reconcile = await reconcileSyntheticComputeDenial({ scope,
          outcome: !state?.wireRequests ? "not-sent" : state.denialAccepted ? "explicit-denial" : "unknown",
          call: (operation, args) => input.ownerCall("ecs", operation, args, true), wait: input.wait,
          record: state => { reconcileState = state; record("reconcile"); },
        });
        if (!reconcile.completed) cleanupError = true;
        if (reconcile.denialContradicted || reconcile.unexpectedTaskObserved) primaryError = true;
      } catch { cleanupError = true; }
    }
    record("finished");
  }
  const state = transport?.snapshot();
  return { mode: "synthetic-compute-denial-exercise", completed: !primaryError && !cleanupError && !journalError &&
    assumptionVerified && credentialLeaseClosed && state?.denialAccepted === true && state.wireClosed && reconcile?.completed === true,
    assumptionVerified, credentialLeaseClosed, primaryError, cleanupError, journalError, scopeReads,
    runTaskRequests: state?.wireRequests ?? 0, denialAccepted: state?.denialAccepted ?? false,
    transportClosed: state?.wireClosed ?? !transport, reconciliation: reconcile,
    inferenceCalls: 0, providerCalls: 0, targetCleanupOwnedByParent: true, independentCloudPostureRequired: true };
}

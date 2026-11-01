import { SYNTHETIC_LAB_ROLE_NAME } from "../shared/security/synthetic-lab-policy.js";
import { syntheticAlternatePrincipalSpec } from "../shared/security/synthetic-alternate-principal.js";
import { reviewSyntheticAlternatePrincipalOwnership, reviewSyntheticAlternatePrincipalSnapshot } from "../services/local-owner/src/synthetic-alternate-principal-review.js";
import { acceptSyntheticAlternatePrincipalLease } from "../services/local-owner/src/synthetic-alternate-principal-lease.js";
import { reviewSyntheticRoleSnapshot } from "../services/local-owner/src/synthetic-role-credentials.js";
import { createSyntheticAlternatePrincipalAttempt } from "./synthetic-alternate-principal-cli.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import type { ProbeCall, ProbeResult } from "./synthetic-trust-probe.js";

type Json = Record<string, any>;
const fail = () => Error("SYNTHETIC_ALTERNATE_PRINCIPAL_REHEARSAL_UNVERIFIED");
const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` :
  v !== null && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Injected local candidate only: no native runner or executable entry.
 * The parent owns the already-deployed target lifecycle and must delete it even
 * if this source rehearsal fails. This function owns only its nonce-tagged source
 * role; it never alters target trust or claims independent cloud verification. */
export async function rehearseSyntheticAlternatePrincipal(input: {
  identity: Json; nonce: string; now: () => number; wait: () => Promise<void>;
  call: ProbeCall; record: (state: Json) => void; environment: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  targetRun: Parameters<typeof createSyntheticAlternatePrincipalAttempt>[0]["run"];
}) {
  const { account, ownerArn } = reviewOwnerIdentity(input.identity), started = input.now();
  if (!Number.isSafeInteger(started) || started < 0 || started > 253402300499999) throw fail();
  const specInput = { account, ownerArn, nonce: input.nonce, startedAt: new Date(started).toISOString() };
  const spec = syntheticAlternatePrincipalSpec(specInput), sourceArgs = ["--role-name", spec.roleName];
  let createAttempted = false, policyAttempted = false, sourceAbsent = false, primaryError = false, cleanupError = false;
  let sourceRoleId = "", targetRoleId = "", normalCalls = 0, cleanupCalls = 0, last = started;
  let lease: ReturnType<typeof acceptSyntheticAlternatePrincipalLease> | undefined, raw: unknown;
  let outcome: ReturnType<ReturnType<typeof createSyntheticAlternatePrincipalAttempt>> | undefined;
  const record = (stage: string) => input.record({ stage, sourceRoleName: spec.roleName,
    verifiedSourceRoleId: sourceRoleId || null, createAttempted, policyAttempted, sourceAbsent,
    primaryError, cleanupError, normalCalls, cleanupCalls, targetAttempted: outcome?.attempted ?? false,
    candidateDenialAccepted: outcome?.accepted ?? false, inferenceCalls: 0, targetCleanupOwnedByParent: true });
  const call: ProbeCall = (service, operation, args, cleanup) => {
    if (cleanup) { if (++cleanupCalls > 32 || service !== "iam" || !["get-role", "list-attached-role-policies", "list-role-policies",
      "list-instance-profiles-for-role", "get-role-policy", "delete-role-policy", "delete-role"].includes(operation)) throw fail(); }
    else {
      const now = input.now();
      if (input.signal?.aborted || ++normalCalls > 28 || !Number.isSafeInteger(now) || now < last || now - started >= 240000 ||
          !(service === "sts" && operation === "assume-role" || service === "iam" && ["get-role", "create-role", "put-role-policy",
            "list-attached-role-policies", "list-role-policies", "list-instance-profiles-for-role", "get-role-policy"].includes(operation))) throw fail();
      last = now;
    }
    return input.call(service, operation, args, cleanup);
  };
  const data = (r: ProbeResult) => { if (!r.ok) throw fail(); return r.data; };
  const read = (operation: string, cleanup: boolean, args = sourceArgs) => data(call("iam", operation, args, cleanup));
  function own(value: Json) {
    const checked = reviewSyntheticAlternatePrincipalOwnership(specInput, value, sourceRoleId);
    sourceRoleId = checked.roleId;
  }
  function memberships(cleanup: boolean) {
    const attached = read("list-attached-role-policies", cleanup), inlineNames = read("list-role-policies", cleanup),
      profiles = read("list-instance-profiles-for-role", cleanup);
    for (const response of [attached, inlineNames, profiles])
      if (response.IsTruncated !== false || response.Marker !== undefined) throw fail();
    if (!same(attached.AttachedPolicies, []) || !same(profiles.InstanceProfiles, []) ||
        !(same(inlineNames.PolicyNames, []) || policyAttempted && same(inlineNames.PolicyNames, ["OnlyTargetAssumption"]))) throw fail();
    return { attached, inlineNames, profiles };
  }
  function exactPolicy(cleanup: boolean) {
    const value = read("get-role-policy", cleanup, [...sourceArgs, "--policy-name", "OnlyTargetAssumption"]);
    if (value.RoleName !== spec.roleName || value.PolicyName !== "OnlyTargetAssumption" || !same(value.PolicyDocument, spec.permissions)) throw fail();
    return value;
  }
  function targetSnapshot() {
    const args = ["--role-name", SYNTHETIC_LAB_ROLE_NAME];
    const checked = reviewSyntheticRoleSnapshot({ account, ownerArn, nonce: input.nonce, startedAtMs: started }, {
      role: read("get-role", false, args), attached: read("list-attached-role-policies", false, args),
      inlineNames: read("list-role-policies", false, args),
      inlinePolicy: read("get-role-policy", false, [...args, "--policy-name", "TokyoNovaLiteOnly"]),
    });
    if (targetRoleId && checked.roleId !== targetRoleId) throw fail();
    targetRoleId = checked.roleId;
  }
  try {
    targetSnapshot();
    const prior = call("iam", "get-role", sourceArgs, false);
    if (prior.ok || prior.code !== "ABSENT") throw fail();
    record("pre-create"); createAttempted = true; record("create-intent");
    data(call("iam", "create-role", [...sourceArgs, "--assume-role-policy-document", JSON.stringify(spec.trust),
      "--description", "Temporary exact-target assumption denial probe", "--max-session-duration", "3600", "--tags", JSON.stringify(spec.tags)], false));
    await input.wait();
    own(read("get-role", false)); memberships(false);
    policyAttempted = true; record("policy-intent");
    data(call("iam", "put-role-policy", [...sourceArgs, "--policy-name", "OnlyTargetAssumption", "--policy-document", JSON.stringify(spec.permissions)], false));
    await input.wait();
    const role = read("get-role", false); own(role);
    const snapshot = { role, ...memberships(false), inlinePolicy: exactPolicy(false) };
    const assumeStartedAtMs = input.now();
    reviewSyntheticAlternatePrincipalSnapshot(specInput, snapshot, assumeStartedAtMs);
    record("source-policy-verified");
    const request = spec.sourceSessionRequest;
    raw = data(call("sts", "assume-role", ["--role-arn", request.RoleArn, "--role-session-name", request.RoleSessionName,
      "--duration-seconds", String(request.DurationSeconds), "--policy", request.Policy], false));
    lease = acceptSyntheticAlternatePrincipalLease({ specInput, snapshot, assumeStartedAtMs, response: raw, now: input.now });
    outcome = createSyntheticAlternatePrincipalAttempt({ specInput, snapshot, lease, run: input.targetRun,
      environment: input.environment, now: input.now })();
    if (!outcome.accepted || !outcome.sourceLeaseClosed || !outcome.attempted) throw fail();
    targetSnapshot(); record("candidate-denial-finished");
  } catch { primaryError = true; }
  finally {
    try { lease?.close(); } catch { cleanupError = true; }
    if (raw && typeof raw === "object" && "Credentials" in raw && raw.Credentials && typeof raw.Credentials === "object")
      for (const key of Object.keys(raw.Credentials)) delete (raw.Credentials as Json)[key];
    raw = undefined;
    if (createAttempted) {
      try {
        let live = call("iam", "get-role", sourceArgs, true);
        for (let n = 0; !live.ok && live.code === "ABSENT" && n < 2; n++) {
          await input.wait(); live = call("iam", "get-role", sourceArgs, true);
        }
        own(data(live));
        const members = memberships(true);
        if (members.inlineNames.PolicyNames.length) {
          exactPolicy(true); record("delete-policy-intent");
          // A lost delete acknowledgement is acceptable only if a fresh empty
          // list proves removal. Unexpected policies are never detached.
          call("iam", "delete-role-policy", [...sourceArgs, "--policy-name", "OnlyTargetAssumption"], true);
          const after = read("list-role-policies", true);
          if (after.IsTruncated !== false || after.Marker !== undefined || !same(after.PolicyNames, [])) throw fail();
        }
        record("delete-role-intent");
        const deleted = call("iam", "delete-role", sourceArgs, true);
        let absentReads = 0;
        for (let n = 0; n < 3; n++) {
          const after = call("iam", "get-role", sourceArgs, true);
          if (!after.ok) {
            if (after.code !== "ABSENT") throw fail();
            if (++absentReads >= (deleted.ok ? 1 : 2)) { sourceAbsent = true; break; }
          } else { own(after.data); absentReads = 0; }
          if (n < 2) await input.wait();
        }
        if (!sourceAbsent) throw fail();
      } catch { cleanupError = true; }
    }
    record("finished");
  }
  return { mode: "alternate-principal-injected-rehearsal", completed: !primaryError && !cleanupError,
    createAttempted, policyAttempted, sourceAbsent, primaryError, cleanupError, normalCalls, cleanupCalls,
    candidateDenialAccepted: outcome?.accepted ?? false, targetAttempted: outcome?.attempted ?? false,
    modelCalls: 0, computeCalls: 0, liveAuthorizationVerified: false,
    independentSourceAbsenceRequired: true, targetCleanupOwnedByParent: true };
}

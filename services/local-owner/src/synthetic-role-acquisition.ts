import { SYNTHETIC_LAB_ROLE_NAME, validateSyntheticOwner } from "../../../shared/security/synthetic-lab-policy.js";
import { acceptSyntheticRoleCredentials, reviewSyntheticRoleSnapshot, syntheticAssumeRoleRequest } from "./synthetic-role-credentials.js";

export type SyntheticRoleOperation = "get-role" | "list-attached-role-policies" | "list-role-policies" | "get-role-policy" | "assume-role";
export type SyntheticRoleCall = (operation: SyntheticRoleOperation, args: readonly string[]) => unknown;
function fail(): never { throw Error("SYNTHETIC_ROLE_ACQUISITION_REJECTED"); }

/** Local candidate only. Caller supplies a freshly verified owner identity and a
 * bounded CLI adapter. Four fresh role reads precede one assumption. No default
 * credential chain, retry, persistence, model invocation or admin fallback. */
export function acquireSyntheticRoleLease(input: {
  identity: { Account?: unknown; Arn?: unknown }; nonce: string;
  call: SyntheticRoleCall; now?: () => number;
}) {
  const clock = input.now ?? Date.now;
  let last = 0, first = 0;
  function time() {
    const n = clock();
    if (!Number.isSafeInteger(n) || n < last || n < 0 || n > 253402300499999) fail();
    last = n; return n;
  }
  let raw: unknown;
  try {
    first = time();
    const account = input.identity.Account, ownerArn = validateSyntheticOwner(input.identity.Arn, account);
    if (typeof account !== "string" || !/^[a-f0-9]{32}$/.test(input.nonce)) fail();
    const base = Object.freeze({ account, ownerArn, nonce: input.nonce });
    const roleArgs = Object.freeze(["--role-name", SYNTHETIC_LAB_ROLE_NAME]);
    const read = (operation: SyntheticRoleOperation, args: readonly string[] = roleArgs) => {
      if (time() - first > 90000) fail();
      const result = input.call(operation, args);
      if (time() - first > 90000) fail();
      return result;
    };
    const snapshot = {
      role: read("get-role"), attached: read("list-attached-role-policies"),
      inlineNames: read("list-role-policies"),
      inlinePolicy: read("get-role-policy", [...roleArgs, "--policy-name", "TokyoNovaLiteOnly"]),
    };
    const context = Object.freeze({ ...base, startedAtMs: time() });
    const reviewed = reviewSyntheticRoleSnapshot(context, snapshot);
    const request = syntheticAssumeRoleRequest(context);
    // The authorization window starts after the fresh policy reads, never after
    // the credential response or browser start. Response validation permits at
    // most 30 seconds; the adapter independently bounds its process to 20s.
    raw = input.call("assume-role", ["--role-arn", request.RoleArn, "--role-session-name", request.RoleSessionName,
      "--duration-seconds", String(request.DurationSeconds), "--policy", request.Policy]);
    const lease = acceptSyntheticRoleCredentials(context, reviewed.roleId, raw, time);
    return {
      getCredentials: lease.getCredentials,
      close: lease.close,
      remainingMs() {
        try { lease.getCredentials(); return Math.max(0, context.startedAtMs + 300000 - last); }
        catch { lease.close(); return 0; }
      },
      toJSON: lease.toJSON,
    };
  } catch { fail(); }
  finally {
    if (raw !== null && typeof raw === "object" && "Credentials" in raw && raw.Credentials !== null && typeof raw.Credentials === "object") {
      for (const key of Object.keys(raw.Credentials)) delete (raw.Credentials as Record<string, unknown>)[key];
    }
  }
}

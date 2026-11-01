import { syntheticAlternatePrincipalSpec } from "../../../shared/security/synthetic-alternate-principal.js";

type Input = Parameters<typeof syntheticAlternatePrincipalSpec>[0];
const fail = () => Error("SYNTHETIC_ALTERNATE_PRINCIPAL_REJECTED");
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (record(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Ownership check remains available after the authorization window so cleanup
 * is not disabled by expiry. A known RoleId must not change under the same name. */
export function reviewSyntheticAlternatePrincipalOwnership(input: Input, envelope: unknown, knownRoleId = "") {
  try {
    const spec = syntheticAlternatePrincipalSpec(input), start = Date.parse(spec.startedAt);
    if (!record(envelope) || !record(envelope.Role)) throw fail();
    const role = envelope.Role, created = typeof role.CreateDate === "string" ? Date.parse(role.CreateDate) : NaN;
    if (role.RoleName !== spec.roleName || role.Arn !== spec.roleArn || role.Path !== "/" ||
        typeof role.RoleId !== "string" || !/^AROA[A-Z0-9]{16,32}$/.test(role.RoleId) || knownRoleId && knownRoleId !== role.RoleId ||
        role.MaxSessionDuration !== spec.maxSessionDuration || role.PermissionsBoundary !== undefined ||
        !Number.isFinite(created) || created < start - 1000 || created > start + 300000 ||
        !same(role.AssumeRolePolicyDocument, spec.trust) ||
        !Array.isArray(role.Tags) || !role.Tags.every((t: unknown) => record(t) && typeof t.Key === "string") ||
        !same([...role.Tags].sort((a, b) => a.Key.localeCompare(b.Key)), [...spec.tags].sort((a, b) => a.Key.localeCompare(b.Key)))) throw fail();
    return { roleArn: spec.roleArn, roleId: role.RoleId as string };
  } catch { throw fail(); }
}

/** Structural prerequisite only. Caller must bind fresh owner-authenticated
 * reads to these exact resources. Not an IAM evaluator or live denial proof. */
export function reviewSyntheticAlternatePrincipalSnapshot(input: Input, snapshot: unknown, nowMs: number) {
  try {
    const spec = syntheticAlternatePrincipalSpec(input), start = Date.parse(spec.startedAt);
    if (!Number.isSafeInteger(nowMs) || nowMs < start || nowMs >= Date.parse(spec.expiresAt) || !record(snapshot)) throw fail();
    const { role: envelope, attached, inlineNames, inlinePolicy, profiles } = snapshot;
    if (!record(envelope) || !record(envelope.Role) || !record(attached) || !record(inlineNames) ||
        !record(inlinePolicy) || !record(profiles)) throw fail();
    const owned = reviewSyntheticAlternatePrincipalOwnership(input, envelope);
    if (Date.parse(envelope.Role.CreateDate) > nowMs + 1000) throw fail();
    for (const [response, field, expected] of [
      [attached, "AttachedPolicies", []], [inlineNames, "PolicyNames", ["OnlyTargetAssumption"]],
      [profiles, "InstanceProfiles", []],
    ] as const) {
      if (response.IsTruncated !== false || response.Marker !== undefined || !same(response[field], expected)) throw fail();
    }
    if (inlinePolicy.RoleName !== spec.roleName || inlinePolicy.PolicyName !== "OnlyTargetAssumption" ||
        !same(inlinePolicy.PolicyDocument, spec.permissions)) throw fail();
    return { ...owned, targetRoleArn: spec.targetRoleArn,
      authorizationEndsAt: spec.expiresAt, liveAuthorizationVerified: false as const };
  } catch { throw fail(); }
}

/** Error-only projection for a future fixed regional STS adapter. A successful
 * AssumeRole is a failed negative test even if its returned session is deny-all.
 * Generic denial proves neither which trust condition rejected nor that every
 * foreign principal is denied. Raw response bodies/messages never leave here. */
export function reviewSyntheticAlternatePrincipalOutcome(response: unknown) {
  try {
    if (!record(response) || Object.keys(response).some(k => !["status", "code"].includes(k))) throw fail();
    if (response.status === 403 && response.code === "AccessDenied") {
      return { accepted: true, disposition: "access-denied" as const,
        exactTrustConditionDiagnosed: false, liveAuthorizationVerified: false, rawDetailsSuppressed: true };
    }
    if (response.status === 200 && response.code === undefined) {
      return { accepted: false, disposition: "unexpected-allow" as const,
        exactTrustConditionDiagnosed: false, liveAuthorizationVerified: false, rawDetailsSuppressed: true };
    }
  } catch { /* return only a fixed diagnostic */ }
  return { accepted: false, disposition: "unverified" as const,
    exactTrustConditionDiagnosed: false, liveAuthorizationVerified: false, rawDetailsSuppressed: true };
}

import { SYNTHETIC_LAB_ROLE_NAME, SYNTHETIC_ROLE_SESSION_SECONDS, syntheticModelPolicy,
  syntheticRoleTrust, syntheticSessionPolicy, validateSyntheticOwner } from "../../../shared/security/synthetic-lab-policy.js";

// Candidate boundary only: no default credential chain, AWS client, refresh,
// logging, file persistence or administrator fallback. Not wired to the live lab.
function fail(): never { throw Error("SYNTHETIC_ROLE_CREDENTIALS_REJECTED"); }
const record = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const validNow = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 253402300499999;

export interface SyntheticRoleContext {
  account: string;
  ownerArn: string;
  nonce: string;
  startedAtMs: number;
}
function context(value: SyntheticRoleContext) {
  if (!value || !validNow(value.startedAtMs) || !/^[a-f0-9]{32}$/.test(value.nonce)) fail();
  try { validateSyntheticOwner(value.ownerArn, value.account); } catch { fail(); }
  return { roleArn: `arn:aws:iam::${value.account}:role/${SYNTHETIC_LAB_ROLE_NAME}`,
    sessionName: `gmai-synthetic-${value.nonce}`, expiresAtMs: value.startedAtMs + 300000 };
}

/** All four responses must come from bounded fresh reads by the validated owner.
 * Structural matching is not a proof of AWS's authorization decision. */
export function reviewSyntheticRoleSnapshot(value: SyntheticRoleContext, snapshot: {
  role: unknown; attached: unknown; inlineNames: unknown; inlinePolicy: unknown;
}) {
  const expected = context(value), { role: envelope, attached, inlineNames, inlinePolicy } = snapshot;
  if (!record(envelope) || !record(envelope.Role) || !record(attached) || !record(inlineNames) || !record(inlinePolicy)) fail();
  const role = envelope.Role;
  if (role.RoleName !== SYNTHETIC_LAB_ROLE_NAME || role.Arn !== expected.roleArn || role.Path !== "/" ||
      typeof role.RoleId !== "string" || !/^AROA[A-Z0-9]{16,32}$/.test(role.RoleId) ||
      role.MaxSessionDuration !== 3600 || role.PermissionsBoundary !== undefined ||
      !same(role.AssumeRolePolicyDocument, syntheticRoleTrust(value.ownerArn, value.account)) ||
      !same(attached.AttachedPolicies, []) || attached.IsTruncated !== false || attached.Marker !== undefined ||
      !same(inlineNames.PolicyNames, ["TokyoNovaLiteOnly"]) || inlineNames.IsTruncated !== false || inlineNames.Marker !== undefined ||
      inlinePolicy.RoleName !== SYNTHETIC_LAB_ROLE_NAME || inlinePolicy.PolicyName !== "TokyoNovaLiteOnly" ||
      !same(inlinePolicy.PolicyDocument, syntheticModelPolicy())) fail();
  return { roleArn: expected.roleArn, roleId: role.RoleId as string };
}

export function syntheticAssumeRoleRequest(value: SyntheticRoleContext) {
  const expected = context(value);
  return { RoleArn: expected.roleArn, RoleSessionName: expected.sessionName,
    DurationSeconds: SYNTHETIC_ROLE_SESSION_SECONDS,
    Policy: JSON.stringify(syntheticSessionPolicy(new Date(value.startedAtMs).toISOString())) };
}

/** The returned object deliberately serializes only status. Destruction drops
 * references and clears the shared credential object; JS memory cannot be
 * cryptographically erased and previously copied SDK values may still exist. */
export function acceptSyntheticRoleCredentials(value: SyntheticRoleContext, roleId: string, response: unknown,
  now: () => number = Date.now) {
  let expected: ReturnType<typeof context>, receivedAt: number;
  let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: Date } | undefined;
  let closed = false;
  try {
    expected = context(value);
    try { receivedAt = now(); } catch { fail(); }
    if (!validNow(receivedAt) || receivedAt < value.startedAtMs || receivedAt - value.startedAtMs > 30000 ||
        typeof roleId !== "string" || !/^AROA[A-Z0-9]{16,32}$/.test(roleId) || !record(response) ||
        !record(response.Credentials) || !record(response.AssumedRoleUser)) fail();
    const raw = response.Credentials, principal = response.AssumedRoleUser;
    const expiry = typeof raw.Expiration === "string" ? Date.parse(raw.Expiration) : NaN;
    if (principal.Arn !== `arn:aws:sts::${value.account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/${expected.sessionName}` ||
        principal.AssumedRoleId !== `${roleId}:${expected.sessionName}` ||
        typeof raw.AccessKeyId !== "string" || !/^ASIA[A-Z0-9]{16}$/.test(raw.AccessKeyId) ||
        typeof raw.SecretAccessKey !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(raw.SecretAccessKey) ||
        typeof raw.SessionToken !== "string" || raw.SessionToken.length < 16 || raw.SessionToken.length > 20000 ||
        /[\x00-\x20\x7f]/.test(raw.SessionToken) || !Number.isFinite(expiry) ||
        expiry < value.startedAtMs + 899000 || expiry > receivedAt + 901000 ||
        !Number.isSafeInteger(response.PackedPolicySize) || response.PackedPolicySize < 0 || response.PackedPolicySize > 100)
      fail();
    credentials = { accessKeyId: raw.AccessKeyId, secretAccessKey: raw.SecretAccessKey,
      sessionToken: raw.SessionToken, expiration: new Date(expiry) };
  } finally {
    // Consume the raw response even when validation fails. The adapter must not
    // log/retain another copy of the process stdout or response.
    if (record(response) && record(response.Credentials)) {
      for (const key of Object.keys(response.Credentials)) delete response.Credentials[key];
    }
  }
  let latest = receivedAt!;
  const close = () => {
    closed = true;
    if (credentials) { credentials.accessKeyId = ""; credentials.secretAccessKey = ""; credentials.sessionToken = ""; }
    credentials = undefined;
  };
  const usable = () => {
    let current: number;
    try { current = now(); } catch { close(); return false; }
    if (!validNow(current) || current < latest || current >= expected.expiresAtMs) close();
    latest = current;
    return !closed && credentials !== undefined;
  };
  return {
    getCredentials() { if (!usable()) fail(); return credentials!; },
    close,
    toJSON() { return { mode: "synthetic-role-credential-lease", usable: usable(),
      authorizationWindowMs: 300000, awsCredentialDurationSeconds: SYNTHETIC_ROLE_SESSION_SECONDS,
      secretsPrinted: false, refreshSupported: false }; },
  };
}

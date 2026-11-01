import { syntheticAlternatePrincipalSpec } from "../../../shared/security/synthetic-alternate-principal.js";
import { reviewSyntheticAlternatePrincipalSnapshot } from "./synthetic-alternate-principal-review.js";

type Input = Parameters<typeof syntheticAlternatePrincipalSpec>[0];
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = () => Error("SYNTHETIC_ALTERNATE_PRINCIPAL_CREDENTIALS_REJECTED");

/** Consumes one source AssumeRole response. No provider chain, refresh, child,
 * model client or persistent key is exposed. The existing absolute window is
 * not extended by provisioning or credential acquisition time. */
export function acceptSyntheticAlternatePrincipalLease(input: {
  specInput: Input; snapshot: unknown; assumeStartedAtMs: number; response: unknown; now: () => number;
}) {
  let keys: { accessKeyId: string; secretAccessKey: string; sessionToken: string } | undefined;
  let roleArn = "", roleId = "", latest = 0, expiresAt = 0, closed = false;
  const close = () => {
    closed = true;
    if (keys) { keys.accessKeyId = ""; keys.secretAccessKey = ""; keys.sessionToken = ""; }
    keys = undefined;
  };
  try {
    const spec = syntheticAlternatePrincipalSpec(input.specInput), received = input.now();
    const snapshot = reviewSyntheticAlternatePrincipalSnapshot(input.specInput, input.snapshot, input.assumeStartedAtMs);
    expiresAt = Date.parse(spec.expiresAt);
    if (!Number.isSafeInteger(received) || received < input.assumeStartedAtMs || received - input.assumeStartedAtMs > 30000 ||
        received >= expiresAt - 20000 || !record(input.response) || !record(input.response.Credentials) ||
        !record(input.response.AssumedRoleUser)) throw fail();
    const raw = input.response.Credentials, principal = input.response.AssumedRoleUser;
    const expiration = typeof raw.Expiration === "string" ? Date.parse(raw.Expiration) : NaN;
    const session = spec.sourceSessionRequest.RoleSessionName;
    if (principal.Arn !== `arn:aws:sts::${input.specInput.account}:assumed-role/${spec.roleName}/${session}` ||
        principal.AssumedRoleId !== `${snapshot.roleId}:${session}` ||
        typeof raw.AccessKeyId !== "string" || !/^ASIA[A-Z0-9]{16}$/.test(raw.AccessKeyId) ||
        typeof raw.SecretAccessKey !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(raw.SecretAccessKey) ||
        typeof raw.SessionToken !== "string" || raw.SessionToken.length < 16 || raw.SessionToken.length > 20000 ||
        /[\x00-\x20\x7f]/.test(raw.SessionToken) || !Number.isFinite(expiration) ||
        expiration < input.assumeStartedAtMs + 899000 || expiration > received + 901000 ||
        !Number.isSafeInteger(input.response.PackedPolicySize) || input.response.PackedPolicySize < 0 || input.response.PackedPolicySize > 100) throw fail();
    keys = { accessKeyId: raw.AccessKeyId, secretAccessKey: raw.SecretAccessKey, sessionToken: raw.SessionToken };
    roleArn = snapshot.roleArn; roleId = snapshot.roleId; latest = received;
  } catch { close(); throw fail(); }
  finally {
    if (record(input.response) && record(input.response.Credentials))
      for (const key of Object.keys(input.response.Credentials)) delete input.response.Credentials[key];
  }
  return {
    roleArn, roleId, close,
    getCredentials() {
      try {
        const now = input.now();
        if (closed || !keys || !Number.isSafeInteger(now) || now < latest || now >= expiresAt) throw fail();
        latest = now; return keys;
      } catch { close(); throw fail(); }
    },
    toJSON() { return { mode: "alternate-principal-lease", closed, credentialsRetained: keys !== undefined,
      authorizationWindowMs: 300000, credentialDurationSeconds: 900, refreshSupported: false }; },
  };
}

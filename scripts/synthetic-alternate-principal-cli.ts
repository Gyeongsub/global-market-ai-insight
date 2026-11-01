import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";
import { syntheticAlternatePrincipalSpec } from "../shared/security/synthetic-alternate-principal.js";
import { reviewSyntheticAlternatePrincipalOutcome, reviewSyntheticAlternatePrincipalSnapshot } from "../services/local-owner/src/synthetic-alternate-principal-review.js";

type SpecInput = Parameters<typeof syntheticAlternatePrincipalSpec>[0];
type Keys = { accessKeyId: string; secretAccessKey: string; sessionToken: string };
type Lease = { roleArn: string; roleId: string; getCredentials: () => Keys; close: () => void };
type Child = { status: number | null; signal: string | null; error?: unknown; stdout: string; stderr: string };
type Options = { env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number; windowsHide: true; encoding: "utf8" };
type Run = (args: readonly string[], options: Options) => Child;
const fail = () => Error("SYNTHETIC_ALTERNATE_PRINCIPAL_ATTEMPT_REJECTED");

/** One-shot adapter candidate; no spawn, AWS executable, live flag or role
 * mutation is provided. The future orchestrator owns fresh-source/cloud gates,
 * source credential acquisition and ownership-checked deletion of both roles.
 * A supplied runner must honor the timeout/output bounds and fixed arguments.
 * Child credentials exist only in its environment, never argv or returned output.
 * This is reference clearing, not secure erasure or STS credential revocation. */
export function createSyntheticAlternatePrincipalAttempt(input: {
  specInput: SpecInput; snapshot: unknown; lease: Lease; run: Run;
  environment: NodeJS.ProcessEnv; now: () => number;
}) {
  let used = false;
  return () => {
    let attempted = false, closed = false, result: Child | undefined, env: NodeJS.ProcessEnv | undefined;
    let projection: unknown;
    try {
      if (used) throw fail();
      used = true;
      const spec = syntheticAlternatePrincipalSpec(input.specInput), start = input.now();
      const reviewed = reviewSyntheticAlternatePrincipalSnapshot(input.specInput, input.snapshot, start);
      const remaining = Date.parse(spec.expiresAt) - start;
      if (remaining < 20000 || input.lease.roleArn !== reviewed.roleArn || input.lease.roleId !== reviewed.roleId) throw fail();
      const keys = input.lease.getCredentials();
      if (typeof keys.accessKeyId !== "string" || !/^ASIA[A-Z0-9]{16}$/.test(keys.accessKeyId) ||
          typeof keys.secretAccessKey !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(keys.secretAccessKey) ||
          typeof keys.sessionToken !== "string" || keys.sessionToken.length < 16 || keys.sessionToken.length > 20000 ||
          /[\x00-\x20\x7f]/.test(keys.sessionToken)) throw fail();
      env = { ...cleanSourceChildEnvironment(input.environment), AWS_CONFIG_FILE: "NUL", AWS_SHARED_CREDENTIALS_FILE: "NUL",
        AWS_ACCESS_KEY_ID: keys.accessKeyId, AWS_SECRET_ACCESS_KEY: keys.secretAccessKey, AWS_SESSION_TOKEN: keys.sessionToken,
        AWS_REGION: "ap-northeast-1", AWS_DEFAULT_REGION: "ap-northeast-1", AWS_CSM_ENABLED: "false",
        AWS_RETRY_MODE: "standard", AWS_MAX_ATTEMPTS: "1" };
      const request = spec.targetSessionRequest;
      // CLI query deliberately excludes every returned child credential. The
      // explicit deny-all policy also bounds unexpected assumption success.
      const args = ["sts", "assume-role", "--role-arn", request.RoleArn, "--role-session-name", request.RoleSessionName,
        "--duration-seconds", String(request.DurationSeconds), "--policy", request.Policy,
        "--query", "{AssumedRoleUser:AssumedRoleUser,Expiration:Credentials.Expiration,PackedPolicySize:PackedPolicySize}",
        "--region", "ap-northeast-1", "--endpoint-url", "https://sts.ap-northeast-1.amazonaws.com",
        "--no-cli-pager", "--no-paginate", "--output", "json"];
      const before = input.now();
      if (!Number.isSafeInteger(before) || before < start || before - start >= 1000) throw fail();
      attempted = true;
      result = input.run(Object.freeze(args), { env, timeout: 20000, maxBuffer: 16384, windowsHide: true, encoding: "utf8" });
      const after = input.now();
      if (!Number.isSafeInteger(after) || after < before || after - before >= 20000 || after >= Date.parse(spec.expiresAt) ||
          result.error || result.signal !== null || typeof result.stdout !== "string" || typeof result.stderr !== "string" ||
          Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > 16384) throw fail();
      if (result.status === 0) projection = { status: 200 };
      else if (result.status === 254 && /^(?:aws: \[ERROR\]: )?An error occurred \(AccessDenied\) when calling the AssumeRole operation(?: \(reached max retries: 0\))?: [^\r\n\x00]+$/.test(result.stderr.trim()))
        projection = { status: 403, code: "AccessDenied" };
    } catch { /* no child error, private ARN or response is returned */ }
    finally {
      used = true;
      if (result) { result.stdout = ""; result.stderr = ""; }
      if (env) for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) delete env[name];
      try { input.lease.close(); closed = true; } catch { /* never declare successful cleanup */ }
    }
    const reviewed = reviewSyntheticAlternatePrincipalOutcome(projection);
    return { ...reviewed, accepted: reviewed.accepted && closed, attempted, sourceLeaseClosed: closed,
      modelCalls: 0, computeCalls: 0, targetCredentialsUsed: false, independentRoleCleanupRequired: true };
  };
}

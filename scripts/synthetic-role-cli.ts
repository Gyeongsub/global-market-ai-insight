import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import type { SyntheticRoleCall } from "../services/local-owner/src/synthetic-role-acquisition.js";
import { phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

type ChildResult = { status: number | null; signal: string | null; error?: unknown; stdout: string; stderr: string };
export function syntheticRoleCliTransport(run: (args: readonly string[]) => ChildResult): SyntheticRoleCall {
  let calls = 0, closed = false;
  const sequence = ["get-role", "list-attached-role-policies", "list-role-policies", "get-role-policy", "assume-role"];
  return (operation, args) => {
    let result: ChildResult | undefined;
    try {
      if (closed || sequence[calls++] !== operation) throw Error();
      const assume = operation === "assume-role";
      result = run([assume ? "sts" : "iam", operation, ...args,
        "--profile", "gmai-admin", "--region", assume ? "ap-northeast-1" : "us-east-1",
        "--endpoint-url", assume ? "https://sts.ap-northeast-1.amazonaws.com" : "https://iam.amazonaws.com",
        "--no-cli-pager", "--no-paginate", "--output", "json"]);
      if (result.error || result.status !== 0 || result.signal !== null) throw Error();
      const value = JSON.parse(result.stdout);
      if (assume) closed = true;
      return value;
    } catch { closed = true; throw Error("SYNTHETIC_ROLE_CLI_REJECTED"); }
    finally {
      // Drop references, not a secure-erasure claim. Do not log child errors;
      // process output can contain keys or private role/account information.
      if (result) { result.stdout = ""; result.stderr = ""; }
    }
  };
}

/** Candidate adapter, no CLI entry/live flag and not wired into the current lab.
 * The calling orchestrator must first verify owner, cloud posture and source gate.
 * Raw STS output stays in this process; never return a CLI diagnostic or fallback. */
export function createSyntheticRoleCli(): SyntheticRoleCall {
  assertNodeSecurityBaseline();
  const aws = process.env.GMAI_AWS_CLI_PATH;
  function fail(): never { throw Error("SYNTHETIC_ROLE_CLI_REJECTED"); }
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink() ||
      realpathSync(aws).toLowerCase() !== resolve(aws).toLowerCase()) fail();
  const env = { ...phase11ReadOnlyChildEnvironment(process.env), AWS_MAX_ATTEMPTS: "1", AWS_RETRY_MODE: "standard" };
  return syntheticRoleCliTransport(args => spawnSync(aws!, [...args],
    { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 }));
}

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { syntheticRoleTrust } from "../shared/security/synthetic-lab-policy.js";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { reviewOwnerGateReceipt } from "./private-owner-draft.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

type Json = Record<string, any>;
export type ProbeResult = { ok: true; data: Json } | { ok: false; code: "ABSENT" | "DENIED" | "UNVERIFIED" };
export type ProbeCall = (service: "iam" | "sts", operation: string, args: string[], cleanup: boolean) => ProbeResult;
const DENY_ALL = { Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }] };
function fail(): never { throw Error("SYNTHETIC_TRUST_PROBE_UNVERIFIED"); }
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function syntheticTrustProbeServiceTarget(service: "iam" | "sts") {
  // An explicit global IAM endpoint needs its global signing region, not the
  // Tokyo workload region. Regional STS stays in Tokyo.
  if (service === "iam") return { region: "us-east-1", endpoint: "https://iam.amazonaws.com" };
  if (service === "sts") return { region: "ap-northeast-1", endpoint: "https://sts.ap-northeast-1.amazonaws.com" };
  return fail();
}
export function syntheticTrustProbePlan(args: readonly string[] = []) {
  if (args.length) fail();
  return { mode: "dry-run", roleCreates: 0, awsCalls: 0, plannedRoleMaximum: 1,
    permissionPoliciesAttached: 0, assumedSessionPolicy: "explicit-deny-all", assumeAttemptsMax: 1,
    inferenceCalls: 0, providerCalls: 0, normalCallLimit: 12, cleanupCallLimit: 12,
    independentCloudAndLocalClosureRequired: true };
}

/** Permission-free, unique, tagged role probes trust compatibility only. A denied
 * attempt does not uniquely prove MFA is missing (propagation/other denies exist).
 * No returned key is requested from the CLI or used by this workflow. */
export async function executeSyntheticTrustProbe(input: {
  identity: Json; nonce: string; now: () => number; wait: () => Promise<void>;
  call: ProbeCall; record: (state: Json) => void;
}) {
  const { account, ownerArn } = reviewOwnerIdentity(input.identity);
  if (!/^[a-f0-9]{32}$/.test(input.nonce)) fail();
  const name = `gmai-synthetic-trust-${input.nonce}`, started = input.now();
  if (!Number.isSafeInteger(started) || started < 0) fail();
  const tags = [{ Key: "Project", Value: "global-market-ai-insight" }, { Key: "Purpose", Value: "permission-free-trust-probe" },
    { Key: "ProbeId", Value: input.nonce }];
  const baseTrust = syntheticRoleTrust(ownerArn, account);
  const trust = { ...baseTrust, Statement: baseTrust.Statement.map(statement => ({ ...statement,
    Condition: { ...statement.Condition, DateLessThan: { "aws:CurrentTime": new Date(started + 300000).toISOString() } } })) };
  let createAttempted = false, absentConfirmed = false, assumption = "not-attempted", primaryError = false, cleanupError = false;
  let roleId = "", normalCalls = 0, cleanupCalls = 0, previous = started;
  const record = (stage: string) => input.record({ mode: "synthetic-trust-probe-journal", stage, roleName: name,
    verifiedRoleId: roleId || null, startedAt: new Date(started).toISOString(), createAttempted, absentConfirmed, assumption,
    normalCalls, cleanupCalls, permissionPoliciesAttached: 0, inferenceCalls: 0 });
  const call: ProbeCall = (service, operation, args, cleanup) => {
    const now = input.now();
    // A shifted wall clock must block new activity, not spend the reserved
    // cleanup budget. Cleanup is bounded by call count, per-call timeout and
    // bounded fixed waits, independently of the workstation's clock.
    if (cleanup ? ++cleanupCalls > 12 : ++normalCalls > 12 || !Number.isSafeInteger(now) || now < previous || now - started > 240000) fail();
    if (!cleanup) previous = now;
    return input.call(service, operation, args, cleanup);
  };
  function owned(data: Json) {
    const role = data?.Role, created = Date.parse(role?.CreateDate);
    if (role?.RoleName !== name || role.Arn !== `arn:aws:iam::${account}:role/${name}` || role.Path !== "/" ||
        !/^AROA[A-Z0-9]{16,32}$/.test(role.RoleId ?? "") || roleId && role.RoleId !== roleId ||
        role.MaxSessionDuration !== 3600 || role.PermissionsBoundary !== undefined ||
        !Number.isFinite(created) || created < started - 1000 || created > started + 240000 ||
        !same(role.AssumeRolePolicyDocument, trust) ||
        !Array.isArray(role.Tags) || !same([...role.Tags].sort((a,b) => a.Key.localeCompare(b.Key)), [...tags].sort((a,b) => a.Key.localeCompare(b.Key)))) fail();
    roleId = role.RoleId;
  }
  function emptyMemberships(cleanup: boolean) {
    for (const [operation, field] of [["list-attached-role-policies", "AttachedPolicies"], ["list-role-policies", "PolicyNames"],
      ["list-instance-profiles-for-role", "InstanceProfiles"]]) {
      const result = call("iam", operation!, ["--role-name", name], cleanup);
      if (!result.ok || !same(result.data[field!], []) || result.data.IsTruncated !== false || result.data.Marker !== undefined) fail();
    }
  }
  try {
    const prior = call("iam", "get-role", ["--role-name", name], false);
    if (prior.ok || prior.code !== "ABSENT") fail();
    record("pre-create");
    createAttempted = true; record("create-intent");
    const created = call("iam", "create-role", ["--role-name", name, "--assume-role-policy-document", JSON.stringify(trust),
      "--description", "Temporary permission-free synthetic lab MFA trust probe", "--max-session-duration", "3600", "--tags", JSON.stringify(tags)], false);
    if (!created.ok) fail();
    // A fresh get, not the write acknowledgement, supplies the ownership proof.
    await input.wait();
    const live = call("iam", "get-role", ["--role-name", name], false);
    if (!live.ok) fail(); owned(live.data); emptyMemberships(false); record("owned-empty-role-verified");
    const sessionName = `gmai-synthetic-${input.nonce}`;
    const assumed = call("sts", "assume-role", ["--role-arn", `arn:aws:iam::${account}:role/${name}`,
      "--role-session-name", sessionName, "--duration-seconds", "900", "--policy", JSON.stringify(DENY_ALL),
      "--query", "{AssumedRoleUser:AssumedRoleUser,Expiration:Credentials.Expiration,PackedPolicySize:PackedPolicySize}"], false);
    if (!assumed.ok) {
      if (assumed.code !== "DENIED") fail(); assumption = "denied-not-diagnostic-of-mfa";
    } else {
      const d = assumed.data, expiry = Date.parse(d.Expiration);
      if (d.AssumedRoleUser?.Arn !== `arn:aws:sts::${account}:assumed-role/${name}/${sessionName}` ||
          d.AssumedRoleUser?.AssumedRoleId !== `${roleId}:${sessionName}` || !Number.isFinite(expiry) ||
          expiry < input.now() + 840000 || expiry > input.now() + 901000 ||
          !Number.isSafeInteger(d.PackedPolicySize) || d.PackedPolicySize < 0 || d.PackedPolicySize > 100 ||
          Object.keys(d).some(k => !["AssumedRoleUser", "Expiration", "PackedPolicySize"].includes(k))) fail();
      assumption = "exact-mfa-trust-assumption-succeeded";
    }
    record("probe-finished");
  } catch { primaryError = true; }
  finally {
    if (createAttempted) {
      try {
        let live = call("iam", "get-role", ["--role-name", name], true);
        // A lost CreateRole response may still commit after an initial absent
        // read. Seek the exact owned role; never turn pre-delete absence alone
        // into confirmed cleanup of an ambiguous creation.
        for (let attempt = 0; !live.ok && live.code === "ABSENT" && attempt < 2; attempt++) {
          await input.wait(); live = call("iam", "get-role", ["--role-name", name], true);
        }
        if (!live.ok) fail();
        else {
          owned(live.data); emptyMemberships(true); record("delete-intent");
          // Do not detach policies or delete instance profiles if anyone changed
          // the owned role. Such a conflict is an unverified cleanup, not consent.
          const deleted = call("iam", "delete-role", ["--role-name", name], true);
          let absentReads = 0;
          for (let attempt = 0; attempt < 3; attempt++) {
            const after = call("iam", "get-role", ["--role-name", name], true);
            if (!after.ok) {
              if (after.code !== "ABSENT") fail();
              if (++absentReads >= (deleted.ok ? 1 : 2)) { absentConfirmed = true; break; }
            } else { owned(after.data); absentReads = 0; }
            if (attempt < 2) await input.wait();
          }
          if (!absentConfirmed) fail();
        }
      } catch { cleanupError = true; }
    }
    record("finished");
  }
  return { mode: "synthetic-trust-probe", completed: !primaryError && !cleanupError, createAttempted, absentConfirmed,
    assumption, primaryError, cleanupError, normalCalls, cleanupCalls, permissionPoliciesAttached: 0,
    assumedCredentialsUsed: false, returnedKeysPrinted: false, inferenceCalls: 0, providerCalls: 0,
    roleDeletionRevokesAllCredentials: false, independentCloudAndLocalClosureRequired: true };
}

export async function runSyntheticTrustProbe() {
  assertNodeSecurityBaseline();
  const aws = process.env.GMAI_AWS_CLI_PATH, runId = process.env.GMAI_OWNER_GATE_RUN_ID;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink() ||
      realpathSync(aws).toLowerCase() !== resolve(aws).toLowerCase() || !/^[a-f0-9-]{36}$/.test(runId ?? "")) fail();
  const env = { ...phase11ReadOnlyChildEnvironment(process.env), AWS_MAX_ATTEMPTS: "1", AWS_RETRY_MODE: "standard" };
  const receiptPath = resolve("outputs/local-gates", `${runId}.json`), stat = lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10000 || realpathSync(receiptPath) !== receiptPath) fail();
  const fingerprint = spawnSync(process.execPath, ["--input-type=module", "--eval",
    'import {fingerprintCurrentSource} from "./scripts/clean-source-build-proof.mjs";console.log(JSON.stringify(fingerprintCurrentSource(process.cwd())));'],
    { env, encoding: "utf8", windowsHide: true, timeout: 30000, maxBuffer: 16000 });
  if (fingerprint.status !== 0 || fingerprint.signal !== null) fail();
  reviewOwnerGateReceipt(JSON.parse(readFileSync(receiptPath, "utf8")), JSON.parse(fingerprint.stdout), runId!, Date.now());
  const readonly = createPhase11ReadOnlyCliRunner();
  const identity = readonly(["sts", "get-caller-identity", "--profile", "gmai-admin", "--region", "ap-northeast-1", "--no-cli-pager", "--no-paginate", "--output", "json"]) as Json;
  reviewOwnerIdentity(identity);
  const readiness = collectPhase11Readiness(createPhase11ReadOnlyCliRunner()) as Json;
  // The evaluator itself rejects unsafe posture; require the same closed-workload
  // fields instead of treating a returned object as an authorization receipt.
  if (readiness.readyForAccountSpecificDiff !== true || readiness.compute?.executionFlagsVerifiedDisabled !== true ||
      readiness.compute.runningTasks !== 0 || readiness.compute.pendingTasks !== 0 || readiness.compute.services !== 0 ||
      readiness.circuit?.verifiedOpen !== true || readiness.occupiedSlots !== 0) fail();
  const nonce = randomUUID().replaceAll("-", ""), directory = ownedLocalGateReportDirectory(process.cwd());
  const journal = join(directory, `synthetic-trust-${nonce}.json`);
  writeFileSync(journal, JSON.stringify({ mode: "synthetic-trust-probe-journal", stage: "initial", roleName: `gmai-synthetic-trust-${nonce}` }) + "\n", { flag: "wx" });
  const call: ProbeCall = (service, operation, args) => {
    const target = syntheticTrustProbeServiceTarget(service);
    const result = spawnSync(aws, [service, operation, ...args, "--profile", "gmai-admin", "--region", target.region,
      "--endpoint-url", target.endpoint,
      "--no-cli-pager", "--no-paginate", "--output", "json"],
    { env, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 100000 });
    if (result.error || result.signal !== null) return { ok: false, code: "UNVERIFIED" };
    if (result.status !== 0) return { ok: false, code:
      operation === "get-role" && /\(NoSuchEntity\) when calling the GetRole operation/.test(result.stderr) ? "ABSENT" :
      operation === "assume-role" && /\(AccessDenied\) when calling the AssumeRole operation/.test(result.stderr) ? "DENIED" : "UNVERIFIED" };
    try { return { ok: true, data: result.stdout.trim() ? JSON.parse(result.stdout) : {} }; }
    catch { return { ok: false, code: "UNVERIFIED" }; }
  };
  return executeSyntheticTrustProbe({ identity, nonce, now: Date.now, wait: () => delay(15000), call, record: state => {
    if (ownedLocalGateReportDirectory(process.cwd()) !== directory || !lstatSync(journal).isFile() ||
        lstatSync(journal).isSymbolicLink() || realpathSync(journal) !== journal) fail();
    writeFileSync(journal, JSON.stringify(state) + "\n");
  } });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(syntheticTrustProbePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-no-permission-trust-probe") fail();
      const result = await runSyntheticTrustProbe(); console.log(JSON.stringify(result));
      if (!result.completed || !result.absentConfirmed) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "SYNTHETIC_TRUST_PROBE_UNVERIFIED", rawDetailsSuppressed: true,
    inspectOwnedJournalBeforeRetry: true, independentCloudAndLocalClosureRequired: true })); process.exitCode = 1; }
}

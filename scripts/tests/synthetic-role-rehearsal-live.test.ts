import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { syntheticRoleRehearsalPlan, syntheticReadDenialRehearsalPlan, syntheticExpiryRehearsalPlan, syntheticAlternatePrincipalRehearsalPlan, syntheticComputeDenialRehearsalPlan, syntheticRestrictedBrowserRehearsalPlan, exerciseSyntheticRoleCredentials } from "../synthetic-role-rehearsal-live.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";
import type { SyntheticRoleOperation } from "../../services/local-owner/src/synthetic-role-acquisition.js";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

const account = "123456789012", owner = `arn:aws:iam::${account}:user/aws-admin-user`, nonce = "a".repeat(32);
const roleId = `AROA${"X".repeat(17)}`, now = Date.parse("2026-10-28T00:00:00.000Z");
function fixture(badPolicy = false, badResponse = false) {
  let raw: any; const operations: string[] = [];
  return { operations, raw: () => raw, input: { identity: { Account: account, Arn: owner }, nonce, now: () => now,
    call(operation: SyntheticRoleOperation) {
      operations.push(operation);
      if (operation === "get-role") return { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME,
        Arn: `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`, RoleId: roleId, Path: "/", MaxSessionDuration: 3600,
        AssumeRolePolicyDocument: syntheticRoleTrust(owner, account) } };
      if (operation === "list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
      if (operation === "list-role-policies") return { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false };
      if (operation === "get-role-policy") return { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: badPolicy ? {} : syntheticModelPolicy() };
      raw = { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only-token",
        Expiration: new Date(now + 900000).toISOString() }, AssumedRoleUser: {
        Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${badResponse ? "INVALID" : roleId}:gmai-synthetic-${nonce}` }, PackedPolicySize: 12 };
      return raw;
    } } };
}

test("credential-only exercise uses four exact reads, assumes once, and consumes raw fields", () => {
  const f = fixture(), result = exerciseSyntheticRoleCredentials(f.input);
  assert.deepEqual(result, { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 });
  assert.deepEqual(f.operations, ["get-role", "list-attached-role-policies", "list-role-policies", "get-role-policy", "assume-role"]);
  assert.deepEqual(f.raw().Credentials, {});
  assert.doesNotMatch(JSON.stringify(result), /ASIA|123456789012|synthetic-test-only|x{40}/);
});
test("unverified policy cannot assume; invalid credential response is consumed with sanitized failure", () => {
  const policy = fixture(true); assert.throws(() => exerciseSyntheticRoleCredentials(policy.input), { message: "SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED" });
  assert.equal(policy.operations.includes("assume-role"), false);
  const response = fixture(false, true); assert.throws(() => exerciseSyntheticRoleCredentials(response.input), { message: "SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED" });
  assert.deepEqual(response.raw().Credentials, {});
});
test("default plan is inert and does not claim authorization or revocation acceptance", () => {
  const p = syntheticRoleRehearsalPlan(); assert.equal(p.awsCalls, 0); assert.equal(p.filesWritten, 0);
  assert.equal(p.plannedTemporaryRolesMax, 1); assert.equal(p.plannedAssumptionsMax, 1); assert.equal(p.plannedInferenceCalls, 0);
  assert.equal(p.existingRoleReuseAllowed, false); assert.equal(p.negativeAuthorizationVerified, false); assert.equal(p.allCredentialsRevoked, false);
  assert.throws(() => syntheticRoleRehearsalPlan(["--execute"]));
});
test("default executable does not require credentials; unknown or unproved live flags fail closed", () => {
  const env = cleanSourceChildEnvironment(process.env);
  for (const args of [[], ["--execute"], ["--execute-temporary-role-rehearsal"], ["--execute-temporary-role-rehearsal", "extra"],
    ["--execute-temporary-role-read-denial"], ["--execute-temporary-role-read-denial", "extra"],
    ["--execute-temporary-role-expiry-contrast"], ["--execute-temporary-role-expiry-contrast", "extra"],
    ["--execute-temporary-role-alternate-principal"], ["--execute-temporary-role-alternate-principal", "extra"],
    ["--execute-temporary-role-compute-denial"], ["--execute-temporary-role-compute-denial", "extra"],
    ["--execute-temporary-role-browser"], ["--execute-temporary-role-browser", "extra"]]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/synthetic-role-rehearsal-live.ts", ...args],
      { env, encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(r.error, undefined); assert.equal(r.signal, null);
    assert.equal(r.status, args.length ? 1 : 0);
    const packet = JSON.parse(args.length ? r.stderr : r.stdout);
    if (!args.length) assert.equal(packet.awsCalls, 0);
    else { assert.equal(packet.error, "SYNTHETIC_ROLE_REHEARSAL_LIVE_UNVERIFIED"); assert.equal(packet.inspectOwnedJournalBeforeRetry, true); }
    assert.doesNotMatch(r.stdout + r.stderr, /123456789012|arn:aws|AccessKeyId|SecretAccessKey|SessionToken/);
  }
});

test("expiry contrast has a distinct inert plan with one assumption and at most two model requests", () => {
  const p = syntheticExpiryRehearsalPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.plannedTemporaryRolesMax, 1); assert.equal(p.plannedAssumptionsMax, 1);
  assert.equal(p.plannedInferenceCalls, 2); assert.equal(p.positiveControlsMax, 1); assert.equal(p.postWindowRequestsMax, 1);
  assert.equal(p.automaticRetries, 0); assert.equal(p.maxOutputTokensPerRequest, 512); assert.equal(p.serverSideExpiryVerified, false);
  assert.equal(p.separateApprovalRequired, true);
});

test("read-denial plan is inert, separately scoped and does not authorize secret/model/compute access", () => {
  const p = syntheticReadDenialRehearsalPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.filesWritten, 0); assert.equal(p.plannedAssumptionsMax, 1);
  assert.equal(p.plannedReadDenialRequestsMax, 2); assert.equal(p.plannedInferenceCalls, 0); assert.equal(p.decryption, false);
  assert.equal(p.runTaskPerformed, false); assert.equal(p.readDenialVerified, false); assert.equal(p.separateApprovalRequired, true);
  assert.deepEqual(p.exactCases, ["parameter-canary", "cluster-read"]);
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/synthetic-role-rehearsal-live.ts", "--plan-read-denial"],
    { env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), p);
});
test("live adapter retains exact source/readiness gates without importing the ordinary inference runner", () => {
  const source = readFileSync(new URL("../synthetic-role-rehearsal-live.ts", import.meta.url), "utf8");
  assert.match(source, /reviewSyntheticDraftSourceProofs\(/);
  assert.match(source, /collectPhase11Readiness\(/);
  assert.match(source, /timeout: 20000/); assert.match(source, /AWS_MAX_ATTEMPTS: "1"/);
  assert.match(source, /exerciseSyntheticRoleCredentials\(\{ identity, nonce, call: createSyntheticRoleCli\(\)/);
  assert.doesNotMatch(source, /BedrockRuntimeClient|defaultProvider|createRestrictedSyntheticRuntime|createSyntheticAnalysisSession/);
});

test("alternate-principal plan is a distinct bounded two-role scope without inference or target keys", () => {
  const p = syntheticAlternatePrincipalRehearsalPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.plannedTemporaryRolesMax, 2); assert.equal(p.plannedAssumptionsMax, 2);
  assert.equal(p.plannedSourceAssumptionsMax, 1); assert.equal(p.plannedTargetAssumptionAttemptsMax, 1);
  assert.equal(p.targetSessionPolicy, "explicit-deny-all"); assert.equal(p.targetTrustModified, false);
  assert.equal(p.targetCredentialsUsed, false); assert.equal(p.plannedInferenceCalls, 0); assert.equal(p.runTaskPerformed, false);
  assert.equal(p.sourceIndependentCleanupRequired, true); assert.equal(p.explicitTwoRoleScopeRequired, true);
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/synthetic-role-rehearsal-live.ts", "--plan-alternate-principal"],
    { env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), p);
});

test("compute denial has a distinct default-inert one-role one-request EC2-only plan", () => {
  const p = syntheticComputeDenialRehearsalPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.plannedTemporaryRolesMax, 1); assert.equal(p.plannedAssumptionsMax, 1);
  assert.equal(p.plannedRunTaskRequestsMax, 1); assert.equal(p.plannedLaunchType, "EC2"); assert.equal(p.fargateSelected, false);
  assert.equal(p.plannedInferenceCalls, 0); assert.equal(p.plannedProviderCalls, 0); assert.equal(p.automaticRetries, 0);
  assert.equal(p.exactOwnedTaskReconciliationRequired, true); assert.equal(p.runTaskDenialVerified, false);
  assert.equal(p.taskSecretInjectionPrevented, false); assert.equal(p.explicitComputeDenialScopeRequired, true);
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/synthetic-role-rehearsal-live.ts", "--plan-compute-denial"],
    { env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), p);
});

test("restricted browser plan preserves one-click inference and temporary-role teardown", () => {
  const p = syntheticRestrictedBrowserRehearsalPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.plannedTemporaryRolesMax, 1); assert.equal(p.plannedAssumptionsMax, 1);
  assert.equal(p.plannedInferenceCalls, 1); assert.equal(p.maxOutputTokensPerRequest, 512); assert.equal(p.automaticModelCalls, 0);
  assert.equal(p.lifetimeMsMax, 300000); assert.equal(p.loopbackOnly, true); assert.equal(p.administratorKeysExported, false);
  assert.equal(p.restrictedLeaseOnly, true); assert.equal(p.browserResultAcceptanceRequired, true); assert.equal(p.permanentRoleCreated, false);
  const source = readFileSync(new URL("../synthetic-role-rehearsal-live.ts", import.meta.url), "utf8");
  assert.match(source, /const roleCall = createSyntheticRoleCli\(\)/);
  assert.match(source, /cleanSourceChildEnvironment\(process.env\)/);
  assert.match(source, /AWS_EC2_METADATA_DISABLED: "true"/);
  assert.doesNotMatch(source, /export-credentials/);
  const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/synthetic-role-rehearsal-live.ts", "--plan-restricted-browser"],
    { env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 15000, windowsHide: true });
  assert.equal(r.status, 0); assert.deepEqual(JSON.parse(r.stdout), p);
});

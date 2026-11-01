import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { executeSyntheticTrustProbe, syntheticTrustProbePlan, syntheticTrustProbeServiceTarget, runSyntheticTrustProbe, type ProbeCall } from "../synthetic-trust-probe.js";
import { syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";

const account = "123456789012", nonce = "a".repeat(32), name = `gmai-synthetic-trust-${nonce}`;
const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: `AIDA${"X".repeat(17)}` };
const start = Date.parse("2026-10-26T00:00:00.000Z"), roleId = `AROA${"X".repeat(17)}`;
const trust = () => { const base = syntheticRoleTrust(identity.Arn, account); return { ...base, Statement: base.Statement.map(s => ({ ...s,
  Condition: { ...s.Condition, DateLessThan: { "aws:CurrentTime": new Date(start + 300000).toISOString() } } })) }; };
function fixture(options: { denied?: boolean; createLost?: boolean; deletionLost?: boolean; deleteSurvives?: boolean;
  collision?: boolean; foreignTag?: boolean; attached?: boolean; listTruncated?: boolean; assumeMalformed?: boolean; waitFails?: boolean; clockBack?: boolean; createInvisible?: boolean } = {}) {
  let exists = options.collision ?? false, now = start, assumeCalls = 0;
  const calls: { operation: string; args: string[]; cleanup: boolean }[] = [], records: any[] = [];
  const role = () => ({ Role: { RoleName: name, Arn: `arn:aws:iam::${account}:role/${name}`, Path: "/", RoleId: roleId,
    CreateDate: new Date(start).toISOString(), MaxSessionDuration: 3600, AssumeRolePolicyDocument: trust(),
    Tags: [{ Key: "Project", Value: "global-market-ai-insight" }, { Key: "Purpose", Value: "permission-free-trust-probe" },
      { Key: "ProbeId", Value: options.foreignTag ? "other" : nonce }] } });
  const call: ProbeCall = (_service, operation, args, cleanup) => {
    calls.push({ operation, args, cleanup });
    if (operation === "get-role") return exists ? { ok: true, data: role() } : { ok: false, code: "ABSENT" };
    if (operation === "create-role") { exists = !options.createInvisible; return options.createLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: role() }; }
    if (operation === "list-attached-role-policies") return { ok: true, data: { AttachedPolicies: options.attached ? [{}] : [], IsTruncated: false } };
    if (operation === "list-role-policies") return { ok: true, data: { PolicyNames: [], IsTruncated: options.listTruncated ?? false } };
    if (operation === "list-instance-profiles-for-role") return { ok: true, data: { InstanceProfiles: [], IsTruncated: false } };
    if (operation === "assume-role") {
      assumeCalls++;
      if (options.denied) return { ok: false, code: "DENIED" };
      return { ok: true, data: { AssumedRoleUser: { Arn: `arn:aws:sts::${account}:assumed-role/${name}/gmai-synthetic-${nonce}`,
        AssumedRoleId: `${roleId}:gmai-synthetic-${nonce}` }, Expiration: new Date(now + 900000).toISOString(), PackedPolicySize: 4,
        ...(options.assumeMalformed ? { Credentials: "PRIVATE_SENTINEL" } : {}) } };
    }
    if (operation === "delete-role") { if (!options.deleteSurvives) exists = false; return options.deletionLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
    throw Error("UNEXPECTED_OPERATION");
  };
  return { calls, records, exists: () => exists, assumeCalls: () => assumeCalls,
    run: () => executeSyntheticTrustProbe({ identity, nonce, now: () => now, call,
      wait: async () => { now += options.clockBack ? -1000 : 15000; if (options.waitFails) throw Error("PRIVATE_SENTINEL"); }, record: state => records.push(state) }) };
}

test("trust probe is inert by default and fixes a deny-all single assumption", async () => {
  assert.equal(syntheticTrustProbePlan().awsCalls, 0);
  assert.throws(() => syntheticTrustProbePlan(["--execute"]));
  const f = fixture(), result = await f.run();
  assert.equal(result.completed, true); assert.equal(result.absentConfirmed, true); assert.equal(f.exists(), false);
  assert.equal(result.assumption, "exact-mfa-trust-assumption-succeeded"); assert.equal(f.assumeCalls(), 1);
  assert.equal(result.normalCalls, 7); assert.equal(result.cleanupCalls, 6);
  assert.equal(f.records[0].stage, "pre-create"); assert.equal(f.records[1].stage, "create-intent");
  const create = f.calls.find(c => c.operation === "create-role")!;
  assert.deepEqual(JSON.parse(create.args[create.args.indexOf("--assume-role-policy-document") + 1]!), trust());
  const assume = f.calls.find(c => c.operation === "assume-role")!;
  assert.deepEqual(JSON.parse(assume.args[assume.args.indexOf("--policy") + 1]!), { Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }] });
  assert.equal(assume.args[assume.args.indexOf("--duration-seconds") + 1], "900");
  assert.match(assume.args[assume.args.indexOf("--query") + 1]!, /Expiration:Credentials.Expiration/);
  assert.doesNotMatch(JSON.stringify(result), /123456789012|PRIVATE_SENTINEL|AROA|arn:aws/);
  assert.equal(f.calls.some(c => /attach|put-role|pass-role|invoke|run-task|export-credentials/.test(c.operation) && c.operation !== "list-attached-role-policies"), false);
});

test("explicit IAM endpoint signs globally while STS stays in the Tokyo workload region", () => {
  assert.deepEqual(syntheticTrustProbeServiceTarget("iam"), { region: "us-east-1", endpoint: "https://iam.amazonaws.com" });
  assert.deepEqual(syntheticTrustProbeServiceTarget("sts"), { region: "ap-northeast-1", endpoint: "https://sts.ap-northeast-1.amazonaws.com" });
  assert.throws(() => syntheticTrustProbeServiceTarget("other" as "iam"));
  const source = readFileSync(new URL("../synthetic-trust-probe.ts", import.meta.url), "utf8");
  assert.match(source, /"--region", target.region/);
  assert.match(source, /"--endpoint-url", target.endpoint/);
});

test("denied MFA trust is not weakened or retried and owned role is removed", async () => {
  const f = fixture({ denied: true }), result = await f.run();
  assert.equal(result.assumption, "denied-not-diagnostic-of-mfa"); assert.equal(f.assumeCalls(), 1);
  assert.equal(result.completed, true); assert.equal(result.absentConfirmed, true);
  assert.equal(f.calls.some(c => c.operation === "update-assume-role-policy"), false);
});

test("ambiguous create and wait failure reconcile owned role without an assumption", async () => {
  for (const options of [{ createLost: true }, { waitFails: true }, { clockBack: true }]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.primaryError, true); assert.equal(result.absentConfirmed, true); assert.equal(f.assumeCalls(), 0); assert.equal(f.exists(), false);
  }
});

test("ambiguous delete requires independent absence; surviving resource is never reported clean", async () => {
  const lost = fixture({ deletionLost: true }), clean = await lost.run(); assert.equal(clean.absentConfirmed, true);
  assert.equal(clean.cleanupCalls, 7);
  const survives = fixture({ deleteSurvives: true }), dirty = await survives.run();
  assert.equal(dirty.absentConfirmed, false); assert.equal(dirty.cleanupError, true); assert.equal(dirty.completed, false);
});

test("pre-delete absence after an ambiguous create stays unverified rather than claiming cleanup", async () => {
  const f = fixture({ createLost: true, createInvisible: true }), result = await f.run();
  assert.equal(result.primaryError, true); assert.equal(result.cleanupError, true); assert.equal(result.absentConfirmed, false);
  assert.equal(f.calls.filter(c => c.cleanup && c.operation === "get-role").length, 3);
  assert.equal(f.calls.some(c => c.operation === "delete-role"), false);
});

test("preexisting or changed resources are never deleted, detached or used", async () => {
  for (const options of [{ collision: true }, { foreignTag: true }, { attached: true }, { listTruncated: true }]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.completed, false); assert.equal(result.absentConfirmed, false); assert.equal(f.assumeCalls(), 0);
    assert.equal(f.calls.some(c => c.operation === "delete-role"), false);
  }
});

test("malformed projected result is suppressed and still cleans its owned role", async () => {
  const f = fixture({ assumeMalformed: true }), result = await f.run();
  assert.equal(result.primaryError, true); assert.equal(result.absentConfirmed, true);
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(f.records), /PRIVATE_SENTINEL|"Credentials":/);
});

test("CLI entry checks runtime and exact local gate; scoped fixed endpoints and no keys on stdout", () => {
  const source = readFileSync(new URL("../synthetic-trust-probe.ts", import.meta.url), "utf8");
  assert.match(source, /assertNodeSecurityBaseline\(\)/); assert.match(source, /reviewOwnerGateReceipt\(/);
  assert.match(source, /AWS_MAX_ATTEMPTS: "1"/); assert.match(source, /timeout: 20000/);
  assert.match(source, /https:\/\/iam.amazonaws.com/); assert.match(source, /https:\/\/sts.ap-northeast-1.amazonaws.com/);
  assert.doesNotMatch(source, /export-credentials|put-role-policy|attach-role-policy|delete-role-policy|console\.log\(.*(?:identity|assumed|stdout)/);
});

test("old runtime fails before CLI validation or any live operation", async () => {
  const version = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  try {
    Object.defineProperty(process.versions, "node", { ...version, value: "24.19.0" });
    await assert.rejects(runSyntheticTrustProbe(), { message: "PROJECT_NODE_SECURITY_BASELINE_REQUIRED" });
  } finally { Object.defineProperty(process.versions, "node", version); }
});

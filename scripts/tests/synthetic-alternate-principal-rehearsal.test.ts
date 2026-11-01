import assert from "node:assert/strict";
import test from "node:test";
import { rehearseSyntheticAlternatePrincipal } from "../synthetic-alternate-principal-rehearsal.js";
import { syntheticAlternatePrincipalSpec } from "../../shared/security/synthetic-alternate-principal.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust } from "../../shared/security/synthetic-lab-policy.js";

const account = "123456789012", nonce = "a".repeat(32), roleId = `AROA${"A".repeat(16)}`, targetId = `AROA${"B".repeat(16)}`;
const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user`, UserId: `AIDA${"A".repeat(17)}` };
const startedAt = "2026-10-31T00:00:00.000Z", start = Date.parse(startedAt);
const spec = syntheticAlternatePrincipalSpec({ account, ownerArn: identity.Arn, nonce, startedAt });
type Faults = { collision?: boolean; createLost?: boolean; invisibleCreate?: boolean; policyLost?: boolean; policySurvives?: boolean;
  deleteLost?: boolean; deleteSurvives?: boolean; policyDeleteLost?: boolean; foreignTag?: boolean; attached?: boolean;
  changedPolicy?: boolean; targetChanged?: boolean; sourceDenied?: boolean; sourceMalformed?: boolean; targetAllowed?: boolean;
  targetError?: boolean; waitFails?: boolean; clockReverse?: boolean; expired?: boolean; listTruncated?: boolean; recordFails?: boolean };
function fixture(faults: Faults = {}) {
  let exists = faults.collision ?? false, policy = false, now = start, sourceAssumptions = 0, targetAttempts = 0, targetReads = 0;
  const calls: Array<{ service: string; operation: string; cleanup: boolean; args: string[] }> = [], records: any[] = [], raw: any[] = [];
  const sourceRole = () => ({ Role: { RoleName: spec.roleName, Arn: spec.roleArn, RoleId: roleId, Path: "/", CreateDate: startedAt,
    MaxSessionDuration: 3600, AssumeRolePolicyDocument: spec.trust,
    Tags: faults.foreignTag ? spec.tags.map(t => t.Key === "ProbeId" ? { ...t, Value: "other" } : t) : spec.tags } });
  const input: Parameters<typeof rehearseSyntheticAlternatePrincipal>[0] = {
    identity, nonce, now: () => now, environment: {},
    wait: async () => { now += faults.clockReverse ? -1000 : faults.expired ? 300000 : 15000; if (faults.waitFails) throw Error("private-wait"); },
    record: state => { records.push(state); if (faults.recordFails && state.stage === "source-policy-verified") throw Error("private-record"); },
    targetRun: (_args, options) => {
      targetAttempts++;
      assert.equal(options.env.AWS_ACCESS_KEY_ID, `ASIA${"A".repeat(16)}`);
      if (faults.targetError) throw Error("private-target");
      return { status: faults.targetAllowed ? 0 : 254, signal: null,
        stdout: faults.targetAllowed ? '{"Credentials":"private-child"}' : "",
        stderr: faults.targetAllowed ? "" : "An error occurred (AccessDenied) when calling the AssumeRole operation: private-denial" };
    },
    call: (service, operation, args, cleanup) => {
      calls.push({ service, operation, args: [...args], cleanup });
      const target = args[args.indexOf("--role-name") + 1] === SYNTHETIC_LAB_ROLE_NAME;
      if (target) {
        assert.equal(cleanup, false); assert.equal(service, "iam");
        if (operation === "get-role") {
          targetReads++;
          const trust = syntheticRoleTrust(identity.Arn, account);
          if (faults.targetChanged && targetReads > 1) trust.Statement[0]!.Principal.AWS = "*";
          return { ok: true, data: { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME, Arn: spec.targetRoleArn, RoleId: targetId, Path: "/",
            MaxSessionDuration: 3600, AssumeRolePolicyDocument: trust } } };
        }
        if (operation === "list-attached-role-policies") return { ok: true, data: { AttachedPolicies: [], IsTruncated: false } };
        if (operation === "list-role-policies") return { ok: true, data: { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false } };
        if (operation === "get-role-policy") return { ok: true, data: { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: syntheticModelPolicy() } };
        throw Error("UNEXPECTED_TARGET_MUTATION");
      }
      if (operation === "get-role") return exists ? { ok: true, data: sourceRole() } : { ok: false, code: "ABSENT" };
      if (operation === "create-role") { exists = !faults.invisibleCreate; return faults.createLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: sourceRole() }; }
      if (operation === "list-attached-role-policies") return { ok: true, data: { AttachedPolicies: faults.attached ? [{}] : [], IsTruncated: false } };
      if (operation === "list-instance-profiles-for-role") return { ok: true, data: { InstanceProfiles: [], IsTruncated: false } };
      if (operation === "list-role-policies") return { ok: true, data: { PolicyNames: policy ? ["OnlyTargetAssumption"] : [], IsTruncated: faults.listTruncated ?? false } };
      if (operation === "put-role-policy") { policy = true; return faults.policyLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
      if (operation === "get-role-policy") {
        const document = structuredClone(spec.permissions);
        if (faults.changedPolicy) document.Statement[0]!.Resource = "*";
        return { ok: true, data: { RoleName: spec.roleName, PolicyName: "OnlyTargetAssumption", PolicyDocument: document } };
      }
      if (operation === "assume-role") {
        sourceAssumptions++;
        assert.equal(args[args.indexOf("--role-arn") + 1], spec.roleArn);
        assert.equal(args[args.indexOf("--policy") + 1], spec.sourceSessionRequest.Policy);
        if (faults.sourceDenied) return { ok: false, code: "DENIED" };
        const value = { Credentials: { AccessKeyId: faults.sourceMalformed ? "invalid" : `ASIA${"A".repeat(16)}`,
          SecretAccessKey: "x".repeat(40), SessionToken: "fixture-only-session", Expiration: new Date(now + 900000).toISOString() }, PackedPolicySize: 4,
          AssumedRoleUser: { Arn: `arn:aws:sts::${account}:assumed-role/${spec.roleName}/${spec.sourceSessionRequest.RoleSessionName}`,
            AssumedRoleId: `${roleId}:${spec.sourceSessionRequest.RoleSessionName}` } };
        raw.push(value); return { ok: true, data: value };
      }
      if (operation === "delete-role-policy") { if (!faults.policySurvives) policy = false;
        return faults.policyDeleteLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
      if (operation === "delete-role") { assert.equal(policy, false); if (!faults.deleteSurvives) exists = false;
        return faults.deleteLost ? { ok: false, code: "UNVERIFIED" } : { ok: true, data: {} }; }
      throw Error("UNEXPECTED_OPERATION");
    },
  };
  return { input, calls, records, raw, exists: () => exists, sourceAssumptions: () => sourceAssumptions, targetAttempts: () => targetAttempts,
    run: () => rehearseSyntheticAlternatePrincipal(input) };
}

test("local rehearsal checks unchanged target, one source assumption and denial then exact source cleanup", async () => {
  const f = fixture(), r = await f.run();
  assert.equal(r.completed, true); assert.equal(r.sourceAbsent, true); assert.equal(f.exists(), false);
  assert.equal(f.sourceAssumptions(), 1); assert.equal(f.targetAttempts(), 1); assert.equal(r.candidateDenialAccepted, true);
  assert.equal(r.modelCalls, 0); assert.equal(r.liveAuthorizationVerified, false); assert.equal(r.targetCleanupOwnedByParent, true);
  assert.ok(r.normalCalls <= 28 && r.cleanupCalls <= 32);
  assert.deepEqual(f.raw[0].Credentials, {});
  assert.doesNotMatch(JSON.stringify(r) + JSON.stringify(f.records), /ASIA|fixture-only|private-|SecretAccessKey/);
  assert.equal(f.calls.filter(c => c.operation === "create-role").length, 1);
  assert.equal(f.calls.filter(c => c.operation === "put-role-policy").length, 1);
  assert.equal(f.calls.some(c => c.operation === "update-assume-role-policy" || c.operation === "attach-role-policy"), false);
});

test("ambiguous source create or policy write still reconciles and deletes owned role", async () => {
  for (const faults of [{ createLost: true }, { policyLost: true }, { waitFails: true }, { clockReverse: true }, { expired: true }, { recordFails: true }]) {
    const f = fixture(faults), r = await f.run();
    assert.equal(r.primaryError, true); assert.equal(r.cleanupError, false); assert.equal(r.sourceAbsent, true);
    assert.equal(f.exists(), false); assert.equal(f.targetAttempts(), 0); assert.equal(f.sourceAssumptions(), 0);
  }
});

test("lost delete acknowledgements need fresh absence and surviving objects remain unverified", async () => {
  for (const faults of [{ deleteLost: true }, { policyDeleteLost: true }]) {
    const f = fixture(faults), r = await f.run(); assert.equal(r.completed, true); assert.equal(r.sourceAbsent, true);
    if (faults.deleteLost) assert.equal(f.calls.filter(c => c.cleanup && c.operation === "get-role").length, 3);
  }
  for (const faults of [{ deleteSurvives: true }, { policySurvives: true }]) {
    const f = fixture(faults), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.sourceAbsent, false);
    assert.equal(r.cleanupError, true); assert.equal(f.exists(), true);
  }
});

test("invisible ambiguous create is not declared absent without ownership and delete evidence", async () => {
  const f = fixture({ createLost: true, invisibleCreate: true }), r = await f.run();
  assert.equal(r.sourceAbsent, false); assert.equal(r.cleanupError, true);
  assert.equal(f.calls.filter(c => c.cleanup && c.operation === "get-role").length, 3);
  assert.equal(f.calls.some(c => c.operation === "delete-role"), false);
});

test("collision, changed ownership or unexpected permissions never authorize detach or deletion", async () => {
  for (const faults of [{ collision: true }, { foreignTag: true }, { attached: true }, { changedPolicy: true }, { listTruncated: true }]) {
    const f = fixture(faults), r = await f.run(); assert.equal(r.completed, false); assert.equal(f.targetAttempts(), 0);
    assert.equal(f.calls.some(c => c.operation.startsWith("delete-") || c.operation.startsWith("detach-")), false);
  }
});

test("source assumption failure never becomes a target-trust denial and still cleans source", async () => {
  for (const faults of [{ sourceDenied: true }, { sourceMalformed: true }]) {
    const f = fixture(faults), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.sourceAbsent, true);
    assert.equal(f.sourceAssumptions(), 1); assert.equal(f.targetAttempts(), 0); assert.equal(r.candidateDenialAccepted, false);
    for (const raw of f.raw) assert.deepEqual(raw.Credentials, {});
  }
});

test("unexpected target allow or transport failure never retries and cleans source", async () => {
  for (const faults of [{ targetAllowed: true }, { targetError: true }]) {
    const f = fixture(faults), r = await f.run(); assert.equal(r.completed, false); assert.equal(r.sourceAbsent, true);
    assert.equal(f.targetAttempts(), 1); assert.equal(f.sourceAssumptions(), 1); assert.equal(r.candidateDenialAccepted, false);
  }
});

test("target trust drift after denial invalidates the whole exercise without modifying target", async () => {
  const f = fixture({ targetChanged: true }), r = await f.run();
  assert.equal(r.completed, false); assert.equal(r.primaryError, true); assert.equal(r.sourceAbsent, true);
  assert.equal(r.candidateDenialAccepted, true); assert.equal(f.targetAttempts(), 1);
  assert.equal(f.calls.some(c => c.operation === "update-assume-role-policy"), false);
});

test("cancellation stops new source activity but preserves cleanup of an already created role", async () => {
  const early = fixture(), stopped = new AbortController(); stopped.abort(); early.input.signal = stopped.signal;
  const first = await early.run(); assert.equal(first.createAttempted, false); assert.equal(early.calls.length, 0);
  const later = fixture(), cancellation = new AbortController(); later.input.signal = cancellation.signal;
  later.input.wait = async () => { cancellation.abort(); };
  const second = await later.run(); assert.equal(second.primaryError, true); assert.equal(second.sourceAbsent, true);
  assert.equal(later.sourceAssumptions(), 0); assert.equal(later.targetAttempts(), 0); assert.equal(later.exists(), false);
});

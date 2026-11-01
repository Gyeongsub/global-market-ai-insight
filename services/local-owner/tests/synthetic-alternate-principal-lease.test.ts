import assert from "node:assert/strict";
import test from "node:test";
import { syntheticAlternatePrincipalSpec } from "../../../shared/security/synthetic-alternate-principal.js";
import { acceptSyntheticAlternatePrincipalLease as accept } from "../src/synthetic-alternate-principal-lease.js";
const specInput = { account: "123456789012", ownerArn: "arn:aws:iam::123456789012:user/aws-admin-user",
  nonce: "a".repeat(32), startedAt: "2026-10-31T00:00:00.000Z" };
const start = Date.parse(specInput.startedAt), roleId = `AROA${"A".repeat(16)}`;
const rejected = { message: "SYNTHETIC_ALTERNATE_PRINCIPAL_CREDENTIALS_REJECTED" };
function fixture() {
  const spec = syntheticAlternatePrincipalSpec(specInput), clock = { now: start + 16000 };
  const snapshot = { role: { Role: { RoleName: spec.roleName, Arn: spec.roleArn, RoleId: roleId, Path: "/", CreateDate: spec.startedAt,
    MaxSessionDuration: 3600, AssumeRolePolicyDocument: spec.trust, Tags: spec.tags } },
    attached: { AttachedPolicies: [], IsTruncated: false }, inlineNames: { PolicyNames: ["OnlyTargetAssumption"], IsTruncated: false },
    inlinePolicy: { RoleName: spec.roleName, PolicyName: "OnlyTargetAssumption", PolicyDocument: spec.permissions },
    profiles: { InstanceProfiles: [], IsTruncated: false } };
  const response = { Credentials: { AccessKeyId: `ASIA${"A".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "fixture-only-session",
    Expiration: new Date(clock.now + 900000).toISOString() }, PackedPolicySize: 4,
    AssumedRoleUser: { Arn: `arn:aws:sts::123456789012:assumed-role/${spec.roleName}/${spec.sourceSessionRequest.RoleSessionName}`,
      AssumedRoleId: `${roleId}:${spec.sourceSessionRequest.RoleSessionName}` } };
  return { input: { specInput, snapshot, assumeStartedAtMs: start + 15000, response, now: () => clock.now }, clock };
}

test("source credentials bind exact role/session and keep the original authorization window", () => {
  const { input, clock } = fixture(), lease = accept(input);
  assert.deepEqual(input.response.Credentials, {}); assert.equal(lease.roleId, roleId);
  assert.equal(lease.getCredentials().accessKeyId, `ASIA${"A".repeat(16)}`);
  assert.doesNotMatch(JSON.stringify(lease), /ASIA|fixture-only|123456789012|secretAccessKey/);
  clock.now = start + 299999; const borrowed = lease.getCredentials();
  clock.now = start + 300000; assert.throws(() => lease.getCredentials(), rejected);
  assert.deepEqual(borrowed, { accessKeyId: "", secretAccessKey: "", sessionToken: "" });
  clock.now = start + 16000; assert.throws(() => lease.getCredentials(), rejected);
  lease.close(); lease.close();
});

test("invalid source credentials, foreign principals and oversized policy cannot acquire a lease", () => {
  for (const mutate of [
    (r: any) => r.AssumedRoleUser.Arn += "-other", (r: any) => r.AssumedRoleUser.AssumedRoleId += "X",
    (r: any) => r.Credentials.AccessKeyId = "invalid", (r: any) => r.Credentials.SecretAccessKey = "invalid",
    (r: any) => r.Credentials.SessionToken = "a\n".repeat(20), (r: any) => r.Credentials.SessionToken = "x".repeat(20001),
    (r: any) => r.Credentials.Expiration = new Date(start + 100000).toISOString(),
    (r: any) => r.Credentials.Expiration = new Date(start + 4000000).toISOString(),
    (r: any) => r.PackedPolicySize = 101, (r: any) => r.PackedPolicySize = -1, (r: any) => r.PackedPolicySize = .5,
  ]) {
    const { input } = fixture(); mutate(input.response); assert.throws(() => accept(input), rejected);
    assert.deepEqual(input.response.Credentials, {});
  }
});

test("slow acquisition, short remaining window and unsafe clocks consume raw keys and fail", () => {
  for (const value of [start + 14999, start + 45001, start + 280000, NaN, Infinity]) {
    const { input, clock } = fixture(); clock.now = value;
    assert.throws(() => accept(input), rejected); assert.deepEqual(input.response.Credentials, {});
  }
  const { input } = fixture(); input.now = () => { throw Error("private-clock"); };
  assert.throws(() => accept(input), rejected); assert.deepEqual(input.response.Credentials, {});
});

test("reversed runtime clock and explicit close invalidate previously borrowed keys", () => {
  for (const mode of ["reverse", "close", "throw"] as const) {
    const { input, clock } = fixture(), lease = accept(input), borrowed = lease.getCredentials();
    if (mode === "reverse") clock.now--;
    if (mode === "close") lease.close();
    if (mode === "throw") input.now = () => { throw Error("private"); };
    assert.throws(() => lease.getCredentials(), rejected); assert.equal(borrowed.sessionToken, "");
    assert.equal(lease.toJSON().credentialsRetained, false);
  }
});

test("invalid snapshot cannot accept otherwise well-shaped credentials", () => {
  const { input } = fixture(); input.snapshot.role.Role.RoleId += "X";
  assert.throws(() => accept(input), rejected); assert.deepEqual(input.response.Credentials, {});
});

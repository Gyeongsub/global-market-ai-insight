import assert from "node:assert/strict";
import test from "node:test";
import { acceptSyntheticRoleCredentials, reviewSyntheticRoleSnapshot, syntheticAssumeRoleRequest } from "../src/synthetic-role-credentials.js";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust, syntheticSessionPolicy } from "../../../shared/security/synthetic-lab-policy.js";

const account = "123456789012", roleId = `AROA${"X".repeat(17)}`;
const ctx = () => ({ account, ownerArn: `arn:aws:iam::${account}:user/aws-admin-user`, nonce: "a".repeat(32),
  startedAtMs: Date.parse("2026-10-26T00:00:00.000Z") });
const roleArn = `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}`;
const sessionName = `gmai-synthetic-${"a".repeat(32)}`;
function snapshot(): any {
  return { role: { Role: { RoleName: SYNTHETIC_LAB_ROLE_NAME, Arn: roleArn, Path: "/", RoleId: roleId,
    MaxSessionDuration: 3600, AssumeRolePolicyDocument: syntheticRoleTrust(ctx().ownerArn, account) } },
  attached: { AttachedPolicies: [], IsTruncated: false }, inlineNames: { PolicyNames: ["TokyoNovaLiteOnly"], IsTruncated: false },
  inlinePolicy: { RoleName: SYNTHETIC_LAB_ROLE_NAME, PolicyName: "TokyoNovaLiteOnly", PolicyDocument: syntheticModelPolicy() } };
}
function response(): any {
  return { Credentials: { AccessKeyId: `ASIA${"X".repeat(16)}`, SecretAccessKey: "x".repeat(40), SessionToken: "synthetic-test-only".repeat(4),
    Expiration: new Date(ctx().startedAtMs + 900000).toISOString() },
  AssumedRoleUser: { Arn: `arn:aws:sts::${account}:assumed-role/${SYNTHETIC_LAB_ROLE_NAME}/${sessionName}`,
    AssumedRoleId: `${roleId}:${sessionName}` }, PackedPolicySize: 24 };
}
const rejected = { message: "SYNTHETIC_ROLE_CREDENTIALS_REJECTED" };

test("restricted-role request fixes principal, session, duration and exact window without fallback", () => {
  const request = syntheticAssumeRoleRequest(ctx());
  assert.deepEqual(Object.keys(request).sort(), ["DurationSeconds", "Policy", "RoleArn", "RoleSessionName"]);
  assert.equal(request.RoleArn, roleArn); assert.equal(request.RoleSessionName, sessionName); assert.equal(request.DurationSeconds, 900);
  assert.deepEqual(JSON.parse(request.Policy), syntheticSessionPolicy("2026-10-26T00:00:00.000Z"));
  assert.ok(request.Policy.length <= 2048);
  for (const value of [{ ...ctx(), account: "000000000000" }, { ...ctx(), ownerArn: "PRIVATE_SENTINEL" },
    { ...ctx(), nonce: "*" }, { ...ctx(), startedAtMs: NaN }]) assert.throws(() => syntheticAssumeRoleRequest(value), rejected);
});

test("fresh role reads must match sole inline restriction and exact MFA trust", () => {
  assert.deepEqual(reviewSyntheticRoleSnapshot(ctx(), snapshot()), { roleArn, roleId });
  const changes: ((s: any) => void)[] = [
    s => { s.role.Role.AssumeRolePolicyDocument.Statement[0].Principal.AWS = "*"; },
    s => { delete s.role.Role.AssumeRolePolicyDocument.Statement[0].Condition.Bool["aws:MultiFactorAuthPresent"]; },
    s => { s.role.Role.Arn += "/other"; }, s => { s.role.Role.Path = "/other/"; },
    s => { s.role.Role.MaxSessionDuration = 43200; }, s => { s.role.Role.PermissionsBoundary = {}; },
    s => { s.attached.AttachedPolicies.push({ PolicyArn: "PRIVATE_SENTINEL" }); },
    s => { s.attached.IsTruncated = true; }, s => { delete s.attached.IsTruncated; },
    s => { s.inlineNames.Marker = "PRIVATE_SENTINEL"; }, s => { s.inlineNames.PolicyNames.push("other"); },
    s => { s.inlinePolicy.PolicyDocument.Statement[0].Resource = "*"; },
    s => { s.inlinePolicy.PolicyDocument.Statement.pop(); }, s => { s.inlinePolicy.RoleName = "other"; },
  ];
  for (const change of changes) { const input = snapshot(); change(input); assert.throws(() => reviewSyntheticRoleSnapshot(ctx(), input), rejected); }
});

test("lease consumes raw keys, serializes only status and clears a borrowed credential reference", () => {
  const raw = response(), lease = acceptSyntheticRoleCredentials(ctx(), roleId, raw, () => ctx().startedAtMs + 1);
  assert.deepEqual(raw.Credentials, {});
  const borrowed = lease.getCredentials(); assert.ok(borrowed.accessKeyId.startsWith("ASIA"));
  assert.doesNotMatch(JSON.stringify(lease), /ASIA|synthetic-test-only|accessKeyId|secretAccessKey|sessionToken/);
  lease.close(); lease.close();
  assert.equal(borrowed.accessKeyId, ""); assert.equal(borrowed.secretAccessKey, ""); assert.equal(borrowed.sessionToken, "");
  assert.throws(() => lease.getCredentials(), rejected); assert.equal(lease.toJSON().usable, false);
});

test("lease ends at five minutes despite fifteen-minute credentials and never refreshes", () => {
  let now = ctx().startedAtMs;
  const lease = acceptSyntheticRoleCredentials(ctx(), roleId, response(), () => now), borrowed = lease.getCredentials();
  now += 299999; assert.equal(lease.toJSON().usable, true);
  now++; assert.throws(() => lease.getCredentials(), rejected); assert.equal(borrowed.sessionToken, "");
  now = ctx().startedAtMs; assert.throws(() => lease.getCredentials(), rejected);
});

test("reversed, invalid or throwing clock permanently clears a lease", () => {
  for (const invalid of [ctx().startedAtMs - 1, NaN, Infinity, -1, "throw"]) {
    let now: number | string = ctx().startedAtMs;
    const lease = acceptSyntheticRoleCredentials(ctx(), roleId, response(), () => { if (now === "throw") throw Error("PRIVATE_SENTINEL"); return now as number; });
    const borrowed = lease.getCredentials(); now = invalid;
    assert.throws(() => lease.getCredentials(), rejected); assert.equal(borrowed.secretAccessKey, "");
  }
});

test("wrong role/session, administrator-like or malformed keys and nonbounded expiry fail without retaining raw keys", () => {
  const changes: ((r: any) => void)[] = [
    r => { r.AssumedRoleUser.Arn = `arn:aws:iam::${account}:user/aws-admin-user`; },
    r => { r.AssumedRoleUser.AssumedRoleId = `${roleId}:different`; },
    r => { r.Credentials.AccessKeyId = `AKIA${"X".repeat(16)}`; },
    r => { r.Credentials.SecretAccessKey = "PRIVATE_SENTINEL"; },
    r => { r.Credentials.SessionToken = "private token\n"; },
    r => { r.Credentials.Expiration = new Date(ctx().startedAtMs + 899000 - 1).toISOString(); },
    r => { r.Credentials.Expiration = new Date(ctx().startedAtMs + 901001).toISOString(); },
    r => { r.Credentials.Expiration = "invalid"; }, r => { r.PackedPolicySize = 101; },
  ];
  for (const change of changes) {
    const input = response(); change(input);
    assert.throws(() => acceptSyntheticRoleCredentials(ctx(), roleId, input, () => ctx().startedAtMs), rejected);
    assert.deepEqual(input.Credentials, {});
  }
  for (const now of [ctx().startedAtMs - 1, ctx().startedAtMs + 30001, NaN]) {
    const input = response(); assert.throws(() => acceptSyntheticRoleCredentials(ctx(), roleId, input, () => now), rejected);
    assert.deepEqual(input.Credentials, {});
  }
  for (const invalid of [{ ...ctx(), ownerArn: "PRIVATE_SENTINEL" }, { ...ctx(), nonce: "*" }]) {
    const input = response(); assert.throws(() => acceptSyntheticRoleCredentials(invalid, roleId, input), rejected);
    assert.deepEqual(input.Credentials, {});
  }
  const input = response();
  assert.throws(() => acceptSyntheticRoleCredentials(ctx(), roleId, input, () => { throw Error("PRIVATE_SENTINEL"); }), rejected);
  assert.deepEqual(input.Credentials, {});
});

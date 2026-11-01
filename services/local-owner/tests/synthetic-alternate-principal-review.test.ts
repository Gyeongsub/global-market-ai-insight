import assert from "node:assert/strict";
import test from "node:test";
import { syntheticAlternatePrincipalSpec } from "../../../shared/security/synthetic-alternate-principal.js";
import { reviewSyntheticAlternatePrincipalOutcome as outcome, reviewSyntheticAlternatePrincipalSnapshot as review } from "../src/synthetic-alternate-principal-review.js";

const input = { account: "123456789012", ownerArn: "arn:aws:iam::123456789012:user/aws-admin-user",
  nonce: "a".repeat(32), startedAt: "2026-10-31T00:00:00.000Z" };
const start = Date.parse(input.startedAt), roleId = `AROA${"A".repeat(16)}`;
function fixture() {
  const spec = syntheticAlternatePrincipalSpec(input);
  return { role: { Role: { RoleName: spec.roleName, Arn: spec.roleArn, RoleId: roleId, Path: "/",
    CreateDate: input.startedAt, MaxSessionDuration: 3600, AssumeRolePolicyDocument: spec.trust, Tags: spec.tags } },
  attached: { AttachedPolicies: [], IsTruncated: false }, inlineNames: { PolicyNames: ["OnlyTargetAssumption"], IsTruncated: false },
  inlinePolicy: { RoleName: spec.roleName, PolicyName: "OnlyTargetAssumption", PolicyDocument: spec.permissions },
  profiles: { InstanceProfiles: [], IsTruncated: false } };
}
const rejected = { message: "SYNTHETIC_ALTERNATE_PRINCIPAL_REJECTED" };

test("fresh exact probe snapshot is a structural prerequisite, never live authorization proof", () => {
  const value = review(input, fixture(), start + 1000);
  assert.equal(value.roleId, roleId); assert.notEqual(value.roleArn, value.targetRoleArn);
  assert.equal(value.authorizationEndsAt, "2026-10-31T00:05:00.000Z");
  assert.equal(value.liveAuthorizationVerified, false);
  assert.equal(review(input, fixture(), start + 299999).roleId, roleId);
});

test("wrong, missing, broad or pre-existing role snapshots cannot arm the probe", () => {
  const changes: Array<(v: any) => void> = [
    v => v.role.Role.Arn += "-other", v => v.role.Role.RoleName += "-other", v => v.role.Role.RoleId = "AROA",
    v => v.role.Role.Path = "/other/", v => v.role.Role.MaxSessionDuration = 43200,
    v => v.role.Role.PermissionsBoundary = {}, v => v.role.Role.CreateDate = "2026-10-30T00:00:00.000Z",
    v => v.role.Role.CreateDate = "2026-11-01T00:00:00.000Z",
    v => v.role.Role.AssumeRolePolicyDocument.Statement[0].Principal.AWS = "*",
    v => delete v.role.Role.AssumeRolePolicyDocument.Statement[0].Condition.Bool["aws:MultiFactorAuthPresent"],
    v => delete v.role.Role.AssumeRolePolicyDocument.Statement[0].Condition.DateLessThan,
    v => v.role.Role.Tags.push({ Key: "other", Value: "private" }), v => v.role.Role.Tags.pop(),
    v => v.role.Role.Tags.push(v.role.Role.Tags[0]), v => v.role.Role.Tags[0] = null,
    v => v.attached.AttachedPolicies.push({ PolicyName: "AdministratorAccess" }),
    v => v.inlineNames.PolicyNames.push("Other"), v => v.profiles.InstanceProfiles.push({}),
    v => v.inlinePolicy.PolicyName = "other", v => v.inlinePolicy.RoleName = "other",
    v => v.inlinePolicy.PolicyDocument.Statement[0].Resource = "*",
    v => v.inlinePolicy.PolicyDocument.Statement[0].Action = "*",
    v => v.inlinePolicy.PolicyDocument.Statement.pop(), v => delete v.role,
  ];
  for (const change of changes) { const value = fixture(); change(value); assert.throws(() => review(input, value, start + 1000), rejected); }
});

test("pagination, missing collections and invalid or expired local time fail closed", () => {
  for (const key of ["attached", "inlineNames", "profiles"] as const) {
    for (const change of [(v: any) => v[key].IsTruncated = true, (v: any) => delete v[key].IsTruncated,
      (v: any) => v[key].Marker = "private", (v: any) => delete v[key]]) {
      const value = fixture(); change(value); assert.throws(() => review(input, value, start + 1000), rejected);
    }
  }
  for (const now of [NaN, Infinity, start - 1, start + 300000, start + .1])
    assert.throws(() => review(input, fixture(), now), rejected);
});

test("only a projected exact STS denial is a candidate pass with no policy attribution", () => {
  const value = outcome({ status: 403, code: "AccessDenied" });
  assert.equal(value.accepted, true); assert.equal(value.disposition, "access-denied");
  assert.equal(value.exactTrustConditionDiagnosed, false); assert.equal(value.liveAuthorizationVerified, false);
  assert.equal(outcome({ status: 200 }).disposition, "unexpected-allow");
  assert.equal(outcome({ status: 200 }).accepted, false);
});

test("expired/signature/throttle/transport failures and unprojected secret bodies are never passes", () => {
  const privateValue = "private-response-sentinel";
  for (const value of [null, [], {}, { status: 403 }, { status: 400, code: "AccessDenied" },
    { status: 200, code: "AccessDenied" }, { status: 403, code: "AccessDeniedException" },
    ...["ExpiredToken", "SignatureDoesNotMatch", "Throttling", "ValidationError"].map(code => ({ status: 403, code })),
    { status: 403, code: "AccessDenied", message: privateValue },
    { status: 200, Credentials: { SessionToken: privateValue } },
    { status: 403, code: "AccessDenied", body: privateValue }]) {
    const result = outcome(value); assert.equal(result.accepted, false);
    assert.equal(result.disposition, "unverified"); assert.doesNotMatch(JSON.stringify(result), new RegExp(privateValue));
  }
});

test("policy key order is immaterial, but extra permission statements are not", () => {
  const value = fixture(), policy = value.inlinePolicy.PolicyDocument;
  value.inlinePolicy.PolicyDocument = { Statement: policy.Statement, Version: policy.Version };
  assert.equal(review(input, value, start + 1000).roleId, roleId);
  policy.Statement.push({ Sid: "UnexpectedCompute", Effect: "Allow", Action: "ecs:RunTask", Resource: "*" });
  assert.throws(() => review(input, value, start + 1000), rejected);
});

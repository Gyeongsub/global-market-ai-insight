import assert from "node:assert/strict";
import test from "node:test";
import { syntheticAlternatePrincipalPlan, syntheticAlternatePrincipalSpec } from "./synthetic-alternate-principal.js";
import { syntheticRoleTrust } from "./synthetic-lab-policy.js";

const account = "123456789012", ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`;
const input = { account, ownerArn, nonce: "a".repeat(32), startedAt: "2026-10-31T00:00:00.000Z" };
const failure = { message: "SYNTHETIC_ALTERNATE_PRINCIPAL_INVALID" };

test("candidate is inert and distinguishes the probe from the existing target principal", () => {
  const p = syntheticAlternatePrincipalPlan(), s = syntheticAlternatePrincipalSpec(input);
  assert.equal(p.awsCalls, 0); assert.equal(p.deploymentExecutable, false);
  assert.equal(p.totalTemporaryRolesIncludingTargetMax, 2);
  assert.equal(p.liveForeignPrincipalDenialVerified, false);
  assert.notEqual(s.roleArn, s.targetRoleArn);
  assert.match(s.targetRoleArn, /:role\/global-market-ai-insight-dev-synthetic-lab$/);
  assert.doesNotMatch(s.targetRoleArn, /principal-/);
  assert.equal(s.maxSessionDuration, 3600);
});

test("source trust retains exact owner, MFA, temporary credentials, TLS and absolute five-minute bounds", () => {
  const s = syntheticAlternatePrincipalSpec(input), trust = s.trust.Statement[0]!;
  assert.deepEqual(trust.Principal, { AWS: ownerArn });
  assert.deepEqual(trust.Condition.Bool, { "aws:SecureTransport": "true", "aws:MultiFactorAuthPresent": "true" });
  assert.deepEqual(trust.Condition.Null, { "aws:TokenIssueTime": "false" });
  assert.equal(trust.Condition.DateGreaterThanEquals["aws:CurrentTime"], input.startedAt);
  assert.equal(Date.parse(s.expiresAt) - Date.parse(input.startedAt), 300000);
  assert.equal(trust.Condition.DateLessThan["aws:CurrentTime"], s.expiresAt);
  const original = syntheticRoleTrust(ownerArn, account);
  assert.equal(original.Statement[0]!.Principal.AWS, ownerArn);
  assert.doesNotMatch(JSON.stringify(original), /gmai-synthetic-principal/);
});

test("probe role and session allow only exact target assumption and no model, compute or role mutation permission", () => {
  const s = syntheticAlternatePrincipalSpec(input);
  assert.deepEqual(s.permissions.Statement.filter(v => v.Effect === "Allow"), [
    { Sid: "OnlyExactTargetAssumption", Effect: "Allow", Action: "sts:AssumeRole", Resource: s.targetRoleArn },
  ]);
  assert.deepEqual(JSON.parse(s.sourceSessionRequest.Policy), s.permissions);
  const statements = s.permissions.Statement as Array<Record<string, any>>;
  assert.equal(statements.find(v => v.Sid === "DenyOtherActions")!.NotAction, "sts:AssumeRole");
  assert.equal(statements.find(v => v.Sid === "DenyOtherTargets")!.NotResource, s.targetRoleArn);
  assert.deepEqual(statements.find(v => v.Sid === "DenyOtherRegions")!.Condition,
    { StringNotEquals: { "aws:RequestedRegion": "ap-northeast-1" } });
  assert.deepEqual(statements.find(v => v.Sid === "DenyInsecureTransport")!.Condition,
    { BoolIfExists: { "aws:SecureTransport": "false" } });
  assert.equal(s.sourceSessionRequest.DurationSeconds, 900);
  assert.equal(s.sourceSessionRequest.RoleArn, s.roleArn);
  assert.ok(s.sourceSessionRequest.Policy.length <= 2048);
  assert.doesNotMatch(s.sourceSessionRequest.Policy, /bedrock:|ecs:|iam:PassRole|iam:Create|ssm:|s3:/);
});

test("unexpected target success is requested with deny-all and is never authority to invoke a model", () => {
  const s = syntheticAlternatePrincipalSpec(input);
  assert.equal(s.targetSessionRequest.RoleArn, s.targetRoleArn);
  assert.equal(s.targetSessionRequest.DurationSeconds, 900);
  assert.deepEqual(JSON.parse(s.targetSessionRequest.Policy), {
    Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }],
  });
  assert.equal(syntheticAlternatePrincipalPlan().returnedTargetCredentialsUsed, false);
});

test("invalid owner, account, nonce and window cannot construct a broader or reusable probe", () => {
  for (const changes of [{ account: "0".repeat(12) }, { account: "999999999999" },
    { ownerArn: `arn:aws:iam::${account}:root` }, { ownerArn: `${ownerArn}-other` },
    { ownerArn: `arn:aws:iam::${account}:role/other` }, { nonce: "A".repeat(32) },
    { nonce: "../private" }, { nonce: "a".repeat(33) }, { startedAt: "not-a-date" },
    { startedAt: "2026-10-31T00:00:00Z" }, { startedAt: "9999-12-31T23:59:59.999Z" },
  ]) assert.throws(() => syntheticAlternatePrincipalSpec({ ...input, ...changes }), failure);
});

test("separate proposals have isolated policy objects and nonce-bound names/tags", () => {
  const first = syntheticAlternatePrincipalSpec(input), second = syntheticAlternatePrincipalSpec({ ...input, nonce: "b".repeat(32) });
  assert.notEqual(first.roleName, second.roleName);
  assert.equal(first.tags.find(v => v.Key === "ProbeId")!.Value, input.nonce);
  first.permissions.Statement.length = 0;
  assert.equal(second.permissions.Statement.length, 7);
  assert.equal(syntheticAlternatePrincipalSpec(input).permissions.Statement.length, 7);
});

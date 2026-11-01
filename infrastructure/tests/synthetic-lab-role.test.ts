import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { SyntheticLabRoleStack } from "../lib/synthetic-lab-role-stack.js";
import { SYNTHETIC_LAB_ROLE_NAME, SYNTHETIC_MODEL_ARN, SYNTHETIC_ROLE_SESSION_SECONDS,
  syntheticModelPolicy, syntheticRoleTrust, syntheticSessionPolicy, validateSyntheticOwner } from "../../shared/security/synthetic-lab-policy.js";
import { SYNTHETIC_LAB } from "../../services/local-owner/src/synthetic-analysis.js";

const account = "123456789012", owner = `arn:aws:iam::${account}:user/aws-admin-user`;

test("candidate synthesizes exactly one role, exact owner/MFA trust and no managed policies", () => {
  const stack = new SyntheticLabRoleStack(new App(), "SyntheticRoleTest", { ownerUserArn: owner, env: { account, region: "ap-northeast-1" } });
  const template = Template.fromStack(stack).toJSON();
  assert.equal(Object.keys(template.Resources).length, 1);
  const role = Object.values(template.Resources)[0] as { Type: string; Properties: Record<string, unknown> };
  assert.equal(role.Type, "AWS::IAM::Role");
  assert.equal(role.Properties.RoleName, SYNTHETIC_LAB_ROLE_NAME);
  assert.equal(role.Properties.MaxSessionDuration, 3600);
  assert.equal(role.Properties.ManagedPolicyArns, undefined);
  assert.deepEqual(role.Properties.AssumeRolePolicyDocument, syntheticRoleTrust(owner, account));
  assert.deepEqual(role.Properties.Policies, [{ PolicyName: "TokyoNovaLiteOnly", PolicyDocument: syntheticModelPolicy() }]);
  const trust = syntheticRoleTrust(owner, account).Statement[0]!;
  assert.deepEqual(trust.Principal, { AWS: owner }); assert.equal(trust.Action, "sts:AssumeRole");
  assert.equal(trust.Condition.Bool["aws:MultiFactorAuthPresent"], "true");
  assert.equal(trust.Condition.Null["aws:TokenIssueTime"], "false");
  assert.doesNotMatch(JSON.stringify(template), /AdministratorAccess|AWS::ECS|AWS::EC2|AWS::Lambda|AWS::S3|AWS::Bedrock|PassRole|TagSession/);
});

test("role policy allows one model action/resource and explicitly restricts other actions/models/regions", () => {
  const policy = syntheticModelPolicy(), allow = policy.Statement.filter(s => s.Effect === "Allow");
  assert.equal(allow.length, 1); assert.equal(allow[0]!.Action, "bedrock:InvokeModel");
  assert.equal(allow[0]!.Resource, `arn:aws:bedrock:${SYNTHETIC_LAB.region}::foundation-model/${SYNTHETIC_LAB.modelId}`);
  assert.equal(SYNTHETIC_MODEL_ARN, allow[0]!.Resource);
  assert.deepEqual(allow[0]!.Condition, { StringEquals: { "aws:RequestedRegion": "ap-northeast-1" }, Bool: { "aws:SecureTransport": "true" } });
  assert.deepEqual(policy.Statement.find(s => s.Sid === "DenyOtherActions"), { Sid: "DenyOtherActions", Effect: "Deny", NotAction: "bedrock:InvokeModel", Resource: "*" });
  assert.deepEqual(policy.Statement.find(s => s.Sid === "DenyOtherModels"), { Sid: "DenyOtherModels", Effect: "Deny", Action: "bedrock:InvokeModel", NotResource: SYNTHETIC_MODEL_ARN });
  assert.equal(policy.Statement.filter(s => s.Effect === "Deny").length, 4);
  assert.doesNotMatch(JSON.stringify(allow), /InvokeModelWithResponseStream|inference-profile|provisioned-model|"Resource":"\*"/);
  policy.Statement[0]!.Resource = "*";
  assert.equal(syntheticModelPolicy().Statement[0]!.Resource, SYNTHETIC_MODEL_ARN);
});

test("session policy retains all restrictions, exact five-minute deny bounds and STS size limit", () => {
  const start = "2026-10-26T00:00:00.000Z", policy = syntheticSessionPolicy(start);
  assert.equal(SYNTHETIC_ROLE_SESSION_SECONDS, 900);
  assert.deepEqual(policy.Statement.slice(0, 5), syntheticModelPolicy().Statement);
  assert.deepEqual(policy.Statement[5], { Sid: "DenyBeforeWindow", Effect: "Deny", Action: "*", Resource: "*", Condition: { DateLessThan: { "aws:CurrentTime": start } } });
  assert.deepEqual(policy.Statement[6], { Sid: "DenyAtOrAfterWindow", Effect: "Deny", Action: "*", Resource: "*", Condition: { DateGreaterThanEquals: { "aws:CurrentTime": "2026-10-26T00:05:00.000Z" } } });
  assert.ok(JSON.stringify(policy).length <= 2048);
  for (const invalid of [null, undefined, "", "2026-02-30T00:00:00.000Z", "2026-10-26", "2026-10-26T00:00:00Z", "9999-12-31T23:59:59.000Z", -1, {}])
    assert.throws(() => syntheticSessionPolicy(invalid), { message: "SYNTHETIC_POLICY_WINDOW_INVALID" });
});

test("unknown, cross-account, root, role and wildcard owners are rejected without reflecting input", () => {
  for (const invalid of [null, "", owner + "\n", owner.replace(account, "210987654321"),
    `arn:aws:iam::${account}:root`, `arn:aws:iam::${account}:role/admin`, `arn:aws:iam::${account}:user/*`, "PRIVATE_SENTINEL"])
    assert.throws(() => validateSyntheticOwner(invalid, account), { message: "SYNTHETIC_POLICY_OWNER_INVALID" });
  for (const invalid of [null, "000000000000", "*", 123456789012])
    assert.throws(() => validateSyntheticOwner(owner, invalid), { message: "SYNTHETIC_POLICY_OWNER_INVALID" });
  assert.throws(() => new SyntheticLabRoleStack(new App(), "BadRegion", { ownerUserArn: owner, env: { account, region: "us-east-1" } }), { message: "SYNTHETIC_POLICY_REGION_INVALID" });
});

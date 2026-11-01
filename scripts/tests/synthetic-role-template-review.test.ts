import assert from "node:assert/strict";
import test from "node:test";
import { App, BootstraplessSynthesizer } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import { SyntheticLabRoleStack } from "../../infrastructure/lib/synthetic-lab-role-stack.js";
import { reviewSyntheticRoleTemplate, reviewSyntheticRoleChangeSet, reviewSyntheticRoleDraftOwnership, syntheticRoleTemplateExpected, syntheticRoleDraftTags } from "../synthetic-role-template-review.js";

const account = "123456789012", ownerArn = `arn:aws:iam::${account}:user/aws-admin-user`, nonce = "a".repeat(32);
const start = Date.parse("2026-10-26T00:00:00.000Z"), name = `gmai-synthetic-role-${nonce}`;
const expected = () => syntheticRoleTemplateExpected(ownerArn, account);
const input = { account, ownerArn, nonce, startedAtMs: start, nowMs: start + 1000,
  stack: { StackId: `arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/test`, StackName: name,
    StackStatus: "REVIEW_IN_PROGRESS", CreationTime: new Date(start).toISOString(), EnableTerminationProtection: false, Tags: syntheticRoleDraftTags(nonce) } };
const change = (): any => ({ ChangeSetName: name, StackName: name, Status: "CREATE_COMPLETE", ExecutionStatus: "AVAILABLE",
  OnStackFailure: "DELETE", Tags: syntheticRoleDraftTags(nonce),
  IncludeNestedStacks: false, Capabilities: ["CAPABILITY_NAMED_IAM"], Parameters: [], CreationTime: new Date(start).toISOString(),
  ChangeSetId: `arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/test`,
  StackId: `arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/test`,
  Changes: [{ Type: "Resource", ResourceChange: { Action: "Add", LogicalResourceId: "SyntheticLabRole", ResourceType: "AWS::IAM::Role" } }] });
const rejected = { message: "SYNTHETIC_ROLE_TEMPLATE_REJECTED" };

test("actual isolated CDK template exactly matches one deletable scoped role without bootstrap/assets", () => {
  const stack = new SyntheticLabRoleStack(new App({ autoSynth: false, analyticsReporting: false }), "RoleReview",
    { ownerUserArn: ownerArn, env: { account, region: "ap-northeast-1" }, synthesizer: new BootstraplessSynthesizer() });
  const template = Template.fromStack(stack).toJSON();
  assert.deepEqual(template, expected());
  const review = reviewSyntheticRoleTemplate(template, ownerArn, account);
  assert.equal(review.iamRoles, 1); assert.equal(review.executionAuthorized, false);
  assert.doesNotMatch(JSON.stringify(review), /123456789012|arn:aws|aws-admin-user/);
});

test("template rejects extra resources, transforms, bootstrap, retain, managed policies and broad trust", () => {
  for (const mutate of [
    (t: any) => { t.Resources.Other = { Type: "AWS::S3::Bucket" }; }, (t: any) => { t.Transform = "AWS::Serverless-2016-10-31"; },
    (t: any) => { t.Parameters = { BootstrapVersion: {} }; }, (t: any) => { t.Resources.SyntheticLabRole.DeletionPolicy = "Retain"; },
    (t: any) => { t.Resources.SyntheticLabRole.UpdateReplacePolicy = "Retain"; },
    (t: any) => { t.Resources.SyntheticLabRole.Properties.ManagedPolicyArns = ["PRIVATE_SENTINEL"]; },
    (t: any) => { t.Resources.SyntheticLabRole.Properties.AssumeRolePolicyDocument.Statement[0].Principal.AWS = "*"; },
    (t: any) => { t.Resources.SyntheticLabRole.Properties.Policies[0].PolicyDocument.Statement[0].Resource = "*"; },
  ]) { const t = expected(); mutate(t); assert.throws(() => reviewSyntheticRoleTemplate(t, ownerArn, account), rejected); }
});

test("proposal review binds owner, one new role, exact IDs, timestamp and completed available CREATE", () => {
  assert.equal(reviewSyntheticRoleChangeSet(change(), expected(), input).createProposalVerified, true);
  for (const mutate of [
    (c: any) => { c.ChangeSetType = "UPDATE"; }, (c: any) => { c.ExecutionStatus = "EXECUTE_COMPLETE"; },
    (c: any) => { c.NextToken = "PRIVATE_SENTINEL"; }, (c: any) => { c.IncludeNestedStacks = true; },
    (c: any) => { c.ImportExistingResources = true; }, (c: any) => { c.RoleARN = "PRIVATE_SENTINEL"; },
    (c: any) => { c.Capabilities.push("CAPABILITY_AUTO_EXPAND"); }, (c: any) => { c.Changes.push(c.Changes[0]); },
    (c: any) => { c.Changes[0].ResourceChange.Action = "Modify"; }, (c: any) => { c.Changes[0].ResourceChange.Replacement = "True"; },
    (c: any) => { c.Changes[0].ResourceChange.PhysicalResourceId = "PRIVATE_SENTINEL"; },
    (c: any) => { c.StackId = c.StackId.replace(account, "210987654321"); },
    (c: any) => { c.ChangeSetName += "other"; }, (c: any) => { c.CreationTime = new Date(start - 1001).toISOString(); },
  ]) { const c = change(); mutate(c); assert.throws(() => reviewSyntheticRoleChangeSet(c, expected(), input), rejected); }
  assert.throws(() => reviewSyntheticRoleChangeSet(change(), expected(), { ...input, nowMs: start + 300001 }), rejected);
  for (const alteration of [{ StackStatus: "UPDATE_COMPLETE" }, { Tags: [{ Key: "ProofId", Value: "foreign" }] }, { EnableTerminationProtection: true }, { RoleARN: "PRIVATE_SENTINEL" }])
    assert.throws(() => reviewSyntheticRoleChangeSet(change(), expected(), { ...input, stack: { ...input.stack, ...alteration } }), rejected);
});

test("AWS untagged placeholder is bound by tagged proposal, template, IDs and timestamps", () => {
  const config = { Mode: "STANDARD", DisableRollback: false };
  const c = { ...change(), DeploymentConfig: config };
  const i = { ...input, stack: { ...input.stack, Tags: [], DeploymentConfig: config } };
  assert.equal(reviewSyntheticRoleChangeSet(c, expected(), i).createProposalVerified, true);
  assert.equal(reviewSyntheticRoleDraftOwnership(c, expected(), i).stackTagsApplied, false);
  for (const patch of [{ Tags: [] }, { Tags: syntheticRoleDraftTags("c".repeat(32)) },
    { DeploymentConfig: { Mode: "EXPRESS", DisableRollback: false } },
    { DeploymentConfig: { Mode: "STANDARD", DisableRollback: true } },
    { DeploymentConfig: { ...config, Unknown: true } }, { StackId: c.StackId + "foreign" }])
    assert.throws(() => reviewSyntheticRoleDraftOwnership({ ...c, ...patch }, expected(), i), rejected);
  assert.throws(() => reviewSyntheticRoleDraftOwnership(c, {}, i), rejected);
  assert.throws(() => reviewSyntheticRoleDraftOwnership(c, expected(), { ...i, stack: { ...i.stack, Tags: undefined } }), rejected);
  assert.throws(() => reviewSyntheticRoleDraftOwnership(c, expected(), { ...i, stack: { ...i.stack, DeploymentConfig: { Mode: "EXPRESS", DisableRollback: false } } }), rejected);
});

test("historical cleanup binding does not turn pending or failed proposals into executable reviews", () => {
  for (const status of ["CREATE_PENDING", "CREATE_IN_PROGRESS", "FAILED"]) {
    const c = { ...change(), Status: status, ExecutionStatus: "UNAVAILABLE", Changes: [] };
    const i = { ...input, nowMs: start + 900000, stack: { ...input.stack, Tags: [] } };
    assert.equal(reviewSyntheticRoleDraftOwnership(c, expected(), i).draftOwnershipVerified, true);
    assert.throws(() => reviewSyntheticRoleChangeSet(c, expected(), i), rejected);
    assert.throws(() => reviewSyntheticRoleDraftOwnership({ ...c, ExecutionStatus: "EXECUTE_COMPLETE" }, expected(), i), rejected);
  }
});

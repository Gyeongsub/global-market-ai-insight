import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { CONTROLLER_POLICY_ID as ID, correctControllerCondition } from "../controller-policy-review.js";
import { controllerDraftArguments, controllerDraftPlan, reviewControllerDraft, reviewControllerDraftCleanup, safeControllerDraftDirectory } from "../controller-change-set-review.js";
const account = "123456789012", prefix = "global-market-ai-insight-dev", name = `gmai-controller-review-${"a".repeat(32)}`;
const started = Date.parse("2026-10-07T06:00:00Z"), now = started + 60_000, roleName = "ControllerRoleTEST";
const table = `arn:aws:dynamodb:ap-northeast-1:${account}:table/${prefix}-jobs`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function fixture() {
  const stack: any = { StackName: `${prefix}-compute`, StackId: `arn:aws:cloudformation:ap-northeast-1:${account}:stack/${prefix}-compute/test`,
    StackStatus: "UPDATE_COMPLETE", DisableRollback: false, RoleARN: `arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-ap-northeast-1`,
    Parameters: [{ ParameterKey: "BootstrapVersion", ParameterValue: "/cdk-bootstrap/hnb659fds/version", ResolvedValue: "30" }], Tags: [{ Key: "Project", Value: "PRIVATE_SENTINEL" }], NotificationARNs: [], RollbackConfiguration: {} };
  const policy: any = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "dynamodb:ConditionCheckItem", Resource: table,
    Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" },
      "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } }] };
  const context = (PolicyDocument: any) => JSON.stringify({ Type: "AWS::IAM::Policy", Properties: { Roles: [roleName], PolicyName: ID, PolicyDocument } });
  const value: any = { StackName: stack.StackName, StackId: stack.StackId, ChangeSetName: name,
    ChangeSetId: `arn:aws:cloudformation:ap-northeast-1:${account}:changeSet/${name}/test`, CreationTime: new Date(started + 1000).toISOString(),
    Status: "CREATE_COMPLETE", ExecutionStatus: "AVAILABLE", IncludeNestedStacks: false, Tags: clone(stack.Tags), NotificationARNs: [],
    RollbackConfiguration: {}, Parameters: [{ ParameterKey: "BootstrapVersion", ParameterValue: "/cdk-bootstrap/hnb659fds/version", ResolvedValue: "30" }], Changes: [{ Type: "Resource", ResourceChange: {
      LogicalResourceId: ID, ResourceType: "AWS::IAM::Policy", Action: "Modify", Replacement: "False", Scope: ["Properties"],
      Details: [{ Evaluation: "Static", ChangeSource: "DirectModification", Target: { Attribute: "Properties", Name: "PolicyDocument", RequiresRecreation: "Never" } }],
      BeforeContext: context(policy), AfterContext: context(correctControllerCondition(policy, table)),
    } }] };
  return { stack, policy, value };
}
const review = (f: ReturnType<typeof fixture>, at = now, since = started) => reviewControllerDraft(f.value, account, name, f.stack, at, since, f.policy, roleName, table);
test("default plan makes zero AWS calls and offers no execution, IAM write or activation capability", () => {
  const p = controllerDraftPlan(); assert.equal(p.awsCalls, 0); assert.equal(p.changeSetsExecuted, 0); assert.equal(p.iamWrites, 0);
  assert.equal(p.noExecutionCapability, true); assert.equal(p.readyForDeployment, false);
  for (const args of [["--execute"], ["--deploy"], ["--enable"], ["--prepare-one-unexecuted-review"]]) assert.throws(() => controllerDraftPlan(args));
  const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-change-set-review.ts")], {
    encoding: "utf8", timeout: 10_000, env: { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_AWS_CLI_PATH: "PRIVATE_SENTINEL" } });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).awsCalls, 0); assert.equal(r.stderr, "");
});
test("exclusive non-replacing policy delta and independently resolved values are accepted without granting execution", () => {
  const f = fixture(), p = review(f); assert.equal(p.exactlyOneIamPolicyModify, true); assert.equal(p.runtimeChanges, 0);
  assert.equal(p.independentlyMatchedBeforeAndAfterPolicy, true); assert.equal(p.changesetExecutionAuthorized, false);
  assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false);
  f.value.Parameters[0].UsePreviousValue = true; review(f);
});
test("partial, stale, nested, different owner/name and changed stack settings are rejected", () => {
  for (const mutate of [
    (f: any) => { f.value.NextToken = "PRIVATE_SENTINEL"; }, (f: any) => { f.value.IncludeNestedStacks = true; },
    (f: any) => { delete f.value.IncludeNestedStacks; }, (f: any) => { f.value.ImportExistingResources = true; },
    (f: any) => { f.value.ParentChangeSetId = "PRIVATE_SENTINEL"; }, (f: any) => { f.value.RootChangeSetId = "PRIVATE_SENTINEL"; },
    (f: any) => { f.value.ChangeSetName += "foreign"; }, (f: any) => { f.value.StackId += "foreign"; },
    (f: any) => { f.value.ChangeSetId = f.value.ChangeSetId.replace(account, "999999999999"); },
    (f: any) => { f.value.Status = "FAILED"; }, (f: any) => { f.value.ExecutionStatus = "EXECUTE_IN_PROGRESS"; },
    (f: any) => { f.value.Tags.push({ Key: "Extra", Value: "PRIVATE_SENTINEL" }); },
    (f: any) => { f.value.NotificationARNs = ["PRIVATE_SENTINEL"]; }, (f: any) => { f.value.RollbackConfiguration.MonitoringTimeInMinutes = 10; },
    (f: any) => { f.value.Parameters[0] = { ParameterKey: "BootstrapVersion", ParameterValue: "999" }; },
    (f: any) => { f.value.Parameters[0].ResolvedValue = "31"; },
    (f: any) => { delete f.value.Parameters[0].ResolvedValue; },
    (f: any) => { f.value.OnStackFailure = "DO_NOTHING"; }, (f: any) => { f.value.DeploymentMode = "REVERT_DRIFT"; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => review(f)); }
  assert.throws(() => review(fixture(), started - 1)); assert.throws(() => review(fixture(), now, now + 1));
  assert.throws(() => review(fixture(), started + 900_002)); assert.throws(() => review(fixture(), NaN));
});
test("extra resource, replacement, metadata and indirect or broad property changes fail closed", () => {
  for (const mutate of [
    (r: any, f: any) => { f.value.Changes.push(clone(f.value.Changes[0])); },
    (r: any) => { r.Replacement = "True"; }, (r: any) => { r.Replacement = "Conditional"; },
    (r: any) => { r.LogicalResourceId = "WorkerTaskDefinition8AD2CCFF"; }, (r: any) => { r.ResourceType = "AWS::IAM::Role"; },
    (r: any) => { r.Action = "Add"; }, (r: any) => { r.Scope.push("Metadata"); }, (r: any) => { r.Details = []; },
    (r: any) => { r.Details[0].Target.Name = "Roles"; }, (r: any) => { r.Details[0].Evaluation = "Dynamic"; },
    (r: any) => { r.Details[0].ChangeSource = "ResourceReference"; }, (r: any) => { r.Details[0].CausingEntity = "PRIVATE_SENTINEL"; },
    (r: any) => { r.Details[0].Target.Path = "/Properties/Roles"; }, (r: any) => { r.Details[0].Target.RequiresRecreation = "Always"; },
  ]) { const f = fixture(); mutate(f.value.Changes[0].ResourceChange, f); assert.throws(() => review(f)); }
});
test("context widening, unknown placeholders and fabricated before-policy do not count as independent proof", () => {
  for (const mutate of [
    (c: any) => { c.Properties.PolicyDocument.Statement[0].Resource = "*"; },
    (c: any) => { delete c.Properties.PolicyDocument.Statement[0].Condition.Null; },
    (c: any) => { c.Properties.Roles.push("foreign"); }, (c: any) => { c.Properties.Users = ["PRIVATE_SENTINEL"]; },
    (c: any) => { c.Metadata = { extra: "PRIVATE_SENTINEL" }; }, (c: any) => { c.Properties.PolicyDocument = "{{changeSet:KNOWN_AFTER_APPLY}}"; },
  ]) { const f = fixture(), r = f.value.Changes[0].ResourceChange, c = JSON.parse(r.AfterContext); mutate(c); r.AfterContext = JSON.stringify(c); assert.throws(() => review(f)); }
  for (const raw of ["{}", "[]", "broken", " ".repeat(200_001), null]) {
    const f = fixture(); f.value.Changes[0].ResourceChange.BeforeContext = raw; assert.throws(() => review(f));
  }
  const f = fixture(); f.policy.Statement[0].Resource += "-foreign"; assert.throws(() => review(f));
});
test("draft arguments preserve exact role, previous bootstrap and settings; cannot create/import/nest/deploy", () => {
  const f = fixture(), args = controllerDraftArguments(name, f.stack, account, resolve("candidate.json"));
  assert.ok(args.includes("UPDATE") && args.includes("--no-include-nested-stacks") && args.includes("--no-import-existing-resources"));
  assert.equal(args[args.indexOf("--role-arn") + 1], f.stack.RoleARN);
  assert.deepEqual(JSON.parse(args[args.indexOf("--parameters") + 1]), [{ ParameterKey: "BootstrapVersion", UsePreviousValue: true }]);
  assert.equal(args.includes("--disable-rollback"), false); assert.equal(args.includes("--template-url"), false);
  for (const mutate of [ (s: any) => { s.RoleARN += "foreign"; }, (s: any) => { s.StackStatus = "UPDATE_IN_PROGRESS"; },
    (s: any) => { s.DisableRollback = true; }, (s: any) => { s.Parameters.push({ ParameterKey: "Other" }); },
    (s: any) => { s.NotificationARNs.push("PRIVATE_SENTINEL"); } ]) {
    const bad = fixture(); mutate(bad.stack); assert.throws(() => controllerDraftArguments(name, bad.stack, account, resolve("candidate.json")));
  }
  assert.throws(() => controllerDraftArguments(name, f.stack, account, "candidate.json"));
});
test("cleanup permits only the exact fresh unexecuted owned draft, including creation ambiguity", () => {
  for (const Status of ["CREATE_PENDING", "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "FAILED", "DELETE_IN_PROGRESS"]) {
    const f = fixture(); f.value.Status = Status; f.value.ExecutionStatus = "UNAVAILABLE";
    assert.equal(reviewControllerDraftCleanup(f.value, account, name, f.stack, now, started), f.value.ChangeSetId);
  }
  for (const ExecutionStatus of ["EXECUTE_IN_PROGRESS", "EXECUTE_COMPLETE", "EXECUTE_FAILED", "OBSOLETE", undefined]) {
    const f = fixture(); f.value.ExecutionStatus = ExecutionStatus;
    assert.throws(() => reviewControllerDraftCleanup(f.value, account, name, f.stack, now, started));
  }
  const f = fixture(); reviewControllerDraftCleanup(f.value, account, name, f.stack, started + 1_000_000, started);
  assert.throws(() => reviewControllerDraftCleanup(f.value, account, name, f.stack, started + 1_140_002, started));
  assert.throws(() => reviewControllerDraftCleanup(f.value, account, name + "foreign", f.stack, now, started));
});
test("physical temporary cleanup is confined to a verified direct child and cannot target root or sibling", () => {
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-controller-review-"));
  try {
    assert.equal(safeControllerDraftDirectory(base, directory, physical), true);
    for (const bad of [base, resolve(base, ".."), resolve("."), directory + "-foreign"])
      assert.equal(safeControllerDraftDirectory(base, bad, physical), false);
    assert.equal(safeControllerDraftDirectory(base, directory, resolve(base, "..")), false);
  } finally {
    assert.equal(safeControllerDraftDirectory(base, directory, physical), true); rmSync(directory, { recursive: true }); assert.equal(existsSync(directory), false);
  }
});

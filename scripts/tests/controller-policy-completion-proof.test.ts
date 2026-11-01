import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { controllerCompletionPlan, reviewControllerCompletion, reviewControllerCompletionHistory } from "../controller-policy-completion-proof.js";
import { correctControllerCondition, CONTROLLER_POLICY_ID as ID } from "../controller-policy-review.js";

const account = "123456789012", prefix = "global-market-ai-insight-dev", region = "ap-northeast-1";
const name = `gmai-controller-review-${"a".repeat(32)}`, now = Date.parse("2026-10-10T11:40:00Z");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture() {
  const table = `arn:aws:dynamodb:${region}:${account}:table/${prefix}-jobs`, role = "synthetic-controller-role";
  const old = { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "dynamodb:ConditionCheckItem", Resource: table,
    Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" },
      "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } }] };
  const policy = correctControllerCondition(old, table);
  const state: any = { t: { account, table, roles: { controller: { name: role } } }, live: { Resources: { synthetic: true } }, policy: { PolicyDocument: policy } };
  const id = `arn:aws:cloudformation:${region}:${account}:changeSet/${name}/synthetic`, stackId = `arn:aws:cloudformation:${region}:${account}:stack/${prefix}-compute/synthetic`;
  const stack: any = { Stacks: [{ StackName: `${prefix}-compute`, StackId: stackId, ChangeSetId: id, StackStatus: "UPDATE_COMPLETE", DisableRollback: false,
    LastUpdatedTime: "2026-10-10T11:39:00Z" }] };
  const context = (document: any) => JSON.stringify({ Type: "AWS::IAM::Policy", Properties: { PolicyName: ID, Roles: [role], PolicyDocument: document } });
  const history: any = { StackId: stackId, StackName: `${prefix}-compute`, ChangeSetId: id, ChangeSetName: name,
    CreationTime: "2026-10-10T11:38:00Z", Status: "CREATE_COMPLETE", ExecutionStatus: "EXECUTE_COMPLETE", IncludeNestedStacks: false,
    Changes: [{ Type: "Resource", ResourceChange: { LogicalResourceId: ID, ResourceType: "AWS::IAM::Policy", Action: "Modify", Replacement: "False", Scope: ["Properties"],
      Details: [{ Evaluation: "Static", ChangeSource: "DirectModification", Target: { Attribute: "Properties", Name: "PolicyDocument", RequiresRecreation: "Never" } }],
      BeforeContext: context(old), AfterContext: context(policy) } }] };
  return { state, stack, history, prepared: { TemplateBody: clone(state.live), StagesAvailable: ["Original"] } };
}

test("default and import perform zero reads and cannot execute, attach, select a target or waive original failure", () => {
  assert.equal(controllerCompletionPlan().awsCalls, 0); assert.equal(controllerCompletionPlan().executionAttempts, 0);
  for (const args of [["--execute"], ["--execute-read-only"], ["--target", "PRIVATE_SENTINEL"], ["--expected-hash", "PRIVATE_SENTINEL"]]) assert.throws(() => controllerCompletionPlan(args));
  const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/controller-policy-completion-proof.ts")],
    { encoding: "utf8", timeout: 10_000, env: { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_AWS_CLI_PATH: "PRIVATE_SENTINEL" } });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).awsCalls, 0); assert.equal(r.stderr, "");
});

test("terminal structural history binds the exact one-condition change without claiming original reconciliation success", () => {
  const f = fixture(), report = reviewControllerCompletionHistory(f.state, f.stack, f.history, f.prepared, now);
  assert.equal(report.exactlyOneUnsupportedConditionRemoved, true); assert.equal(report.originalReconciliationStillIncomplete, true);
  assert.equal(report.fullOriginalBeforeAfterStackSettingsComparisonVerified, false); assert.equal(report.actualWorkloadAuthorizationProven, false);
  assert.equal(report.readyForLiveJobs, false); assert.equal(report.readyForPublication, false);
  assert.equal("reviewedWholeTemplateMatched" in report, false); assert.equal(JSON.stringify(report).includes(account), false);
});

test("a synthetic structural pass cannot pass the fixed independent production candidate digests", () => {
  const f = fixture(); assert.throws(() => reviewControllerCompletion(f.state, f.stack, f.history, f.prepared, now), /REVIEWED_CANDIDATE_UNMATCHED/);
});

test("incomplete, stale, future, foreign, pending and rollback histories fail closed", () => {
  for (const mutate of [(f: any) => { f.stack.Stacks = []; }, (f: any) => { f.stack.NextToken = "private"; },
    (f: any) => { f.stack.Stacks[0].StackStatus = "UPDATE_ROLLBACK_COMPLETE"; }, (f: any) => { f.stack.Stacks[0].DisableRollback = true; },
    (f: any) => { f.stack.Stacks[0].LastUpdatedTime = "2026-10-10T10:00:00Z"; }, (f: any) => { f.stack.Stacks[0].LastUpdatedTime = "2026-10-10T12:00:00Z"; },
    (f: any) => { f.history.CreationTime = "2026-10-10T12:00:00Z"; }, (f: any) => { f.history.ChangeSetId += "foreign"; },
    (f: any) => { f.history.StackId = "foreign"; }, (f: any) => { f.history.ExecutionStatus = "AVAILABLE"; },
    (f: any) => { f.history.IncludeNestedStacks = true; }, (f: any) => { f.history.ImportExistingResources = true; },
    (f: any) => { f.history.NextToken = "private"; }]) {
    const f = fixture(); mutate(f); assert.throws(() => reviewControllerCompletionHistory(f.state, f.stack, f.history, f.prepared, now));
  }
});

test("extra/replacing/dynamic changes and a mismatched prepared whole template are refused", () => {
  for (const mutate of [(f: any) => { f.history.Changes.push(clone(f.history.Changes[0])); },
    (f: any) => { f.history.Changes[0].ResourceChange.Replacement = "True"; }, (f: any) => { f.history.Changes[0].ResourceChange.Action = "Add"; },
    (f: any) => { f.history.Changes[0].ResourceChange.Details[0].Evaluation = "Dynamic"; },
    (f: any) => { f.history.Changes[0].ResourceChange.Details[0].Target.Name = "Roles"; },
    (f: any) => { f.prepared.TemplateBody.Resources.other = true; }]) {
    const f = fixture(); mutate(f); assert.throws(() => reviewControllerCompletionHistory(f.state, f.stack, f.history, f.prepared, now));
  }
});

test("policy widening, missing key/null, foreign attachments and hidden unrelated context deltas cannot count as correction", () => {
  for (const mutate of [(before: any, after: any) => { after.Properties.PolicyDocument.Statement[0].Resource += "-foreign"; },
    (before: any, after: any) => { delete after.Properties.PolicyDocument.Statement[0].Condition.Null; },
    (before: any, after: any) => { after.Properties.PolicyDocument.Statement.push({ Action: "*", Resource: "*", Effect: "Allow" }); },
    (before: any, after: any) => { after.Properties.Roles = ["foreign"]; },
    (before: any, after: any) => { after.Properties.Metadata = "unrelated"; },
    (before: any, after: any) => { before.Properties.PolicyDocument.Statement[0].Condition.Null = {}; }]) {
    const f = fixture(), resource = f.history.Changes[0].ResourceChange;
    const before = JSON.parse(resource.BeforeContext), after = JSON.parse(resource.AfterContext); mutate(before, after);
    resource.BeforeContext = JSON.stringify(before); resource.AfterContext = JSON.stringify(after);
    assert.throws(() => reviewControllerCompletionHistory(f.state, f.stack, f.history, f.prepared, now));
  }
});

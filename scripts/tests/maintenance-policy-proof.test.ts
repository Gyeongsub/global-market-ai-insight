import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { buildMaintenancePolicyValidationDocuments } from "../maintenance-log-diagnostics.js";
import { maintenancePolicyMatrix, maintenancePolicyProofPlan, maintenanceSnapshotReadFingerprint, maintenanceLogPositiveControl, recordMaintenanceSimulation, reviewMaintenanceSimulation } from "../maintenance-policy-proof.js";

const account = ["123456", "789012"].join("");
test("fixed proposed-policy matrix has eleven intended allows and twenty explicit boundary denies", () => {
  const cases = maintenancePolicyMatrix(account);
  assert.equal(cases.length, 31); assert.equal(new Set(cases.map(item => item.name)).size, 31);
  assert.equal(cases.filter(item => item.expected === "allowed").length, 11);
  assert.equal(cases.filter(item => item.expected === "implicitDeny").length, 20);
  for (const item of cases) {
    assert.match(item.name, /^[a-z-]+$/);
    assert.equal(item.context.length, 3);
    assert.deepEqual(item.context.map(value => value.ContextKeyName).sort(), ["dynamodb:EnclosingOperation", "dynamodb:LeadingKeys", "ecs:cluster"].sort());
    assert.ok(item.context.every(value => value.ContextKeyValues.length > 0));
    assert.equal(item.context.find(value => value.ContextKeyName === "dynamodb:EnclosingOperation")?.ContextKeyType, "string");
    assert.doesNotMatch(item.resource, /https:|111111111111/);
  }
  const mixed = cases.find(item => item.name === "cannot-read-mixed-circuit-keys")!;
  assert.deepEqual(mixed.context.find(value => value.ContextKeyName === "dynamodb:LeadingKeys")?.ContextKeyValues, ["control_slot_0", "control_circuit"]);
  for (const value of ["000000000000", "PRIVATE_SENTINEL", "123", "${AWS::AccountId}"]) assert.throws(() => maintenancePolicyMatrix(value));
});
test("proposed simulation policy is resolved from the exact inspected six-statement CDK role", async () => {
  // Share one actual synthesis between the original role assertions and the
  // basic-validator input assertions instead of building an identical second
  // template in a separate test process. Both document scopes remain tested.
  const documents = await buildMaintenancePolicyValidationDocuments(account);
  assert.deepEqual(documents.map(item => item.name), ["complete-proposed-maintenance-policy", "literal-exact-stream-control"]);
  const policy = documents[0]!.policy as any;
  assert.equal(policy.Version, "2012-10-17"); assert.equal(policy.Statement.length, 6);
  assert.doesNotMatch(JSON.stringify(policy), /Fn::|"Ref"|ssm:|bedrock:|ecs:RunTask|iam:PassRole|dynamodb:PutItem/);
  const logs = policy.Statement.find((entry: any) => [entry.Action].flat().includes("logs:PutLogEvents"));
  assert.equal(logs.Resource, `arn:aws:logs:ap-northeast-1:${account}:log-group:/aws/lambda/global-market-ai-insight-dev-maintenance:*:*`);
  assert.deepEqual(documents[1]!.policy, { Version: "2012-10-17", Statement: [{ Effect: "Allow",
    Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: logs.Resource.slice(0, -4) + ":log-stream:synthetic-policy-proof" }] });
  assert.ok(policy.Statement.every((entry: any) => typeof entry.Resource === "string" && entry.Resource !== "*"));
  const check = policy.Statement.find((entry: any) => [entry.Action].flat().includes("dynamodb:ConditionCheckItem"));
  assert.equal(check.Condition["ForAnyValue:StringEquals"], undefined);
  assert.deepEqual(check.Condition["ForAllValues:StringLike"], { "dynamodb:LeadingKeys": ["job_*"] });
  const remove = policy.Statement.find((entry: any) => [entry.Action].flat().includes("dynamodb:DeleteItem"));
  assert.deepEqual(remove.Condition["ForAnyValue:StringEquals"], { "dynamodb:EnclosingOperation": ["TransactWriteItems"] });
});
test("exact single-resource simulation replies pass without exposing proposed ARN or policy", () => {
  for (const item of maintenancePolicyMatrix(account)) {
    const report = reviewMaintenanceSimulation({ IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action, EvalDecision: item.expected,
      ResourceSpecificResults: [{ EvalResourceName: item.resource, EvalResourceDecision: item.expected }] }] }, item);
    assert.deepEqual(report, { case: item.name, expected: item.expected, verified: true });
    assert.doesNotMatch(JSON.stringify(report), /arn:aws:|123456789012/);
  }
});
test("truncation, missing contexts, aggregate-only results or unexpected allow cannot pass", () => {
  const item = maintenancePolicyMatrix(account).find(value => value.name === "cannot-read-provider-secret")!;
  const valid = { IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action, EvalDecision: item.expected,
    ResourceSpecificResults: [{ EvalResourceName: item.resource, EvalResourceDecision: item.expected }] }] };
  for (const mutation of [(input: any) => { input.IsTruncated = true; }, (input: any) => { input.EvaluationResults[0].EvalDecision = "allowed"; },
    (input: any) => { input.EvaluationResults[0].MissingContextValues = ["PRIVATE_SENTINEL"]; },
    (input: any) => { delete input.EvaluationResults[0].ResourceSpecificResults; },
    (input: any) => { input.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName += "other"; },
    (input: any) => { input.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceDecision = "allowed"; }]) {
    const input = structuredClone(valid); mutation(input); assert.throws(() => reviewMaintenanceSimulation(input, item));
  }
});
test("default is zero AWS and execution switches cannot attach a policy or perform work", () => {
  const plan = maintenancePolicyProofPlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.awsCallsMax, 64); assert.equal(plan.proposedPolicySimulationsMax, 31);
  assert.equal(plan.iamWrites, 0); assert.equal(plan.taskStops, 0); assert.equal(plan.policyAttached, false);
  assert.equal(plan.sourceCodeExecutedInCloud, false); assert.equal(plan.simulatorIsLiveAuthorizationProof, false);
  assert.equal(plan.readyForDeployment, false);
  assert.throws(() => maintenancePolicyProofPlan(["--execute"]));
  const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-policy-proof.ts"), "--execute"], { encoding: "utf8", timeout: 10000 });
  assert.notEqual(r.status, 0); assert.equal(r.stdout, ""); assert.doesNotMatch(r.stderr, /arn:aws:|PRIVATE_SENTINEL/);
});
test("a partial matrix keeps mismatch evidence without granting a pass or reflecting private replies", () => {
  const item = maintenancePolicyMatrix(account).find(value => value.name === "create-only-maintenance-stream")!;
  const result = recordMaintenanceSimulation({ PRIVATE_SENTINEL: account }, item);
  assert.deepEqual(result, { case: item.name, expected: "allowed", verified: false, simulatorCoverageVerified: false,
    reason: "LOG_RESOURCE_POSITIVE_CONTROL_UNVERIFIED" });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|arn:aws:|123456789012/);
  assert.equal([result].every(value => value.verified), false);
});
const exactReply = (item: any, decision: string) => ({ IsTruncated: false, EvaluationResults: [{ EvalActionName: item.action,
  EvalDecision: decision, MissingContextValues: [], ResourceSpecificResults: [{ EvalResourceName: item.resource, EvalResourceDecision: decision }] }] });
test("every log allow or denial requires its own exact action-resource positive control", () => {
  const cases = maintenancePolicyMatrix(account).filter(item => item.action.startsWith("logs:")); assert.equal(cases.length, 4);
  for (const item of cases) {
    const reply = exactReply(item, item.expected), positive = exactReply(item, "allowed");
    assert.equal(recordMaintenanceSimulation(reply, item).verified, false);
    assert.equal(recordMaintenanceSimulation(reply, item, exactReply(item, "implicitDeny")).verified, false);
    assert.equal(recordMaintenanceSimulation(reply, item, positive).verified, true);
    const substitute = structuredClone(positive); substitute.EvaluationResults[0].ResourceSpecificResults[0].EvalResourceName = "*";
    assert.equal(recordMaintenanceSimulation(reply, item, substitute).verified, false);
    const missing = structuredClone(positive); missing.EvaluationResults[0].MissingContextValues = ["PRIVATE_SENTINEL"];
    assert.equal(recordMaintenanceSimulation(reply, item, missing).verified, false);
  }
});
test("controls are fixed unattached diagnostics, not broader proposed policy or an arbitrary service", () => {
  for (const item of maintenancePolicyMatrix(account).filter(item => item.action.startsWith("logs:"))) {
    assert.deepEqual(maintenanceLogPositiveControl(item), { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: item.action, Resource: "*" }] });
  }
  const other = maintenancePolicyMatrix(account)[0]; assert.throws(() => maintenanceLogPositiveControl(other));
  assert.throws(() => maintenanceLogPositiveControl({ ...other, action: "logs:*" }));
  assert.throws(() => maintenanceLogPositiveControl({ ...other, name: "private", action: "logs:CreateLogStream" }));
});
test("foreign log denial is unverified when the evaluator rejects even an allow-all control", () => {
  const item = maintenancePolicyMatrix(account).find(item => item.name === "cannot-write-other-log-group")!;
  const denial = exactReply(item, "implicitDeny"), result = recordMaintenanceSimulation(denial, item, denial);
  assert.equal(result.verified, false); assert.equal(result.simulatorCoverageVerified, false);
  assert.equal(JSON.stringify(result).includes(account), false); assert.equal(JSON.stringify(result).includes("arn:"), false);
});
function capturedReads() {
  const keys = ["sts.get-caller-identity", "lambda.get-function-configuration", "budgets.describe-budgets", "cloudformation.describe-stacks",
    "ecs.list-tasks", "ecs.list-tasks", "ecs.list-services", "ecs.describe-task-definition", "dynamodb.get-item", "dynamodb.get-item",
    "dynamodb.get-item", "cloudformation.list-stack-resources", "cloudformation.list-stack-resources", "dynamodb.describe-table"];
  return keys.map((key, n) => ({ args: [...key.split("."), "--synthetic-index", String(n)], value: { private: "PRIVATE_SENTINEL", index: n } }));
}
test("read fingerprint includes Budget, circuit, both slots and both inventories rather than only the last read", () => {
  const captured = capturedReads(), baseline = maintenanceSnapshotReadFingerprint(captured); assert.match(baseline, /^[a-f0-9]{64}$/);
  for (const n of [2, 8, 9, 10, 11, 12]) {
    const changed = structuredClone(captured); changed[n].value.private = "changed";
    assert.notEqual(maintenanceSnapshotReadFingerprint(changed), baseline);
  }
  assert.equal(baseline.includes("PRIVATE_SENTINEL"), false);
});
test("missing, duplicate, unknown and invalid reads cannot become a stable fingerprint", () => {
  const good = capturedReads();
  for (const mutate of [
    (v: any) => { v.pop(); }, (v: any) => { v.push(v[0]); }, (v: any) => { v[10] = structuredClone(v[9]); },
    (v: any) => { v[0].args[0] = "unknown"; }, (v: any) => { v[1].value = null; }, (v: any) => { v[2].value = []; },
    (v: any) => { v[3].args.push(1); },
  ]) { const value = structuredClone(good); mutate(value); assert.throws(() => maintenanceSnapshotReadFingerprint(value)); }
  for (const bad of [null, {}, []]) assert.throws(() => maintenanceSnapshotReadFingerprint(bad));
});

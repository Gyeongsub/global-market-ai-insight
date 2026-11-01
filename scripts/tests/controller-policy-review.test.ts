import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalPatchValue } from "../compute-patch-rollout.js";
import { CONTROLLER_POLICY_ID as ID, correctControllerCondition, controllerCorrectionMatrix, controllerPolicyReviewPlan,
  collectControllerPolicySnapshot, collectAppliedControllerSnapshot, collectRestoredControllerSnapshot, resolveControllerPolicyTemplate, reviewControllerPolicyTemplate,
  reviewAppliedControllerState, reviewUnchangedControllerState, controllerStateDriftDetails } from "../controller-policy-review.js";
import { PATCH } from "../promote-worker-patch.js";
import type { BoundaryTargets } from "../iam-boundary-proof.js";
const PREFIX = "global-market-ai-insight-dev", account = "123456789012", region = "ap-northeast-1";
const table = `arn:aws:dynamodb:${region}:${account}:table/${PREFIX}-jobs`;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const trust = { Version: "2012-10-17", Statement: [] };
const targets: BoundaryTargets = { account, table, cluster: `arn:aws:ecs:${region}:${account}:cluster/${PREFIX}-worker`,
  task: `arn:aws:ecs:${region}:${account}:task-definition/${PREFIX}-worker:9`, secret: "PRIVATE_SENTINEL", model: "PRIVATE_SENTINEL",
  roles: { controller: { name: "ControllerRoleTEST", arn: `arn:aws:iam::${account}:role/ControllerRoleTEST`, policy: ID, trust },
    worker: { name: "WorkerRoleTEST", arn: `arn:aws:iam::${account}:role/WorkerRoleTEST`, policy: "WorkerPolicy", trust },
    execution: { name: "ExecutionRoleTEST", arn: `arn:aws:iam::${account}:role/ExecutionRoleTEST`, policy: "ExecutionPolicy", trust } } };
function document(resource: any = table) {
  return { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "dynamodb:ConditionCheckItem", Resource: resource,
    Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" },
      "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } },
    { Effect: "Allow", Action: "ecs:RunTask", Resource: targets.task, Condition: { ArnEquals: { "ecs:cluster": targets.cluster } } }] };
}
function template() {
  const live: any = { Description: "PRIVATE_SENTINEL", Parameters: {}, Outputs: {}, Resources: {
    [ID]: { Type: "AWS::IAM::Policy", Properties: { PolicyName: ID, Roles: [{ Ref: "ControllerRole10B665F1" }], PolicyDocument: document(table) } },
    ControllerFunctionC25B79B1: { Type: "AWS::Lambda::Function", Properties: { Code: { S3Key: "PRIVATE_SENTINEL" }, Environment: { Variables: {
      ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", WORKER_TASK_DEFINITION: { Ref: "WorkerTaskDefinition8AD2CCFF" } } } } },
    WorkerTaskDefinition8AD2CCFF: { Type: "AWS::ECS::TaskDefinition", Properties: { Cpu: "256", ContainerDefinitions: [{
      Image: "PRIVATE_SENTINEL", User: "65532:65532", ReadonlyRootFilesystem: true }] } },
  } };
  for (let n = 0; n < 23; n++) live.Resources[`Fixed${n}`] = { Type: "AWS::Logs::LogGroup", Properties: { RetentionInDays: 7 } };
  const proposed = clone(live); proposed.Resources[ID].Properties.PolicyDocument = correctControllerCondition(document(), table);
  return { live, proposed };
}
test("correction plan has zero AWS calls and no generic mutation/enable flags", () => {
  const plan = controllerPolicyReviewPlan(); assert.equal(plan.awsCalls, 0); assert.equal(plan.iamWrites, 0); assert.equal(plan.readyForDeployment, false);
  for (const args of [["--execute"], ["--deploy"], ["--enable-jobs"], ["PRIVATE_SENTINEL"]]) assert.throws(() => controllerPolicyReviewPlan(args));
});
test("one unsupported condition is removed without changing the input or another statement", () => {
  const before = document(), original = canonicalPatchValue(before), after = correctControllerCondition(before, table);
  assert.equal(canonicalPatchValue(before), original); assert.deepEqual(after.Statement[1], before.Statement[1]);
  assert.deepEqual(after.Statement[0].Condition, { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" } });
  assert.throws(() => correctControllerCondition(after, table));
});
test("wrong action/resource/key/missing null, extra condition and duplicate statement fail closed", () => {
  for (const mutate of [
    (d: any) => { d.Statement[0].Resource = "*"; }, (d: any) => { d.Statement[0].Action = ["dynamodb:ConditionCheckItem"]; },
    (d: any) => { d.Statement[0].Condition.Null = {}; }, (d: any) => { d.Statement[0].Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"].push("job_*"); },
    (d: any) => { d.Statement[0].Condition.StringEquals = { private: "PRIVATE_SENTINEL" }; },
    (d: any) => { d.Statement.push(clone(d.Statement[0])); }, (d: any) => { d.Statement[0].Effect = "Deny"; },
    (d: any) => { d.Statement[0].Sid = "unexpected"; },
  ]) { const d = document(); mutate(d); assert.throws(() => correctControllerCondition(d, table)); }
  for (const bad of [null, [], {}, { Version: "2012-10-17", Statement: [] }]) assert.throws(() => correctControllerCondition(bad, table));
});
test("exclusive correction keeps every code/image/trust/network/export byte unchanged", () => {
  const { live, proposed } = template(), result = reviewControllerPolicyTemplate(live, proposed, table);
  assert.equal(result.exactlyOnePolicyConditionRemoval, true); assert.equal(result.runtimeCodeAndImageUnchanged, true);
  assert.equal(result.readyForDeployment, false); assert.equal(result.circuitWriteGrantAdded, false);
  assert.equal(JSON.stringify(result).includes("PRIVATE_SENTINEL"), false);
});
test("all non-policy deltas including metadata, code, network, enablement and deletion are refused", () => {
  for (const mutate of [
    (t: any) => { t.Description = "changed"; }, (t: any) => { t.Outputs.Extra = { Value: "PRIVATE_SENTINEL" }; },
    (t: any) => { t.Resources.ControllerFunctionC25B79B1.Properties.Code.S3Key = "changed"; },
    (t: any) => { t.Resources.WorkerTaskDefinition8AD2CCFF.Properties.ContainerDefinitions[0].Image = "changed"; },
    (t: any) => { t.Resources.Fixed0.DeletionPolicy = "Retain"; }, (t: any) => { t.Resources.Fixed0.Metadata = { changed: true }; },
    (t: any) => { t.Resources[ID].Properties.Roles.push({ Ref: "other" }); },
    (t: any) => { t.Resources.ControllerFunctionC25B79B1.Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true"; },
    (t: any) => { delete t.Resources.Fixed0; }, (t: any) => { t.Resources.Extra = { Type: "AWS::ECS::Service" }; },
    (t: any) => { t.Resources[ID].Properties.PolicyDocument.Statement.push({ Effect: "Allow", Action: "iam:*", Resource: "*" }); },
  ]) { const input = template(); mutate(input.proposed); assert.throws(() => reviewControllerPolicyTemplate(input.live, input.proposed, table)); }
});
test("proposed matrix retains every controller boundary and adds four control/table denials", () => {
  const cases = controllerCorrectionMatrix(targets); assert.equal(cases.length, 15);
  assert.equal(cases.filter(c => c.expected === "allowed").length, 4);
  assert.equal(cases.filter(c => c.expected === "implicitDeny").length, 11);
  assert.ok(cases.every(c => c.role === "controller" && c.context.length === 4));
  assert.equal(new Set(cases.map(c => c.name)).size, 15);
});
function resolution() {
  const live = template().live, key = `${PREFIX}-foundation:TableArn`;
  const d: any = document({ "Fn::ImportValue": key });
  d.Statement[1].Resource = { Ref: "WorkerTaskDefinition8AD2CCFF" };
  d.Statement[1].Condition.ArnEquals["ecs:cluster"] = { "Fn::GetAtt": ["ClusterTEST", "Arn"] };
  d.Statement.push({ Effect: "Allow", Action: "iam:PassRole", Resource: [{ "Fn::GetAtt": ["ControllerRole10B665F1", "Arn"] }] });
  d.Statement.push({ Effect: "Allow", Action: "logs:PutLogEvents", Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": ["LogsTEST", "Arn"] }, ":*"]] } });
  live.Resources[ID].Properties.PolicyDocument = d;
  const entry = (LogicalResourceId: string, ResourceType: string, PhysicalResourceId: string) => ({ LogicalResourceId, ResourceType, PhysicalResourceId, ResourceStatus: "CREATE_COMPLETE" });
  const compute: any = { StackResourceSummaries: [entry("WorkerTaskDefinition8AD2CCFF", "AWS::ECS::TaskDefinition", targets.task),
    entry("ClusterTEST", "AWS::ECS::Cluster", `${PREFIX}-worker`), entry("ControllerRole10B665F1", "AWS::IAM::Role", targets.roles.controller.name),
    entry("LogsTEST", "AWS::Logs::LogGroup", `/aws/lambda/${PREFIX}-controller`)] };
  const foundationResources: any = { StackResourceSummaries: [entry("TableTEST", "AWS::DynamoDB::Table", `${PREFIX}-jobs`)] };
  const foundation: any = { Outputs: { Table: { Value: { "Fn::GetAtt": ["TableTEST", "Arn"] }, Export: { Name: key } } } };
  return { live, foundation, compute, foundationResources };
}
test("intrinsics resolve only owned exact table/task/cluster/role/log references", () => {
  const v = resolution(), r = resolveControllerPolicyTemplate(v.live, v.foundation, v.compute, v.foundationResources, targets);
  assert.equal(r.Statement[0].Resource, table); assert.equal(r.Statement[1].Resource, targets.task);
  assert.equal(r.Statement[1].Condition.ArnEquals["ecs:cluster"], targets.cluster);
  assert.ok(r.Statement[3].Resource.endsWith(`log-group:/aws/lambda/${PREFIX}-controller:*:*`));
});
test("unknown import, partial inventory, wrong ownership and unresolved intrinsic cannot be guessed", () => {
  for (const mutate of [
    (v: any) => { v.compute.NextToken = "PRIVATE_SENTINEL"; },
    (v: any) => { v.compute.StackResourceSummaries.push(clone(v.compute.StackResourceSummaries[0])); },
    (v: any) => { v.foundationResources.StackResourceSummaries[0].PhysicalResourceId += "-foreign"; },
    (v: any) => { v.foundation.Outputs.Table.Value = { "Fn::GetAtt": ["TableTEST", "Other"] }; },
    (v: any) => { v.live.Resources[ID].Properties.PolicyDocument.Statement[0].Resource = { "Fn::ImportValue": "foreign:Table" }; },
    (v: any) => { v.live.Resources[ID].Properties.PolicyDocument.Statement[0].Resource = { "Fn::Sub": "PRIVATE_SENTINEL" }; },
    (v: any) => { v.compute.StackResourceSummaries[0].ResourceStatus = "DELETE_IN_PROGRESS"; },
  ]) { const v = resolution(); mutate(v); assert.throws(() => resolveControllerPolicyTemplate(v.live, v.foundation, v.compute, v.foundationResources, targets)); }
});

function privateSnapshotFixture(version = 11) {
  const live: any = { Description: "PRIVATE_SENTINEL", Resources: {}, Outputs: {}, Parameters: {} };
  const roles: any = {}, summaries: any[] = [];
  const entry = (LogicalResourceId: string, ResourceType: string, PhysicalResourceId: string) => ({ LogicalResourceId, ResourceType, PhysicalResourceId, ResourceStatus: "UPDATE_COMPLETE" });
  for (const [kind, logical, policy, principal] of [
    ["controller", "ControllerRole10B665F1", ID, "lambda.amazonaws.com"],
    ["worker", "WorkerTaskRoleAABBCCDD", "WorkerPolicy", "ecs-tasks.amazonaws.com"],
    ["execution", "WorkerExecutionRoleAABBCCDD", "ExecutionPolicy", "ecs-tasks.amazonaws.com"],
  ]) {
    const name = `${kind}RoleTEST`, arn = `arn:aws:iam::${account}:role/${name}`;
    const trust = { Version: "2012-10-17", Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: principal } }] };
    roles[kind] = { logical, name, arn, trust };
    live.Resources[logical] = { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: trust } };
    live.Resources[policy] = { Type: "AWS::IAM::Policy", Properties: { PolicyName: policy, Roles: [{ Ref: logical }], PolicyDocument: document(table) } };
    summaries.push(entry(logical, "AWS::IAM::Role", name), entry(policy, "AWS::IAM::Policy", `opaque-${kind}-policy`));
  }
  const c = { FunctionName: `${PREFIX}-controller`, FunctionArn: `arn:aws:lambda:${region}:${account}:function:${PREFIX}-controller`,
    State: "Active", LastUpdateStatus: "Successful", Role: roles.controller.arn, CodeSha256: "PRIVATE_SENTINEL", Environment: { Variables: {
      MAX_ACTIVE_JOBS: "2", JOBS_TABLE_NAME: `${PREFIX}-jobs`, WORKER_CLUSTER: targets.cluster, WORKER_TASK_DEFINITION: targets.task,
      ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false" } } };
  live.Resources.ControllerFunctionC25B79B1 = { Type: "AWS::Lambda::Function", Properties: { FunctionName: c.FunctionName,
    Role: { "Fn::GetAtt": [roles.controller.logical, "Arn"] }, Environment: c.Environment } };
  const container = { image: `${account}.dkr.ecr.${region}.amazonaws.com/${PREFIX}-worker@${PATCH.runtimeDigest}`,
    user: "65532:65532", readonlyRootFilesystem: true, secrets: [{ name: "TWELVE_DATA_API_KEY", valueFrom:
      `arn:aws:ssm:${region}:${account}:parameter/global-market-ai-insight/dev/market-data/api-key` }],
    environment: [{ name: "BEDROCK_MODEL_ID", value: "amazon.nova-lite-v1:0" }] };
  live.Resources.WorkerTaskDefinition8AD2CCFF = { Type: "AWS::ECS::TaskDefinition", Properties: { Family: `${PREFIX}-worker`,
    TaskRoleArn: { "Fn::GetAtt": [roles.worker.logical, "Arn"] }, ExecutionRoleArn: { "Fn::GetAtt": [roles.execution.logical, "Arn"] },
    ContainerDefinitions: [{ User: "65532:65532", ReadonlyRootFilesystem: true }] } };
  live.Resources.ClusterTEST = { Type: "AWS::ECS::Cluster" };
  summaries.push(entry("ControllerFunctionC25B79B1", "AWS::Lambda::Function", c.FunctionName),
    entry("WorkerTaskDefinition8AD2CCFF", "AWS::ECS::TaskDefinition", targets.task), entry("ClusterTEST", "AWS::ECS::Cluster", `${PREFIX}-worker`));
  while (Object.keys(live.Resources).length < 26) live.Resources[`Fixed${Object.keys(live.Resources).length}`] = { Type: "AWS::Logs::LogGroup" };
  const controllerPolicy = live.Resources[ID].Properties.PolicyDocument;
  const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user` };
  const task = { taskDefinition: { taskDefinitionArn: targets.task, taskRoleArn: roles.worker.arn, executionRoleArn: roles.execution.arn, containerDefinitions: [container] } };
  const circuit = { Item: { jobId: { S: "control_circuit" }, state: { S: "OPEN" }, version: { N: String(version) } } };
  const budgets = { Budgets: [{ BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: "5", Unit: "USD" },
    CalculatedSpend: { ActualSpend: { Amount: "0", Unit: "USD" }, ForecastedSpend: { Amount: "0.01", Unit: "USD" } } }] };
  const readCalls: string[] = [], queryCalls: string[] = [];
  const read = (args: readonly string[]): unknown => {
    const key = args.slice(0, 2).join("."); readCalls.push(key);
    if (key === "sts.get-caller-identity") return identity;
    if (key === "lambda.get-function-configuration") return c;
    if (key === "budgets.describe-budgets") return budgets;
    if (key === "cloudformation.describe-stacks") return { Stacks: ["foundation", "compute", "api"].map(n => ({ StackName: `${PREFIX}-${n}`, StackStatus: "UPDATE_COMPLETE" })) };
    if (key === "ecs.list-tasks") return { taskArns: [] };
    if (key === "ecs.list-services") return { serviceArns: [] };
    if (key === "ecs.describe-task-definition") return task;
    if (key === "dynamodb.get-item") return args.includes(JSON.stringify({ jobId: { S: "control_circuit" } })) ? circuit : {};
    if (key === "cloudformation.list-stack-resources") return { StackResourceSummaries: args.includes(`${PREFIX}-foundation`)
      ? [entry("TableTEST", "AWS::DynamoDB::Table", `${PREFIX}-jobs`)] : summaries };
    if (key === "dynamodb.describe-table") return { Table: { TableName: `${PREFIX}-jobs`, TableArn: table, TableStatus: "ACTIVE",
      BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" }, KeySchema: [{ AttributeName: "jobId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "jobId", AttributeType: "S" }] } };
    throw Error("UNEXPECTED_READ");
  };
  const query = (service: string, action: string, extra: string[]) => {
    const key = `${service}.${action}`; queryCalls.push(key);
    if (key === "cloudformation.get-template") return { TemplateBody: extra.includes(`${PREFIX}-compute`) ? live : { Resources: {}, Outputs: {} }, StagesAvailable: ["Original"] };
    if (key === "iam.get-role") return { Role: { RoleName: roles.controller.name, Arn: roles.controller.arn, Path: "/", AssumeRolePolicyDocument: roles.controller.trust } };
    if (key === "iam.list-role-policies") return { PolicyNames: [ID], IsTruncated: false };
    if (key === "iam.list-attached-role-policies") return { AttachedPolicies: [], IsTruncated: false };
    if (key === "iam.get-role-policy") return { RoleName: roles.controller.name, PolicyName: ID, PolicyDocument: controllerPolicy };
    throw Error("UNEXPECTED_QUERY");
  };
  return { read, query, readCalls, queryCalls, budgets, controllerPolicy, circuit, live };
}
test("private snapshot binds fourteen original reads and six independent template/role reads", () => {
  const f = privateSnapshotFixture(), s = collectControllerPolicySnapshot(f.read, f.query);
  assert.equal(f.readCalls.length, 14); assert.equal(f.queryCalls.length, 6);
  assert.equal(s.report.exactlyOnePolicyConditionRemoval, true); assert.equal(s.t.roles.controller.name, "controllerRoleTEST");
  assert.match(s.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(s.report).includes("PRIVATE_SENTINEL"), false);
});
test("an OPEN version change is retained even though later empty slot reads occur", () => {
  const a = privateSnapshotFixture(11), b = privateSnapshotFixture(12);
  const first = collectControllerPolicySnapshot(a.read, a.query), second = collectControllerPolicySnapshot(b.read, b.query);
  assert.notEqual(first.fingerprint, second.fingerprint);
  const c = privateSnapshotFixture(); c.budgets.Budgets[0].CalculatedSpend.ForecastedSpend.Amount = "0.02";
  assert.notEqual(first.fingerprint, collectControllerPolicySnapshot(c.read, c.query).fingerprint);
});
test("unknown raw responses, attached-policy drift and mixed ownership cannot become a snapshot proof", () => {
  const f = privateSnapshotFixture(); assert.throws(() => collectControllerPolicySnapshot(() => null, f.query));
  const g = privateSnapshotFixture(), query = g.query;
  assert.throws(() => collectControllerPolicySnapshot(g.read, (service, action, extra) => {
    const r: any = query(service, action, extra);
    if (action === "get-role-policy") r.PolicyDocument = { ...r.PolicyDocument, Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] };
    return r;
  }), /ATTACHED_POLICY_DRIFT/);
});

function appliedFixture() {
  const f = privateSnapshotFixture(), before = collectControllerPolicySnapshot(f.read, f.query);
  f.live.Resources[ID].Properties.PolicyDocument = clone(before.proposed.Resources[ID].Properties.PolicyDocument);
  const query = (service: string, action: string, args: string[]) => {
    const value: any = f.query(service, action, args);
    if (action === "get-role-policy") return { ...value, PolicyDocument: clone(before.proposedPolicy) };
    return value;
  };
  return { f, before, query };
}
test("applied snapshot independently matches corrected attached policy and exact unchanged runtime", () => {
  const { f, before, query } = appliedFixture(), result = collectAppliedControllerSnapshot(f.read, query, before);
  assert.equal(result.report.exactAppliedPolicyVerified, true); assert.equal(result.report.readyForLiveJobs, false);
  assert.equal(f.readCalls.length, 28); assert.equal(f.queryCalls.length, 12);
  assert.equal(JSON.stringify(result.report).includes("PRIVATE_SENTINEL"), false);
});
test("post-update allow widening, incomplete attached policy and extra template delta fail closed", () => {
  for (const mode of ["policy", "template", "original-policy"]) {
    const { f, before, query } = appliedFixture();
    if (mode === "template") f.live.Description = "changed";
    const q = (s: string, a: string, args: string[]) => {
      const v: any = query(s, a, args);
      if (a === "get-role-policy" && mode === "policy") v.PolicyDocument.Statement.push({ Effect: "Allow", Action: "*", Resource: "*" });
      if (a === "get-role-policy" && mode === "original-policy") v.PolicyDocument = before.policy.PolicyDocument;
      return v;
    };
    assert.throws(() => collectAppliedControllerSnapshot(f.read, q, before));
  }
});
test("post-update circuit version, runtime code, foreign stack and budget settings drift are not normalized away", () => {
  for (const mode of ["circuit", "code", "foreign-stack", "budget-limit"]) {
    const { f, before, query } = appliedFixture();
    const read = (args: readonly string[]) => {
      const v: any = clone(f.read(args));
      if (mode === "circuit" && v.Item?.jobId?.S === "control_circuit") v.Item.version.N = "12";
      if (mode === "code" && args[0] === "lambda") v.CodeSha256 = "changed";
      if (mode === "foreign-stack" && args[1] === "describe-stacks") v.Stacks[0].LastUpdatedTime = "changed";
      if (mode === "budget-limit" && args[0] === "budgets") v.Budgets[0].BudgetLimit.Amount = "6";
      return v;
    };
    assert.throws(() => collectAppliedControllerSnapshot(read, query, before), mode === "budget-limit" ? /MAINTENANCE_CORE_NOT_READY/ : /POST_UPDATE_DRIFT/);
  }
});
test("natural spend refresh and exact owned policy update timestamp do not authorize settings drift", () => {
  const { f, before, query } = appliedFixture();
  const read = (args: readonly string[]) => {
    const v: any = clone(f.read(args));
    if (args[0] === "budgets") v.Budgets[0].CalculatedSpend.ForecastedSpend.Amount = "0.02";
    if (args[1] === "describe-stacks") { v.Stacks[1].LastUpdatedTime = "new-time"; v.Stacks[1].ChangeSetId = "new-id"; }
    if (args[1] === "list-stack-resources" && args.includes(`${PREFIX}-compute`)) {
      const policy = v.StackResourceSummaries.find((x: any) => x.LogicalResourceId === ID); policy.LastUpdatedTimestamp = "new-time";
    }
    return v;
  };
  assert.equal(collectAppliedControllerSnapshot(read, query, before).report.onlyOneConditionRemoved, true);
});

test("applied drift retains all six exact comparison scopes without leaking snapshot values", () => {
  for (const scope of ["compute-template", "attached-policy", "resource-targets", "foundation-template", "controller-role", "captured-read-state"]) {
    // Independent captures must not share the in-memory fixture's object refs.
    const { f, before, query } = appliedFixture(), after = clone(collectAppliedControllerSnapshot(f.read, query, before));
    if (scope === "compute-template") before.proposed.Description = "CHANGED_PRIVATE_SENTINEL";
    if (scope === "attached-policy") before.proposedPolicy.privateTest = "PRIVATE_SENTINEL";
    if (scope === "resource-targets") before.t.secret = "CHANGED_PRIVATE_SENTINEL";
    if (scope === "foundation-template") before.foundation.Description = "PRIVATE_SENTINEL";
    if (scope === "controller-role") before.role.Description = "PRIVATE_SENTINEL";
    if (scope === "captured-read-state") before.captured.privateTest = "PRIVATE_SENTINEL";
    assert.throws(() => reviewAppliedControllerState(before, after), error => {
      const d = controllerStateDriftDetails(error);
      assert.deepEqual(d, { changedScopes: [scope], fullStateComparisonPassed: false });
      assert.equal(JSON.stringify(d).includes("PRIVATE_SENTINEL"), false);
      assert.equal((error as Error).message, "CONTROLLER_POLICY_POST_UPDATE_DRIFT"); return true;
    });
  }
});

test("original-state drift reports multiple fixed scopes and never normalizes away unknown properties", () => {
  const f = privateSnapshotFixture(), before = collectControllerPolicySnapshot(f.read, f.query), current = clone(before);
  current.t.secret = "CHANGED_PRIVATE_SENTINEL"; current.role.PrivateUnknown = "PRIVATE_SENTINEL";
  current.captured.PrivateUnknown = "PRIVATE_SENTINEL";
  assert.throws(() => reviewUnchangedControllerState(before, current), error => {
    assert.deepEqual(controllerStateDriftDetails(error), { changedScopes: ["resource-targets", "controller-role", "captured-read-state"], fullStateComparisonPassed: false });
    assert.equal((error as Error).message, "CONTROLLER_POLICY_ORIGINAL_STATE_DRIFT"); return true;
  });
  assert.equal(controllerStateDriftDetails(new Error("CONTROLLER_POLICY_POST_UPDATE_DRIFT")), null);
  assert.equal(controllerStateDriftDetails({ changedScopes: ["PRIVATE_SENTINEL"] }), null);
});
test("rollback verification is bound to exact original policy and terminal owned stack, never release approval", () => {
  const f = privateSnapshotFixture(), before = collectControllerPolicySnapshot(f.read, f.query);
  const terminal = { StackName: `${PREFIX}-compute`, StackId: `arn:aws:cloudformation:${region}:${account}:stack/${PREFIX}-compute/test`,
    StackStatus: "UPDATE_ROLLBACK_COMPLETE", LastUpdatedTime: "new-time" };
  // Add the stable StackId to both original and restored observations.
  for (const item of before.captured.reads) if (item.args[1] === "describe-stacks")
    item.value.Stacks[1].StackId = terminal.StackId;
  const read = (args: readonly string[]) => {
    const v: any = clone(f.read(args)); if (args[1] === "describe-stacks") v.Stacks[1] = clone(terminal); return v;
  };
  const p = collectRestoredControllerSnapshot(read, f.query, before, terminal);
  assert.equal(p.originalPolicyRestored, true); assert.equal(p.readyForDeployment, false);
  for (const change of [{ StackId: terminal.StackId + "foreign" }, { StackStatus: "UPDATE_COMPLETE" }, { StackName: "foreign" }])
    assert.throws(() => collectRestoredControllerSnapshot(read, f.query, before, { ...terminal, ...change }));
  const changed = (args: readonly string[]) => { const v: any = read(args); if (v.Item?.jobId?.S === "control_circuit") v.Item.version.N = "12"; return v; };
  assert.throws(() => collectRestoredControllerSnapshot(changed, f.query, before, terminal), /ORIGINAL_STATE_DRIFT/);
});

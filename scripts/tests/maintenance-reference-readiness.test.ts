import assert from "node:assert/strict";
import test from "node:test";
import { collectMaintenanceReferenceReadiness, evaluateMaintenanceReferences } from "../maintenance-reference-readiness.js";

const account = ["123456", "789012"].join("");
const prefix = "global-market-ai-insight-dev", cluster = `arn:aws:ecs:ap-northeast-1:${account}:cluster/${prefix}-worker`;
const definition = `arn:aws:ecs:ap-northeast-1:${account}:task-definition/${prefix}-worker:9`;
const identity = { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user` };
const controller = { Environment: { Variables: { MAX_ACTIVE_JOBS: "2", JOBS_TABLE_NAME: `${prefix}-jobs`, WORKER_CLUSTER: cluster,
  WORKER_TASK_DEFINITION: definition, ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false" } } };
const resource = (logical: string, type: string, physical: string) => ({ LogicalResourceId: logical, ResourceType: type, PhysicalResourceId: physical, ResourceStatus: "CREATE_COMPLETE" });
function snapshot() {
  return { identity: structuredClone(identity), controller: structuredClone(controller),
    foundationResources: { StackResourceSummaries: [resource("Table", "AWS::DynamoDB::Table", `${prefix}-jobs`)] },
    computeResources: { StackResourceSummaries: [resource("Cluster", "AWS::ECS::Cluster", `${prefix}-worker`), resource("Controller", "AWS::Lambda::Function", `${prefix}-controller`)] },
    table: { Table: { TableName: `${prefix}-jobs`, TableArn: `arn:aws:dynamodb:ap-northeast-1:${account}:table/${prefix}-jobs`,
      TableStatus: "ACTIVE", BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" },
      KeySchema: [{ AttributeName: "jobId", KeyType: "HASH" }], AttributeDefinitions: [{ AttributeName: "jobId", AttributeType: "S" }] } },
  };
}
const core = { readyForAccountSpecificDiff: true, stacks: { maintenance: "ABSENT" }, privateUnknown: "PRIVATE_SENTINEL" };
test("exact existing-resource references permit only the next diff, without reflecting raw input", () => {
  const report = evaluateMaintenanceReferences(core, snapshot());
  assert.equal(report.referencesVerified, true); assert.equal(report.readyForReferenceSpecificDiff, true);
  assert.match(report.referenceFingerprint!, /^[a-f0-9]{64}$/);
  for (const key of ["readyForDeployment", "readyForLiveAcceptance", "maintenanceInvokeAuthorized", "slotOrJobMutationAuthorized", "taskLaunchAuthorized", "scheduleEnablementAuthorized"] as const) assert.equal(report[key], false);
  assert.doesNotMatch(JSON.stringify(report), /123456789012|arn:aws:|PRIVATE_SENTINEL|global-market-ai-insight-dev/);
});
test("ownership lists cannot hide missing, duplicate, partial or foreign resources", () => {
  for (const field of ["foundationResources", "computeResources"] as const) {
    for (const value of [null, {}, { StackResourceSummaries: [], NextToken: "PRIVATE_SENTINEL" },
      { StackResourceSummaries: [resource("Repeated", "AWS::DynamoDB::Table", `${prefix}-jobs`), resource("Repeated", "AWS::DynamoDB::Table", `${prefix}-jobs`)] }]) {
      const input = snapshot(); (input as any)[field] = value;
      assert.equal(evaluateMaintenanceReferences(core, input).readyForReferenceSpecificDiff, false);
    }
  }
  const input = snapshot(); input.computeResources.StackResourceSummaries[0]!.PhysicalResourceId += "-other";
  assert.equal(evaluateMaintenanceReferences(core, input).referenceFingerprint, null);
});
test("changed capacity, controller references, table schema or maintenance presence fails closed", () => {
  for (const [key, value] of [["MAX_ACTIVE_JOBS", "5"], ["JOBS_TABLE_NAME", "foreign-table"], ["WORKER_CLUSTER", cluster + "-other"]] as const) {
    const input = snapshot(); input.controller.Environment.Variables[key] = value;
    assert.equal(evaluateMaintenanceReferences(core, input).referencesVerified, false);
  }
  for (const change of [(table: any) => { table.TableStatus = "UPDATING"; }, (table: any) => { table.BillingModeSummary.BillingMode = "PROVISIONED"; },
    (table: any) => { table.KeySchema.push({ AttributeName: "other", KeyType: "RANGE" }); }]) {
    const input = snapshot(); change(input.table.Table); assert.equal(evaluateMaintenanceReferences(core, input).referencesVerified, false);
  }
  assert.equal(evaluateMaintenanceReferences({ ...core, stacks: { maintenance: "DELETE_FAILED" } }, snapshot()).referencesVerified, false);
  assert.equal(evaluateMaintenanceReferences({ ...core, readyForAccountSpecificDiff: false }, snapshot()).referencesVerified, false);
});

test("CloudFormation's exact cluster name is distinct from a controller ARN or foreign name", () => {
  for (const value of [cluster, `${prefix}-worker-other`, "PRIVATE_SENTINEL", "arn:aws:ecs:us-east-1:111111111111:cluster/foreign"]) {
    const input = snapshot(); input.computeResources.StackResourceSummaries[0]!.PhysicalResourceId = value;
    assert.equal(evaluateMaintenanceReferences(core, input).ownership.cluster, false);
  }
  const input = snapshot(); input.controller.Environment.Variables.WORKER_CLUSTER = cluster.replace(account, "111111111111");
  assert.equal(evaluateMaintenanceReferences(core, input).exactRuntimeReferences, false);
});

function coreReader(calls: string[], enabled = false) {
  return (args: readonly string[]): unknown => {
    const key = args.slice(0, 2).join("."); calls.push(key);
    if (key === "sts.get-caller-identity") return identity;
    if (key === "lambda.get-function-configuration") return enabled ? { Environment: { Variables: { ...controller.Environment.Variables, ENABLE_PROVIDER_BACKED_JOBS: "true" } } } : controller;
    if (key === "budgets.describe-budgets") return { Budgets: [{ BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: "5", Unit: "USD" },
      CalculatedSpend: { ActualSpend: { Amount: "0", Unit: "USD" }, ForecastedSpend: { Amount: "0.1", Unit: "USD" } } }] };
    if (key === "cloudformation.describe-stacks") return { Stacks: ["foundation", "compute", "api"].map(name => ({ StackName: `${prefix}-${name}`, StackStatus: "CREATE_COMPLETE" })) };
    if (key === "ecs.list-tasks") return { taskArns: [] };
    if (key === "ecs.list-services") return { serviceArns: [] };
    if (key === "ecs.describe-task-definition") return { taskDefinition: { taskDefinitionArn: definition, containerDefinitions: [{ image: `${account}.dkr.ecr.ap-northeast-1.amazonaws.com/${prefix}-worker@sha256:${"a".repeat(64)}`, readonlyRootFilesystem: true, user: "65532:65532" }] } };
    if (key === "dynamodb.get-item") return args.includes(JSON.stringify({ jobId: { S: "control_circuit" } })) ? { Item: { jobId: { S: "control_circuit" }, state: { S: "OPEN" }, version: { N: "11" } } } : {};
    throw new Error("UNEXPECTED_FIXTURE_QUERY");
  };
}
test("collector captures same-read runtime references and performs exactly fourteen read-only queries", () => {
  const calls: string[] = [], bindings = snapshot();
  const report = collectMaintenanceReferenceReadiness(coreReader(calls), args => {
    calls.push(args.slice(0, 2).join("."));
    if (args[0] === "dynamodb") return bindings.table;
    return args.includes(`${prefix}-foundation`) ? bindings.foundationResources : bindings.computeResources;
  });
  assert.equal(calls.length, 14); assert.equal(report.awsCalls, 14); assert.equal(report.referencesVerified, true);
  assert.deepEqual(calls.slice(-3), ["cloudformation.list-stack-resources", "cloudformation.list-stack-resources", "dynamodb.describe-table"]);
  assert.equal(calls.some(name => /put|delete|update|stop|invoke|run-task/.test(name)), false);
});
test("failed core safety prevents all additional reference reads", () => {
  const calls: string[] = []; let extra = 0;
  assert.throws(() => collectMaintenanceReferenceReadiness(coreReader(calls, true), () => { extra++; return {}; }), /MAINTENANCE_CORE_NOT_READY/);
  assert.equal(extra, 0); assert.equal(calls.length, 11);
});

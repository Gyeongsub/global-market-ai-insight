import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { App, Stack } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { loadProjectConfig } from "../lib/config.js";
import { MaintenanceStack } from "../lib/maintenance-stack.js";

const config = loadProjectConfig("infrastructure/environments/dev.example.json");
const app = new App();
const sources = new Stack(app, "MaintenanceSources");
const table = new dynamodb.Table(sources, "Jobs", {
  partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
const vpc = new ec2.Vpc(sources, "Vpc", { maxAzs: 1, natGateways: 0, subnetConfiguration: [{ name: "public", subnetType: ec2.SubnetType.PUBLIC }] });
const cluster = new ecs.Cluster(sources, "Cluster", { vpc, clusterName: "gmai-dev-worker" });
const stack = new MaintenanceStack(app, "MaintenanceDraft", {
  config, jobsTable: table, cluster, handlerCode: lambda.Code.fromInline("exports.handler = async () => ({});"),
});
const template = Template.fromStack(stack);

test("maintenance schedule stays disabled with bounded single-function target", () => {
  template.resourceCountIs("AWS::Events::Rule", 1);
  template.resourceCountIs("AWS::Lambda::Function", 1);
  template.resourceCountIs("AWS::Logs::LogGroup", 1);
  template.hasResourceProperties("AWS::Events::Rule", {
    State: "DISABLED", ScheduleExpression: "rate(5 minutes)", Targets: Match.arrayWith([Match.objectLike({ RetryPolicy: Match.objectLike({ MaximumRetryAttempts: 0 }) })]),
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    Timeout: 45, MemorySize: 128,
    Environment: { Variables: Match.objectLike({ MAX_ACTIVE_JOBS: "2" }) },
  });
  const types = Object.values(template.toJSON().Resources).map((resource: any) => resource.Type);
  assert.equal(types.includes("AWS::SNS::Topic"), false);
  assert.equal(types.includes("AWS::ECS::Service"), false);
});

test("maintenance IAM only touches exact slot/job keys and project-cluster tasks", () => {
  const policies = Object.values(template.findResources("AWS::IAM::Policy")) as any[];
  const statements = policies.flatMap(policy => policy.Properties.PolicyDocument.Statement);
  const dynamo = statements.filter(statement => String([statement.Action].flat()).includes("dynamodb:"));
  assert.equal(dynamo.length, 4);
  for (const statement of dynamo) {
    const keys = statement.Condition?.["ForAllValues:StringLike"]?.["dynamodb:LeadingKeys"];
    assert.ok(Array.isArray(keys));
    assert.equal(keys.includes("*"), false);
    assert.equal(keys.includes("control_circuit"), false);
    assert.ok(keys.every((key: string) => key === "job_*" || key === "control_slot_0" || key === "control_slot_1"));
  }
  const ecsStatement = statements.find(statement => String([statement.Action].flat()).includes("ecs:StopTask"));
  assert.ok(ecsStatement);
  assert.deepEqual([ecsStatement.Action].flat().sort(), ["ecs:DescribeTasks", "ecs:StopTask"]);
  assert.ok(ecsStatement.Condition?.ArnEquals?.["ecs:cluster"]);
  assert.notEqual(ecsStatement.Resource, "*");
  const taskResource = JSON.stringify(ecsStatement.Resource);
  assert.match(taskResource, /:task\//);
  assert.match(taskResource, /ImportValue/);
  assert.match(taskResource, /\/\*/);
  assert.doesNotMatch(JSON.stringify(statements), /ssm:|bedrock:|ecs:RunTask|iam:PassRole/);
});

test("maintenance draft entry point requires the separate operations opt-in", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, GMAI_ENABLE_MAINTENANCE_DRAFT: "true", GMAI_ENABLE_OPERATIONS: "false", GMAI_ENABLE_API: "true" };
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Maintenance draft requires the explicitly enabled operations draft/);
});

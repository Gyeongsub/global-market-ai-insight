import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { App, Stack } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { AlarmCircuitStack } from "../lib/alarm-circuit-stack.js";
import { loadProjectConfig } from "../lib/config.js";

const config = loadProjectConfig("infrastructure/environments/dev.example.json");
const app = new App();
const sources = new Stack(app, "AlarmCircuitSources");
const table = new dynamodb.Table(sources, "Jobs", {
  partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
const stack = new AlarmCircuitStack(app, "AlarmCircuitDraft", {
  config,
  jobsTable: table,
  handlerCode: lambda.Code.fromInline("exports.handler = async () => ({});"),
});
const template = Template.fromStack(stack);

test("alarm automation has one bounded function and one exact EventBridge rule", () => {
  template.resourceCountIs("AWS::Lambda::Function", 1);
  template.resourceCountIs("AWS::Lambda::EventInvokeConfig", 1);
  template.resourceCountIs("AWS::Events::Rule", 1);
  template.resourceCountIs("AWS::Logs::LogGroup", 1);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Timeout: 5,
    MemorySize: 128,
    ReservedConcurrentExecutions: 1,
    Environment: { Variables: Match.objectLike({
      EXPECTED_ACCOUNT_ID: { Ref: "AWS::AccountId" },
      ALLOWED_ALARM_NAMES_JSON: JSON.stringify([
        "global-market-ai-insight-dev-ControllerErrors",
        "global-market-ai-insight-dev-ControllerThrottles",
        "global-market-ai-insight-dev-ApiServerErrors",
        "global-market-ai-insight-dev-TaskLaunchFailures",
        "global-market-ai-insight-dev-ProviderFailures",
        "global-market-ai-insight-dev-ModelFailures",
      ]),
    }) },
  });
  template.hasResourceProperties("AWS::Events::Rule", {
    EventPattern: {
      source: ["aws.cloudwatch"],
      "detail-type": ["CloudWatch Alarm State Change"],
      detail: {
        alarmName: [
          "global-market-ai-insight-dev-ControllerErrors",
          "global-market-ai-insight-dev-ControllerThrottles",
          "global-market-ai-insight-dev-ApiServerErrors",
          "global-market-ai-insight-dev-TaskLaunchFailures",
          "global-market-ai-insight-dev-ProviderFailures",
          "global-market-ai-insight-dev-ModelFailures",
        ],
        state: { value: ["ALARM"] },
      },
    },
    Targets: Match.arrayWith([Match.objectLike({
      RetryPolicy: Match.objectLike({ MaximumRetryAttempts: 1, MaximumEventAgeInSeconds: 60 }),
    })]),
  });
  template.hasResourceProperties("AWS::Lambda::EventInvokeConfig", {
    MaximumRetryAttempts: 1,
    MaximumEventAgeInSeconds: 60,
  });
  const types = Object.values(template.toJSON().Resources).map((resource: any) => resource.Type);
  assert.doesNotMatch(JSON.stringify(template.findResources("AWS::Lambda::Function")), /"Mode":"Active"/);
  assert.equal(types.includes("AWS::SNS::Topic"), false);
  assert.equal(types.includes("AWS::Events::Rule"), true);
});

test("alarm automation IAM can touch only the circuit item and cannot launch work", () => {
  const policies = Object.values(template.findResources("AWS::IAM::Policy")) as any[];
  const statements = policies.flatMap(policy => policy.Properties.PolicyDocument.Statement);
  const dynamo = statements.find(statement => String([statement.Action].flat()).includes("dynamodb:UpdateItem"));
  assert.ok(dynamo);
  assert.deepEqual([dynamo.Action].flat().sort(), ["dynamodb:GetItem", "dynamodb:UpdateItem"]);
  assert.deepEqual(dynamo.Condition?.["ForAllValues:StringEquals"]?.["dynamodb:LeadingKeys"], ["control_circuit"]);
  assert.notEqual(dynamo.Resource, "*");
  assert.doesNotMatch(JSON.stringify(statements), /ecs:|bedrock:|ssm:|sns:Publish|iam:PassRole/);
});

test("alarm automation entry point requires operations and a separate cost acknowledgement", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("infrastructure/bin/app.ts");
  let env: NodeJS.ProcessEnv = {
    ...process.env,
    GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true",
    GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "true",
    GMAI_ENABLE_OPERATIONS: "false",
    GMAI_ENABLE_API: "false",
  };
  let result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Alarm circuit automation requires the explicitly enabled operations draft/);

  env = {
    ...env,
    GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true",
    GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "false",
    GMAI_ENABLE_OPERATIONS: "true",
    GMAI_ENABLE_API: "true",
  };
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Alarm circuit automation requires a separate cost acknowledgement/);
});

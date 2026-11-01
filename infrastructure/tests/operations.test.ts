import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { App, CfnResource, Stack } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { loadProjectConfig } from "../lib/config.js";
import { OperationsStack } from "../lib/operations-stack.js";

const app = new App();
const sources = new Stack(app, "Sources");
// An inert test-only source keeps the imported-resource stack valid at synth.
new CfnResource(sources, "TestOnly", { type: "AWS::CloudFormation::WaitConditionHandle" });
const controller = lambda.Function.fromFunctionName(sources, "Controller", "gmai-dev-controller");
const api = apigwv2.HttpApi.fromHttpApiAttributes(sources, "Api", { httpApiId: "example123", apiEndpoint: "https://example.invalid" });
const config = loadProjectConfig("infrastructure/environments/dev.example.json");
const apiLogs = logs.LogGroup.fromLogGroupName(sources, "ApiLogs", "/aws/apigateway/global-market-ai-insight-dev-api-access");
const controllerLogs = logs.LogGroup.fromLogGroupName(sources, "ControllerLogs", "/aws/lambda/global-market-ai-insight-dev-controller");
const workerLogs = logs.LogGroup.fromLogGroupName(sources, "WorkerLogs", "/aws/ecs/global-market-ai-insight-dev/worker");
const template = Template.fromStack(new OperationsStack(app, "OperationsDraft", {
  config, controllerFunction: controller, httpApi: api,
  apiAccessLogGroup: apiLogs, controllerLogGroup: controllerLogs, workerLogGroup: workerLogs,
}));

test("operations draft contains only one dashboard and three inactive standard alarms", () => {
  template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
  template.resourceCountIs("AWS::CloudWatch::Alarm", 3);
  const types = Object.values(template.toJSON().Resources).map((resource: any) => resource.Type);
  assert.deepEqual([...new Set(types)].sort(), ["AWS::CloudWatch::Alarm", "AWS::CloudWatch::Dashboard"]);
  for (const alarm of Object.values(template.findResources("AWS::CloudWatch::Alarm")) as any[]) {
    assert.equal(alarm.Properties.ActionsEnabled, false);
    assert.equal(alarm.Properties.TreatMissingData, "notBreaching");
    assert.equal(alarm.Properties.Period, 300);
    assert.equal(alarm.Properties.Statistic, "Sum");
    assert.equal(alarm.Properties.Threshold, 1);
    assert.equal(alarm.Properties.AlarmActions, undefined);
  }
});

test("draft uses default API and Lambda metrics without custom-metric writers or schedule", () => {
  template.hasResourceProperties("AWS::CloudWatch::Alarm", { Namespace: "AWS/ApiGateway", MetricName: "5xx", ActionsEnabled: false });
  template.hasResourceProperties("AWS::CloudWatch::Alarm", { Namespace: "AWS/Lambda", MetricName: "Errors", ActionsEnabled: false });
  template.hasResourceProperties("AWS::CloudWatch::Alarm", { Namespace: "AWS/Lambda", MetricName: "Throttles", ActionsEnabled: false });
  template.resourceCountIs("AWS::Logs::MetricFilter", 0);
  assert.doesNotMatch(JSON.stringify(template.toJSON()), /AWS::SNS|AWS::Events|AWS::Scheduler|AWS::Lambda::Function|PutMetricData/);
});

test("custom structured-log metrics are separately gated, low-cardinality and inactive", () => {
  const isolated = new App();
  const sourceStack = new Stack(isolated, "MetricSources");
  new CfnResource(sourceStack, "TestOnly", { type: "AWS::CloudFormation::WaitConditionHandle" });
  const importedController = lambda.Function.fromFunctionName(sourceStack, "Controller", "gmai-dev-controller");
  const importedApi = apigwv2.HttpApi.fromHttpApiAttributes(sourceStack, "Api", { httpApiId: "example123", apiEndpoint: "https://example.invalid" });
  const importedApiLogs = logs.LogGroup.fromLogGroupName(sourceStack, "ApiLogs", "/aws/apigateway/global-market-ai-insight-dev-api-access");
  const importedControllerLogs = logs.LogGroup.fromLogGroupName(sourceStack, "ControllerLogs", "/aws/lambda/global-market-ai-insight-dev-controller");
  const importedWorkerLogs = logs.LogGroup.fromLogGroupName(sourceStack, "WorkerLogs", "/aws/ecs/global-market-ai-insight-dev/worker");
  const enabled = Template.fromStack(new OperationsStack(isolated, "MetricOperations", {
    config, controllerFunction: importedController, httpApi: importedApi,
    apiAccessLogGroup: importedApiLogs, controllerLogGroup: importedControllerLogs,
    workerLogGroup: importedWorkerLogs, customMetricsEnabled: true,
  }));
  enabled.resourceCountIs("AWS::Logs::MetricFilter", 3);
  enabled.resourceCountIs("AWS::CloudWatch::Alarm", 6);
  for (const filter of Object.values(enabled.findResources("AWS::Logs::MetricFilter")) as any[]) {
    assert.equal(filter.Properties.MetricTransformations.length, 1);
    assert.equal(filter.Properties.MetricTransformations[0].MetricNamespace, "global-market-ai-insight/dev");
    assert.equal(filter.Properties.MetricTransformations[0].MetricValue, "1");
    assert.equal(filter.Properties.MetricTransformations[0].DefaultValue, 0);
    assert.equal(filter.Properties.MetricTransformations[0].Dimensions, undefined);
  }
  const rendered = JSON.stringify(enabled.toJSON());
  for (const token of ["TASK_LAUNCH_FAILED", "PROVIDER_ERROR", "MODEL_ERROR"]) assert.match(rendered, new RegExp(token));
  assert.doesNotMatch(rendered, /jobId|requestId|PutMetricData|AWS::SNS/);
  for (const alarm of Object.values(enabled.findResources("AWS::CloudWatch::Alarm")) as any[]) {
    assert.equal(alarm.Properties.ActionsEnabled, false);
    assert.equal(alarm.Properties.AlarmActions, undefined);
  }
});

test("notification path needs an explicit opt-in and never creates an email subscription", () => {
  const isolated = new App();
  const sourceStack = new Stack(isolated, "NotificationSources");
  new CfnResource(sourceStack, "TestOnly", { type: "AWS::CloudFormation::WaitConditionHandle" });
  const importedController = lambda.Function.fromFunctionName(sourceStack, "Controller", "gmai-dev-controller");
  const importedApi = apigwv2.HttpApi.fromHttpApiAttributes(sourceStack, "Api", { httpApiId: "example123", apiEndpoint: "https://example.invalid" });
  const importedApiLogs = logs.LogGroup.fromLogGroupName(sourceStack, "ApiLogs", "/aws/apigateway/global-market-ai-insight-dev-api-access");
  const importedControllerLogs = logs.LogGroup.fromLogGroupName(sourceStack, "ControllerLogs", "/aws/lambda/global-market-ai-insight-dev-controller");
  const importedWorkerLogs = logs.LogGroup.fromLogGroupName(sourceStack, "WorkerLogs", "/aws/ecs/global-market-ai-insight-dev/worker");
  const enabled = Template.fromStack(new OperationsStack(isolated, "NotificationOperations", {
    config, controllerFunction: importedController, httpApi: importedApi,
    apiAccessLogGroup: importedApiLogs, controllerLogGroup: importedControllerLogs,
    workerLogGroup: importedWorkerLogs, notificationsEnabled: true,
  }));
  enabled.resourceCountIs("AWS::KMS::Key", 1);
  enabled.resourceCountIs("AWS::KMS::Alias", 1);
  enabled.resourceCountIs("AWS::SNS::Topic", 1);
  enabled.resourceCountIs("AWS::SNS::Subscription", 0);
  for (const alarm of Object.values(enabled.findResources("AWS::CloudWatch::Alarm")) as any[]) {
    assert.equal(alarm.Properties.ActionsEnabled, true);
    assert.equal(alarm.Properties.AlarmActions.length, 1);
  }
  const rendered = JSON.stringify(enabled.toJSON());
  assert.doesNotMatch(rendered, /alias\/aws\/sns/);
  assert.match(rendered, /EnableKeyRotation/);
  assert.match(rendered, /cloudwatch\.amazonaws\.com/);
  assert.match(rendered, /aws:SourceAccount/);
  assert.match(rendered, /aws:SourceArn/);
  assert.match(rendered, /global-market-ai-insight-dev-\*/);
  assert.match(rendered, /aws:SecureTransport/);
  assert.doesNotMatch(rendered, /Endpoint|SubscriptionRoleArn/);
});

test("dashboard embeds only the bounded structured log summaries", () => {
  const rendered = JSON.stringify(template.toJSON());
  assert.equal((rendered.match(/\\\"type\\\":\\\"log\\\"/g) ?? []).length, 3);
  assert.match(rendered, /routeKey/);
  assert.match(rendered, /publicCode/);
  assert.match(rendered, /diagnosticCategory/);
  assert.match(rendered, /global-market-ai-insight-dev-api-access/);
  assert.match(rendered, /global-market-ai-insight-dev-controller/);
  assert.match(rendered, /global-market-ai-insight-dev\/worker/);
  assert.match(rendered, /-PT15M/);
  assert.doesNotMatch(rendered, /@message|provider payload|prompt|taskArn/i);
});

test("operations queries reject a literal log group outside the reviewed project names", () => {
  const isolated = new App();
  const sourceStack = new Stack(isolated, "WrongSources");
  new CfnResource(sourceStack, "TestOnly", { type: "AWS::CloudFormation::WaitConditionHandle" });
  const importedController = lambda.Function.fromFunctionName(sourceStack, "Controller", "gmai-dev-controller");
  const importedApi = apigwv2.HttpApi.fromHttpApiAttributes(sourceStack, "Api", { httpApiId: "example123", apiEndpoint: "https://example.invalid" });
  const goodApi = logs.LogGroup.fromLogGroupName(sourceStack, "ApiLogs", "/aws/apigateway/global-market-ai-insight-dev-api-access");
  const goodController = logs.LogGroup.fromLogGroupName(sourceStack, "ControllerLogs", "/aws/lambda/global-market-ai-insight-dev-controller");
  const wrongWorker = logs.LogGroup.fromLogGroupName(sourceStack, "WorkerLogs", "/aws/ecs/another-project/worker");
  assert.throws(() => new OperationsStack(isolated, "RejectedOperations", {
    config, controllerFunction: importedController, httpApi: importedApi,
    apiAccessLogGroup: goodApi, controllerLogGroup: goodController, workerLogGroup: wrongWorker,
  }), /Unexpected worker log group/);
});

test("entry point refuses operations without an explicitly enabled API or pinned digest", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("infrastructure/bin/app.ts");
  const env: NodeJS.ProcessEnv = { ...process.env, GMAI_ENABLE_OPERATIONS: "true", GMAI_ENABLE_API: "false" };
  delete env.GMAI_WORKER_IMAGE_DIGEST;
  let result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires the explicitly enabled IAM-protected API stack/);
  env.GMAI_ENABLE_API = "true";
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a pinned worker image digest/);
});

test("entry point fails closed unless alarm notification and cost flags agree", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("infrastructure/bin/app.ts");
  let env: NodeJS.ProcessEnv = {
    ...process.env,
    GMAI_ENABLE_API: "false",
    GMAI_ENABLE_OPERATIONS: "false",
    GMAI_ENABLE_ALARM_NOTIFICATIONS: "true",
    GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "true",
  };
  let result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require the explicitly enabled operations draft/);

  env = {
    ...env,
    GMAI_ENABLE_API: "true",
    GMAI_ENABLE_OPERATIONS: "true",
    GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "false",
  };
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /separate cost acknowledgement/);

  env = {
    ...env,
    GMAI_ENABLE_ALARM_NOTIFICATIONS: "false",
    GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "true",
  };
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires notifications to be enabled/);
});

test("entry point fails closed unless custom metrics and cost flags agree", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("infrastructure/bin/app.ts");
  let env: NodeJS.ProcessEnv = {
    ...process.env,
    GMAI_ENABLE_API: "false",
    GMAI_ENABLE_OPERATIONS: "false",
    GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "true",
    GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "true",
  };
  let result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require the explicitly enabled operations draft/);

  env = {
    ...env,
    GMAI_ENABLE_API: "true",
    GMAI_ENABLE_OPERATIONS: "true",
    GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "false",
  };
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /require a separate cost acknowledgement/);

  env = {
    ...env,
    GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "false",
    GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "true",
  };
  result = spawnSync(process.execPath, [cli, entry], { env, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires custom operation metrics to be enabled/);
});

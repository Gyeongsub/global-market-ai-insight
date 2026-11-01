import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { createPhase11ReadOnlyCliRunner, PHASE11_LOG_GROUP_PAGE_LIMIT, summarizeReadinessFailure, validatePhase11ReadOnlyQuery } from "../phase11-live-readiness.js";
import { collectPhase11ReferenceReadiness, evaluatePhase11ReferenceReadiness, type Phase11ReferenceSnapshot } from "../phase11-reference-readiness.js";
import { phase11ReferenceFingerprint } from "../../infrastructure/lib/phase11-reference-identity.js";

const account = ["123456", "789012"].join("");
const prefix = "global-market-ai-insight-dev";
const region = "ap-northeast-1";
const apiId = "example123";
const controllerArn = `arn:aws:lambda:${region}:${account}:function:${prefix}-controller`;
const groups = [`/aws/apigateway/${prefix}-api-access`, `/aws/lambda/${prefix}-controller`, `/aws/ecs/${prefix}/worker`];
const summary = (logical: string, type: string, name: string) => ({ LogicalResourceId: logical, ResourceType: type, PhysicalResourceId: name, ResourceStatus: "CREATE_COMPLETE" });

function healthy(): Phase11ReferenceSnapshot {
  return {
    identity: { Account: account, Arn: `arn:aws:iam::${account}:user/aws-admin-user` },
    foundationResources: { StackResourceSummaries: [summary("JobsTableABC123", "AWS::DynamoDB::Table", `${prefix}-jobs`), summary("WorkerLogsDEF456", "AWS::Logs::LogGroup", groups[2]!)] },
    computeResources: { StackResourceSummaries: [summary("ControllerABC123", "AWS::Lambda::Function", `${prefix}-controller`), summary("ControllerLogsDEF456", "AWS::Logs::LogGroup", groups[1]!)] },
    apiResources: { StackResourceSummaries: [summary("HttpApiABC123", "AWS::ApiGatewayV2::Api", apiId), summary("ApiLogsDEF456", "AWS::Logs::LogGroup", groups[0]!)] },
    api: { ApiId: apiId, Name: `${prefix}-api`, ProtocolType: "HTTP", ApiEndpoint: `https://${apiId}.execute-api.${region}.amazonaws.com` },
    routes: { Items: ["GET /v1/assets", "POST /v1/jobs", "GET /v1/jobs/{jobId}", "GET /v1/health"].map(RouteKey => ({ RouteKey, AuthorizationType: "AWS_IAM", Target: "integrations/integration1" })) },
    integrations: { Items: [{ IntegrationId: "integration1", IntegrationType: "AWS_PROXY", IntegrationUri: controllerArn, PayloadFormatVersion: "2.0", IntegrationMethod: "POST", TimeoutInMillis: 15_000 }] },
    controller: { FunctionName: `${prefix}-controller`, FunctionArn: controllerArn, Runtime: "nodejs22.x", State: "Active", LastUpdateStatus: "Successful", Environment: { Variables: { ENABLE_PROVIDER_BACKED_JOBS: "false", ENABLE_LIVE_RESULT_DISPLAY: "false", PRIVATE: "PRIVATE_VALUE" } } },
    table: { Table: { TableName: `${prefix}-jobs`, TableArn: `arn:aws:dynamodb:${region}:${account}:table/${prefix}-jobs`, TableStatus: "ACTIVE", BillingModeSummary: { BillingMode: "PAY_PER_REQUEST" }, KeySchema: [{ AttributeName: "jobId", KeyType: "HASH" }] } },
    logGroups: groups.map(name => ({ logGroups: [{ logGroupName: name, arn: `arn:aws:logs:${region}:${account}:log-group:${name}:*`, retentionInDays: 7 }] })),
  };
}

test("exact existing references authorize only a separate diff and print no resource or private values", () => {
  const report = evaluatePhase11ReferenceReadiness(healthy());
  assert.equal(report.referencesVerified, true);
  assert.equal(report.readyForReferenceSpecificDiff, true);
  for (const name of ["readyForDeployment", "upstreamDeploymentAuthorized", "circuitMutationAuthorized"]) assert.equal(report[name], false);
  assert.equal(report.coreReadinessStillRequired, true);
  assert.equal(report.cloudMutations, 0);
  assert.equal(report.referenceFingerprint, phase11ReferenceFingerprint(account, apiId));
  const serialized = JSON.stringify(report);
  for (const hidden of [account, apiId, controllerArn, "execute-api", "PRIVATE_VALUE", ...groups]) assert.equal(serialized.includes(hidden), false);
});

test("wrong identity, account, Region and endpoint cannot satisfy reference proof", () => {
  for (const change of [
    (snapshot: any) => { snapshot.identity.Arn = `arn:aws:iam::${account}:user/another-user`; },
    (snapshot: any) => { snapshot.api.ApiEndpoint = "https://private.example"; },
    (snapshot: any) => { snapshot.api.Name = "another-project"; },
    (snapshot: any) => { snapshot.api.ApiId = "another123"; },
    (snapshot: any) => { snapshot.api.ProtocolType = "WEBSOCKET"; },
    (snapshot: any) => { snapshot.controller.FunctionArn = controllerArn.replace(region, "us-east-1"); },
    (snapshot: any) => { snapshot.table.Table.TableArn = snapshot.table.Table.TableArn.replace(account, "111111111111"); },
  ]) {
    const snapshot = healthy(); change(snapshot);
    const report = evaluatePhase11ReferenceReadiness(snapshot);
    assert.equal(report.referencesVerified, false);
    assert.equal(report.referenceFingerprint, null);
  }
});

test("an IAM-only API is not reported as verified owner-only live access", () => {
  const snapshot = healthy();
  const controller = snapshot.controller as { Environment: { Variables: Record<string, string> } };
  assert.equal(evaluatePhase11ReferenceReadiness(snapshot).privateOwnerConfigurationMatchesCaller, false);
  controller.Environment.Variables.PRIVATE_OWNER_USER_ARN = (snapshot.identity as { Arn: string }).Arn;
  const matching = evaluatePhase11ReferenceReadiness(snapshot);
  assert.equal(matching.privateOwnerConfigurationMatchesCaller, true);
  assert.equal(matching.privateOwnerLiveAcceptanceVerified, false);
  controller.Environment.Variables.PRIVATE_OWNER_USER_ARN += "-other";
  assert.equal(evaluatePhase11ReferenceReadiness(snapshot).privateOwnerConfigurationMatchesCaller, false);
});

test("partial, malformed, duplicate or non-complete resource ownership stays blocked", () => {
  for (const value of [{}, null, { StackResourceSummaries: [] }, { StackResourceSummaries: [null] },
    { ...(healthy().foundationResources as object), NextToken: "PRIVATE_VALUE" },
    { StackResourceSummaries: [summary("Same", "AWS::DynamoDB::Table", `${prefix}-jobs`), summary("Same", "AWS::Logs::LogGroup", groups[2]!)] },
    { StackResourceSummaries: [{ ...summary("Jobs", "AWS::DynamoDB::Table", `${prefix}-jobs`), ResourceStatus: "UPDATE_IN_PROGRESS" }, summary("Logs", "AWS::Logs::LogGroup", groups[2]!)] }]) {
    assert.equal(evaluatePhase11ReferenceReadiness({ ...healthy(), foundationResources: value }).referencesVerified, false);
  }
  const snapshot = healthy() as any;
  snapshot.apiResources.StackResourceSummaries.push(summary("SecondApi", "AWS::ApiGatewayV2::Api", "another123"));
  assert.equal(evaluatePhase11ReferenceReadiness(snapshot).referencesVerified, false);
});

test("a disabled controller requires explicit flags and a healthy exact runtime", () => {
  for (const value of [null, {}, { ...healthy().controller as object, State: "Pending" },
    { ...healthy().controller as object, LastUpdateStatus: "Failed" },
    { ...healthy().controller as object, Runtime: "nodejs20.x" },
    { ...healthy().controller as object, Environment: { Variables: { ENABLE_PROVIDER_BACKED_JOBS: "true", ENABLE_LIVE_RESULT_DISPLAY: "false" } } },
    { ...healthy().controller as object, Environment: { Variables: { ENABLE_LIVE_RESULT_DISPLAY: "false" } } }]) {
    assert.equal(evaluatePhase11ReferenceReadiness({ ...healthy(), controller: value }).referencesVerified, false);
  }
});

test("all four routes must be IAM-protected and target the exact bounded controller integration", () => {
  for (const change of [
    (snapshot: any) => { snapshot.routes.Items[0].AuthorizationType = "NONE"; },
    (snapshot: any) => { snapshot.routes.Items[0].Target = "integrations/another1"; },
    (snapshot: any) => { snapshot.routes.Items[0].RouteKey = "ANY /{proxy+}"; },
    (snapshot: any) => { snapshot.routes.NextToken = "PRIVATE_VALUE"; },
    (snapshot: any) => { snapshot.routes.Items.pop(); },
    (snapshot: any) => { snapshot.integrations.Items[0].IntegrationUri = `${controllerArn}-foreign`; },
    (snapshot: any) => { snapshot.integrations.Items[0].TimeoutInMillis = 30_000; },
    (snapshot: any) => { snapshot.integrations.Items[0].IntegrationType = "HTTP_PROXY"; },
    (snapshot: any) => { snapshot.integrations.Items.push(snapshot.integrations.Items[0]); },
    (snapshot: any) => { snapshot.integrations.NextToken = "PRIVATE_VALUE"; },
  ]) {
    const snapshot = healthy(); change(snapshot);
    assert.equal(evaluatePhase11ReferenceReadiness(snapshot).referencesVerified, false);
  }
});

test("on-demand jobs table must be active and have the exact jobId-only primary key", () => {
  for (const change of [
    (snapshot: any) => { snapshot.table.Table.TableStatus = "CREATING"; },
    (snapshot: any) => { snapshot.table.Table.BillingModeSummary.BillingMode = "PROVISIONED"; },
    (snapshot: any) => { snapshot.table.Table.KeySchema[0].AttributeName = "privateOtherKey"; },
    (snapshot: any) => { snapshot.table.Table.KeySchema.push({ AttributeName: "sortKey", KeyType: "RANGE" }); },
  ]) {
    const snapshot = healthy(); change(snapshot);
    assert.equal(evaluatePhase11ReferenceReadiness(snapshot).referencesVerified, false);
  }
});

test("all log-group reads must be complete, exact-account and bounded-retention", () => {
  for (const value of [{}, null, { logGroups: [] }, { logGroups: [], nextToken: "PRIVATE_VALUE" },
    { logGroups: [{ logGroupName: groups[0], arn: "PRIVATE_VALUE", retentionInDays: 7 }] },
    { logGroups: [{ ...(healthy().logGroups[0] as any).logGroups[0], retentionInDays: "7" }] },
    { logGroups: [{ ...(healthy().logGroups[0] as any).logGroups[0], retentionInDays: 365 }] },
    { logGroups: [{ ...(healthy().logGroups[0] as any).logGroups[0], logGroupArn: "PRIVATE_VALUE" }] },
    { logGroups: [(healthy().logGroups[0] as any).logGroups[0], (healthy().logGroups[0] as any).logGroups[0]] }]) {
    assert.equal(evaluatePhase11ReferenceReadiness({ ...healthy(), logGroups: [value, ...healthy().logGroups.slice(1)] }).referencesVerified, false);
  }
  assert.equal(evaluatePhase11ReferenceReadiness({ ...healthy(), logGroups: [] }).referencesVerified, false);
});

function runnerFor(snapshot: Phase11ReferenceSnapshot, calls: string[][]): (args: readonly string[]) => unknown {
  let logIndex = 0;
  return args => {
    calls.push([...args]);
    const key = `${args[0]}.${args[1]}`;
    if (key === "sts.get-caller-identity") return snapshot.identity;
    if (key === "cloudformation.list-stack-resources") {
      const stack = args[args.indexOf("--stack-name") + 1];
      if (stack === `${prefix}-foundation`) return snapshot.foundationResources;
      if (stack === `${prefix}-compute`) return snapshot.computeResources;
      if (stack === `${prefix}-api`) return snapshot.apiResources;
    }
    const values: Record<string, unknown> = {
      "apigatewayv2.get-api": snapshot.api, "apigatewayv2.get-routes": snapshot.routes,
      "apigatewayv2.get-integrations": snapshot.integrations, "lambda.get-function-configuration": snapshot.controller,
      "dynamodb.describe-table": snapshot.table,
    };
    if (key === "logs.describe-log-groups") return snapshot.logGroups[logIndex++];
    if (Object.hasOwn(values, key)) return values[key];
    throw new Error("PRIVATE_UNEXPECTED_QUERY");
  };
}

test("collector performs exactly twelve scoped single-page reads, no lookups, invoke or mutation", () => {
  const calls: string[][] = [];
  assert.equal(collectPhase11ReferenceReadiness(runnerFor(healthy(), calls)).referencesVerified, true);
  assert.equal(calls.length, 12);
  for (const args of calls) {
    assert.equal(args[args.indexOf("--profile") + 1], "gmai-admin");
    assert.equal(args[args.indexOf("--region") + 1], region);
    assert.ok(args.includes("--no-paginate"));
    assert.ok(args.includes("--no-cli-pager"));
    assert.ok(args.includes("json"));
    assert.ok(["get-caller-identity", "list-stack-resources", "get-api", "get-routes", "get-integrations", "get-function-configuration", "describe-table", "describe-log-groups"].includes(args[1]!));
    if (args[0] === "apigatewayv2") assert.equal(args[args.indexOf("--api-id") + 1], apiId);
    if (args[0] === "logs") {
      assert.equal(args[args.indexOf("--limit") + 1], "50");
      assert.equal(PHASE11_LOG_GROUP_PAGE_LIMIT, "50");
      assert.equal(validatePhase11ReadOnlyQuery(args), "logs.describe-log-groups");
    }
    assert.equal(args.includes("--endpoint-url"), false);
  }
});

test("log metadata page size must match the supported fixed service limit before spawning", () => {
  const args = ["logs", "describe-log-groups", "--log-group-name-prefix", groups[0]!, "--limit", "50",
    "--profile", "gmai-admin", "--region", region, "--output", "json", "--no-cli-pager", "--no-paginate"];
  assert.equal(validatePhase11ReadOnlyQuery(args), "logs.describe-log-groups");
  let spawns = 0;
  const run = createPhase11ReadOnlyCliRunner({ spawn: () => { spawns += 1; return { status: 0, signal: null, stdout: "{}" }; } });
  for (const limit of ["0", "1", "49", "51", "100", "050", "50.0"]) {
    const changed = [...args]; changed[changed.indexOf("--limit") + 1] = limit;
    assert.throws(() => run(changed), error => {
      assert.deepEqual(summarizeReadinessFailure(error), { error: "AWS_QUERY_ARGUMENTS_INVALID", stage: "logs.describe-log-groups" });
      return true;
    });
  }
  assert.equal(spawns, 0);
});

test("collector stops before following references when identity or stack ownership cannot be proven", () => {
  const calls: string[][] = [];
  const invalid = healthy(); invalid.identity = {};
  assert.throws(() => collectPhase11ReferenceReadiness(runnerFor(invalid, calls)));
  assert.equal(calls.length, 1);
  calls.length = 0;
  const partial = healthy(); partial.apiResources = { StackResourceSummaries: [], NextToken: "PRIVATE_VALUE" };
  assert.throws(() => collectPhase11ReferenceReadiness(runnerFor(partial, calls)));
  assert.equal(calls.length, 4);
});

test("shared CLI runner refuses write, login and credential generation operations before spawning", () => {
  const run = createPhase11ReadOnlyCliRunner();
  for (const args of [["login"], ["cloudformation", "deploy"], ["dynamodb", "update-item"], ["ecs", "run-task"], ["sts", "get-session-token"], ["logs", "put-log-events"]]) {
    assert.throws(() => run(args), error => {
      assert.deepEqual(summarizeReadinessFailure(error), { error: "AWS_OPERATION_NOT_ALLOWLISTED", stage: "unknown" });
      return true;
    });
  }
});

test("reference readiness defaults to zero AWS and rejects unknown execution arguments privately", () => {
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const entry = resolve("scripts/phase11-reference-readiness.ts");
  const plan = spawnSync(process.execPath, [cli, entry], { encoding: "utf8", timeout: 10_000 });
  assert.equal(plan.status, 0);
  assert.equal(JSON.parse(plan.stdout).awsCallsMax, 12);
  assert.equal(JSON.parse(plan.stdout).mode, "dry-run");
  const invalid = spawnSync(process.execPath, [cli, entry, "--execute"], { encoding: "utf8", timeout: 10_000 });
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr.includes(account), false);
  assert.equal(invalid.stderr.includes("arn:aws"), false);
});

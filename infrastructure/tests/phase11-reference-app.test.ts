import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { buildPhase11ReferenceApprovalPacket, inspectPhase11ReferenceAssembly } from "../../scripts/phase11-drill-preflight.js";
import { loadProjectConfig } from "../lib/config.js";
import { createPhase11ReferenceStacks, parsePhase11ReferenceInputs } from "../lib/phase11-reference-app.js";
import { phase11ReferenceFingerprint } from "../lib/phase11-reference-identity.js";

const prefix = "global-market-ai-insight-dev";
const config = loadProjectConfig("infrastructure/environments/dev.example.json");
const account = ["123456", "789012"].join("");
const validEnv = (): NodeJS.ProcessEnv => ({
  CDK_DEFAULT_ACCOUNT: account, CDK_DEFAULT_REGION: "ap-northeast-1",
  GMAI_PHASE11_REFERENCE_ONLY: "true", GMAI_EXISTING_HTTP_API_ID: "example123",
  GMAI_PHASE11_REFERENCE_FINGERPRINT: phase11ReferenceFingerprint(account, "example123"),
  GMAI_ENABLE_API: "true", GMAI_ENABLE_OPERATIONS: "true",
  GMAI_ENABLE_INTERNAL_JOBS: "false", GMAI_ENABLE_MAINTENANCE_DRAFT: "false",
  GMAI_ENABLE_ALARM_NOTIFICATIONS: "false", GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "false",
  GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "true", GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "true",
  GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true", GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "true",
});

test("reference-only assembly contains exactly two temporary stacks, zero base resources and zero imports", () => {
  const outdir = mkdtempSync(join(tmpdir(), "gmai-reference-test-"));
  try {
    const app = new App({ outdir });
    const stacks = createPhase11ReferenceStacks(app, parsePhase11ReferenceInputs(config, validEnv()), lambda.Code.fromInline("exports.handler=async()=>{};"));
    const operations = Template.fromStack(stacks.operations);
    const alarmCircuit = Template.fromStack(stacks.alarmCircuit);
    const assembly = app.synth();
    assert.deepEqual(assembly.stacks.map(stack => stack.stackName).sort(), [`${prefix}-alarm-circuit`, `${prefix}-operations`]);
    for (const template of [operations, alarmCircuit]) {
      assert.doesNotMatch(JSON.stringify(template.toJSON()), /Fn::ImportValue|AWS::ECS|AWS::ApiGatewayV2|AWS::DynamoDB::Table|AWS::SNS|AWS::KMS|AWS::EC2|AWS::Scheduler/);
      assert.equal(template.toJSON().Outputs, undefined);
    }
    operations.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
    operations.resourceCountIs("AWS::CloudWatch::Alarm", 6);
    operations.resourceCountIs("AWS::Logs::MetricFilter", 3);
    alarmCircuit.resourceCountIs("AWS::Lambda::Function", 1);
    alarmCircuit.resourceCountIs("AWS::Events::Rule", 1);
    assert.ok(assembly.getStackArtifact(`${prefix}-alarm-circuit`).dependencies.some(dependency => dependency.id === `${prefix}-operations`));
    assert.deepEqual(assembly.manifest.missing ?? [], []);
    const inspection = inspectPhase11ReferenceAssembly(outdir, account);
    assert.equal(inspection.synthesizedStacks, 2);
    assert.equal(inspection.readyForDeployment, false);
    assert.equal(JSON.stringify(inspection).includes(account), false);
    assert.throws(() => inspectPhase11ReferenceAssembly(outdir, ["987654", "321098"].join("")));
  } finally { rmSync(outdir, { recursive: true, force: true }); }
});

test("existing-resource references preserve exact metric names and circuit-only least privilege", () => {
  const app = new App();
  const stacks = createPhase11ReferenceStacks(app, parsePhase11ReferenceInputs(config, validEnv()), lambda.Code.fromInline("exports.handler=async()=>{};"));
  const operations = Template.fromStack(stacks.operations).toJSON();
  const alarmCircuit = Template.fromStack(stacks.alarmCircuit).toJSON();
  const rendered = JSON.stringify({ operations, alarmCircuit });
  for (const expected of [`${prefix}-controller`, `${prefix}-jobs`, `/aws/ecs/${prefix}/worker`, `/aws/lambda/${prefix}-controller`, `/aws/apigateway/${prefix}-api-access`, "example123", "dynamodb:LeadingKeys", "control_circuit"]) assert.ok(rendered.includes(expected));
  assert.doesNotMatch(rendered, /ecs:RunTask|iam:PassRole|dynamodb:PutItem|dynamodb:DeleteItem/);
  for (const alarm of Object.values(operations.Resources) as any[]) if (alarm.Type === "AWS::CloudWatch::Alarm") {
    assert.equal(alarm.Properties.ActionsEnabled, false);
    assert.equal(alarm.Properties.AlarmActions, undefined);
  }
  const tableStatement = (Object.values(alarmCircuit.Resources) as any[]).find(resource => resource.Type === "AWS::IAM::Policy").Properties.PolicyDocument.Statement.find((statement: any) => statement.Action.includes("dynamodb:UpdateItem"));
  assert.notEqual(tableStatement.Resource, "*");
  assert.match(JSON.stringify(tableStatement.Resource), new RegExp(`table/${prefix}-jobs`));
});

test("low-quota compatibility is explicit, reference-only and preserves the exact least-privilege scope", () => {
  const outdir = mkdtempSync(join(tmpdir(), "gmai-unreserved-test-"));
  try {
    const inputs = parsePhase11ReferenceInputs(config, { ...validEnv(), GMAI_ALLOW_UNRESERVED_ALARM_DRILL: "true" });
    assert.equal(inputs.unreservedDrill, true);
    const app = new App({ outdir });
    const stacks = createPhase11ReferenceStacks(app, inputs, lambda.Code.fromInline("exports.handler=async()=>{};"));
    const alarm = Template.fromStack(stacks.alarmCircuit).toJSON();
    const fn = (Object.values(alarm.Resources) as any[]).find(value => value.Type === "AWS::Lambda::Function");
    assert.equal(Object.hasOwn(fn.Properties, "ReservedConcurrentExecutions"), false);
    app.synth();
    assert.throws(() => inspectPhase11ReferenceAssembly(outdir, account));
    const report = inspectPhase11ReferenceAssembly(outdir, account, true) as any;
    assert.equal(report.alarmCircuitSecurity.ecsRunTaskAllowed, false);
    assert.equal(report.alarmCircuitSecurity.lambda.accountSharedConcurrencyDrill, true);
    assert.equal(report.readyForDeployment, false);
    for (const value of ["TRUE", "", "1", " true"]) assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), GMAI_ALLOW_UNRESERVED_ALARM_DRILL: value }));
    assert.throws(() => createPhase11ReferenceStacks(new App(), { ...inputs, unreservedDrill: "true" as any }, lambda.Code.fromInline("exports.handler=async()=>{};")));
    const normal = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")],
      { encoding: "utf8", timeout: 10_000, env: { ...validEnv(), GMAI_PHASE11_REFERENCE_ONLY: "false", GMAI_ALLOW_UNRESERVED_ALARM_DRILL: "true" } });
    assert.notEqual(normal.status, 0);
    assert.match(normal.stderr, /dedicated reference-only entry point/);
  } finally { rmSync(outdir, { recursive: true, force: true }); }
});

test("reference-only configuration fails closed for missing flags and cost or runtime scope expansion", () => {
  for (const [name, value] of Object.entries(validEnv())) {
    if (["CDK_DEFAULT_ACCOUNT", "CDK_DEFAULT_REGION", "GMAI_EXISTING_HTTP_API_ID"].includes(name)) continue;
    const env = validEnv();
    env[name] = value === "true" ? "false" : "true";
    assert.throws(() => parsePhase11ReferenceInputs(config, env), name);
  }
  for (const name of ["GMAI_PHASE11_REFERENCE_ONLY", "GMAI_ENABLE_INTERNAL_JOBS", "GMAI_ENABLE_ALARM_NOTIFICATIONS", "GMAI_ENABLE_MAINTENANCE_DRAFT"]) {
    const env = validEnv(); delete env[name];
    assert.throws(() => parsePhase11ReferenceInputs(config, env), name);
  }
});

test("environment and API inputs reject ARN, URL, token, whitespace, foreign project and Region", () => {
  for (const value of [undefined, "", "private.example", "https://example.invalid", "${Token[TOKEN.1]}", "ABCDEF1234", "example123 ", "a".repeat(129)]) {
    assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), GMAI_EXISTING_HTTP_API_ID: value }));
  }
  for (const value of [undefined, "", "000000000000", "123", "${AWS::AccountId}"]) assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), CDK_DEFAULT_ACCOUNT: value }));
  assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), CDK_DEFAULT_REGION: "us-east-1" }));
  assert.throws(() => parsePhase11ReferenceInputs({ ...config, projectName: "another-project", providerApiKeyParameterName: "/another-project/dev/provider-api-key" }, validEnv()));
});

test("resource factory refuses a mixed existing app or caller-supplied invalid environment", () => {
  const app = new App(); new Stack(app, "Unrelated");
  const inputs = parsePhase11ReferenceInputs(config, validEnv());
  assert.throws(() => createPhase11ReferenceStacks(app, inputs, lambda.Code.fromInline("exports.handler=async()=>{};")), /APP_NOT_EMPTY/);
  assert.throws(() => createPhase11ReferenceStacks(new App(), { ...inputs, httpApiId: "${Token[TOKEN.1]}" }, lambda.Code.fromInline("exports.handler=async()=>{};")), /INPUT_INVALID/);
  assert.throws(() => createPhase11ReferenceStacks(new App(), { ...inputs, environment: { ...inputs.environment, region: "us-east-1" } }, lambda.Code.fromInline("exports.handler=async()=>{};")), /INPUT_INVALID/);
});

test("a changed valid API or account cannot reuse a different reference fingerprint", () => {
  assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), GMAI_EXISTING_HTTP_API_ID: "another123" }), /FINGERPRINT_MISMATCH/);
  assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), CDK_DEFAULT_ACCOUNT: "111111111111" }), /FINGERPRINT_MISMATCH/);
  assert.throws(() => parsePhase11ReferenceInputs(config, { ...validEnv(), GMAI_PHASE11_REFERENCE_FINGERPRINT: undefined }), /FINGERPRINT_MISMATCH/);
  const inputs = parsePhase11ReferenceInputs(config, validEnv());
  assert.throws(() => createPhase11ReferenceStacks(new App(), { ...inputs, httpApiId: "another123" }, lambda.Code.fromInline("exports.handler=async()=>{};")), /FINGERPRINT_MISMATCH/);
});

test("main app refuses the reference-only flag rather than accidentally adding base stacks", () => {
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")], { encoding: "utf8", timeout: 10_000, env: validEnv() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /main app refuses this scope/);
});

test("credential-free reference preflight validates inventory, IAM and cleanup without claiming live proof", () => {
  const packet = buildPhase11ReferenceApprovalPacket() as any;
  assert.equal(packet.awsCalls, 0);
  assert.equal(packet.cloudMutations, 0);
  assert.equal(packet.credentialsLoaded, false);
  assert.equal(packet.deploymentPerformed, false);
  assert.equal(packet.assembly.synthesizedStacks, 2);
  assert.equal(packet.assembly.baseStacksSynthesized, 0);
  assert.equal(packet.assembly.liveReferencesVerified, false);
  assert.equal(packet.assembly.workerImageDigestRequired, false);
  assert.equal(packet.assembly.upstreamDeploymentAuthorized, false);
  assert.equal(packet.crossStackImports.distinctImports, 0);
  assert.equal(packet.crossStackImports.readyForDeployment, false);
  assert.equal(packet.teardownSafety.retainedOrSnapshottedResources, 0);
  assert.equal(packet.alarmCircuitSecurity.ecsRunTaskAllowed, false);
  assert.equal(packet.alarmCircuitSecurity.passRoleAllowed, false);
  assert.equal(packet.alarmCircuitSecurity.dynamodbLeadingKey, "control_circuit");
  assert.equal(JSON.stringify(packet).includes(account), false);
  assert.equal(JSON.stringify(packet).includes("example123"), false);
});

test("CLI refuses unrequested execution and suppresses raw configuration values", () => {
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/phase11-reference-preflight.ts"), "--execute"], { encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /private details are suppressed/);
  const synth = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/phase11-drill-app.ts")], { encoding: "utf8", timeout: 10_000, env: { ...validEnv(), GMAI_EXISTING_HTTP_API_ID: "PRIVATE_BAD_VALUE" } });
  assert.notEqual(synth.status, 0);
  assert.equal(synth.stdout, "");
  assert.equal(synth.stderr.includes("PRIVATE_BAD_VALUE"), false);
});

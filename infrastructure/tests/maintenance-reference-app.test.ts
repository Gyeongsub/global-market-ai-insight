import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { App, Stack } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { loadProjectConfig } from "../lib/config.js";
import { createMaintenanceReferenceStack, maintenanceReferenceFingerprint, MAINTENANCE_DISABLED_FLAGS, parseMaintenanceReferenceInputs } from "../lib/maintenance-reference-app.js";
import { buildMaintenanceReferencePacket, inspectMaintenanceReferenceTemplate } from "../../scripts/maintenance-reference-preflight.js";

const account = ["123456", "789012"].join("");
const config = loadProjectConfig("infrastructure/environments/dev.example.json");
const validEnv = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(MAINTENANCE_DISABLED_FLAGS.map(name => [name, "false"])), CDK_DEFAULT_ACCOUNT: account, CDK_DEFAULT_REGION: config.region,
  GMAI_MAINTENANCE_REFERENCE_ONLY: "true", GMAI_ENABLE_MAINTENANCE_DRAFT: "true", GMAI_ACKNOWLEDGE_MAINTENANCE_DRILL_COST: "true",
  GMAI_MAINTENANCE_REFERENCE_FINGERPRINT: maintenanceReferenceFingerprint(account),
});
const outdir = mkdtempSync(join(tmpdir(), "gmai-maintenance-reference-test-"));
let original: any;
try {
  const app = new App({ outdir });
  const stack = createMaintenanceReferenceStack(app, parseMaintenanceReferenceInputs(config, validEnv()), lambda.Code.fromInline("exports.handler = async () => ({});"));
  original = Template.fromStack(stack).toJSON();
  const assembly = app.synth();
  assert.deepEqual(assembly.stacks.map(stack => stack.stackName), ["global-market-ai-insight-dev-maintenance"]);
  assert.deepEqual(assembly.manifest.missing ?? [], []);
} finally { rmSync(outdir, { recursive: true, force: true }); }
const changed = (type: string, mutate: (props: any, resource: any, template: any) => void) => {
  const copy = structuredClone(original);
  const resource: any = Object.values(copy.Resources).find((candidate: any) => candidate.Type === type);
  mutate(resource.Properties, resource, copy);
  return copy;
};

test("one reference-only disabled maintenance stack has no base resources, imports or lookup requests", () => {
  const report = inspectMaintenanceReferenceTemplate(original, account);
  assert.equal(report.synthesizedStacks, 1); assert.equal(report.baseStacksSynthesized, 0);
  assert.equal(report.disabledSchedule, true); assert.equal(report.crossStackImports, 0);
  assert.equal(report.lookupRequests, 0); assert.equal(report.retainedOrSnapshottedResources, 0);
  assert.equal(report.accountSharedConcurrency, true); assert.equal(report.reservedConcurrencyGuarantee, false);
  for (const key of ["readyForDeployment", "readyForLiveAcceptance", "liveReferencesVerified", "codeArtifactVerified", "runTaskAllowed", "passRoleAllowed", "secretReadAllowed", "modelCallsAllowed", "circuitWritesAllowed"] as const) assert.equal(report[key], false);
  assert.doesNotMatch(JSON.stringify(report), /arn:aws:|123456789012|global-market-ai-insight-dev/);
});

test("the main app cannot silently synthesize base stacks for a maintenance reference request", () => {
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/app.ts")], { encoding: "utf8", timeout: 10000, env: { ...process.env, ...validEnv() } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /main app refuses this scope/);
});

test("all scope flags are explicit and no notifications, runtime, metrics or alarm automation flag can join", () => {
  for (const name of MAINTENANCE_DISABLED_FLAGS) for (const value of [undefined, "true", "FALSE", "1", ""]) {
    assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), [name]: value }));
  }
  for (const name of ["GMAI_MAINTENANCE_REFERENCE_ONLY", "GMAI_ENABLE_MAINTENANCE_DRAFT", "GMAI_ACKNOWLEDGE_MAINTENANCE_DRILL_COST"]) {
    for (const value of [undefined, "false", "TRUE", " true"]) assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), [name]: value }));
  }
  assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), GMAI_WORKER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}` }));
});

test("foreign identity/config/fingerprint and mixed apps cannot become owned-resource proof", () => {
  for (const value of [undefined, "", "000000000000", "123", "PRIVATE_SENTINEL", "${AWS::AccountId}"]) assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), CDK_DEFAULT_ACCOUNT: value }));
  assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), CDK_DEFAULT_REGION: "us-east-1" }));
  assert.throws(() => parseMaintenanceReferenceInputs(config, { ...validEnv(), GMAI_MAINTENANCE_REFERENCE_FINGERPRINT: "a".repeat(64) }));
  assert.throws(() => parseMaintenanceReferenceInputs({ ...config, maxActiveJobs: 3 }, validEnv()));
  const app = new App(); new Stack(app, "Unrelated");
  assert.throws(() => createMaintenanceReferenceStack(app, parseMaintenanceReferenceInputs(config, validEnv()), lambda.Code.fromInline("exports.handler=async()=>{};")));
  assert.throws(() => inspectMaintenanceReferenceTemplate(original, "111111111111"));
});

test("changed schedules, concurrency, timeout, code delivery, environment and resource retention fail closed", () => {
  const cases: Array<[string, (props: any, resource: any, template: any) => void]> = [
    ["AWS::Events::Rule", props => { props.State = "ENABLED"; }],
    ["AWS::Events::Rule", props => { props.ScheduleExpression = "rate(1 minute)"; }],
    ["AWS::Events::Rule", props => { props.Targets[0].RetryPolicy.MaximumRetryAttempts = 1; }],
    ["AWS::Lambda::Function", props => { props.Timeout = 900; }],
    ["AWS::Lambda::Function", props => { props.ReservedConcurrentExecutions = 1; }],
    ["AWS::Lambda::Function", props => { props.Environment.Variables.SECRET = "PRIVATE_SENTINEL"; }],
    ["AWS::Lambda::Function", props => { props.Code.ImageUri = "unreviewed"; }],
    ["AWS::Lambda::Function", props => { props.VpcConfig = {}; }],
    ["AWS::Logs::LogGroup", (_props, resource) => { resource.DeletionPolicy = "Retain"; }],
    ["AWS::IAM::Role", props => { props.ManagedPolicyArns = ["AdministratorAccess"]; }],
    ["AWS::Lambda::Permission", props => { props.Principal = "*"; }],
    ["AWS::Lambda::Permission", props => { delete props.SourceArn; }],
    ["AWS::Lambda::Function", (_props, resource) => { resource.Condition = "Unreviewed"; }],
    ["AWS::Lambda::Function", (_props, _resource, template) => { template.Resources.Extra = { Type: "AWS::SNS::Topic" }; }],
  ];
  for (const [type, mutation] of cases) assert.throws(() => inspectMaintenanceReferenceTemplate(changed(type, mutation), account), type);
});

test("every DynamoDB key/transaction constraint and exact ECS cluster boundary is enforced", () => {
  const mutate = (action: string, update: (statement: any) => void) => changed("AWS::IAM::Policy", props => {
    const statement = props.PolicyDocument.Statement.find((entry: any) => [entry.Action].flat().includes(action)); update(statement);
  });
  for (const action of ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:ConditionCheckItem", "dynamodb:DeleteItem"]) {
    assert.throws(() => inspectMaintenanceReferenceTemplate(mutate(action, statement => { statement.Resource = "*"; }), account));
    assert.throws(() => inspectMaintenanceReferenceTemplate(mutate(action, statement => { statement.Condition["ForAllValues:StringLike"]["dynamodb:LeadingKeys"] = ["*"]; }), account));
    assert.throws(() => inspectMaintenanceReferenceTemplate(mutate(action, statement => { delete statement.Condition.Null; }), account));
  }
  assert.throws(() => inspectMaintenanceReferenceTemplate(mutate("dynamodb:DeleteItem", statement => { delete statement.Condition["ForAnyValue:StringEquals"]; }), account));
  assert.throws(() => inspectMaintenanceReferenceTemplate(mutate("dynamodb:ConditionCheckItem", statement => {
    statement.Condition["ForAnyValue:StringEquals"] = { "dynamodb:EnclosingOperation": ["TransactWriteItems"] };
  }), account));
  assert.throws(() => inspectMaintenanceReferenceTemplate(mutate("ecs:StopTask", statement => { statement.Condition = {}; }), account));
  assert.throws(() => inspectMaintenanceReferenceTemplate(mutate("ecs:StopTask", statement => { statement.Action.push("ecs:RunTask"); }), account));
});

test("local packet removes its synthetic assembly and cannot claim live code, ownership or deployment", () => {
  const report = buildMaintenanceReferencePacket();
  assert.equal(report.temporaryAssemblyRemoved, true); assert.equal(report.syntheticAccountOnly, true);
  assert.equal(report.inlineStubOnly, true); assert.equal(report.awsCalls, 0); assert.equal(report.cloudMutations, 0);
  assert.equal(report.deploymentPerformed, false); assert.equal(report.codeArtifactVerified, false);
});

test("CLI rejects execution switches and suppresses sensitive inputs", () => {
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/maintenance-reference-preflight.ts"), "--execute"], { encoding: "utf8", timeout: 10000 });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.match(result.stderr, /private details are suppressed/);
  const app = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("infrastructure/bin/maintenance-drill-app.ts")],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, ...validEnv(), GMAI_MAINTENANCE_REFERENCE_FINGERPRINT: "PRIVATE_SENTINEL" } });
  assert.notEqual(app.status, 0); assert.equal(app.stdout, ""); assert.equal(app.stderr.includes("PRIVATE_SENTINEL"), false);
});

import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { App } from "aws-cdk-lib/core";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { loadProjectConfig } from "../infrastructure/lib/config.js";
import { createMaintenanceReferenceStack, maintenanceReferenceFingerprint, MAINTENANCE_PREFIX as PREFIX } from "../infrastructure/lib/maintenance-reference-app.js";

type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as RecordValue;
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : [value]; }
// Resolve only literal ARN joins and the fixed AWS partition, never arbitrary
// intrinsics, environment values, account reads, lookups or reference outputs.
function literalArn(value: unknown): string {
  if (typeof value === "string") return value;
  const record = object(value);
  assert.deepEqual(Object.keys(record), ["Fn::Join"]);
  const pieces = record["Fn::Join"];
  assert.ok(Array.isArray(pieces) && pieces.length === 2 && pieces[0] === "" && Array.isArray(pieces[1]));
  return pieces[1].map((part: unknown) => {
    if (typeof part === "string") return part;
    assert.deepEqual(part, { Ref: "AWS::Partition" });
    return "aws";
  }).join("");
}

/** Exact local template review, not deployed IAM or source ownership evidence. */
export function inspectMaintenanceReferenceTemplate(value: unknown, expectedAccount: string) {
  maintenanceReferenceFingerprint(expectedAccount);
  const template = object(value), resources = object(template.Resources);
  assert.equal(template.Outputs, undefined);
  assert.equal(template.Transform, undefined);
  assert.equal(template.Conditions, undefined);
  assert.doesNotMatch(JSON.stringify(template), /Fn::ImportValue|AWS::CDK::Metadata/);
  const counts: Record<string, number> = {};
  for (const resource of Object.values(resources)) {
    const typed = object(resource);
    assert.ok(Object.keys(typed).every(key => ["Type", "Properties", "DeletionPolicy", "UpdateReplacePolicy", "DependsOn", "Metadata"].includes(key)));
    assert.equal(typeof typed.Type, "string");
    counts[String(typed.Type)] = (counts[String(typed.Type)] ?? 0) + 1;
    assert.ok(typed.DeletionPolicy === undefined || typed.DeletionPolicy === "Delete");
    assert.ok(typed.UpdateReplacePolicy === undefined || typed.UpdateReplacePolicy === "Delete");
  }
  const inventory = Object.fromEntries(Object.entries(counts).sort());
  assert.deepEqual(inventory, {
    "AWS::Events::Rule": 1, "AWS::IAM::Policy": 1, "AWS::IAM::Role": 1,
    "AWS::Lambda::Function": 1, "AWS::Lambda::Permission": 1, "AWS::Logs::LogGroup": 1,
  });
  const unique = (type: string): [string, RecordValue] => {
    const entries = Object.entries(resources).filter(([, value]) => object(value).Type === type);
    assert.equal(entries.length, 1);
    assert.match(entries[0]![0], /^[A-Za-z][A-Za-z0-9]{0,254}$/);
    return [entries[0]![0], object(object(entries[0]![1]).Properties)];
  };
  const [roleId, role] = unique("AWS::IAM::Role"), [logId, log] = unique("AWS::Logs::LogGroup");
  const [functionId, fn] = unique("AWS::Lambda::Function"), [ruleId, rule] = unique("AWS::Events::Rule");
  assert.deepEqual(role.AssumeRolePolicyDocument, { Version: "2012-10-17",
    Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" } }] });
  for (const key of ["ManagedPolicyArns", "Policies", "PermissionsBoundary"]) assert.equal(role[key], undefined);
  assert.equal(log.LogGroupName, `/aws/lambda/${PREFIX}-maintenance`);
  assert.ok(log.RetentionInDays === 7 || log.RetentionInDays === 14);
  const logResource = object(resources[logId]);
  assert.equal(logResource.DeletionPolicy, "Delete"); assert.equal(logResource.UpdateReplacePolicy, "Delete");
  assert.equal(fn.FunctionName, `${PREFIX}-maintenance`);
  assert.ok(Object.keys(fn).every(key => ["FunctionName", "Description", "Runtime", "Architectures", "Handler", "Code", "Role", "MemorySize", "Timeout", "Environment", "LoggingConfig", "Tags"].includes(key)));
  assert.deepEqual(fn.LoggingConfig, { LogGroup: { Ref: logId } });
  assert.equal(fn.Runtime, "nodejs22.x"); assert.deepEqual(fn.Architectures, ["x86_64"]);
  assert.equal(fn.Handler, "main.handler"); assert.equal(fn.MemorySize, 128); assert.equal(fn.Timeout, 45);
  assert.deepEqual(fn.Role, { "Fn::GetAtt": [roleId, "Arn"] });
  assert.equal(fn.ReservedConcurrentExecutions, undefined);
  for (const key of ["VpcConfig", "Layers", "DeadLetterConfig", "FileSystemConfigs", "TracingConfig", "EnvironmentEncryptionKey"]) assert.equal(fn[key], undefined);
  const cluster = `arn:aws:ecs:ap-northeast-1:${expectedAccount}:cluster/${PREFIX}-worker`;
  const table = `arn:aws:dynamodb:ap-northeast-1:${expectedAccount}:table/${PREFIX}-jobs`;
  assert.deepEqual(fn.Environment, { Variables: { JOBS_TABLE_NAME: `${PREFIX}-jobs`, WORKER_CLUSTER_ARN: cluster, MAX_ACTIVE_JOBS: "2" } });
  const code = object(fn.Code);
  assert.ok(Object.keys(code).length > 0 && Object.keys(code).every(key => ["ZipFile", "S3Bucket", "S3Key", "S3ObjectVersion"].includes(key)));
  if (Object.hasOwn(code, "ZipFile")) assert.ok(Object.keys(code).length === 1 && typeof code.ZipFile === "string" && code.ZipFile.length > 0 && code.ZipFile.length <= 4096);
  else assert.ok(Object.hasOwn(code, "S3Bucket") && Object.hasOwn(code, "S3Key"));
  assert.equal(rule.Name, `${PREFIX}-maintenance`); assert.equal(rule.State, "DISABLED");
  assert.equal(rule.ScheduleExpression, "rate(5 minutes)"); assert.equal(rule.EventPattern, undefined);
  const targets = rule.Targets;
  assert.ok(Array.isArray(targets) && targets.length === 1);
  const target = object(targets[0]);
  assert.deepEqual(target.Arn, { "Fn::GetAtt": [functionId, "Arn"] });
  assert.deepEqual(target.RetryPolicy, { MaximumEventAgeInSeconds: 300, MaximumRetryAttempts: 0 });
  assert.ok(Object.keys(target).every(key => ["Arn", "Id", "RetryPolicy"].includes(key)));
  const [, permission] = unique("AWS::Lambda::Permission");
  assert.deepEqual(permission, { Action: "lambda:InvokeFunction", FunctionName: { "Fn::GetAtt": [functionId, "Arn"] },
    Principal: "events.amazonaws.com", SourceArn: { "Fn::GetAtt": [ruleId, "Arn"] } });
  const [, policy] = unique("AWS::IAM::Policy");
  assert.deepEqual(policy.Roles, [{ Ref: roleId }]); assert.equal(policy.Users, undefined); assert.equal(policy.Groups, undefined);
  const document = object(policy.PolicyDocument);
  assert.equal(document.Version, "2012-10-17");
  const statements = document.Statement;
  assert.ok(Array.isArray(statements) && statements.length === 6);
  const keyed = [
    { actions: ["dynamodb:GetItem"], keys: ["job_*", "control_slot_0", "control_slot_1"], transactional: false },
    { actions: ["dynamodb:UpdateItem"], keys: ["job_*"], transactional: false },
    { actions: ["dynamodb:ConditionCheckItem"], keys: ["job_*"], transactional: false },
    { actions: ["dynamodb:DeleteItem"], keys: ["control_slot_0", "control_slot_1"], transactional: true },
  ];
  const seen = new Set<string>();
  for (const raw of statements) {
    const statement = object(raw), actions = list(statement.Action).sort();
    assert.equal(statement.Effect, "Allow");
    assert.ok(Object.keys(statement).every(key => ["Effect", "Action", "Resource", "Condition"].includes(key)));
    const actionKey = JSON.stringify(actions); assert.equal(seen.has(actionKey), false); seen.add(actionKey);
    const scope = keyed.find(entry => JSON.stringify(entry.actions) === actionKey);
    if (scope) {
      assert.equal(literalArn(statement.Resource), table);
      assert.deepEqual(statement.Condition, { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": scope.keys },
        Null: { "dynamodb:LeadingKeys": "false" },
        ...(scope.transactional ? { "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } : {}) });
    } else if (actionKey === JSON.stringify(["ecs:DescribeTasks", "ecs:StopTask"])) {
      assert.equal(literalArn(statement.Resource), cluster.replace(":cluster/", ":task/") + "/*");
      assert.deepEqual(statement.Condition, { ArnEquals: { "ecs:cluster": cluster } });
    } else {
      assert.deepEqual(actions, ["logs:CreateLogStream", "logs:PutLogEvents"]);
      assert.deepEqual(statement.Resource, { "Fn::Join": ["", [{ "Fn::GetAtt": [logId, "Arn"] }, ":*"]] });
      assert.equal(statement.Condition, undefined);
    }
  }
  return { mode: "local-maintenance-reference-preflight", synthesizedStacks: 1, baseStacksSynthesized: 0,
    inventory, crossStackImports: 0, lookupRequests: 0, disabledSchedule: true, scheduleEnablementPerformed: false,
    maxActiveSlots: 2, conditionalSlotReleaseOnly: true, exactClusterTaskBoundary: true,
    secretReadAllowed: false, modelCallsAllowed: false, runTaskAllowed: false, passRoleAllowed: false,
    circuitWritesAllowed: false, retainedOrSnapshottedResources: 0, codeArtifactVerified: false,
    accountSharedConcurrency: true, reservedConcurrencyGuarantee: false,
    liveReferencesVerified: false, awsCalls: 0, cloudMutations: 0, deploymentPerformed: false,
    readyForDeployment: false, readyForLiveAcceptance: false, readyForPublication: false, rawIdentifiersPrinted: false };
}

export function buildMaintenanceReferencePacket() {
  const outdir = mkdtempSync(join(tmpdir(), "gmai-maintenance-preflight-"));
  assert.equal(dirname(resolve(outdir)), resolve(tmpdir()));
  const ownedRealPath = realpathSync(outdir);
  try {
    const account = ["123456", "789012"].join("");
    const app = new App({ outdir });
    const stack = createMaintenanceReferenceStack(app, { config: loadProjectConfig("infrastructure/environments/dev.example.json"),
      account, referenceFingerprint: maintenanceReferenceFingerprint(account) }, lambda.Code.fromInline("exports.handler = async () => ({});"));
    const report = inspectMaintenanceReferenceTemplate(Template.fromStack(stack).toJSON(), account);
    const assembly = app.synth();
    assert.deepEqual(assembly.stacks.map(stack => stack.stackName), [`${PREFIX}-maintenance`]);
    assert.deepEqual(assembly.manifest.missing ?? [], []);
    return { ...report, syntheticAccountOnly: true, inlineStubOnly: true, temporaryAssemblyRemoved: true };
  } finally {
    assert.equal(realpathSync(outdir), ownedRealPath);
    rmSync(outdir, { recursive: true, force: true });
  }
}

/** Proposed policy only; no role exists and no policy is attached. Resolve the
 * exact reviewed intrinsics using the fresh caller's account, not overrides.
 * CloudFormation LogGroup.Arn includes :*, before our stream suffix is added. */
export function buildMaintenancePolicyForSimulation(account: string) {
  maintenanceReferenceFingerprint(account);
  const outdir = mkdtempSync(join(tmpdir(), "gmai-maintenance-preflight-"));
  assert.equal(dirname(resolve(outdir)), resolve(tmpdir()));
  const ownedRealPath = realpathSync(outdir);
  try {
    const app = new App({ outdir });
    const stack = createMaintenanceReferenceStack(app, { config: loadProjectConfig("infrastructure/environments/dev.example.json"),
      account, referenceFingerprint: maintenanceReferenceFingerprint(account) }, lambda.Code.fromInline("exports.handler = async () => ({});"));
    const template = Template.fromStack(stack).toJSON();
    inspectMaintenanceReferenceTemplate(template, account);
    const entries = Object.entries(template.Resources) as Array<[string, RecordValue]>;
    const logId = entries.find(([, value]) => value.Type === "AWS::Logs::LogGroup")![0];
    const document = object(object(entries.find(([, value]) => value.Type === "AWS::IAM::Policy")![1].Properties).PolicyDocument);
    const resolveValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(resolveValue);
      if (value !== null && typeof value === "object") {
        const record = object(value);
        if (Object.hasOwn(record, "Fn::GetAtt")) {
          assert.deepEqual(record, { "Fn::GetAtt": [logId, "Arn"] });
          return `arn:aws:logs:ap-northeast-1:${account}:log-group:/aws/lambda/${PREFIX}-maintenance:*`;
        }
        if (Object.hasOwn(record, "Ref")) { assert.deepEqual(record, { Ref: "AWS::Partition" }); return "aws"; }
        if (Object.hasOwn(record, "Fn::Join")) {
          assert.deepEqual(Object.keys(record), ["Fn::Join"]);
          const parts = record["Fn::Join"];
          assert.ok(Array.isArray(parts) && parts.length === 2 && parts[0] === "" && Array.isArray(parts[1]));
          const literals = parts[1].map(resolveValue); assert.ok(literals.every((part: unknown) => typeof part === "string"));
          return literals.join("");
        }
        return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, resolveValue(value)]));
      }
      return value;
    };
    const policy = object(resolveValue(document));
    assert.doesNotMatch(JSON.stringify(policy), /Fn::|"Ref"/);
    return policy;
  } finally { assert.equal(realpathSync(outdir), ownedRealPath); rmSync(outdir, { recursive: true, force: true }); }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    if (process.argv.length !== 2) throw new Error("MAINTENANCE_PREFLIGHT_ARGUMENTS_INVALID");
    console.log(JSON.stringify(buildMaintenanceReferencePacket()));
  } catch {
    console.error("Maintenance reference-only preflight failed; private details are suppressed.");
    process.exitCode = 1;
  }
}

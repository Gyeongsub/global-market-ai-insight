import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluatePhase11ConsoleExportNames, evaluatePhase11Imports } from "./phase11-import-readiness.js";
import { phase11ReferenceFingerprint } from "../infrastructure/lib/phase11-reference-identity.js";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

interface AssemblyArtifact {
  type?: string;
  properties?: { templateFile?: string; stackName?: string };
}

interface AssemblyManifest {
  artifacts?: Record<string, AssemblyArtifact>;
}

interface TemplateResource {
  Type?: string;
  Properties?: Record<string, unknown>;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
}

interface CloudFormationTemplate {
  Resources?: Record<string, TemplateResource>;
}

const STACK_IDS = [
  "global-market-ai-insight-dev-alarm-circuit",
  "global-market-ai-insight-dev-api",
  "global-market-ai-insight-dev-compute",
  "global-market-ai-insight-dev-foundation",
  "global-market-ai-insight-dev-operations",
] as const;

const TARGET_STACK_IDS = [
  "global-market-ai-insight-dev-operations",
  "global-market-ai-insight-dev-alarm-circuit",
] as const;

const FLAGS = {
  GMAI_ENABLE_API: "true",
  GMAI_ENABLE_INTERNAL_JOBS: "false",
  GMAI_ENABLE_OPERATIONS: "true",
  GMAI_ENABLE_MAINTENANCE_DRAFT: "false",
  GMAI_ENABLE_ALARM_NOTIFICATIONS: "false",
  GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST: "false",
  GMAI_ENABLE_CUSTOM_OPERATION_METRICS: "true",
  GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST: "true",
  GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION: "true",
  GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST: "true",
} as const;

/** Local synthesis must not inherit login, endpoint overrides or cloud opt-ins. */
export function phase11CredentialFreeSynthEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return cleanSourceChildEnvironment(source);
}

const EXPECTED_OPERATIONS_INVENTORY = {
  "AWS::CloudWatch::Alarm": 6,
  "AWS::CloudWatch::Dashboard": 1,
  "AWS::Logs::MetricFilter": 3,
} as const;

const EXPECTED_ALARM_CIRCUIT_INVENTORY = {
  "AWS::Events::Rule": 1,
  "AWS::IAM::Policy": 1,
  "AWS::IAM::Role": 1,
  "AWS::Lambda::EventInvokeConfig": 1,
  "AWS::Lambda::Function": 1,
  "AWS::Lambda::Permission": 1,
  "AWS::Logs::LogGroup": 1,
} as const;

function typeCounts(template: CloudFormationTemplate): Record<string, number> {
  const counts = new Map<string, number>();
  for (const resource of Object.values(template.Resources ?? {})) {
    assert.ok(resource.Type, "Every synthesized resource must have a type.");
    counts.set(resource.Type, (counts.get(resource.Type) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function count(counts: Record<string, number>, type: string): number {
  return counts[type] ?? 0;
}

function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), "Expected a synthesized object.");
  return value as Record<string, unknown>;
}

function resourcesOfType(template: CloudFormationTemplate, type: string): TemplateResource[] {
  return Object.values(template.Resources ?? {}).filter(resource => resource.Type === type);
}

export function readPhase11AssemblyJson(outdir: string, file: string): unknown {
  assert.equal(isAbsolute(file), false, "Assembly template paths must be relative.");
  const candidate = resolve(outdir, file);
  for (const [base, path] of [[outdir, candidate], [realpathSync(outdir), realpathSync(candidate)]] as const) {
    const offset = relative(base, path);
    assert.ok(offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`), "Assembly template escaped its output directory.");
  }
  assert.ok(lstatSync(candidate).isFile() && lstatSync(candidate).size <= 2_000_000, "Assembly template must be a bounded regular file.");
  return JSON.parse(readFileSync(candidate, "utf8"));
}

function assertSafeTargetInventory(operations: Record<string, number>, alarmCircuit: Record<string, number>): void {
  assert.deepEqual(operations, EXPECTED_OPERATIONS_INVENTORY, "Operations inventory changed from the reviewed drill scope.");
  assert.deepEqual(alarmCircuit, EXPECTED_ALARM_CIRCUIT_INVENTORY, "Alarm circuit inventory changed from the reviewed drill scope.");

  for (const type of [
    "AWS::SNS::Topic",
    "AWS::SNS::Subscription",
    "AWS::KMS::Key",
    "AWS::Scheduler::Schedule",
    "AWS::ECS::Service",
    "AWS::ElasticLoadBalancingV2::LoadBalancer",
    "AWS::EC2::NatGateway",
    "AWS::EC2::EIP",
  ]) {
    assert.equal(count(operations, type) + count(alarmCircuit, type), 0, `Unexpected cost or notification resource: ${type}`);
  }
}

function inspectTeardownSafety(
  operationsTemplate: CloudFormationTemplate,
  alarmCircuitTemplate: CloudFormationTemplate,
): Record<string, unknown> {
  let explicitDeleteResources = 0;
  for (const template of [operationsTemplate, alarmCircuitTemplate]) {
    for (const resource of Object.values(template.Resources ?? {})) {
      assert.ok(
        resource.DeletionPolicy === undefined || resource.DeletionPolicy === "Delete",
        "A drill resource would be retained or snapshotted after stack deletion.",
      );
      assert.ok(
        resource.UpdateReplacePolicy === undefined || resource.UpdateReplacePolicy === "Delete",
        "A replaced drill resource would be retained or snapshotted.",
      );
      if (resource.DeletionPolicy === "Delete") explicitDeleteResources += 1;
    }
  }

  const logGroups = resourcesOfType(alarmCircuitTemplate, "AWS::Logs::LogGroup");
  assert.equal(logGroups.length, 1);
  assert.equal(logGroups[0]!.DeletionPolicy, "Delete");
  assert.equal(logGroups[0]!.UpdateReplacePolicy, "Delete");

  return {
    retainedOrSnapshottedResources: 0,
    explicitDeleteResources,
    alarmCircuitLogGroupDeletionPolicy: "Delete",
    alarmCircuitLogGroupUpdateReplacePolicy: "Delete",
  };
}

export function inspectAlarmCircuitSecurity(template: CloudFormationTemplate, expectedAccount = ["123456", "789012"].join(""), unreservedDrill = false): Record<string, unknown> {
  const prefix = "global-market-ai-insight-dev";
  assert.match(expectedAccount, /^(?!0{12}$)\d{12}$/, "Expected a verified account shape.");
  const account = expectedAccount;
  assert.equal(typeof unreservedDrill, "boolean");
  const alarmNames = ["ControllerErrors", "ControllerThrottles", "ApiServerErrors", "TaskLaunchFailures", "ProviderFailures", "ModelFailures"].map(suffix => `${prefix}-${suffix}`);
  const uniqueId = (type: string) => {
    const entries = Object.entries(template.Resources ?? {}).filter(([, resource]) => resource.Type === type);
    assert.equal(entries.length, 1, "Expected one security-scoped resource.");
    const id = entries[0]![0];
    assert.match(id, /^[A-Za-z][A-Za-z0-9]{0,254}$/);
    return id;
  };
  const roleId = uniqueId("AWS::IAM::Role");
  const logId = uniqueId("AWS::Logs::LogGroup");
  const functionId = uniqueId("AWS::Lambda::Function");
  const ruleId = uniqueId("AWS::Events::Rule");
  const role = object(template.Resources![roleId]!.Properties);
  assert.deepEqual(role.AssumeRolePolicyDocument, {
    Version: "2012-10-17", Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" } }],
  }, "Only Lambda may assume the drill role.");
  assert.equal(role.ManagedPolicyArns, undefined, "No uninspected managed-policy attachment is allowed.");
  assert.equal(role.Policies, undefined, "No uninspected inline role policy is allowed.");
  const log = object(template.Resources![logId]!.Properties);
  assert.equal(log.LogGroupName, `/aws/lambda/${prefix}-alarm-circuit`);
  assert.ok(log.RetentionInDays === 7 || log.RetentionInDays === 14);
  const policies = resourcesOfType(template, "AWS::IAM::Policy");
  assert.equal(policies.length, 1);
  const policyProperties = object(policies[0]!.Properties);
  assert.deepEqual(policyProperties.Roles, [{ Ref: roleId }]);
  assert.equal(policyProperties.Users, undefined);
  assert.equal(policyProperties.Groups, undefined);
  const policyDocument = object(policyProperties.PolicyDocument);
  assert.equal(policyDocument.Version, "2012-10-17");
  const statements = policyDocument.Statement;
  assert.ok(Array.isArray(statements) && statements.length === 2);
  const actions = statements.flatMap(statement => {
    const action = object(statement).Action;
    return Array.isArray(action) ? action : [action];
  });
  assert.ok(actions.every(action => typeof action === "string"));
  assert.deepEqual([...actions].sort(), [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
  ]);
  assert.equal(actions.some(action => /ecs:|iam:PassRole|dynamodb:PutItem|dynamodb:DeleteItem/.test(String(action))), false);
  for (const statement of statements) {
    const entry = object(statement);
    assert.equal(entry.Effect, "Allow");
    assert.equal(entry.NotAction, undefined);
    assert.equal(entry.NotResource, undefined);
    assert.ok(Object.keys(entry).every(key => ["Action", "Condition", "Effect", "Resource"].includes(key)));
  }
  const dynamo = statements.find(statement => {
    const action = object(statement).Action;
    return Array.isArray(action) && action.includes("dynamodb:UpdateItem");
  });
  assert.ok(dynamo);
  assert.deepEqual([...(object(dynamo).Action as string[])].sort(), ["dynamodb:GetItem", "dynamodb:UpdateItem"]);
  assert.deepEqual(object(dynamo).Condition, {
    "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["control_circuit"] },
    Null: { "dynamodb:LeadingKeys": "false" },
  });
  const tableResource = object(object(dynamo).Resource);
  if (Object.hasOwn(tableResource, "Fn::ImportValue")) {
    assert.deepEqual(Object.keys(tableResource), ["Fn::ImportValue"]);
    assert.match(String(tableResource["Fn::ImportValue"]), /^global-market-ai-insight-dev-foundation:ExportsOutputFnGetAttJobsTable[A-Z0-9]{8}Arn[A-Z0-9]{8}$/);
  } else {
    assert.deepEqual(tableResource, { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:dynamodb:ap-northeast-1:${account}:table/${prefix}-jobs`]] });
  }
  const logsStatement = statements.find(statement => {
    const action = object(statement).Action;
    return Array.isArray(action) && action.includes("logs:PutLogEvents");
  });
  assert.ok(logsStatement);
  assert.deepEqual([...(object(logsStatement).Action as string[])].sort(), ["logs:CreateLogStream", "logs:PutLogEvents"]);
  assert.equal(object(logsStatement).Condition, undefined);
  assert.deepEqual(object(logsStatement).Resource, { "Fn::Join": ["", [{ "Fn::GetAtt": [logId, "Arn"] }, ":*"]] });

  const functions = resourcesOfType(template, "AWS::Lambda::Function");
  assert.equal(functions.length, 1);
  const functionProperties = object(functions[0]!.Properties);
  assert.equal(functionProperties.FunctionName, `${prefix}-alarm-circuit`);
  assert.equal(functionProperties.Runtime, "nodejs22.x");
  assert.deepEqual(functionProperties.Architectures, ["x86_64"]);
  assert.deepEqual(functionProperties.Role, { "Fn::GetAtt": [roleId, "Arn"] });
  assert.equal(functionProperties.MemorySize, 128);
  assert.equal(functionProperties.Timeout, 5);
  if (unreservedDrill) assert.equal(Object.hasOwn(functionProperties, "ReservedConcurrentExecutions"), false);
  else assert.equal(functionProperties.ReservedConcurrentExecutions, 1);
  const environmentVariables = object(object(functionProperties.Environment).Variables);
  assert.deepEqual(Object.keys(environmentVariables).sort(), [
    "ALLOWED_ALARM_NAMES_JSON",
    "EXPECTED_ACCOUNT_ID",
    "JOBS_TABLE_NAME",
  ]);
  assert.equal(environmentVariables.EXPECTED_ACCOUNT_ID, account);
  if (typeof environmentVariables.JOBS_TABLE_NAME === "string") assert.equal(environmentVariables.JOBS_TABLE_NAME, `${prefix}-jobs`);
  else {
    const tableName = object(environmentVariables.JOBS_TABLE_NAME);
    assert.deepEqual(Object.keys(tableName), ["Fn::ImportValue"]);
    assert.match(String(tableName["Fn::ImportValue"]), /^global-market-ai-insight-dev-foundation:ExportsOutputRefJobsTable[A-Z0-9]{16}$/);
  }
  assert.deepEqual(JSON.parse(String(environmentVariables.ALLOWED_ALARM_NAMES_JSON)), alarmNames);

  const invokeConfigs = resourcesOfType(template, "AWS::Lambda::EventInvokeConfig");
  assert.equal(invokeConfigs.length, 1);
  const invokeProperties = object(invokeConfigs[0]!.Properties);
  assert.deepEqual(invokeProperties.FunctionName, { Ref: functionId });
  assert.equal(invokeProperties.Qualifier, "$LATEST");
  assert.equal(invokeProperties.MaximumRetryAttempts, 1);
  assert.equal(invokeProperties.MaximumEventAgeInSeconds, 60);

  const rules = resourcesOfType(template, "AWS::Events::Rule");
  assert.equal(rules.length, 1);
  const ruleProperties = object(rules[0]!.Properties);
  assert.equal(ruleProperties.Name, `${prefix}-alarm-circuit`);
  assert.equal(ruleProperties.State, "ENABLED");
  const pattern = object(ruleProperties.EventPattern);
  assert.deepEqual(pattern, { source: ["aws.cloudwatch"], "detail-type": ["CloudWatch Alarm State Change"], detail: { alarmName: alarmNames, state: { value: ["ALARM"] } } });
  const detail = object(pattern.detail);
  const state = object(detail.state);
  assert.deepEqual(pattern.source, ["aws.cloudwatch"]);
  assert.deepEqual(pattern["detail-type"], ["CloudWatch Alarm State Change"]);
  assert.deepEqual(detail.alarmName, alarmNames);
  assert.deepEqual(state.value, ["ALARM"]);
  assert.ok(Array.isArray(ruleProperties.Targets) && ruleProperties.Targets.length === 1);
  const target = object(ruleProperties.Targets[0]);
  assert.deepEqual(target, { Arn: { "Fn::GetAtt": [functionId, "Arn"] }, Id: "Target0", RetryPolicy: { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 1 } });
  const permissions = resourcesOfType(template, "AWS::Lambda::Permission");
  assert.equal(permissions.length, 1);
  assert.deepEqual(permissions[0]!.Properties, {
    Action: "lambda:InvokeFunction", FunctionName: { "Fn::GetAtt": [functionId, "Arn"] },
    Principal: "events.amazonaws.com", SourceArn: { "Fn::GetAtt": [ruleId, "Arn"] },
  });

  return {
    allowedIamActions: [...actions].sort(),
    wildcardResources: false,
    exactRoleTrustAndAttachments: true,
    logStreamWildcardScopedToNewGroup: true,
    invocationScopedToExactRule: true,
    dynamodbLeadingKey: "control_circuit",
    ecsRunTaskAllowed: false,
    passRoleAllowed: false,
    environmentSecretValues: false,
    lambda: { memoryMiB: 128, timeoutSeconds: 5, reservedConcurrency: unreservedDrill ? null : 1,
      accountSharedConcurrencyDrill: unreservedDrill, asyncRetryAttempts: 1, maxEventAgeSeconds: 60 },
    eventRule: { source: "aws.cloudwatch", detailType: "CloudWatch Alarm State Change", alarmNames: 6, state: "ALARM", targetRetryAttempts: 1, maxEventAgeSeconds: 60 },
  };
}

/** Inspect a private account-specific assembly without returning its identifiers or granting execution. */
export function inspectPhase11ReferenceAssembly(outdir: string, expectedAccount: string, unreservedDrill = false): Record<string, unknown> {
  assert.match(expectedAccount, /^(?!0{12}$)\d{12}$/, "Expected a verified account shape.");
  const manifest = readPhase11AssemblyJson(outdir, "manifest.json") as AssemblyManifest & { missing?: unknown[] };
  assert.deepEqual(manifest.missing ?? [], [], "Reference assembly must not request context lookups.");
  const stacks = Object.entries(manifest.artifacts ?? {}).filter(([, value]) => value.type === "aws:cloudformation:stack");
  assert.deepEqual(stacks.map(([id]) => id).sort(), [...TARGET_STACK_IDS].sort());
  const templates = stacks.map(([id, artifact]) => {
    assert.equal((artifact as { environment?: string }).environment, `aws://${expectedAccount}/ap-northeast-1`);
    // CDK omits stackName when it is identical to the artifact ID.
    assert.equal(artifact.properties?.stackName ?? id, id);
    assert.ok(artifact.properties?.templateFile);
    const template = readPhase11AssemblyJson(outdir, artifact.properties.templateFile) as CloudFormationTemplate;
    assert.equal(JSON.stringify(template).includes("Fn::ImportValue"), false);
    assert.equal(Object.keys((template as { Outputs?: unknown }).Outputs ?? {}).length, 0);
    return [id, template] as const;
  });
  const byId = new Map(templates);
  const operations = byId.get(TARGET_STACK_IDS[0])!;
  const alarmCircuit = byId.get(TARGET_STACK_IDS[1])!;
  const inventory = { operations: typeCounts(operations), alarmCircuit: typeCounts(alarmCircuit) };
  assertSafeTargetInventory(inventory.operations, inventory.alarmCircuit);
  return { synthesizedStacks: 2, baseStacksSynthesized: 0, imports: 0, contextLookups: 0,
    resourceInventory: inventory, alarmCircuitSecurity: inspectAlarmCircuitSecurity(alarmCircuit, expectedAccount, unreservedDrill),
    teardownSafety: inspectTeardownSafety(operations, alarmCircuit), rawIdentifiersPrinted: false,
    readyForDeployment: false, liveReferencesStillRequired: true };
}

function buildPhase11Packet(consoleExportObservation: unknown, referenceOnly: boolean): Record<string, unknown> {
  const outdir = mkdtempSync(join(tmpdir(), "gmai-phase11-preflight-"));
  const temporaryRoot = realpathSync(tmpdir());
  const physicalOutdir = realpathSync(outdir);
  const temporaryOffset = relative(temporaryRoot, physicalOutdir);
  assert.ok(temporaryOffset !== "" && temporaryOffset !== ".." && !isAbsolute(temporaryOffset) && !temporaryOffset.startsWith(`..${sep}`), "Preflight output must remain inside the temporary directory.");
  try {
    const env: NodeJS.ProcessEnv = {
      ...phase11CredentialFreeSynthEnvironment(process.env),
      ...FLAGS,
      AWS_EC2_METADATA_DISABLED: "true",
      CDK_OUTDIR: outdir,
      CDK_DEFAULT_ACCOUNT: ["123456", "789012"].join(""),
      CDK_DEFAULT_REGION: "ap-northeast-1",
      GMAI_CONFIG: resolve("infrastructure/environments/dev.example.json"),
      GMAI_WORKER_IMAGE_DIGEST: `sha256:${"0".repeat(64)}`,
      GMAI_PHASE11_REFERENCE_ONLY: referenceOnly ? "true" : "false",
    };
    if (referenceOnly) {
      env.GMAI_PHASE11_REFERENCE_ONLY = "true";
      env.GMAI_EXISTING_HTTP_API_ID = "example123";
      env.GMAI_PHASE11_REFERENCE_FINGERPRINT = phase11ReferenceFingerprint(env.CDK_DEFAULT_ACCOUNT!, "example123");
      delete env.GMAI_WORKER_IMAGE_DIGEST;
    }

    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve(referenceOnly ? "infrastructure/bin/phase11-drill-app.ts" : "infrastructure/bin/app.ts")],
      { env, encoding: "utf8", timeout: 90_000, windowsHide: true, maxBuffer: 2_000_000 },
    );
    assert.equal(result.status, 0, "Credential-free Phase 11 synthesis failed.");
    assert.equal(result.signal, null, "Credential-free Phase 11 synthesis was interrupted.");

    const manifest = readPhase11AssemblyJson(outdir, "manifest.json") as AssemblyManifest;
    const stacks = Object.entries(manifest.artifacts ?? {})
      .filter(([, artifact]) => artifact.type === "aws:cloudformation:stack");
    assert.deepEqual(stacks.map(([id]) => id).sort(), [...(referenceOnly ? TARGET_STACK_IDS : STACK_IDS)].sort());
    const missingContext = (manifest as { missing?: unknown[] }).missing ?? [];
    if (referenceOnly) assert.deepEqual(missingContext, [], "Reference assembly must not request context lookups.");
    const byId = new Map(stacks);
    const load = (id: (typeof TARGET_STACK_IDS)[number]) => {
      const file = byId.get(id)?.properties?.templateFile;
      assert.ok(file, "Target stack template is missing from the local assembly.");
      return readPhase11AssemblyJson(outdir, file) as CloudFormationTemplate;
    };
    const operationsTemplate = load(TARGET_STACK_IDS[0]);
    const alarmCircuitTemplate = load(TARGET_STACK_IDS[1]);
    const operations = typeCounts(operationsTemplate);
    const alarmCircuit = typeCounts(alarmCircuitTemplate);
    assertSafeTargetInventory(operations, alarmCircuit);
    const alarmCircuitSecurity = inspectAlarmCircuitSecurity(alarmCircuitTemplate);
    const teardownSafety = inspectTeardownSafety(operationsTemplate, alarmCircuitTemplate);
    const targetTemplates = {
      [TARGET_STACK_IDS[0]]: operationsTemplate,
      [TARGET_STACK_IDS[1]]: alarmCircuitTemplate,
    };
    const crossStackImports = consoleExportObservation === undefined
      ? evaluatePhase11Imports(targetTemplates)
      : evaluatePhase11ConsoleExportNames(targetTemplates, consoleExportObservation);
    if (referenceOnly) {
      assert.equal(crossStackImports.distinctImports, 0, "Reference-only assembly must not require deployed exports.");
      assert.equal(crossStackImports.unresolvedImports, 0);
      for (const template of [operationsTemplate, alarmCircuitTemplate]) {
        assert.equal(JSON.stringify(template).includes("Fn::ImportValue"), false);
        assert.equal(Object.keys((template as { Outputs?: unknown }).Outputs ?? {}).length, 0);
      }
    }

    return {
      mode: referenceOnly ? "local-phase11-reference-only-approval-packet" : "local-phase11-approval-packet",
      preparedRegion: "ap-northeast-1",
      awsCalls: 0,
      cloudMutations: 0,
      credentialsLoaded: false,
      deploymentPerformed: false,
      intendedTargetStacks: [...TARGET_STACK_IDS],
      deploymentOrder: [...TARGET_STACK_IDS],
      teardownOrder: [TARGET_STACK_IDS[1], TARGET_STACK_IDS[0]],
      resourceInventory: { operations, alarmCircuit },
      alarmCircuitSecurity,
      teardownSafety,
      crossStackImports,
      assembly: {
        referenceOnly,
        synthesizedStacks: stacks.length,
        baseStacksSynthesized: referenceOnly ? 0 : 3,
        contextLookupsRequested: missingContext.length,
        liveReferencesVerified: false,
        workerImageDigestRequired: !referenceOnly,
        upstreamDeploymentAuthorized: false,
      },
      gates: FLAGS,
      controlledSignalStage: {
        internalJobsEnabled: false,
        maximumRetainedHours: 2,
        circuitTransition: "separately-approved exact-version CLOSED, then alarm automation must restore OPEN",
        syntheticLogEvents: 2,
        logBatchesMax: 1,
        fargateLaunchesMax: 0,
        providerCallsMax: 0,
        bedrockCallsMax: 0,
        safeEndState: "OPEN",
      },
      approvalsStillRequired: [
        "fresh AWS identity, Region, Budget and retained-resource inventory",
        "current Tokyo pricing and exact account-specific CloudFormation diff",
        referenceOnly
          ? "fresh same-account resource-owner proof for the exact existing API, controller, table and three log groups"
          : "fresh complete export inventory for every exact target import; no blind exclusive retry or upstream update",
        "deployment of the two target stacks",
        "temporary exact-version circuit close and one synthetic log batch",
        "teardown and delayed-billing verification",
      ],
    };
  } finally {
    assert.ok(!lstatSync(outdir).isSymbolicLink() && realpathSync(outdir) === physicalOutdir, "Refuse cleanup of a redirected temporary output.");
    rmSync(outdir, { recursive: true, force: true });
  }
}

export function buildPhase11LocalApprovalPacket(consoleExportObservation?: unknown): Record<string, unknown> {
  return buildPhase11Packet(consoleExportObservation, false);
}

export function buildPhase11ReferenceApprovalPacket(): Record<string, unknown> {
  return buildPhase11Packet(undefined, true);
}

function main(): void {
  if (process.argv.length !== 2) throw new Error("This preflight accepts no arguments and never executes AWS operations.");
  console.log(JSON.stringify(buildPhase11LocalApprovalPacket()));
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try { main(); }
  catch { console.error("Phase 11 local preflight failed; raw synthesis details are suppressed."); process.exitCode = 1; }
}

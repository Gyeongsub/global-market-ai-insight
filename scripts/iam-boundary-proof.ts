import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, isAbsolute, resolve } from "node:path";
import { lstatSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { collectPhase11Readiness, createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { PATCH } from "./promote-worker-patch.js";

const PREFIX = "global-market-ai-insight-dev", REGION = "ap-northeast-1", STACK = `${PREFIX}-compute`;
type Json = Record<string, any>;
type Query = (service: string, operation: string, extra: string[]) => Json;
type RoleKind = "controller" | "worker" | "execution";
export interface BoundaryTargets {
  account: string; cluster: string; task: string; table: string; secret: string; model: string;
  roles: Record<RoleKind, { arn: string; name: string; policy: string; trust: Json }>;
}
export interface SimulationCase {
  name: string; role: RoleKind; action: string; resource: string; expected: "allowed" | "implicitDeny";
  context: { ContextKeyName: string; ContextKeyValues: string[]; ContextKeyType: "string" | "stringList" }[];
}
const fail = (code: string): never => { throw new Error(`IAM_BOUNDARY_${code}`); };
const hash = (value: unknown) => createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
const object = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);
function whole(response: Json, key: string): Json[] {
  if (!object(response) || response.NextToken != null || response.Marker != null || response.IsTruncated === true ||
      !Array.isArray(response[key]) || response[key].length > 100 || response[key].some((entry: unknown) => !object(entry))) fail("COLLECTION_INCOMPLETE");
  return response[key];
}

/** Bind roles to exact current stack physical IDs, live Lambda/task references,
 * and the original owned template. No caller-selected identity is accepted. */
export function deriveBoundaryTargets(identity: Json, controller: Json, taskResponse: Json, summaries: Json, templateResponse: Json): BoundaryTargets {
  const account = identity.Account;
  if (typeof account !== "string" || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || identity.Arn !== `arn:aws:iam::${account}:user/aws-admin-user`) fail("IDENTITY_INVALID");
  const env = controller.Environment?.Variables, task = taskResponse.taskDefinition;
  if (controller.FunctionName !== `${PREFIX}-controller` || controller.FunctionArn !== `arn:aws:lambda:${REGION}:${account}:function:${PREFIX}-controller` ||
      controller.State !== "Active" || controller.LastUpdateStatus !== "Successful" || env?.ENABLE_PROVIDER_BACKED_JOBS !== "false" ||
      env.ENABLE_LIVE_RESULT_DISPLAY !== "false" || env.JOBS_TABLE_NAME !== `${PREFIX}-jobs` || !object(task) ||
      task.taskDefinitionArn !== env.WORKER_TASK_DEFINITION || !new RegExp(`^arn:aws:ecs:${REGION}:${account}:task-definition/${PREFIX}-worker:[1-9][0-9]{0,5}$`).test(task.taskDefinitionArn) ||
      env.WORKER_CLUSTER !== `arn:aws:ecs:${REGION}:${account}:cluster/${PREFIX}-worker` || !Array.isArray(task.containerDefinitions) || task.containerDefinitions.length !== 1) fail("LIVE_SCOPE_INVALID");
  const worker = task.containerDefinitions[0], secret = `arn:aws:ssm:${REGION}:${account}:parameter/global-market-ai-insight/dev/market-data/api-key`;
  if (worker.image !== `${account}.dkr.ecr.${REGION}.amazonaws.com/${PREFIX}-worker@${PATCH.runtimeDigest}` ||
      hash(worker.secrets) !== hash([{ name: "TWELVE_DATA_API_KEY", valueFrom: secret }]) ||
      !Array.isArray(worker.environment) || worker.environment.filter((entry: Json) => entry.name === "BEDROCK_MODEL_ID" && entry.value === "amazon.nova-lite-v1:0").length !== 1) fail("TASK_SCOPE_INVALID");
  const resources = whole(summaries, "StackResourceSummaries"), ids = new Set<string>();
  for (const entry of resources) {
    if (typeof entry.LogicalResourceId !== "string" || ids.has(entry.LogicalResourceId) || !/^(?:CREATE|UPDATE)_COMPLETE$/.test(entry.ResourceStatus)) fail("STACK_OWNERSHIP_INVALID");
    ids.add(entry.LogicalResourceId);
  }
  const body = typeof templateResponse.TemplateBody === "string" ? JSON.parse(templateResponse.TemplateBody) : templateResponse.TemplateBody;
  if (!object(body?.Resources)) fail("TEMPLATE_INVALID");
  const physical = (type: string, id: string) => {
    const matches = resources.filter(entry => entry.ResourceType === type && entry.LogicalResourceId === id);
    if (matches.length !== 1 || typeof matches[0].PhysicalResourceId !== "string") fail("STACK_OWNERSHIP_INVALID");
    return matches[0].PhysicalResourceId as string;
  };
  const functionIds = Object.entries(body.Resources).filter(([, value]) => object(value) && value.Type === "AWS::Lambda::Function" && value.Properties?.FunctionName === `${PREFIX}-controller`);
  const taskIds = Object.entries(body.Resources).filter(([, value]) => object(value) && value.Type === "AWS::ECS::TaskDefinition" && value.Properties?.Family === `${PREFIX}-worker`);
  if (functionIds.length !== 1 || taskIds.length !== 1 || physical("AWS::Lambda::Function", functionIds[0][0]) !== controller.FunctionName ||
      physical("AWS::ECS::TaskDefinition", taskIds[0][0]) !== task.taskDefinitionArn) fail("STACK_OWNERSHIP_INVALID");
  const roles = {} as BoundaryTargets["roles"];
  for (const [kind, prefix, service] of [["controller", "ControllerRole", "lambda.amazonaws.com"], ["worker", "WorkerTaskRole", "ecs-tasks.amazonaws.com"], ["execution", "WorkerExecutionRole", "ecs-tasks.amazonaws.com"]] as const) {
    const matches = Object.entries(body.Resources).filter(([id, value]) => new RegExp(`^${prefix}[A-F0-9]{8}$`).test(id) && object(value) && value.Type === "AWS::IAM::Role");
    if (matches.length !== 1) fail("ROLE_OWNERSHIP_INVALID");
    const [logical, resource] = matches[0] as [string, Json], name = physical("AWS::IAM::Role", logical);
    if (!/^[A-Za-z0-9+=,.@_-]{1,64}$/.test(name)) fail("ROLE_OWNERSHIP_INVALID");
    const trust = resource.Properties?.AssumeRolePolicyDocument;
    if (!object(trust) || !Array.isArray(trust.Statement) || trust.Statement.length !== 1 ||
        hash(trust.Statement[0]) !== hash({ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: service } })) fail("TRUST_SCOPE_INVALID");
    const policies = Object.entries(body.Resources).filter(([, value]) => object(value) && value.Type === "AWS::IAM::Policy" &&
      hash(value.Properties?.Roles) === hash([{ Ref: logical }]));
    if (policies.length !== 1) fail("POLICY_OWNERSHIP_INVALID");
    const [policyId, policyResource] = policies[0] as [string, Json], policy = policyResource.Properties?.PolicyName;
    // CloudFormation's inline-policy physical ID is opaque, not PolicyName.
    // Bind its exact logical ownership and template PolicyName, then verify
    // that exact name/role with GetRolePolicy and complete inline inventories.
    const policyPhysical = physical("AWS::IAM::Policy", policyId);
    if (typeof policy !== "string" || !/^[A-Za-z0-9+=,.@_-]{1,128}$/.test(policy) ||
        !/^[A-Za-z0-9+=,.@_/-]{1,1024}$/.test(policyPhysical)) fail("POLICY_OWNERSHIP_INVALID");
    roles[kind] = { name, arn: `arn:aws:iam::${account}:role/${name}`, policy, trust };
  }
  const lambdaProperties = (functionIds[0][1] as Json).Properties, taskProperties = (taskIds[0][1] as Json).Properties;
  const refArn = (value: Json) => value?.["Fn::GetAtt"]?.length === 2 && value["Fn::GetAtt"][1] === "Arn" ? physical("AWS::IAM::Role", value["Fn::GetAtt"][0]) : null;
  if (controller.Role !== roles.controller.arn || task.taskRoleArn !== roles.worker.arn || task.executionRoleArn !== roles.execution.arn ||
      refArn(lambdaProperties.Role) !== roles.controller.name || refArn(taskProperties.TaskRoleArn) !== roles.worker.name ||
      refArn(taskProperties.ExecutionRoleArn) !== roles.execution.name) fail("ROLE_REFERENCE_INVALID");
  return { account, roles, task: task.taskDefinitionArn, cluster: env.WORKER_CLUSTER, secret,
    table: `arn:aws:dynamodb:${REGION}:${account}:table/${PREFIX}-jobs`, model: `arn:aws:bedrock:${REGION}::foundation-model/amazon.nova-lite-v1:0` };
}

export function boundaryMatrix(t: BoundaryTargets): SimulationCase[] {
  const context = (name: string, value: string, list = false) => [{ ContextKeyName: name, ContextKeyValues: [value], ContextKeyType: list ? "stringList" as const : "string" as const }];
  const entry = (name: string, role: RoleKind, action: string, resource: string, allowed: boolean, ctx: SimulationCase["context"] = []): SimulationCase =>
    ({ name, role, action, resource, expected: allowed ? "allowed" : "implicitDeny", context: ctx });
  const next = t.task.replace(/:([0-9]+)$/, (_, revision) => `:${Number(revision) + 1}`);
  const cases = [
    entry("controller-approved-task", "controller", "ecs:RunTask", t.task, true, context("ecs:cluster", t.cluster)),
    entry("controller-unapproved-revision", "controller", "ecs:RunTask", next, false, context("ecs:cluster", t.cluster)),
    entry("controller-wrong-cluster", "controller", "ecs:RunTask", t.task, false, context("ecs:cluster", `${t.cluster}-unapproved-simulation`)),
    entry("controller-pass-execution", "controller", "iam:PassRole", t.roles.execution.arn, true, context("iam:PassedToService", "ecs-tasks.amazonaws.com")),
    entry("controller-pass-worker", "controller", "iam:PassRole", t.roles.worker.arn, true, context("iam:PassedToService", "ecs-tasks.amazonaws.com")),
    entry("controller-wrong-service", "controller", "iam:PassRole", t.roles.execution.arn, false, context("iam:PassedToService", "lambda.amazonaws.com")),
    entry("controller-unapproved-role", "controller", "iam:PassRole", `arn:aws:iam::${t.account}:role/${PREFIX}-unapproved-simulation`, false, context("iam:PassedToService", "ecs-tasks.amazonaws.com")),
    entry("worker-cannot-launch", "worker", "ecs:RunTask", t.task, false, context("ecs:cluster", t.cluster)),
    entry("worker-cannot-pass-role", "worker", "iam:PassRole", t.roles.execution.arn, false, context("iam:PassedToService", "ecs-tasks.amazonaws.com")),
    entry("execution-cannot-launch", "execution", "ecs:RunTask", t.task, false, context("ecs:cluster", t.cluster)),
    entry("controller-cannot-read-secret", "controller", "ssm:GetParameters", t.secret, false),
    entry("controller-cannot-invoke-model", "controller", "bedrock:InvokeModel", t.model, false),
    entry("execution-secret-injection", "execution", "ssm:GetParameters", t.secret, true),
    entry("worker-job-update", "worker", "dynamodb:UpdateItem", t.table, true, context("dynamodb:LeadingKeys", `job_${"a".repeat(48)}`, true)),
    entry("worker-cannot-reset-circuit", "worker", "dynamodb:UpdateItem", t.table, false, context("dynamodb:LeadingKeys", "control_circuit", true)),
    entry("controller-circuit-condition-check", "controller", "dynamodb:ConditionCheckItem", t.table, true, context("dynamodb:LeadingKeys", "control_circuit", true)),
    entry("controller-cannot-condition-check-job", "controller", "dynamodb:ConditionCheckItem", t.table, false, context("dynamodb:LeadingKeys", `job_${"a".repeat(48)}`, true)),
  ];
  // Principal simulation evaluates attached policy conditions even for deny
  // cases. Supply every known condition key; a deny caused merely by absent
  // inputs is not proof of a least-privilege resource/action boundary.
  const defaults = [
    ...context("ecs:cluster", t.cluster), ...context("iam:PassedToService", "ecs-tasks.amazonaws.com"),
    ...context("dynamodb:LeadingKeys", `job_${"a".repeat(48)}`, true),
    ...context("dynamodb:EnclosingOperation", "TransactWriteItems"),
  ];
  return cases.map(item => ({ ...item, context: defaults.map(value => item.context.find(override => override.ContextKeyName === value.ContextKeyName) ?? value) }));
}

/** Read individual-resource decisions, not merely an aggregate allow. */
export function reviewBoundarySimulation(value: Json, expected: SimulationCase) {
  if (value.IsTruncated !== false) fail("SIMULATION_INCOMPLETE");
  const results = whole(value, "EvaluationResults");
  if (results.length !== 1) fail("SIMULATION_INCOMPLETE");
  const result = results[0], specific = result.ResourceSpecificResults;
  // AWS marks MissingContextValues optional; omission means no keys reported,
  // not an unknown decision. Null/malformed/nonempty fields still fail.
  const noMissing = (values: unknown) => values === undefined || Array.isArray(values) && values.length === 0;
  if (typeof result.EvalActionName !== "string" || result.EvalActionName.toLowerCase() !== expected.action.toLowerCase() || result.EvalDecision !== expected.expected ||
      !noMissing(result.MissingContextValues) || !Array.isArray(specific) || specific.length !== 1 ||
      specific[0]?.EvalResourceName !== expected.resource || specific[0].EvalResourceDecision !== expected.expected ||
      !noMissing(specific[0].MissingContextValues)) fail("SIMULATION_UNVERIFIED");
  return { case: expected.name, expected: expected.expected, verified: true };
}

/** Preserve failures while finishing the fixed read-only matrix and its closing
 * snapshot. A mismatch is not a thrown early success or permission waiver. */
export function recordBoundarySimulation(value: unknown, expected: SimulationCase) {
  try { if (!object(value)) throw new Error("SIMULATION_SHAPE_INVALID");
    return { ...reviewBoundarySimulation(value, expected), reason: "EXACT_DECISION_VERIFIED" }; }
  catch { return { case: expected.name, expected: expected.expected, verified: false, reason: "SIMULATION_UNVERIFIED" }; }
}
export function summarizeBoundaryResults(results: ReturnType<typeof recordBoundarySimulation>[]) {
  if (results.length !== 17 || new Set(results.map(r => r.case)).size !== 17) fail("MATRIX_INCOMPLETE");
  return { simulations: results.length, results,
    expectedAllowCases: results.filter(r => r.expected === "allowed").length,
    expectedDenyCases: results.filter(r => r.expected === "implicitDeny").length,
    verifiedAllowCases: results.filter(r => r.expected === "allowed" && r.verified).length,
    verifiedDenyCases: results.filter(r => r.expected === "implicitDeny" && r.verified).length,
    allExpectedDecisionsVerified: results.every(r => r.verified), unverifiedCases: results.filter(r => !r.verified).map(r => r.case),
    readyForDeployment: false };
}

export function boundaryProofPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, simulationsMax: 17, awsCallsMax: 70, actualWorkloadCalls: 0, iamWrites: 0,
    roleAssumptions: 0, credentialsRetrieved: false, providerSecretRead: false, publicationPerformed: false, simulatorIsLiveAuthorizationProof: false };
}

export function executeBoundaryProof() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(), env = phase11ReadOnlyChildEnvironment(process.env); let calls = 0;
  const consume = () => { if (++calls > 70 || Date.now() - started >= 900_000) fail("DEADLINE_OR_CALL_LIMIT"); };
  const query: Query = (service, operation, extra) => {
    consume();
    // All callers below are fixed reads or simulation. No additional policy,
    // boundary, resource-policy, caller override or exclusion is provided.
    const allowed = new Set(["cloudformation.list-stack-resources", "cloudformation.get-template", "iam.get-role", "iam.list-role-policies",
      "iam.get-role-policy", "iam.list-attached-role-policies", "iam.simulate-principal-policy"]);
    if (!allowed.has(`${service}.${operation}`)) fail("QUERY_REJECTED");
    const result = spawnSync(aws!, [service, operation, ...extra, "--profile", "gmai-admin", "--region", REGION, "--no-cli-pager", "--no-paginate", "--output", "json"],
      { env, encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null) fail("READ_UNVERIFIED");
    return JSON.parse(result.stdout);
  };
  const snapshot = () => {
    const reader = createPhase11ReadOnlyCliRunner(); let identity: Json | undefined, controller: Json | undefined, task: Json | undefined;
    const observedReads: Json[] = [];
    const report = collectPhase11Readiness(args => { consume(); const value = reader(args) as Json;
      observedReads.push({ args: [...args], value });
      if (args[0] === "sts") identity = value; if (args[0] === "lambda") controller = value; if (args[1] === "describe-task-definition") task = value; return value; });
    if (report.readyForAccountSpecificDiff !== true || !identity || !controller || !task) fail("BASELINE_BLOCKED");
    const resources = query("cloudformation", "list-stack-resources", ["--stack-name", STACK]);
    const template = query("cloudformation", "get-template", ["--stack-name", STACK, "--template-stage", "Original"]);
    const targets = deriveBoundaryTargets(identity!, controller!, task!, resources, template), policies: Json = {};
    for (const [kind, target] of Object.entries(targets.roles)) {
      const role = query("iam", "get-role", ["--role-name", target.name]).Role;
      const inline = query("iam", "list-role-policies", ["--role-name", target.name, "--max-items", "100"]);
      const attached = query("iam", "list-attached-role-policies", ["--role-name", target.name, "--max-items", "100"]);
      if (!object(role) || role.Arn !== target.arn || role.RoleName !== target.name || role.Path !== "/" || role.PermissionsBoundary != null ||
          typeof role.RoleId !== "string" || !/^AROA[A-Z0-9]{17}$/.test(role.RoleId) || hash(role.AssumeRolePolicyDocument) !== hash(target.trust) ||
          inline.IsTruncated !== false || inline.Marker != null || inline.NextToken != null || hash(inline.PolicyNames) !== hash([target.policy]) ||
          attached.IsTruncated !== false || whole(attached, "AttachedPolicies").length !== 0) fail("ROLE_POLICY_UNVERIFIED");
      const policy = query("iam", "get-role-policy", ["--role-name", target.name, "--policy-name", target.policy]);
      if (policy.RoleName !== target.name || policy.PolicyName !== target.policy || !object(policy.PolicyDocument)) fail("ROLE_POLICY_UNVERIFIED");
      policies[kind] = { arn: role.Arn, id: role.RoleId, path: role.Path, trust: role.AssumeRolePolicyDocument, duration: role.MaxSessionDuration, policy: policy.PolicyDocument };
    }
    return { targets, fingerprint: hash({ observedReads, resources, template, controller, task, targets, policies, circuit: report.circuit }) };
  };
  const before = snapshot(), results = [];
  for (const item of boundaryMatrix(before.targets)) {
    const args = ["--policy-source-arn", before.targets.roles[item.role].arn, "--action-names", item.action, "--resource-arns", item.resource, "--max-items", "100"];
    if (item.context.length) args.push("--context-entries", JSON.stringify(item.context));
    results.push(recordBoundarySimulation(query("iam", "simulate-principal-policy", args), item));
  }
  const after = snapshot(); if (before.fingerprint !== after.fingerprint) fail("CLOSING_STATE_CHANGED");
  return { mode: "owned-live-iam-boundary-simulation", awsCalls: calls, ...summarizeBoundaryResults(results), rolePolicyAndRuntimeUnchanged: true,
    jobsEnabled: false, displayEnabled: false, circuitVersionUnchanged: true, emptyTaskServiceAndSlotInventory: true,
    actualWorkloadCalls: 0, iamWrites: 0, roleAssumptions: 0, credentialsRetrieved: false, providerSecretRead: false,
    privateIdentifiersPrinted: false, simulatorIsLiveAuthorizationProof: false, readyForPublication: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(boundaryProofPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-read-only") fail("ARGUMENTS_REJECTED");
      const report = executeBoundaryProof(); console.log(JSON.stringify(report)); if (!report.allExpectedDecisionsVerified) process.exitCode = 1; }
  } catch (error) {
    const code = error instanceof Error && /^IAM_BOUNDARY_[A-Z_]{1,80}$/.test(error.message) ? error.message : "IAM_BOUNDARY_INCOMPLETE";
    console.error(JSON.stringify({ error: code, privateDetailsSuppressed: true, iamWrites: 0, actualWorkloadCalls: 0 })); process.exitCode = 1;
  }
}

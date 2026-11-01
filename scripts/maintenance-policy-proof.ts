import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectMaintenanceReferenceReadiness } from "./maintenance-reference-readiness.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { reviewBoundarySimulation, type SimulationCase } from "./iam-boundary-proof.js";
import { canonicalPatchValue } from "./compute-patch-rollout.js";

type Json = Record<string, any>;
const REGION = "ap-northeast-1", PREFIX = "global-market-ai-insight-dev";
class MaintenancePolicyError extends Error {
  constructor(readonly code: string, readonly stage: string = "unknown") { super(`MAINTENANCE_POLICY_${code}`); }
}
function fail(code: string, stage = "unknown"): never { throw new MaintenancePolicyError(code, stage); }
const hash = (value: unknown) => createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
export type MaintenancePolicyCase = Omit<SimulationCase, "role">;
export function maintenancePolicyMatrix(account: string): MaintenancePolicyCase[] {
  if (typeof account !== "string" || !/^(?!0{12}$)[0-9]{12}$/.test(account)) fail("IDENTITY_INVALID");
  const cluster = `arn:aws:ecs:${REGION}:${account}:cluster/${PREFIX}-worker`;
  const task = cluster.replace(":cluster/", ":task/") + "/" + "a".repeat(32);
  const table = `arn:aws:dynamodb:${REGION}:${account}:table/${PREFIX}-jobs`;
  const stream = `arn:aws:logs:${REGION}:${account}:log-group:/aws/lambda/${PREFIX}-maintenance:log-stream:synthetic-policy-proof`;
  const defaults: SimulationCase["context"] = [
    { ContextKeyName: "dynamodb:LeadingKeys", ContextKeyValues: [`job_${"a".repeat(48)}`], ContextKeyType: "stringList" },
    { ContextKeyName: "dynamodb:EnclosingOperation", ContextKeyValues: ["TransactWriteItems"], ContextKeyType: "string" },
    { ContextKeyName: "ecs:cluster", ContextKeyValues: [cluster], ContextKeyType: "string" },
  ];
  const entry = (name: string, action: string, resource: string, allowed: boolean, overrides: Record<string, string[]> = {}): MaintenancePolicyCase => ({
    name, action, resource, expected: allowed ? "allowed" : "implicitDeny", context: defaults.map(value => ({ ...value, ContextKeyValues: overrides[value.ContextKeyName] ?? [...value.ContextKeyValues] })),
  });
  const keys = (...values: string[]) => ({ "dynamodb:LeadingKeys": values });
  return [
    entry("get-slot-zero", "dynamodb:GetItem", table, true, keys("control_slot_0")),
    entry("get-slot-one", "dynamodb:GetItem", table, true, keys("control_slot_1")),
    entry("get-owned-job", "dynamodb:GetItem", table, true),
    entry("update-owned-job", "dynamodb:UpdateItem", table, true),
    entry("check-owned-job-in-transaction", "dynamodb:ConditionCheckItem", table, true),
    entry("release-slot-zero-in-transaction", "dynamodb:DeleteItem", table, true, keys("control_slot_0")),
    entry("release-slot-one-in-transaction", "dynamodb:DeleteItem", table, true, keys("control_slot_1")),
    entry("describe-owned-cluster-task", "ecs:DescribeTasks", task, true),
    entry("stop-owned-cluster-task", "ecs:StopTask", task, true),
    entry("create-only-maintenance-stream", "logs:CreateLogStream", stream, true),
    entry("write-only-maintenance-stream", "logs:PutLogEvents", stream, true),
    entry("cannot-read-circuit", "dynamodb:GetItem", table, false, keys("control_circuit")),
    entry("cannot-update-circuit", "dynamodb:UpdateItem", table, false, keys("control_circuit")),
    entry("cannot-update-slot", "dynamodb:UpdateItem", table, false, keys("control_slot_0")),
    entry("cannot-delete-job", "dynamodb:DeleteItem", table, false),
    entry("cannot-delete-slot-outside-transaction", "dynamodb:DeleteItem", table, false, { ...keys("control_slot_0"), "dynamodb:EnclosingOperation": ["DeleteItem"] }),
    entry("cannot-condition-check-control-slot", "dynamodb:ConditionCheckItem", table, false, keys("control_slot_0")),
    entry("cannot-read-mixed-circuit-keys", "dynamodb:GetItem", table, false, keys("control_slot_0", "control_circuit")),
    entry("cannot-read-unconfigured-slot", "dynamodb:GetItem", table, false, keys("control_slot_2")),
    entry("cannot-update-other-table", "dynamodb:UpdateItem", table + "-foreign-simulation", false),
    entry("cannot-stop-other-cluster-task", "ecs:StopTask", task.replace(`${PREFIX}-worker/`, `${PREFIX}-foreign-simulation/`), false),
    entry("cannot-stop-with-other-cluster-context", "ecs:StopTask", task, false, { "ecs:cluster": [cluster + "-foreign-simulation"] }),
    entry("cannot-launch-task", "ecs:RunTask", `arn:aws:ecs:${REGION}:${account}:task-definition/${PREFIX}-worker:1`, false),
    entry("cannot-pass-role", "iam:PassRole", `arn:aws:iam::${account}:role/${PREFIX}-synthetic-unapproved`, false),
    entry("cannot-read-provider-secret", "ssm:GetParameters", `arn:aws:ssm:${REGION}:${account}:parameter/global-market-ai-insight/dev/market-data/api-key`, false),
    entry("cannot-invoke-model", "bedrock:InvokeModel", `arn:aws:bedrock:${REGION}::foundation-model/amazon.nova-lite-v1:0`, false),
    entry("cannot-scan-table", "dynamodb:Scan", table, false),
    entry("cannot-query-table", "dynamodb:Query", table, false),
    entry("cannot-write-other-log-group", "logs:PutLogEvents", stream.replace("-maintenance:", "-controller:"), false),
    entry("cannot-create-log-group", "logs:CreateLogGroup", stream.split(":log-stream:")[0]!, false),
    entry("cannot-publish-notification", "sns:Publish", `arn:aws:sns:${REGION}:${account}:${PREFIX}-synthetic-unapproved`, false),
  ];
}
export function reviewMaintenanceSimulation(value: Json, expected: MaintenancePolicyCase) {
  // The shared reviewer checks exact aggregate AND single-resource decision,
  // no truncation/missing context. It does not use this compatibility role.
  return reviewBoundarySimulation(value, { ...expected, role: "worker" });
}
/** Keep checking independent read-only cases, but never turn a mismatch into
 * authorization. Only the fixed matrix name/expected decision escape. */
export function maintenanceLogPositiveControl(expected: MaintenancePolicyCase) {
  const account = /^arn:aws:logs:ap-northeast-1:([0-9]{12}):log-group:/.exec(expected.resource)?.[1];
  if (!account || !expected.action.startsWith("logs:") ||
    !maintenancePolicyMatrix(account).some(item => item.name === expected.name && hash(item) === hash(expected))) fail("CONTROL_CASE_INVALID");
  // Unattached diagnostic only. Never attach this universal Resource grant.
  return { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: expected.action, Resource: "*" }] };
}
export function recordMaintenanceSimulation(value: Json, expected: MaintenancePolicyCase, positiveControl?: Json) {
  if (expected.action.startsWith("logs:")) {
    try {
      if (!positiveControl) throw new Error("MISSING_CONTROL");
      reviewMaintenanceSimulation(positiveControl, { ...expected, expected: "allowed" });
    } catch {
      return { case: expected.name, expected: expected.expected, verified: false,
        simulatorCoverageVerified: false, reason: "LOG_RESOURCE_POSITIVE_CONTROL_UNVERIFIED" };
    }
  }
  try { return reviewMaintenanceSimulation(value, expected); }
  catch { return { case: expected.name, expected: expected.expected, verified: false }; }
}
export function maintenancePolicyProofPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 64, proposedPolicySimulationsMax: 31, logPositiveControlsMax: 4,
    actualWorkloadCalls: 0, iamWrites: 0, roleAssumptions: 0, rolesCreated: 0,
    secretContentReads: 0, taskStops: 0, policyAttached: false, sourceCodeExecutedInCloud: false,
    simulatorIsLiveAuthorizationProof: false, readyForDeployment: false, readyForPublication: false };
}
export function maintenanceSnapshotReadFingerprint(value: unknown) {
  const expected: Record<string, number> = { "sts.get-caller-identity": 1, "lambda.get-function-configuration": 1,
    "budgets.describe-budgets": 1, "cloudformation.describe-stacks": 1, "ecs.list-tasks": 2,
    "ecs.list-services": 1, "ecs.describe-task-definition": 1, "dynamodb.get-item": 3,
    "cloudformation.list-stack-resources": 2, "dynamodb.describe-table": 1 };
  if (!Array.isArray(value) || value.length !== 14) fail("SNAPSHOT_READS_INCOMPLETE");
  const observed: Record<string, number> = {}, commands = new Set();
  for (const item of value) {
    if (!item || typeof item !== "object" || !Array.isArray(item.args) || item.args.length < 2 ||
      !item.args.every((arg: unknown) => typeof arg === "string") || !item.value || typeof item.value !== "object" || Array.isArray(item.value)) fail("SNAPSHOT_RESPONSE_INVALID");
    const key = item.args.slice(0, 2).join("."), command = hash(item.args);
    if (!Object.hasOwn(expected, key) || commands.has(command)) fail("SNAPSHOT_SCOPE_INVALID");
    commands.add(command); observed[key] = (observed[key] ?? 0) + 1;
  }
  if (hash(observed) !== hash(expected)) fail("SNAPSHOT_READS_INCOMPLETE");
  return hash(value);
}
export async function executeMaintenancePolicyProof() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const { buildMaintenancePolicyForSimulation } = await import("./maintenance-reference-preflight.js");
  const started = Date.now(), env = phase11ReadOnlyChildEnvironment(process.env); let calls = 0;
  const consume = () => { const elapsed = Date.now() - started;
    if (++calls > 64 || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 600_000) fail("CALL_OR_TIME_BOUND"); };
  const snapshot = () => {
    const captured: Json[] = [];
    const reader = () => { const run = createPhase11ReadOnlyCliRunner(); return (args: readonly string[]) => {
      consume(); const value = run(args); captured.push({ args: [...args], value }); return value;
    }; };
    const coreReader = reader(); let identity: Json | undefined, controller: Json | undefined, definition: Json | undefined, circuit: Json | undefined;
    const report = collectMaintenanceReferenceReadiness(args => { const value = coreReader(args) as Json;
      if (args[0] === "sts") identity = value;
      if (args[0] === "lambda") controller = value;
      if (args[1] === "describe-task-definition") definition = value;
      if (args[1] === "get-item" && args.includes(JSON.stringify({ jobId: { S: "control_circuit" } }))) circuit = value;
      return value;
    }, reader());
    if (!report.referencesVerified || !identity || !controller || !definition || !circuit) fail("REFERENCES_UNVERIFIED");
    const account = identity.Account;
    const policy = buildMaintenancePolicyForSimulation(account);
    const controllerScope = { name: controller.FunctionName, arn: controller.FunctionArn, role: controller.Role,
      state: controller.State, lastUpdateStatus: controller.LastUpdateStatus, codeHash: controller.CodeSha256, environment: controller.Environment };
    const stable = hash({ identity: { account, arn: identity.Arn }, controllerScope, definition: definition.taskDefinition, circuit: circuit.Item,
      references: report.referenceFingerprint, readFingerprint: maintenanceSnapshotReadFingerprint(captured), policy });
    return { account, policy, stable };
  };
  const query = (operation: "get-context-keys-for-custom-policy" | "simulate-custom-policy", extra: string[]): Json => {
    consume();
    const result = spawnSync(aws!, ["iam", operation, ...extra, "--profile", "gmai-admin", "--region", REGION, "--no-cli-pager", "--no-paginate", "--output", "json"],
      { encoding: "utf8", windowsHide: true, env, timeout: 20000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null || typeof result.stdout !== "string" || Date.now() - started >= 600_000) fail("SIMULATION_READ_FAILED");
    const value = JSON.parse(result.stdout);
    if (value === null || typeof value !== "object" || Array.isArray(value)) fail("SIMULATION_RESPONSE_INVALID");
    return value;
  };
  const before = snapshot(), policy = JSON.stringify(before.policy), results = [], coverage = [];
  const contexts = query("get-context-keys-for-custom-policy", ["--policy-input-list", policy]);
  if (!Array.isArray(contexts.ContextKeyNames) || contexts.ContextKeyNames.length !== 3 || contexts.Marker != null || contexts.IsTruncated === true ||
    hash([...contexts.ContextKeyNames].sort()) !== hash(["dynamodb:EnclosingOperation", "dynamodb:LeadingKeys", "ecs:cluster"].sort())) fail("CONTEXT_KEYS_UNVERIFIED");
  for (const item of maintenancePolicyMatrix(before.account)) {
    let control: Json | undefined;
    if (item.action.startsWith("logs:")) {
      control = query("simulate-custom-policy", ["--policy-input-list", JSON.stringify(maintenanceLogPositiveControl(item)),
        "--action-names", item.action, "--resource-arns", item.resource, "--context-entries", JSON.stringify(item.context), "--max-items", "100"]);
      let verified = false;
      try { reviewMaintenanceSimulation(control, { ...item, expected: "allowed" }); verified = true; } catch { /* Keep failure, not authorization. */ }
      coverage.push({ case: item.name, exactActionAndResourcePositiveControlVerified: verified });
    }
    const reply = query("simulate-custom-policy", ["--policy-input-list", policy, "--action-names", item.action, "--resource-arns", item.resource,
      "--context-entries", JSON.stringify(item.context), "--max-items", "100"]);
    results.push(recordMaintenanceSimulation(reply, item, control));
  }
  const after = snapshot();
  if (before.stable !== after.stable) fail("SOURCE_OR_RUNTIME_CHANGED");
  return { ...maintenancePolicyProofPlan(), mode: "read-only-proposed-maintenance-policy-proof", awsCalls: calls, simulations: results.length,
    expectedAllows: results.filter(result => result.expected === "allowed").length,
    expectedDenies: results.filter(result => result.expected === "implicitDeny").length,
    results, logPositiveControls: coverage, broadControlPolicyAttached: false, allDeclaredContextsSupplied: true, proposedPolicySha256: hash(before.policy),
    allExpectedDecisionsVerified: results.every(result => result.verified),
    unverifiedCases: results.filter(result => !result.verified).map(result => result.case),
    policyAndLiveReferencesStableBeforeAfter: true, unattachedProposedPolicyOnly: true, actualWorkloadCalls: 0,
    iamWrites: 0, taskStops: 0, secretContentReads: 0, rawIdentifiersPrinted: false };
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify(maintenancePolicyProofPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-read-only") fail("ARGUMENTS_REJECTED");
      const report = await executeMaintenancePolicyProof(); console.log(JSON.stringify(report));
      if (!report.allExpectedDecisionsVerified) process.exitCode = 1;
    }
  } catch (error) {
    const safe = error instanceof MaintenancePolicyError && /^[A-Z_]{3,48}$/.test(error.code) && /^[a-z-]{3,64}$/.test(error.stage);
    console.error(JSON.stringify({ error: safe ? `MAINTENANCE_POLICY_${error.code}` : "MAINTENANCE_POLICY_PROOF_FAILED",
      stage: safe ? error.stage : "unknown", rawIdentifiersPrinted: false })); process.exitCode = 1;
  }
}

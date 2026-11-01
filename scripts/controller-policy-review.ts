import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { boundaryMatrix, deriveBoundaryTargets, reviewBoundarySimulation, type BoundaryTargets, type SimulationCase } from "./iam-boundary-proof.js";
import { collectMaintenanceReferenceReadiness } from "./maintenance-reference-readiness.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

type Json = Record<string, any>;
const PREFIX = "global-market-ai-insight-dev", REGION = "ap-northeast-1";
export const CONTROLLER_POLICY_ID = "ControllerRoleDefaultPolicyA5FA0784";
const CONTROLLER = "ControllerFunctionC25B79B1", TASK = "WorkerTaskDefinition8AD2CCFF";
function fail(code: string): never { throw new Error(`CONTROLLER_POLICY_${code}`); }
const hash = (value: unknown) => createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
const object = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const DRIFT_SCOPES = ["compute-template", "attached-policy", "resource-targets", "foundation-template", "controller-role", "captured-read-state"] as const;
class ControllerStateDrift extends Error {
  constructor(code: "POST_UPDATE_DRIFT" | "ORIGINAL_STATE_DRIFT", readonly changedScopes: readonly string[]) {
    super(`CONTROLLER_POLICY_${code}`);
  }
}
/** Local diagnostic labels only. No property names from remote objects,
 * identifiers, raw values or private snapshot hashes are exposed. */
export function controllerStateDriftDetails(error: unknown) {
  if (!(error instanceof ControllerStateDrift)) return null;
  return { changedScopes: [...error.changedScopes], fullStateComparisonPassed: false };
}
function requireUnchangedState(code: "POST_UPDATE_DRIFT" | "ORIGINAL_STATE_DRIFT", pairs: readonly (readonly [unknown, unknown])[]) {
  const changedScopes = pairs.flatMap(([a, b], index) => hash(a) !== hash(b) ? [DRIFT_SCOPES[index]] : []);
  if (changedScopes.length) throw new ControllerStateDrift(code, Object.freeze(changedScopes));
}
const oldCondition = {
  "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] },
  Null: { "dynamodb:LeadingKeys": "false" },
  "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] },
};
const correctedCondition = {
  "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["control_circuit"] },
  Null: { "dynamodb:LeadingKeys": "false" },
};
/** Remove exactly one unsupported condition from exactly one existing action.
 * No new action, table, key, role, trust, credential or control write. */
export function correctControllerCondition(document: unknown, exactTable: unknown) {
  if (!object(document) || document.Version !== "2012-10-17" || !Array.isArray(document.Statement) ||
    document.Statement.length < 1 || document.Statement.length > 20) fail("DOCUMENT_INVALID");
  const indices = document.Statement.map((s: Json, n: number) => s?.Action === "dynamodb:ConditionCheckItem" ? n : -1).filter((n: number) => n >= 0);
  if (indices.length !== 1) fail("EXACT_CONDITION_STATEMENT_REQUIRED");
  const statement = document.Statement[indices[0]], expected = { Effect: "Allow", Action: "dynamodb:ConditionCheckItem", Resource: exactTable, Condition: oldCondition };
  if (hash(statement) !== hash(expected)) fail("CONDITION_SCOPE_INVALID");
  const proposed = clone(document);
  proposed.Statement[indices[0]].Condition = clone(correctedCondition);
  return proposed;
}
/** Dedicated IAM-only template delta; the existing image-only gate stays strict. */
export function reviewControllerPolicyTemplate(live: unknown, proposed: unknown, exactTable: unknown) {
  if (!object(live) || !object(proposed) || !object(live.Resources) || !object(proposed.Resources) ||
    Object.keys(live.Resources).length !== 26 || Object.keys(proposed.Resources).length !== 26 ||
    Object.keys(live).some(k => !["AWSTemplateFormatVersion", "Description", "Resources", "Outputs", "Parameters", "Rules", "Metadata"].includes(k))) fail("TEMPLATE_SCOPE_INVALID");
  const resource = live.Resources[CONTROLLER_POLICY_ID];
  if (resource?.Type !== "AWS::IAM::Policy" || resource.Properties?.PolicyName !== CONTROLLER_POLICY_ID ||
    hash(resource.Properties.Roles) !== hash([{ Ref: "ControllerRole10B665F1" }]) ||
    live.Resources[CONTROLLER]?.Type !== "AWS::Lambda::Function" || live.Resources[TASK]?.Type !== "AWS::ECS::TaskDefinition") fail("TEMPLATE_IDENTITY_INVALID");
  const env = live.Resources[CONTROLLER].Properties?.Environment?.Variables;
  const containers = live.Resources[TASK].Properties?.ContainerDefinitions;
  if (env?.ENABLE_PROVIDER_BACKED_JOBS !== "false" || env.ENABLE_LIVE_RESULT_DISPLAY !== "false" ||
    !Array.isArray(containers) || containers.length !== 1 || containers[0].User !== "65532:65532" ||
    containers[0].ReadonlyRootFilesystem !== true) fail("DISABLED_POSTURE_REQUIRED");
  const expected = clone(live);
  expected.Resources[CONTROLLER_POLICY_ID].Properties.PolicyDocument = correctControllerCondition(resource.Properties.PolicyDocument, exactTable);
  if (hash(proposed) !== hash(expected)) fail("NONEXCLUSIVE_DELTA");
  return { exactlyOnePolicyConditionRemoval: true, resourceAdditions: 0, resourceRemovals: 0,
    runtimeCodeAndImageUnchanged: true, roleAttachmentsAndTrustUnchanged: true, networkAndExportsUnchanged: true,
    executionRemainsDisabled: true, circuitWriteGrantAdded: false, taskReplacementRequired: false,
    readyForDeployment: false, readyForLiveJobs: false, proposedTemplateSha256: hash(proposed) };
}
/** Only inspected fixed-stack intrinsics are resolved; no lookup or arbitrary
 * export/ARN substitution. Result must independently equal GetRolePolicy. */
export function resolveControllerPolicyTemplate(template: Json, foundation: Json, computeResources: Json, foundationResources: Json, t: BoundaryTargets) {
  const inventories = [computeResources, foundationResources];
  for (const r of inventories) if (!Array.isArray(r.StackResourceSummaries) || r.NextToken != null || r.Marker != null ||
    r.StackResourceSummaries.length > 100 || new Set(r.StackResourceSummaries.map((v: Json) => v.LogicalResourceId)).size !== r.StackResourceSummaries.length) fail("OWNERSHIP_INCOMPLETE");
  const find = (id: string) => {
    const found = inventories.flatMap(r => r.StackResourceSummaries).filter(r => r.LogicalResourceId === id);
    if (found.length !== 1 || !/^(?:CREATE|UPDATE)_COMPLETE$/.test(found[0].ResourceStatus)) fail("OWNERSHIP_INVALID");
    return found[0];
  };
  const attribute = (id: string, name: string): string => {
    const r = find(id), physical = r.PhysicalResourceId;
    if (name !== "Arn") fail("INTRINSIC_UNSUPPORTED");
    if (r.ResourceType === "AWS::DynamoDB::Table" && physical === `${PREFIX}-jobs`) return t.table;
    if (r.ResourceType === "AWS::ECS::Cluster" && physical === `${PREFIX}-worker`) return t.cluster;
    if (r.ResourceType === "AWS::IAM::Role") {
      const roles = Object.values(t.roles).filter(role => role.name === physical);
      if (roles.length === 1) return roles[0].arn;
    }
    if (r.ResourceType === "AWS::Logs::LogGroup" && physical === `/aws/lambda/${PREFIX}-controller`)
      return `arn:aws:logs:${REGION}:${t.account}:log-group:${physical}:*`;
    fail("INTRINSIC_RESOURCE_UNSUPPORTED");
  };
  const resolveValue = (v: unknown, depth = 0): any => {
    if (depth > 16) fail("INTRINSIC_DEPTH");
    if (Array.isArray(v)) return v.map(x => resolveValue(x, depth + 1));
    if (!object(v)) return v;
    if (Object.keys(v).length === 1 && typeof v.Ref === "string") {
      if (v.Ref === "AWS::Partition") return "aws";
      if (v.Ref === "AWS::Region") return REGION;
      if (v.Ref === "AWS::AccountId") return t.account;
      const r = find(v.Ref);
      if (r.ResourceType === "AWS::ECS::TaskDefinition" && r.PhysicalResourceId === t.task) return t.task;
      if (r.ResourceType === "AWS::IAM::Role" && Object.values(t.roles).some(role => role.name === r.PhysicalResourceId)) return r.PhysicalResourceId;
      fail("REF_UNSUPPORTED");
    }
    if (Object.keys(v).length === 1 && Array.isArray(v["Fn::GetAtt"]) && v["Fn::GetAtt"].length === 2) return attribute(...v["Fn::GetAtt"] as [string, string]);
    if (Object.keys(v).length === 1 && Array.isArray(v["Fn::Join"]) && v["Fn::Join"].length === 2) {
      const [separator, parts] = v["Fn::Join"];
      if (typeof separator !== "string" || !Array.isArray(parts) || parts.length > 30) fail("JOIN_UNSUPPORTED");
      const resolved = parts.map((x: unknown) => resolveValue(x, depth + 1));
      if (!resolved.every((x: unknown) => typeof x === "string")) fail("JOIN_UNSUPPORTED");
      return resolved.join(separator);
    }
    if (Object.keys(v).length === 1 && typeof v["Fn::ImportValue"] === "string") {
      const name = v["Fn::ImportValue"];
      if (!name.startsWith(`${PREFIX}-foundation:`) || !object(foundation.Outputs)) fail("IMPORT_UNSUPPORTED");
      const outputs = Object.values(foundation.Outputs).filter((o: any) => o?.Export?.Name === name) as Json[];
      if (outputs.length !== 1 || !Array.isArray(outputs[0].Value?.["Fn::GetAtt"]) || outputs[0].Value["Fn::GetAtt"].length !== 2) fail("IMPORT_UNSUPPORTED");
      const value = attribute(...outputs[0].Value["Fn::GetAtt"] as [string, string]);
      if (value !== t.table) fail("IMPORT_UNSUPPORTED");
      return value;
    }
    if (Object.keys(v).some(k => k === "Ref" || k.startsWith("Fn::"))) fail("INTRINSIC_UNSUPPORTED");
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveValue(x, depth + 1)]));
  };
  return resolveValue(template.Resources?.[CONTROLLER_POLICY_ID]?.Properties?.PolicyDocument);
}
export function controllerCorrectionMatrix(t: BoundaryTargets): SimulationCase[] {
  const base = boundaryMatrix(t).filter(i => i.role === "controller");
  const circuit = base.find(i => i.name === "controller-circuit-condition-check")!;
  const extra = (name: string, action: string, resource = t.table, keys = ["control_circuit"]): SimulationCase => ({
    ...circuit, name, action, resource, expected: "implicitDeny",
    context: circuit.context.map(c => c.ContextKeyName === "dynamodb:LeadingKeys" ? { ...c, ContextKeyValues: keys } : c),
  });
  return [...base, extra("cannot-update-circuit", "dynamodb:UpdateItem"), extra("cannot-delete-circuit", "dynamodb:DeleteItem"),
    extra("cannot-check-other-table", "dynamodb:ConditionCheckItem", t.table + "-foreign-simulation"),
    extra("cannot-check-mixed-job-and-circuit", "dynamodb:ConditionCheckItem", t.table, ["control_circuit", `job_${"a".repeat(48)}`])];
}
export function controllerPolicyReviewPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 55, proposedSimulationsMax: 15,
    iamWrites: 0, deployments: 0, changeSetsCreated: 0, assetsUploaded: 0, workloadCalls: 0,
    readyForDeployment: false, jobsEnablementAuthorized: false, rawIdentifiersPrinted: false };
}
/** Private in-memory snapshot for fixed operator workflows. Never print it. */
export function collectControllerPolicyState(
  read: (args: readonly string[]) => unknown,
  query: (service: string, action: string, extra: string[]) => Json,
) {
    const captured: Json = { reads: [] };
    const reader = (args: readonly string[]) => {
      const value = read(args);
      if (!object(value)) fail("READ_RESPONSE_INVALID");
      // Bind every observed control/slot/task/stack/budget response, not just
      // the last GetItem (which could otherwise overwrite the circuit).
      captured.reads.push({ args: [...args], value });
      if (args[0] === "sts") captured.identity = value;
      if (args[0] === "lambda") captured.controller = value;
      if (args[1] === "describe-task-definition") captured.task = value;
      if (args[1] === "get-item" && args.includes(JSON.stringify({ jobId: { S: "control_circuit" } }))) captured.circuit = value;
      if (args[1] === "list-stack-resources") captured[args.includes(`${PREFIX}-foundation`) ? "foundationResources" : "computeResources"] = value;
      return value;
    };
    const refs = collectMaintenanceReferenceReadiness(reader, reader);
    if (!refs.referencesVerified) fail("BASELINE_UNVERIFIED");
    const computeResponse = query("cloudformation", "get-template", ["--stack-name", `${PREFIX}-compute`, "--template-stage", "Original"]);
    const foundationResponse = query("cloudformation", "get-template", ["--stack-name", `${PREFIX}-foundation`, "--template-stage", "Original"]);
    const template = (r: Json) => {
      if (!Array.isArray(r.StagesAvailable) || !r.StagesAvailable.includes("Original")) fail("TEMPLATE_RESPONSE_INVALID");
      const body = typeof r.TemplateBody === "string" ? JSON.parse(r.TemplateBody) : r.TemplateBody;
      if (!object(body) || Buffer.byteLength(JSON.stringify(body)) > 1_000_000) fail("TEMPLATE_RESPONSE_INVALID"); return body;
    };
    const live = template(computeResponse), foundation = template(foundationResponse);
    const t = deriveBoundaryTargets(captured.identity, captured.controller, captured.task, captured.computeResources, computeResponse);
    const target = t.roles.controller;
    const role = query("iam", "get-role", ["--role-name", target.name]).Role;
    const inline = query("iam", "list-role-policies", ["--role-name", target.name, "--max-items", "100"]);
    const attached = query("iam", "list-attached-role-policies", ["--role-name", target.name, "--max-items", "100"]);
    const policy = query("iam", "get-role-policy", ["--role-name", target.name, "--policy-name", target.policy]);
    if (!object(role) || role.Arn !== target.arn || role.RoleName !== target.name || role.Path !== "/" || role.PermissionsBoundary != null ||
      hash(role.AssumeRolePolicyDocument) !== hash(target.trust) || inline.IsTruncated !== false || inline.Marker != null || inline.NextToken != null ||
      hash(inline.PolicyNames) !== hash([target.policy]) || attached.IsTruncated !== false || attached.Marker != null || attached.NextToken != null ||
      hash(attached.AttachedPolicies) !== hash([]) || policy.RoleName !== target.name || policy.PolicyName !== target.policy || !object(policy.PolicyDocument)) fail("ROLE_SCOPE_INVALID");
    const resolved = resolveControllerPolicyTemplate(live, foundation, captured.computeResources, captured.foundationResources, t);
    if (hash(resolved) !== hash(policy.PolicyDocument)) fail("ATTACHED_POLICY_DRIFT");
    // Do not retain aliases supplied by injected readers or later snapshots.
    return clone({ t, live, foundation, role, policy, captured });
}
export function collectControllerPolicySnapshot(
  read: (args: readonly string[]) => unknown,
  query: (service: string, action: string, extra: string[]) => Json,
) {
    const { t, live, foundation, role, policy, captured } = collectControllerPolicyState(read, query);
    const statements = live.Resources[CONTROLLER_POLICY_ID].Properties.PolicyDocument.Statement;
    const exactTable = statements.find((s: Json) => s.Action === "dynamodb:ConditionCheckItem")?.Resource;
    const proposed = clone(live);
    proposed.Resources[CONTROLLER_POLICY_ID].Properties.PolicyDocument = correctControllerCondition(proposed.Resources[CONTROLLER_POLICY_ID].Properties.PolicyDocument, exactTable);
    const report = reviewControllerPolicyTemplate(live, proposed, exactTable);
    const proposedPolicy = correctControllerCondition(policy.PolicyDocument, t.table);
    if (hash(resolveControllerPolicyTemplate(proposed, foundation, captured.computeResources, captured.foundationResources, t)) !== hash(proposedPolicy)) fail("PROPOSED_REFERENCE_DRIFT");
    return { t, live, proposed, exactTable, policy, proposedPolicy, controller: captured.controller as Json,
      captured, foundation, role, report, fingerprint: hash({ captured, live, foundation, role, policy, proposedPolicy }) };
}
export type ControllerPolicyBaseline = ReturnType<typeof collectControllerPolicySnapshot>;
/** Only update metadata for this one owned stack may differ. All settings,
 * outputs, owner IDs, roles, bootstrap parameters and rollback posture remain. */
export function stableControllerStack(value: Json) {
  const v = clone(value);
  if (v.StackName === `${PREFIX}-compute`) { delete v.LastUpdatedTime; delete v.ChangeSetId; }
  return v;
}
function stableControllerReads(captured: Json) {
  const result = clone(captured);
  const inventory = (value: Json) => {
    for (const item of value.StackResourceSummaries ?? []) if (item.LogicalResourceId === CONTROLLER_POLICY_ID) {
      if (!/^(?:CREATE|UPDATE)_COMPLETE$/.test(item.ResourceStatus)) fail("POST_POLICY_NOT_HEALTHY");
      delete item.LastUpdatedTimestamp; item.ResourceStatus = "UPDATE_COMPLETE";
    }
    return value;
  };
  result.computeResources = inventory(result.computeResources);
  for (const item of result.reads) {
    if (item.args[0] === "budgets") for (const budget of item.value.Budgets ?? []) delete budget.CalculatedSpend;
    if (item.args[0] === "cloudformation" && item.args[1] === "describe-stacks")
      item.value.Stacks = item.value.Stacks.map(stableControllerStack);
    if (item.args[1] === "list-stack-resources" && item.args.includes(`${PREFIX}-compute`)) inventory(item.value);
  }
  return result;
}
export function reviewAppliedControllerState(before: ControllerPolicyBaseline, after: ReturnType<typeof collectControllerPolicyState>) {
  reviewControllerPolicyTemplate(before.live, after.live, before.exactTable);
  requireUnchangedState("POST_UPDATE_DRIFT", [[after.live, before.proposed], [after.policy.PolicyDocument, before.proposedPolicy],
    [after.t, before.t], [after.foundation, before.foundation], [after.role, before.role],
    [stableControllerReads(after.captured), stableControllerReads(before.captured)]]);
  return { exactAppliedPolicyVerified: true, onlyOneConditionRemoved: true, runtimeAndCircuitUnchanged: true,
    trustAndRoleAttachmentsUnchanged: true, jobsEnabled: false, displayEnabled: false, readyForLiveJobs: false };
}
export function collectAppliedControllerSnapshot(read: (args: readonly string[]) => unknown,
  query: (service: string, action: string, extra: string[]) => Json, before: ControllerPolicyBaseline) {
  const current = collectControllerPolicyState(read, query);
  return { ...current, report: reviewAppliedControllerState(before, current) };
}
export function reviewUnchangedControllerState(before: ControllerPolicyBaseline, current: ControllerPolicyBaseline) {
  requireUnchangedState("ORIGINAL_STATE_DRIFT", [[current.live, before.live], [current.policy, before.policy],
    [current.t, before.t], [current.foundation, before.foundation], [current.role, before.role],
    [stableControllerReads(current.captured), stableControllerReads(before.captured)]]);
  return { originalPolicyRestored: true, runtimeAndCircuitRestored: true, readyForDeployment: false, readyForLiveJobs: false };
}
/** Rollback reconciliation only, not deployment readiness. The shared core
 * readiness gate still rejects UPDATE_ROLLBACK_COMPLETE. Normalize it only
 * after independently binding the exact terminal owned stack for this update. */
export function collectRestoredControllerSnapshot(read: (args: readonly string[]) => unknown,
  query: (service: string, action: string, extra: string[]) => Json, before: ControllerPolicyBaseline, terminal: Json) {
  if (terminal.StackName !== `${PREFIX}-compute` || terminal.StackStatus !== "UPDATE_ROLLBACK_COMPLETE" ||
    !String(terminal.StackId).startsWith(`arn:aws:cloudformation:${REGION}:${before.t.account}:stack/${PREFIX}-compute/`)) fail("ROLLBACK_STACK_UNBOUND");
  const restored = collectControllerPolicySnapshot(args => {
    const value = read(args);
    if (args[0] !== "cloudformation" || args[1] !== "describe-stacks") return value;
    if (!object(value) || !Array.isArray(value.Stacks)) fail("ROLLBACK_STACK_INCOMPLETE");
    const response = clone(value), matches = response.Stacks.filter((s: Json) => s.StackName === `${PREFIX}-compute`);
    if (matches.length !== 1 || hash(matches[0]) !== hash(terminal)) fail("ROLLBACK_STACK_DRIFT");
    matches[0].StackStatus = "UPDATE_COMPLETE";
    return response;
  }, query);
  return reviewUnchangedControllerState(before, restored);
}
export function executeControllerPolicyReview() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(); let calls = 0;
  const consume = () => { const elapsed = Date.now() - started;
    if (++calls > 55 || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed >= 600_000) fail("CALL_OR_TIME_BOUND"); };
  const query = (service: string, action: string, extra: string[]) => {
    if (!["cloudformation.get-template", "iam.get-role", "iam.list-role-policies", "iam.list-attached-role-policies", "iam.get-role-policy", "iam.simulate-custom-policy"].includes(`${service}.${action}`)) fail("QUERY_REJECTED");
    consume(); const r = spawnSync(aws, [service, action, ...extra, "--profile", "gmai-admin", "--region", REGION, "--no-cli-pager", "--no-paginate", "--output", "json"],
      { encoding: "utf8", windowsHide: true, env: phase11ReadOnlyChildEnvironment(process.env), timeout: 20_000, maxBuffer: 2_000_000 });
    if (r.status !== 0 || r.signal !== null || r.error || Date.now() - started >= 600_000) fail("READ_FAILED");
    const value = JSON.parse(r.stdout); if (!object(value)) fail("RESPONSE_INVALID"); return value;
  };
  const snapshot = () => {
    // The existing CLI runner has a 12-call cap; split this 14-read capture
    // across two separately bounded runners without weakening either guard.
    const first = createPhase11ReadOnlyCliRunner(), second = createPhase11ReadOnlyCliRunner(); let reads = 0;
    return collectControllerPolicySnapshot(args => { consume(); return (++reads <= 7 ? first : second)(args); }, query);
  };
  const before = snapshot(), results = [];
  for (const item of controllerCorrectionMatrix(before.t)) {
    const r = query("iam", "simulate-custom-policy", ["--policy-input-list", JSON.stringify(before.proposedPolicy), "--action-names", item.action,
      "--resource-arns", item.resource, "--context-entries", JSON.stringify(item.context), "--max-items", "100"]);
    results.push(reviewBoundarySimulation(r, item));
  }
  const after = snapshot(); if (before.fingerprint !== after.fingerprint) fail("SOURCE_OR_RUNTIME_CHANGED");
  return { ...controllerPolicyReviewPlan(), ...before.report, mode: "read-only-controller-policy-correction-review", awsCalls: calls,
    proposedPolicySha256: hash(before.proposedPolicy), sourceAndAttachedPolicyMatched: true, liveReferencesStableBeforeAfter: true,
    simulations: results.length, expectedAllows: results.filter(r => r.expected === "allowed").length,
    expectedDenies: results.filter(r => r.expected === "implicitDeny").length, results, allExpectedDecisionsVerified: true,
    correctedPolicyAttached: false, simulatorIsLiveAuthorizationProof: false, requiresFreshExactChangeSetReview: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(controllerPolicyReviewPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-read-only") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(executeControllerPolicyReview())); }
  } catch { console.error(JSON.stringify({ error: "CONTROLLER_POLICY_REVIEW_FAILED", rawIdentifiersPrinted: false })); process.exitCode = 1; }
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, isAbsolute, resolve } from "node:path";
import { lstatSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { collectControllerPolicyState, CONTROLLER_POLICY_ID, correctControllerCondition } from "./controller-policy-review.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";

type Json = Record<string, any>;
const STACK = "global-market-ai-insight-dev-compute", REGION = "ap-northeast-1";
// Reviewed proposal digests from the earlier independent fixed-target review.
// This is a current read of a known candidate, not a replay of the failed
// operator or a fabricated before-state snapshot.
export const REVIEWED_APPLIED_TEMPLATE_SHA256 = "711935517aa3c0e505f21666b78b2008eb05be4b9a3d5f73fddda0ad8cf4e955";
export const REVIEWED_APPLIED_POLICY_SHA256 = "bb8af0027f5eb081ea9095821a9893f7e512fa643a4bb9d2ae2df40c7339c0d5";
const object = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value: unknown) => createHash("sha256").update(canonicalPatchValue(value)).digest("hex");
const same = (a: unknown, b: unknown) => canonicalPatchValue(a) === canonicalPatchValue(b);
function fail(code: string): never { throw new Error(`CONTROLLER_COMPLETION_${code}`); }

/** Terminal history and the whole applied template/policy must agree. No
 * caller ready flag, alternate target, policy attachment or normalization of
 * unknown before/after stack settings is accepted. */
export function reviewControllerCompletionHistory(state: ReturnType<typeof collectControllerPolicyState>,
  stackReply: Json, history: Json, prepared: Json, now: number) {
  if (!Array.isArray(stackReply?.Stacks) || stackReply.Stacks.length !== 1 || stackReply.NextToken != null ||
      !Number.isSafeInteger(now)) fail("STACK_INCOMPLETE");
  const stack = stackReply.Stacks[0], account = state.t.account;
  const updated = Date.parse(stack.LastUpdatedTime), created = Date.parse(history?.CreationTime);
  const name = history?.ChangeSetName;
  if (stack.StackName !== STACK || !String(stack.StackId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:stack/${STACK}/`) ||
      stack.StackStatus !== "UPDATE_COMPLETE" || stack.DisableRollback === true ||
      !Number.isFinite(updated) || updated > now || now - updated > 3_600_000 ||
      !/^gmai-controller-review-[a-f0-9]{32}$/.test(name ?? "") || !Number.isFinite(created) || created > updated ||
      now - created > 3_600_000 || history.StackId !== stack.StackId || history.StackName !== STACK ||
      !String(history.ChangeSetId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`) ||
      history.ChangeSetId !== stack.ChangeSetId || history.Status !== "CREATE_COMPLETE" || history.ExecutionStatus !== "EXECUTE_COMPLETE" ||
      history.NextToken != null || history.ParentChangeSetId != null || history.RootChangeSetId != null ||
      history.IncludeNestedStacks !== false || history.ImportExistingResources === true || !Array.isArray(history.Changes) || history.Changes.length !== 1) fail("HISTORY_UNBOUND");
  if (!object(state.live) || !Array.isArray(prepared?.StagesAvailable) || !prepared.StagesAvailable.includes("Original")) fail("PREPARED_TEMPLATE_INCOMPLETE");
  const body = typeof prepared.TemplateBody === "string" ? JSON.parse(prepared.TemplateBody) : prepared.TemplateBody;
  if (!same(body, state.live)) fail("PREPARED_TEMPLATE_CHANGED");
  const change = history.Changes[0], resource = change?.ResourceChange;
  if (change.Type !== "Resource" || !object(resource) || resource.LogicalResourceId !== CONTROLLER_POLICY_ID ||
      resource.ResourceType !== "AWS::IAM::Policy" || resource.Action !== "Modify" || resource.Replacement !== "False" ||
      resource.ChangeSetId != null || resource.ModuleInfo != null || !same(resource.Scope, ["Properties"]) ||
      !Array.isArray(resource.Details) || resource.Details.length < 1 || resource.Details.length > 12) fail("DELTA_INVALID");
  for (const detail of resource.Details) if (detail.Evaluation !== "Static" || detail.ChangeSource !== "DirectModification" || detail.CausingEntity != null ||
    detail.Target?.Attribute !== "Properties" || detail.Target.Name !== "PolicyDocument" || detail.Target.RequiresRecreation !== "Never" ||
    detail.Target.Path != null && (typeof detail.Target.Path !== "string" || !/^\/Properties\/PolicyDocument(?:\/|$)/.test(detail.Target.Path))) fail("DETAIL_INVALID");
  const context = (raw: unknown) => {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 200_000) fail("CONTEXT_INVALID");
    const value: unknown = JSON.parse(raw);
    if (!object(value) || !object(value.Properties) || value.Type != null && value.Type !== "AWS::IAM::Policy" ||
        value.Properties.PolicyName !== CONTROLLER_POLICY_ID || !same(value.Properties.Roles, [state.t.roles.controller.name]) ||
        value.Properties.Groups != null || value.Properties.Users != null) fail("CONTEXT_INVALID");
    return value;
  };
  const before = context(resource.BeforeContext), after = context(resource.AfterContext);
  if (!same(correctControllerCondition(before.Properties.PolicyDocument, state.t.table), after.Properties.PolicyDocument) ||
      !same(after.Properties.PolicyDocument, state.policy.PolicyDocument) ||
      !same({ ...before, Properties: { ...before.Properties, PolicyDocument: undefined } },
        { ...after, Properties: { ...after.Properties, PolicyDocument: undefined } })) fail("CONTEXT_DELTA_INVALID");
  return { actualTerminalHistoryBound: true,
    exactlyOneUnsupportedConditionRemoved: true, oneNonreplacingPolicyModify: true,
    resourcesAdded: 0, resourcesRemoved: 0, roleAttachmentsAndTrustVerified: true,
    originalRolloutReportedSuccess: false, originalReconciliationStillIncomplete: true,
    fullOriginalBeforeAfterStackSettingsComparisonVerified: false,
    actualWorkloadAuthorizationProven: false, jobsEnabled: false, displayEnabled: false,
    readyForLiveJobs: false, readyForPublication: false };
}

/** Production caller has no digest/target override. Structural fixture success
 * alone cannot match this independently reviewed whole-candidate binding. */
export function reviewControllerCompletion(state: ReturnType<typeof collectControllerPolicyState>,
  stackReply: Json, history: Json, prepared: Json, now: number) {
  if (hash(state.live) !== REVIEWED_APPLIED_TEMPLATE_SHA256 || hash(state.policy.PolicyDocument) !== REVIEWED_APPLIED_POLICY_SHA256) fail("REVIEWED_CANDIDATE_UNMATCHED");
  return { ...reviewControllerCompletionHistory(state, stackReply, history, prepared, now),
    reviewedWholeTemplateMatched: true, actualAttachedPolicyMatched: true };
}

export function controllerCompletionPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, awsCallsMax: 43, timeMaxMs: 600_000, iamWrites: 0,
    changeSetsCreated: 0, executionAttempts: 0, workloadCalls: 0, originalReconciliationWaived: false, readyForPublication: false };
}

export function executeControllerCompletionProof() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
      basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(), env = phase11ReadOnlyChildEnvironment(process.env); let calls = 0;
  const consume = () => { if (++calls > 43 || Date.now() - started < 0 || Date.now() - started >= 600_000) fail("BOUNDS_EXCEEDED"); };
  const query = (service: string, action: string, args: string[]) => {
    if (!["cloudformation.get-template", "cloudformation.describe-stacks", "cloudformation.describe-change-set",
      "iam.get-role", "iam.list-role-policies", "iam.list-attached-role-policies", "iam.get-role-policy"].includes(`${service}.${action}`)) fail("READ_REJECTED");
    consume(); const result = spawnSync(aws, [service, action, ...args, "--profile", "gmai-admin", "--region", REGION,
      "--no-cli-pager", "--no-paginate", "--output", "json"], { env, encoding: "utf8", windowsHide: true, timeout: 20_000, maxBuffer: 2_000_000 });
    if (result.status !== 0 || result.signal !== null || result.error) fail("READ_FAILED");
    const value: unknown = JSON.parse(result.stdout); if (!object(value)) fail("RESPONSE_INVALID"); return value;
  };
  const snapshot = () => {
    const first = createPhase11ReadOnlyCliRunner(), second = createPhase11ReadOnlyCliRunner(); let reads = 0;
    return collectControllerPolicyState(args => { consume(); return (++reads <= 7 ? first : second)(args); }, query);
  };
  const before = snapshot();
  const stack = query("cloudformation", "describe-stacks", ["--stack-name", STACK]);
  const id = stack.Stacks?.[0]?.ChangeSetId;
  if (typeof id !== "string" || !id.startsWith(`arn:aws:cloudformation:${REGION}:${before.t.account}:changeSet/gmai-controller-review-`)) fail("HISTORY_OWNER_INVALID");
  const history = query("cloudformation", "describe-change-set", ["--stack-name", STACK, "--change-set-name", id, "--include-property-values"]);
  const prepared = query("cloudformation", "get-template", ["--stack-name", STACK, "--change-set-name", id, "--template-stage", "Original"]);
  const report = reviewControllerCompletion(before, stack, history, prepared, Date.now());
  const after = snapshot(); if (hash(before) !== hash(after)) fail("CLOSING_STATE_CHANGED");
  return { mode: "read-only-reviewed-controller-completion-proof", awsCalls: calls, iamWrites: 0, executionAttempts: 0,
    reviewedTemplateSha256: hash(after.live), reviewedPolicySha256: hash(after.policy.PolicyDocument),
    observedAtUtc: new Date().toISOString(), currentStateStableBeforeAfter: true, privateIdentifiersPrinted: false, ...report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(controllerCompletionPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-read-only") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(executeControllerCompletionProof())); }
  } catch (error) {
    const code = error instanceof Error && /^CONTROLLER_(?:COMPLETION|POLICY)_[A-Z_]+$/.test(error.message) ? error.message : "CONTROLLER_COMPLETION_INCOMPLETE";
    console.error(JSON.stringify({ error: code, rawDetailsSuppressed: true, iamWrites: 0, originalRolloutSuccessClaimed: false })); process.exitCode = 1;
  }
}

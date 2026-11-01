import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPatchValue } from "./compute-patch-rollout.js";
import { collectAppliedControllerSnapshot, collectControllerPolicySnapshot, collectRestoredControllerSnapshot, controllerCorrectionMatrix,
  reviewControllerPolicyTemplate, reviewUnchangedControllerState, stableControllerStack, controllerStateDriftDetails, type ControllerPolicyBaseline } from "./controller-policy-review.js";
import { controllerDraftArguments, reviewControllerDraft, reviewControllerDraftCleanup,
  safeControllerDraftDirectory } from "./controller-change-set-review.js";
import { reviewBoundarySimulation } from "./iam-boundary-proof.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";

type Json = Record<string, any>;
const STACK = "global-market-ai-insight-dev-compute", REGION = "ap-northeast-1";
const same = (a: unknown, b: unknown) => canonicalPatchValue(a) === canonicalPatchValue(b);
const object = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
function fail(code: string): never { throw new Error(`CONTROLLER_ROLLOUT_${code}`); }
// Only fixed local decision codes may leave this operator. Never serialize a
// caught AWS exception, stack, path, response, or Error.cause.
const FAILURE_CODES = new Set([
  ...["ARGUMENTS_REJECTED", "EXECUTE_OWNER_INVALID", "STACK_INCOMPLETE", "TERMINAL_UNBOUND", "STACK_NOT_TERMINAL",
    "RECONCILIATION_ALREADY_ATTEMPTED", "RECONCILIATION_OWNER_MISSING", "RECONCILIATION_OWNER_INVALID",
    "ROLLBACK_UNVERIFIED", "RECONCILIATION_STATUS_UNVERIFIED", "RECONCILIATION_UNVERIFIED", "CREATE_ACK_INVALID",
    "PREPARATION_FAILED", "PREPARATION_UNVERIFIED", "PREPARED_TEMPLATE_CHANGED", "PRE_EXECUTION_DRIFT",
    "PRE_EXECUTION_CHANGESET_CHANGED", "EXECUTION_NOT_STARTED", "UPDATE_ROLLED_BACK", "EXECUTION_HISTORY_UNVERIFIED",
    "DRAFT_CLEANUP_UNVERIFIED", "CONFIGURATION_INVALID", "BOUNDS_EXCEEDED", "OPERATION_REJECTED",
    "AWS_OPERATION_FAILED", "RESPONSE_INVALID", "ROLLBACK_BASELINE_MISSING", "TEMP_INVALID", "PRIVATE_ACL_UNVERIFIED",
    "INLINE_TEMPLATE_TOO_LARGE", "LOCAL_CANDIDATE_CHANGED", "TEMP_CLEANUP_UNVERIFIED", "INCOMPLETE"].map(v => `CONTROLLER_ROLLOUT_${v}`),
  ...["POST_UPDATE_DRIFT", "POST_POLICY_NOT_HEALTHY", "ORIGINAL_STATE_DRIFT", "ROLLBACK_STACK_UNBOUND",
    "ROLLBACK_STACK_INCOMPLETE", "ROLLBACK_STACK_DRIFT", "ATTACHED_POLICY_DRIFT", "PROPOSED_REFERENCE_DRIFT",
    "ROLE_SCOPE_INVALID", "BASELINE_UNVERIFIED", "DISABLED_POSTURE_REQUIRED", "NONEXCLUSIVE_DELTA"].map(v => `CONTROLLER_POLICY_${v}`),
  ...["OWNER_INVALID", "INPUT_INVALID", "RESPONSE_INVALID", "ENVELOPE_INVALID", "DELTA_INVALID", "DETAIL_INVALID",
    "CONTEXT_INVALID", "CONTEXT_SCOPE_INVALID", "CONTEXT_DELTA_INVALID", "CLEANUP_UNVERIFIED"].map(v => `CONTROLLER_DRAFT_${v}`),
]);
function failureCode(error: unknown) {
  try { if (error instanceof Error && FAILURE_CODES.has(error.message)) return error.message; } catch { /* Untrusted getter. */ }
  return "CONTROLLER_ROLLOUT_INCOMPLETE";
}
type FailureStage = "baseline" | "stack-baseline" | "candidate" | "proposed-simulation" | "create-draft" |
  "prepare-draft" | "review-draft" | "prepared-template" | "fresh-baseline" | "execute" |
  "reconciliation-owner" | "reconciliation-poll" | "terminal-stack-review" | "applied-state-review" |
  "restored-state-review" | "unstarted-review" | "execution-outcome" | "final-reconciliation" |
  "execution-history" | "draft-cleanup" | "adapter-or-arguments" | "local-temp-cleanup";
type FailureFact = { stage: FailureStage; code: string; decisionDetails?: NonNullable<ReturnType<typeof controllerStateDriftDetails>> };
function failureFact(stage: FailureStage, error: unknown): FailureFact {
  const details = controllerStateDriftDetails(error);
  return { stage, code: failureCode(error), ...(details ? { decisionDetails: details } : {}) };
}
class ControllerRolloutFailure extends Error {
  constructor(readonly report: Json) { super(report.error); }
}
export function controllerRolloutFailurePacket(error: unknown) {
  if (error instanceof ControllerRolloutFailure) return error.report;
  return { schemaVersion: 1, error: failureCode(error), primaryFailure: { stage: "adapter-or-arguments", code: failureCode(error) },
    cleanupFailure: null, mutationAttemptsKnown: false, privateDetailsSuppressed: true,
    mutationRetryDisabled: true, independentSafeStopRequired: true, readyForLiveJobs: false, readyForPublication: false };
}
/** Keep cloud failure evidence even if removal of this operator's private
 * temporary candidate also fails. Cleanup is attempted once, never retried. */
export async function withControllerRolloutLocalCleanup(operation: () => Promise<Json>, cleanup: () => void) {
  let result: Json | undefined, primary: Json | undefined, localFailure: FailureFact | null = null;
  try { result = await operation(); }
  catch (error) { primary = controllerRolloutFailurePacket(error); }
  finally {
    try { cleanup(); }
    catch (error) { localFailure = { stage: "local-temp-cleanup", code: failureCode(error) }; }
  }
  if (primary || localFailure) {
    const report = primary ?? controllerRolloutFailurePacket(new Error(localFailure!.code));
    throw new ControllerRolloutFailure({ ...report,
      ...(primary ? {} : { primaryFailure: null, error: localFailure!.code }), localCleanupFailure: localFailure,
      privateCandidateRemoved: localFailure === null, independentSafeStopRequired: true });
  }
  if (!result) fail("INCOMPLETE");
  return result;
}
export function controllerRolloutPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, mainCallsMax: 145, reconciliationCallsReserved: 50,
    mainTimeMaxMs: 900_000, reconciliationTimeMaxMs: 480_000,
    changeSetsCreatedMax: 1, changeSetsExecutedMax: 1, maximumPolicyChanges: 1,
    rollbackRequired: true, jobsEnablementAuthorized: false, actualWorkloadCalls: 0,
    assetsUploaded: 0, credentialsRetrieved: false, readyForPublication: false };
}
export function controllerRolloutExecuteArguments(id: string, account: string, name: string, stack: Json) {
  if (!/^(?!0{12}$)[0-9]{12}$/.test(account) || !/^gmai-controller-review-[a-f0-9]{32}$/.test(name) ||
    !id.startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`) ||
    !/^[A-Za-z0-9-]+$/.test(id.slice(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`.length)) || stack.StackName !== STACK ||
    !String(stack.StackId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:stack/${STACK}/`) ||
    stack.StackStatus !== "UPDATE_COMPLETE" || stack.DisableRollback === true) fail("EXECUTE_OWNER_INVALID");
  return ["--stack-name", stack.StackId, "--change-set-name", id, "--client-request-token", name,
    "--no-disable-rollback", "--no-retain-except-on-create"];
}
/** A terminal status from an older update is not this execution's result. */
export function reviewControllerRolloutTerminal(before: Json, response: Json, name: string, started: number, now: number) {
  if (!Array.isArray(response.Stacks) || response.Stacks.length !== 1 || response.NextToken != null) fail("STACK_INCOMPLETE");
  const after = response.Stacks[0], updated = Date.parse(after.LastUpdatedTime);
  if (after.StackId !== before.StackId || after.StackName !== STACK || !Number.isFinite(updated) ||
    updated < started - 1000 || updated > now || after.ChangeSetId !== name || after.DisableRollback === true ||
    !same(stableControllerStack(before), stableControllerStack({ ...after, StackStatus: before.StackStatus }))) fail("TERMINAL_UNBOUND");
  if (after.StackStatus === "UPDATE_COMPLETE") return "updated" as const;
  if (after.StackStatus === "UPDATE_ROLLBACK_COMPLETE") return "rolled-back" as const;
  fail("STACK_NOT_TERMINAL");
}
interface Ports {
  query(service: string, action: string, args: string[], reconciliation?: boolean): Json;
  snapshot(before?: ControllerPolicyBaseline, reconciliation?: boolean, rollbackStack?: Json): ControllerPolicyBaseline | Json;
  candidate(value: Json): string;
  assertCandidate(value: Json): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}
/** Testable state machine. Only the CLI adapter below supplies the fixed AWS
 * allowlist and credential environment. Never resubmit an ambiguous mutation. */
export async function performControllerPolicyRollout(io: Ports, name: string) {
  const started = io.now(); let createAttempted = false, executeAttempted = false, executionNotStarted = false, reconciled = false, reconciliationAttempted = false;
  let before: ControllerPolicyBaseline | undefined, stack: Json | undefined, id = "", account = "", outcome = "";
  let stage: FailureStage = "baseline", primaryFailure: FailureFact | null = null, cleanupFailure: FailureFact | null = null;
  let executionAcknowledgementAmbiguous = false, terminalHistoryVerified = false, draftAbsenceVerified = false, result: Json | undefined;
  const stackRead = (cleanup = false) => io.query("cloudformation", "describe-stacks", ["--stack-name", stack?.StackId ?? STACK], cleanup);
  const reconcile = async () => {
    stage = "reconciliation-owner";
    if (reconciliationAttempted) fail("RECONCILIATION_ALREADY_ATTEMPTED");
    reconciliationAttempted = true;
    if (!stack || !id || !before) fail("RECONCILIATION_OWNER_MISSING");
    for (let n = 0; n < 24; n++) {
      stage = "reconciliation-poll";
      const response = stackRead(true), current = response.Stacks?.[0];
      if (current?.StackId !== stack.StackId || response.Stacks.length !== 1 || response.NextToken != null) fail("RECONCILIATION_OWNER_INVALID");
      if (["UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"].includes(current.StackStatus) && current.ChangeSetId === id) {
        stage = "terminal-stack-review";
        outcome = reviewControllerRolloutTerminal(stack, response, id, executionStarted, io.now());
        // The same 20 independent reads verify applied policy or original
        // restored state, never a success flag from the update API.
        if (outcome === "updated") { stage = "applied-state-review"; io.snapshot(before, true); }
        else {
          stage = "restored-state-review";
          const restored = io.snapshot(before, true, current) as Json;
          if (restored.originalPolicyRestored !== true || restored.runtimeAndCircuitRestored !== true) fail("ROLLBACK_UNVERIFIED");
        }
        reconciled = true; return;
      }
      if (!["UPDATE_COMPLETE", "UPDATE_IN_PROGRESS", "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
        "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS"].includes(current.StackStatus)) fail("RECONCILIATION_STATUS_UNVERIFIED");
      await io.sleep(5000);
    }
    // A definitively still-AVAILABLE owned draft plus the unchanged original
    // stack and twenty independently unchanged reads establish non-execution.
    // This is not inferred from a failed/timeout acknowledgement alone.
    stage = "unstarted-review";
    const pending = io.query("cloudformation", "describe-change-set", ["--stack-name", stack.StackId, "--change-set-name", name], true);
    if (pending.ExecutionStatus === "AVAILABLE" && pending.ChangeSetId === id && same(stackRead(true), { Stacks: [stack] })) {
      reviewControllerDraftCleanup(pending, account, name, stack, io.now(), started);
      reviewUnchangedControllerState(before, io.snapshot(undefined, true) as ControllerPolicyBaseline);
      outcome = "not-started"; executionNotStarted = true; reconciled = true; return;
    }
    fail("RECONCILIATION_UNVERIFIED");
  };
  let executionStarted = 0;
  try {
    before = io.snapshot() as ControllerPolicyBaseline; account = before.t.account;
    stage = "stack-baseline";
    const response = stackRead();
    if (!Array.isArray(response.Stacks) || response.Stacks.length !== 1 || response.NextToken != null) fail("STACK_INCOMPLETE");
    stack = response.Stacks[0];
    stage = "candidate";
    const path = io.candidate(before.proposed), args = controllerDraftArguments(name, stack!, account, path);
    const cases = controllerCorrectionMatrix(before.t);
    stage = "proposed-simulation";
    for (const item of cases) reviewBoundarySimulation(io.query("iam", "simulate-custom-policy", [
      "--policy-input-list", JSON.stringify(before.proposedPolicy), "--action-names", item.action,
      "--resource-arns", item.resource, "--context-entries", JSON.stringify(item.context), "--max-items", "100"]), item);
    stage = "create-draft"; createAttempted = true;
    const created = io.query("cloudformation", "create-change-set", args);
    if (created.StackId !== stack!.StackId || !String(created.Id).startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`)) fail("CREATE_ACK_INVALID");
    id = created.Id;
    let draft: Json | undefined;
    stage = "prepare-draft";
    for (let n = 0; n < 12; n++) {
      const current = io.query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name, "--include-property-values"]);
      if (current.Status === "CREATE_COMPLETE") { draft = current; break; }
      if (!["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(current.Status)) fail("PREPARATION_FAILED");
      await io.sleep(5000);
    }
    if (!draft || draft.ChangeSetId !== id) fail("PREPARATION_UNVERIFIED");
    stage = "review-draft";
    reviewControllerDraft(draft, account, name, stack!, io.now(), started, before.policy.PolicyDocument, before.t.roles.controller.name, before.t.table);
    stage = "prepared-template";
    const prepared = io.query("cloudformation", "get-template", ["--stack-name", stack!.StackId, "--change-set-name", id, "--template-stage", "Original"]);
    const body = typeof prepared.TemplateBody === "string" ? JSON.parse(prepared.TemplateBody) : prepared.TemplateBody;
    if (!prepared.StagesAvailable?.includes("Original") || !same(body, before.proposed)) fail("PREPARED_TEMPLATE_CHANGED");
    reviewControllerPolicyTemplate(before.live, body, before.exactTable); io.assertCandidate(body);
    stage = "fresh-baseline";
    const fresh = io.snapshot() as ControllerPolicyBaseline;
    if (fresh.fingerprint !== before.fingerprint || !same(stackRead(), response)) fail("PRE_EXECUTION_DRIFT");
    // Recheck the actual draft immediately before execution, not only its old
    // response. No historical packet, caller ready flag or preview is reused.
    const latest = io.query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", id, "--include-property-values"]);
    if (latest.ChangeSetId !== id) fail("PRE_EXECUTION_CHANGESET_CHANGED");
    reviewControllerDraft(latest, account, name, stack!, io.now(), started, before.policy.PolicyDocument, before.t.roles.controller.name, before.t.table);
    const executionArgs = controllerRolloutExecuteArguments(id, account, name, stack!);
    stage = "execute"; executionStarted = io.now(); executeAttempted = true;
    try { io.query("cloudformation", "execute-change-set", executionArgs); }
    catch { executionAcknowledgementAmbiguous = true; /* Independently reconcile, no retry. */ }
    await reconcile();
    stage = "execution-outcome";
    if (outcome !== "updated") fail(outcome === "not-started" ? "EXECUTION_NOT_STARTED" : "UPDATE_ROLLED_BACK");
    result = { mode: "exclusive-disabled-controller-policy-update", exactlyOnePolicyConditionRemoved: true,
      changeSetsCreated: 1, changeSetsExecuted: 1, rollbackDisabled: false, postUpdateIndependentlyVerified: true,
      resourcesAdded: 0, resourcesRemoved: 0, runtimeChanges: 0, trustChanges: 0, jobsEnabled: false,
      displayEnabled: false, circuitMutations: 0, actualWorkloadCalls: 0, credentialsRetrieved: false,
      proposedSimulationsVerified: cases.length, readyForLiveJobs: false, readyForPublication: false };
  } catch (error) {
    primaryFailure = failureFact(stage, error);
  } finally {
    try {
    if (executeAttempted && !executionNotStarted) {
      stage = "final-reconciliation";
      if (!reconciled && !reconciliationAttempted) await reconcile();
      if (!reconciled) fail("RECONCILIATION_UNVERIFIED");
      // Executed change sets are history, not pending executable drafts. CFN
      // may remove them automatically. Never delete an in-progress operation.
      stage = "execution-history";
      const history = io.query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name], true);
      if (!history.absent && (history.ChangeSetId !== id || history.StackId !== stack!.StackId ||
        !["EXECUTE_COMPLETE", "EXECUTE_FAILED", "OBSOLETE"].includes(history.ExecutionStatus))) fail("EXECUTION_HISTORY_UNVERIFIED");
      terminalHistoryVerified = !history.absent;
    } else if (createAttempted) {
      stage = "draft-cleanup";
      const current = io.query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name], true);
      if (!current.absent) {
        const owned = reviewControllerDraftCleanup(current, account, name, stack!, io.now(), started);
        io.query("cloudformation", "delete-change-set", ["--stack-name", stack!.StackId, "--change-set-name", owned], true);
        let absent = false;
        for (let n = 0; n < 10; n++) {
          const check = io.query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name], true);
          if (check.absent) { absent = true; break; }
          reviewControllerDraftCleanup(check, account, name, stack!, io.now(), started); await io.sleep(3000);
        }
        if (!absent) fail("DRAFT_CLEANUP_UNVERIFIED");
      }
      draftAbsenceVerified = true;
    }
    } catch (error) { cleanupFailure = failureFact(stage, error); }
  }
  if (primaryFailure || cleanupFailure) throw new ControllerRolloutFailure({ schemaVersion: 1,
    error: primaryFailure?.code ?? cleanupFailure!.code, primaryFailure, cleanupFailure,
    mutationAttemptsKnown: true, createAttempted, executeAttempted, executionAcknowledgementAmbiguous,
    reconciliationAttempted, reconciliationVerified: reconciled, terminalHistoryVerified, draftAbsenceVerified,
    executionOutcome: ["updated", "rolled-back", "not-started"].includes(outcome) ? outcome : "unverified",
    privateDetailsSuppressed: true, mutationRetryDisabled: true, independentSafeStopRequired: true,
    readyForLiveJobs: false, readyForPublication: false });
  if (!result) fail("INCOMPLETE");
  return result;
}
export async function executeControllerPolicyRollout() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-controller-review-"));
  const path = join(directory, "candidate.json"), env = phase11ReadOnlyChildEnvironment(process.env), start = Date.now();
  const name = `gmai-controller-review-${randomUUID().replaceAll("-", "")}`;
  let calls = 0, cleanupCalls = 0, reconciliationStarted = 0;
  const consume = (cleanup = false) => {
    if (cleanup && !reconciliationStarted) reconciliationStarted = Date.now();
    const elapsed = Date.now() - (cleanup ? reconciliationStarted : start);
    if (elapsed < 0 || (cleanup ? ++cleanupCalls > 50 || elapsed > 480_000 : ++calls > 145 || elapsed > 900_000)) fail("BOUNDS_EXCEEDED");
  };
  const query = (service: string, action: string, args: string[], cleanup = false): Json => {
    const key = `${service}.${action}`;
    const allowed = ["cloudformation.get-template", "cloudformation.describe-stacks", "iam.get-role",
      "iam.list-role-policies", "iam.list-attached-role-policies", "iam.get-role-policy"];
    if (!(cleanup ? [...allowed, "cloudformation.describe-change-set", "cloudformation.delete-change-set"] :
      [...allowed, "iam.simulate-custom-policy", "cloudformation.create-change-set", "cloudformation.describe-change-set", "cloudformation.execute-change-set"]).includes(key)) fail("OPERATION_REJECTED");
    consume(cleanup);
    const r = spawnSync(aws, [service, action, ...args, "--profile", "gmai-admin", "--region", REGION,
      "--no-cli-pager", "--no-paginate", "--output", "json"], { env, windowsHide: true, encoding: "utf8", timeout: 25_000, maxBuffer: 2_000_000 });
    if (r.status !== 0 || r.signal !== null || r.error) {
      if (cleanup && action === "describe-change-set" && /\(ChangeSetNotFound\)/.test(r.stderr)) return { absent: true };
      fail("AWS_OPERATION_FAILED");
    }
    const value: unknown = r.stdout.trim() ? JSON.parse(r.stdout) : {};
    if (!object(value)) fail("RESPONSE_INVALID"); return value;
  };
  const snapshot = (before?: ControllerPolicyBaseline, cleanup = false, rollbackStack?: Json) => {
    const first = createPhase11ReadOnlyCliRunner(), second = createPhase11ReadOnlyCliRunner(); let reads = 0;
    const read = (args: readonly string[]) => { consume(cleanup); return (++reads <= 7 ? first : second)(args); };
    const q = (service: string, action: string, args: string[]) => query(service, action, args, cleanup);
    if (rollbackStack) {
      if (!before) fail("ROLLBACK_BASELINE_MISSING");
      return collectRestoredControllerSnapshot(read, q, before, rollbackStack);
    }
    return before ? collectAppliedControllerSnapshot(read, q, before) : collectControllerPolicySnapshot(read, q);
  };
  return withControllerRolloutLocalCleanup(async () => {
    if (!safeControllerDraftDirectory(base, directory, physical)) fail("TEMP_INVALID");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL], {
      env: privateAclChildEnvironment(env, directory), windowsHide: true, encoding: "utf8", timeout: 10_000, maxBuffer: 20_000 });
    if (acl.status !== 0 || acl.signal !== null || acl.error || JSON.parse(acl.stdout).privateAclVerified !== true) fail("PRIVATE_ACL_UNVERIFIED");
    const packet = await performControllerPolicyRollout({ query, snapshot, now: Date.now,
      sleep: ms => new Promise(done => setTimeout(done, ms)), candidate: value => {
        const raw = JSON.stringify(value); if (Buffer.byteLength(raw) > 51_200) fail("INLINE_TEMPLATE_TOO_LARGE");
        writeFileSync(path, raw, { encoding: "utf8", flag: "wx" }); return path;
      }, assertCandidate: value => { if (readFileSync(path, "utf8") !== JSON.stringify(value)) fail("LOCAL_CANDIDATE_CHANGED"); },
    }, name);
    return { ...packet, awsCalls: calls + cleanupCalls, privateAclVerified: true, privateCandidateRemoved: true };
  }, () => {
    if (!safeControllerDraftDirectory(base, directory, physical)) fail("TEMP_INVALID");
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("TEMP_CLEANUP_UNVERIFIED");
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(controllerRolloutPlan()));
    else { if (args.length !== 1 || args[0] !== "--execute-one-reviewed-update") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(await executeControllerPolicyRollout())); }
  } catch (error) {
    console.error(JSON.stringify(controllerRolloutFailurePacket(error))); process.exitCode = 1;
  }
}

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalPatchValue, canonicalStackTags } from "./compute-patch-rollout.js";
import { collectControllerPolicySnapshot, CONTROLLER_POLICY_ID, controllerCorrectionMatrix, correctControllerCondition,
  reviewControllerPolicyTemplate } from "./controller-policy-review.js";
import { reviewBoundarySimulation } from "./iam-boundary-proof.js";
import { createPhase11ReadOnlyCliRunner, phase11ReadOnlyChildEnvironment } from "./phase11-live-readiness.js";
import { PRIVATE_ACL, privateAclChildEnvironment } from "./promote-worker-patch.js";

type Json = Record<string, any>;
const PREFIX = "global-market-ai-insight-dev", STACK = `${PREFIX}-compute`, REGION = "ap-northeast-1";
const object = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalPatchValue(a) === canonicalPatchValue(b);
const hash = (v: unknown) => createHash("sha256").update(canonicalPatchValue(v)).digest("hex");
function fail(code: string): never { throw new Error(`CONTROLLER_DRAFT_${code}`); }
function ownedIdentity(value: Json, account: string, name: string, stack: Json, now: number, started: number, maxAge = 900_000) {
  const creation = typeof value.CreationTime === "string" ? Date.parse(value.CreationTime) : NaN;
  if (!/^[0-9]{12}$/.test(account) || /^0+$/.test(account) || !/^gmai-controller-review-[a-f0-9]{32}$/.test(name) ||
    !Number.isSafeInteger(now) || !Number.isSafeInteger(started) || started < 0 || now < started || now - started > maxAge ||
    !Number.isFinite(creation) || creation < started - 1000 || creation > now || now - creation > maxAge ||
    stack.StackName !== STACK || !String(stack.StackId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:stack/${STACK}/`) ||
    value.StackId !== stack.StackId || value.StackName !== STACK || value.ChangeSetName !== name ||
    !String(value.ChangeSetId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`)) fail("OWNER_INVALID");
}
export function controllerDraftArguments(name: string, stack: Json, account: string, path: string) {
  if (!/^(?!0{12}$)[0-9]{12}$/.test(account) || !/^gmai-controller-review-[a-f0-9]{32}$/.test(name) || !isAbsolute(path) || /[\u0000-\u001f]/.test(path) ||
    stack.StackName !== STACK || stack.StackStatus !== "UPDATE_COMPLETE" || stack.DisableRollback === true ||
    !String(stack.StackId).startsWith(`arn:aws:cloudformation:${REGION}:${account}:stack/${STACK}/`) ||
    stack.RoleARN !== `arn:aws:iam::${account}:role/cdk-hnb659fds-cfn-exec-role-${account}-${REGION}` ||
    !Array.isArray(stack.Parameters) || stack.Parameters.length !== 1 || stack.Parameters[0].ParameterKey !== "BootstrapVersion" ||
    stack.Parameters[0].ParameterValue !== "/cdk-bootstrap/hnb659fds/version" ||
    typeof stack.Parameters[0].ResolvedValue !== "string" || !/^[1-9][0-9]*$/.test(stack.Parameters[0].ResolvedValue) ||
    !same(stack.NotificationARNs ?? [], [])) fail("INPUT_INVALID");
  canonicalStackTags(stack.Tags);
  return ["--stack-name", stack.StackId, "--change-set-name", name, "--change-set-type", "UPDATE", "--template-body", `file://${path}`,
    "--role-arn", stack.RoleARN, "--tags", JSON.stringify(stack.Tags ?? []), "--notification-arns", "[]",
    "--parameters", JSON.stringify([{ ParameterKey: "BootstrapVersion", UsePreviousValue: true }]),
    "--capabilities", "CAPABILITY_IAM", "CAPABILITY_NAMED_IAM", "--no-include-nested-stacks", "--no-import-existing-resources",
    "--client-token", name, "--description", "Unexecuted exclusive controller condition correction review"];
}
/** Exactly one non-replacing IAM property delta plus independently resolved
 * before/after values. No caller-provided ready flag and no execution function. */
export function reviewControllerDraft(value: unknown, account: string, name: string, stack: Json,
  now: number, started: number, originalPolicy: Json, roleName: string, table: string) {
  if (!object(value)) fail("RESPONSE_INVALID");
  ownedIdentity(value, account, name, stack, now, started);
  if (value.Status !== "CREATE_COMPLETE" || value.ExecutionStatus !== "AVAILABLE" || value.NextToken != null ||
    value.ParentChangeSetId != null || value.RootChangeSetId != null || value.IncludeNestedStacks !== false ||
    value.ImportExistingResources === true || value.DeploymentMode != null || value.OnStackFailure != null ||
    canonicalStackTags(value.Tags) !== canonicalStackTags(stack.Tags) || !same(value.NotificationARNs ?? [], stack.NotificationARNs ?? []) ||
    !same(value.RollbackConfiguration ?? {}, stack.RollbackConfiguration ?? {}) ||
    !Array.isArray(value.Parameters) || value.Parameters.length !== 1 || value.Parameters[0].ParameterKey !== "BootstrapVersion" ||
    value.Parameters[0].ParameterValue !== stack.Parameters[0].ParameterValue ||
    value.Parameters[0].ResolvedValue !== stack.Parameters[0].ResolvedValue ||
    !Array.isArray(value.Changes) || value.Changes.length !== 1) fail("ENVELOPE_INVALID");
  const change = value.Changes[0], r = change?.ResourceChange;
  if (change.Type !== "Resource" || !object(r) || r.LogicalResourceId !== CONTROLLER_POLICY_ID ||
    r.ResourceType !== "AWS::IAM::Policy" || r.Action !== "Modify" || r.Replacement !== "False" ||
    r.ChangeSetId != null || r.ModuleInfo != null || !same(r.Scope, ["Properties"]) ||
    !Array.isArray(r.Details) || r.Details.length < 1 || r.Details.length > 12) fail("DELTA_INVALID");
  for (const detail of r.Details) {
    const target = detail?.Target;
    if (detail.Evaluation !== "Static" || detail.ChangeSource !== "DirectModification" || detail.CausingEntity != null ||
      target?.Attribute !== "Properties" || target.Name !== "PolicyDocument" || target.RequiresRecreation !== "Never" ||
      target.Path != null && (typeof target.Path !== "string" || !/^\/Properties\/PolicyDocument(?:\/|$)/.test(target.Path))) fail("DETAIL_INVALID");
  }
  const context = (raw: unknown) => {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 200_000) fail("CONTEXT_INVALID");
    let v: unknown; try { v = JSON.parse(raw); } catch { fail("CONTEXT_INVALID"); }
    if (!object(v) || !object(v.Properties) || v.Type != null && v.Type !== "AWS::IAM::Policy") fail("CONTEXT_INVALID");
    if (v.Properties.PolicyName !== CONTROLLER_POLICY_ID || !same(v.Properties.Roles, [roleName]) ||
      v.Properties.Groups != null || v.Properties.Users != null) fail("CONTEXT_SCOPE_INVALID");
    return v;
  };
  const before = context(r.BeforeContext), after = context(r.AfterContext);
  const corrected = correctControllerCondition(originalPolicy, table);
  if (!same(before.Properties.PolicyDocument, originalPolicy) || !same(after.Properties.PolicyDocument, corrected) ||
    !same({ ...before, Properties: { ...before.Properties, PolicyDocument: undefined } },
      { ...after, Properties: { ...after.Properties, PolicyDocument: undefined } })) fail("CONTEXT_DELTA_INVALID");
  return { exactlyOneIamPolicyModify: true, replacementRequired: false, independentlyMatchedBeforeAndAfterPolicy: true,
    resourcesAdded: 0, resourcesRemoved: 0, runtimeChanges: 0, changesetExecutionAuthorized: false, readyForDeployment: false };
}
export function reviewControllerDraftCleanup(value: unknown, account: string, name: string, stack: Json, now: number, started: number) {
  if (!object(value)) fail("CLEANUP_UNVERIFIED");
  ownedIdentity(value, account, name, stack, now, started, 1_140_000);
  if (!["CREATE_PENDING", "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "FAILED", "DELETE_PENDING", "DELETE_IN_PROGRESS"].includes(value.Status) ||
    !["AVAILABLE", "UNAVAILABLE"].includes(value.ExecutionStatus)) fail("CLEANUP_UNVERIFIED");
  return value.ChangeSetId as string;
}
export function safeControllerDraftDirectory(base: string, directory: string, physical: string) {
  try { const name = basename(directory); return /^gmai-controller-review-[A-Za-z0-9]+$/.test(name) &&
    relative(resolve(base), resolve(directory)) === name && lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink() &&
    realpathSync(base) === physical && realpathSync(directory) === resolve(physical, name); } catch { return false; }
}
export function controllerDraftPlan(args: readonly string[] = []) {
  if (args.length) fail("ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, prepareCallsMax: 90, cleanupCallsReserved: 15,
    changeSetsCreatedMax: 1, changeSetsExecuted: 0, iamWrites: 0, assetsUploaded: 0,
    providerCalls: 0, modelCalls: 0, workerTasksLaunched: 0, noExecutionCapability: true, readyForDeployment: false };
}
export async function prepareControllerDraft() {
  const aws = process.env.GMAI_AWS_CLI_PATH;
  if (process.platform !== "win32" || process.env.AWS_PROFILE !== "gmai-admin" || !aws || !isAbsolute(aws) ||
    basename(aws).toLowerCase() !== "aws.exe" || !lstatSync(aws).isFile() || lstatSync(aws).isSymbolicLink()) fail("CONFIGURATION_INVALID");
  const started = Date.now(), base = resolve(tmpdir()), physical = realpathSync(base);
  const directory = mkdtempSync(join(base, "gmai-controller-review-")), path = join(directory, "candidate.json");
  const name = `gmai-controller-review-${randomUUID().replaceAll("-", "")}`, env = phase11ReadOnlyChildEnvironment(process.env);
  let calls = 0, cleanupCalls = 0, attempted = false, stack: Json | undefined, account = "", packet: Json | undefined;
  const consume = (cleanup = false) => {
    const elapsed = Date.now() - started;
    if (!Number.isSafeInteger(elapsed) || elapsed < 0 ||
      (cleanup ? ++cleanupCalls > 15 || elapsed > 1_140_000 : ++calls > 90 || elapsed > 900_000)) fail("BOUNDS_EXCEEDED");
  };
  const query = (service: string, action: string, extra: string[], cleanup = false): Json => {
    const key = `${service}.${action}`;
    const allowed = cleanup ? ["cloudformation.describe-change-set", "cloudformation.delete-change-set"] :
      ["cloudformation.get-template", "cloudformation.describe-stacks", "cloudformation.create-change-set", "cloudformation.describe-change-set",
        "iam.get-role", "iam.list-role-policies", "iam.list-attached-role-policies", "iam.get-role-policy", "iam.simulate-custom-policy"];
    if (!allowed.includes(key)) fail("OPERATION_REJECTED");
    consume(cleanup);
    const r = spawnSync(aws, [service, action, ...extra, "--profile", "gmai-admin", "--region", REGION,
      "--no-cli-pager", "--no-paginate", "--output", "json"], { env, windowsHide: true, encoding: "utf8", timeout: 25_000, maxBuffer: 2_000_000 });
    if (r.status !== 0 || r.signal !== null || r.error) {
      if (cleanup && action === "describe-change-set" && /\(ChangeSetNotFound\)/.test(r.stderr)) return { absent: true };
      fail(cleanup ? "CLEANUP_READ_FAILED" : "AWS_OPERATION_FAILED");
    }
    const value: unknown = r.stdout.trim() ? JSON.parse(r.stdout) : {};
    if (!object(value)) fail("RESPONSE_INVALID"); return value;
  };
  const snapshot = () => {
    const first = createPhase11ReadOnlyCliRunner(), second = createPhase11ReadOnlyCliRunner(); let reads = 0;
    return collectControllerPolicySnapshot(args => { consume(); return (++reads <= 7 ? first : second)(args); }, query);
  };
  try {
    if (!safeControllerDraftDirectory(base, directory, physical)) fail("TEMP_INVALID");
    const acl = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PRIVATE_ACL], {
      env: privateAclChildEnvironment(env, directory), encoding: "utf8", timeout: 10_000, maxBuffer: 20_000, windowsHide: true });
    if (acl.status !== 0 || acl.signal !== null || acl.error || JSON.parse(acl.stdout).privateAclVerified !== true) fail("PRIVATE_ACL_UNVERIFIED");
    const before = snapshot(); account = before.t.account;
    if (before.live.Parameters?.BootstrapVersion?.Type !== "AWS::SSM::Parameter::Value<String>" ||
      before.live.Parameters.BootstrapVersion.Default !== "/cdk-bootstrap/hnb659fds/version") fail("BOOTSTRAP_TEMPLATE_INVALID");
    const stacks = query("cloudformation", "describe-stacks", ["--stack-name", STACK]);
    if (!Array.isArray(stacks.Stacks) || stacks.Stacks.length !== 1 || stacks.NextToken != null) fail("STACK_INVALID");
    stack = stacks.Stacks[0];
    const args = controllerDraftArguments(name, stack!, account, path);
    const results = controllerCorrectionMatrix(before.t).map(item => reviewBoundarySimulation(query("iam", "simulate-custom-policy", [
      "--policy-input-list", JSON.stringify(before.proposedPolicy), "--action-names", item.action, "--resource-arns", item.resource,
      "--context-entries", JSON.stringify(item.context), "--max-items", "100"]), item));
    const candidate = JSON.stringify(before.proposed);
    if (Buffer.byteLength(candidate) > 51_200) fail("INLINE_TEMPLATE_TOO_LARGE");
    writeFileSync(path, candidate, { encoding: "utf8", flag: "wx" });
    // Set before submission: even a timed-out create may have made this exact
    // unique owned draft. Never resubmit; finally independently checks it.
    attempted = true;
    const created = query("cloudformation", "create-change-set", args);
    if (created.StackId !== stack!.StackId || !String(created.Id).startsWith(`arn:aws:cloudformation:${REGION}:${account}:changeSet/${name}/`)) fail("CREATE_ACK_INVALID");
    let value: Json | undefined;
    for (let n = 0; n < 12; n++) {
      const current = query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name, "--include-property-values"]);
      if (current.Status === "CREATE_COMPLETE") { value = current; break; }
      if (!["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(current.Status)) fail("PREPARATION_FAILED");
      await new Promise(done => setTimeout(done, 5000));
    }
    if (!value || value.ChangeSetId !== created.Id) fail("PREPARATION_UNVERIFIED");
    const review = reviewControllerDraft(value, account, name, stack!, Date.now(), started, before.policy.PolicyDocument, before.t.roles.controller.name, before.t.table);
    const response = query("cloudformation", "get-template", ["--stack-name", stack!.StackId, "--change-set-name", value.ChangeSetId, "--template-stage", "Original"]);
    const body = typeof response.TemplateBody === "string" ? JSON.parse(response.TemplateBody) : response.TemplateBody;
    if (!Array.isArray(response.StagesAvailable) || !response.StagesAvailable.includes("Original") || !same(body, before.proposed) ||
      readFileSync(path, "utf8") !== candidate) fail("PREPARED_TEMPLATE_CHANGED");
    reviewControllerPolicyTemplate(before.live, body, before.exactTable);
    const after = snapshot(), finalStacks = query("cloudformation", "describe-stacks", ["--stack-name", STACK]);
    if (before.fingerprint !== after.fingerprint || !same(finalStacks, stacks)) fail("SOURCE_OR_RUNTIME_CHANGED");
    packet = { ...review, simulations: results.length, expectedAllows: results.filter(r => r.expected === "allowed").length,
      expectedDenies: results.filter(r => r.expected === "implicitDeny").length, exactTemplateIndependentlyMatched: true,
      proposedTemplateSha256: hash(body), proposedPolicySha256: hash(before.proposedPolicy), livePolicyUnchanged: true,
      liveReferencesStableBeforeAfter: true, privateAclVerified: true, templateBytes: Buffer.byteLength(candidate) };
  } finally {
    try {
      if (attempted) {
        const current = query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name], true);
        if (!current.absent) {
          const id = reviewControllerDraftCleanup(current, account, name, stack!, Date.now(), started);
          query("cloudformation", "delete-change-set", ["--stack-name", stack!.StackId, "--change-set-name", id], true);
          let absent = false;
          for (let n = 0; n < 10; n++) {
            const check = query("cloudformation", "describe-change-set", ["--stack-name", stack!.StackId, "--change-set-name", name], true);
            if (check.absent) { absent = true; break; }
            reviewControllerDraftCleanup(check, account, name, stack!, Date.now(), started);
            await new Promise(done => setTimeout(done, 3000));
          }
          if (!absent) fail("CLEANUP_UNVERIFIED");
        }
      }
    } finally {
      if (!safeControllerDraftDirectory(base, directory, physical)) fail("TEMP_INVALID");
      rmSync(directory, { recursive: true }); if (existsSync(directory)) fail("TEMP_CLEANUP_UNVERIFIED");
    }
  }
  if (!packet) fail("INCOMPLETE");
  return { ...controllerDraftPlan(), ...packet, mode: "unexecuted-controller-condition-change-set-review", awsCalls: calls + cleanupCalls,
    changeSetsCreated: 1, ownedChangeSetRemoved: true, privateCandidateRemoved: true, circuitMutations: 0, jobsEnabled: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(controllerDraftPlan()));
    else { if (args.length !== 1 || args[0] !== "--prepare-one-unexecuted-review") fail("ARGUMENTS_REJECTED"); console.log(JSON.stringify(await prepareControllerDraft())); }
  } catch (error) {
    const code = error instanceof Error && /^CONTROLLER_(?:DRAFT|POLICY)_[A-Z_]+$/.test(error.message) ? error.message : "CONTROLLER_DRAFT_INCOMPLETE";
    console.error(JSON.stringify({ error: code, privateDetailsSuppressed: true, noAutomaticRetry: true, independentSafeStopRequired: true })); process.exitCode = 1;
  }
}

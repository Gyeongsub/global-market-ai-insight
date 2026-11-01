import { SYNTHETIC_LAB_ROLE_NAME, syntheticRoleTrust } from "../shared/security/synthetic-lab-policy.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import { reviewSyntheticRoleChangeSet, reviewSyntheticRoleDraftOwnership, reviewSyntheticRoleTemplate, syntheticRoleDraftTags } from "./synthetic-role-template-review.js";
import type { DraftCall, DraftResponse } from "./synthetic-role-draft.js";

type Json = Record<string, any>;
function fail(): never { throw Error("SYNTHETIC_ROLE_REHEARSAL_UNVERIFIED"); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` :
  v !== null && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
export type SyntheticRoleExercise = { assumptionVerified: true; credentialLeaseClosed: true; inferenceCalls: 0 };
export type SyntheticExpiryExercise = { assumptionVerified: true; credentialLeaseClosed: true; inferenceCalls: 2; serverSideExpiryVerified: true };
export type SyntheticBrowserExercise = { assumptionVerified: true; credentialLeaseClosed: true; inferenceCalls: 0 | 1; listenerClosed: true };

/** Injected candidate core; the default-inert live adapter is separate. Creates one
 * isolated role through a freshly reviewed CREATE proposal, runs a synchronous
 * bounded credential-only or separately approved read-denial exercise, and
 * removes its stack even on failure.
 * The live caller must enforce source/cloud gates, 20s subprocess limits and
 * fixed 15s waits. Only the explicitly selected expiry-contrast mode permits
 * the separately approved two-model-request experiment. Legacy modes stay zero. */
export async function rehearseSyntheticRole(input: {
  identity: Json; nonce: string; template: unknown; now: () => number;
  call: DraftCall; wait: () => Promise<void>; record: (state: Json) => void;
  exercise: () => SyntheticRoleExercise | SyntheticExpiryExercise | SyntheticBrowserExercise | Promise<SyntheticRoleExercise | SyntheticExpiryExercise | SyntheticBrowserExercise>;
  exerciseMode?: "expiry-contrast" | "restricted-browser";
  observedModelAttempts?: () => number;
}) {
  if (input.exerciseMode !== undefined && !["expiry-contrast", "restricted-browser"].includes(input.exerciseMode) ||
      input.exerciseMode !== undefined && typeof input.observedModelAttempts !== "function" ||
      input.exerciseMode === undefined && input.observedModelAttempts !== undefined) fail();
  const { account, ownerArn } = reviewOwnerIdentity(input.identity);
  const template = structuredClone(input.template), expected = reviewSyntheticRoleTemplate(template, ownerArn, account);
  const tags = syntheticRoleDraftTags(input.nonce), name = `gmai-synthetic-role-${input.nonce}`;
  // Idempotency belongs to an operation, not to the entire stack lifecycle.
  // Keep tokens stable within this run, but never reuse execution for teardown.
  const tokens = { create: `${name}-create`, execute: `${name}-execute`, delete: `${name}-delete` };
  const started = input.now();
  if (!Number.isSafeInteger(started) || started < 0) fail();
  let latest = started, normalCalls = 0, cleanupCalls = 0, stackId = "", changeId = "", roleId = "";
  let createAttempted = false, executeAttempted = false, owned = false, deployed = false, exercised = false;
  let deleteAttempted = false, stackAbsent = false, roleAbsent = false, primaryError = false, cleanupError = false;
  let deletionResponse: "NOT_ATTEMPTED" | "ACKNOWLEDGED" | "TOKEN_CONFLICT" | "UNVERIFIED" = "NOT_ATTEMPTED";
  const record = (stage: string) => input.record({ stage, startedAtMs: started, stackName: name, verifiedStackId: stackId || null,
    verifiedRoleId: roleId || null,
    verifiedChangeSetId: changeId || null, templateSha256: expected.templateSha256, createAttempted,
    executeAttempted, deployed, exercised, deleteAttempted, deletionResponse, stackAbsent, roleAbsent, normalCalls, cleanupCalls });
  const call: DraftCall = (service, operation, args, cleanup) => {
    const permitted = service === "iam" ? ["get-role"] : cleanup ?
      ["describe-stacks", "describe-change-set", "get-template", "list-stack-resources", "delete-change-set", "delete-stack"] :
      ["describe-stacks", "create-change-set", "describe-change-set", "get-template", "list-stack-resources", "execute-change-set"];
    if (!permitted.includes(operation)) fail();
    if (cleanup) { if (++cleanupCalls > 48) fail(); }
    else {
      const now = input.now();
      if (++normalCalls > 30 || !Number.isSafeInteger(now) || now < latest || now - started > 720000) fail();
      latest = now;
    }
    return input.call(service, operation, args, cleanup);
  };
  const requireAbsent = (r: DraftResponse) => { if (r.ok || r.code !== "ABSENT") fail(); };
  function stack(data: Json) {
    if (data.NextToken !== undefined || !Array.isArray(data.Stacks) || data.Stacks.length !== 1) fail();
    const s = data.Stacks[0], created = Date.parse(s.CreationTime);
    const tombstone = s.StackStatus === "DELETE_COMPLETE";
    if (s.StackName !== name || !new RegExp(`^arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/[a-zA-Z0-9-]+$`).test(s.StackId ?? "") ||
        stackId && stackId !== s.StackId || !Number.isFinite(created) || created < started - 1000 || created > started + 240000 ||
        s.RoleARN !== undefined || s.ParentId !== undefined || s.RootId !== undefined ||
        !same(s.Parameters ?? [], []) || !same(s.NotificationARNs ?? [], []) ||
        s.DeploymentConfig !== undefined && !same(s.DeploymentConfig, { Mode: "STANDARD", DisableRollback: false }) ||
        s.EnableTerminationProtection !== false && !(tombstone && s.EnableTerminationProtection === undefined) ||
        !Array.isArray(s.Tags) || !s.Tags.every((t: Json) => t && typeof t.Key === "string" && typeof t.Value === "string") ||
        !(same([...s.Tags].sort((a, b) => a.Key.localeCompare(b.Key)), tags) || owned && s.Tags.length === 0 &&
          ["REVIEW_IN_PROGRESS", "DELETE_IN_PROGRESS", "DELETE_COMPLETE"].includes(s.StackStatus))) fail();
    if (tombstone && (!owned || !(deleteAttempted || executeAttempted) || !Number.isFinite(Date.parse(s.DeletionTime)) ||
        Date.parse(s.DeletionTime) < created)) fail();
    stackId = s.StackId; return s;
  }
  function readTemplate(cleanup: boolean, proposal: boolean) {
    const r = call("cloudformation", "get-template", ["--stack-name", stackId || name,
      ...(proposal ? ["--change-set-name", changeId || name] : []), "--template-stage", "Original"], cleanup);
    if (!r.ok) fail();
    const body = typeof r.data.TemplateBody === "string" ? JSON.parse(r.data.TemplateBody) : r.data.TemplateBody;
    if (reviewSyntheticRoleTemplate(body, ownerArn, account).templateSha256 !== expected.templateSha256) fail();
    return body;
  }
  function resources(cleanup: boolean, complete: boolean) {
    const r = call("cloudformation", "list-stack-resources", ["--stack-name", stackId], cleanup);
    if (!r.ok || r.data.NextToken !== undefined || !Array.isArray(r.data.StackResourceSummaries)) fail();
    const rows = r.data.StackResourceSummaries;
    if (rows.length > 1 || complete && rows.length !== 1 || !executeAttempted && rows.length !== 0) fail();
    for (const v of rows) {
      if (v.LogicalResourceId !== "SyntheticLabRole" || v.ResourceType !== "AWS::IAM::Role" ||
          v.PhysicalResourceId !== SYNTHETIC_LAB_ROLE_NAME && !(v.PhysicalResourceId === undefined && v.ResourceStatus === "CREATE_FAILED") ||
          !(complete ? ["CREATE_COMPLETE"] : ["CREATE_COMPLETE", "CREATE_FAILED", "DELETE_COMPLETE", "DELETE_FAILED"]).includes(v.ResourceStatus)) fail();
    }
    return rows;
  }
  function roleOwnership(cleanup: boolean, requirePresent: boolean) {
    const r = call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], cleanup);
    if (!r.ok) { if (r.code === "ABSENT" && !requirePresent) return; fail(); }
    const v = r.data.Role, created = Date.parse(v?.CreateDate);
    const roleTags = v?.Tags;
    if (!v || v.RoleName !== SYNTHETIC_LAB_ROLE_NAME || v.Path !== "/" ||
        v.Arn !== `arn:aws:iam::${account}:role/${SYNTHETIC_LAB_ROLE_NAME}` ||
        !/^AROA[A-Z0-9]{16,32}$/.test(v.RoleId ?? "") || roleId && v.RoleId !== roleId ||
        !Number.isFinite(created) || created < started - 1000 || created > started + 720000 ||
        v.MaxSessionDuration !== 3600 || v.PermissionsBoundary !== undefined ||
        canonical(v.AssumeRolePolicyDocument) !== canonical(syntheticRoleTrust(ownerArn, account)) ||
        !Array.isArray(roleTags) || roleTags.some(t => !t || typeof t.Key !== "string" || typeof t.Value !== "string") ||
        new Set(roleTags.map(t => t.Key)).size !== roleTags.length) fail();
    const expectedTags = (template as Json).Resources.SyntheticLabRole.Properties.Tags as { Key: string; Value: string }[];
    if (expectedTags.some(t => !roleTags.some((actual: Json) => actual.Key === t.Key && actual.Value === t.Value))) fail();
    const systemTags: Json = { "aws:cloudformation:stack-id": stackId, "aws:cloudformation:stack-name": name,
      "aws:cloudformation:logical-id": "SyntheticLabRole" };
    if (roleTags.some((t: Json) => t.Key.startsWith("aws:cloudformation:") && systemTags[t.Key] !== t.Value)) fail();
    roleId = v.RoleId;
  }
  function bindProposal(d: Json, s: Json, body: unknown, ready: boolean) {
    const context = { ownerArn, account, nonce: input.nonce, startedAtMs: started, stack: s };
    const r = ready ? reviewSyntheticRoleChangeSet(d, body, { ...context, nowMs: input.now() }) :
      reviewSyntheticRoleDraftOwnership(d, body, context);
    if (r.templateSha256 !== expected.templateSha256) fail();
    owned = true; stackId = d.StackId; changeId = d.ChangeSetId;
  }
  try {
    requireAbsent(call("cloudformation", "describe-stacks", ["--stack-name", name], false));
    requireAbsent(call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], false));
    // Intent is durable before dispatch. A journal write failure must not be
    // confused with a dispatched AWS operation during this process's cleanup.
    record("pre-create"); record("create-intent"); createAttempted = true;
    const c = call("cloudformation", "create-change-set", ["--stack-name", name, "--change-set-name", name,
      "--change-set-type", "CREATE", "--template-body", JSON.stringify(template), "--tags", JSON.stringify(tags),
      "--capabilities", "CAPABILITY_NAMED_IAM", "--on-stack-failure", "DELETE", "--no-include-nested-stacks",
      "--no-import-existing-resources", "--client-token", tokens.create, "--description", "Temporary isolated synthetic role rehearsal"], false);
    if (!c.ok) fail();
    let ready = false;
    for (let i = 0; i < 6; i++) {
      const d = call("cloudformation", "describe-change-set", ["--stack-name", name, "--change-set-name", name], false);
      if (!d.ok) fail();
      if (d.data.Status === "CREATE_COMPLETE") { ready = true; break; }
      if (!["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(d.data.Status)) fail();
      if (i < 5) await input.wait();
    }
    if (!ready) fail();
    // Fresh proposal, stack, original template and empty inventory immediately
    // precede a single execution. Never execute the previous day's draft.
    const d = call("cloudformation", "describe-change-set", ["--stack-name", name, "--change-set-name", name], false);
    const s = call("cloudformation", "describe-stacks", ["--stack-name", name], false);
    if (!d.ok || !s.ok || s.data.Stacks?.length !== 1) fail();
    bindProposal(d.data, s.data.Stacks[0], readTemplate(false, true), true); stack(s.data); resources(false, false);
    requireAbsent(call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], false));
    record("reviewed-not-executed"); record("execute-intent"); executeAttempted = true;
    const executed = call("cloudformation", "execute-change-set", ["--stack-name", stackId, "--change-set-name", changeId,
      "--client-request-token", tokens.execute], false);
    // Lost execution acknowledgement is reconciled only for cleanup, not retried.
    if (!executed.ok) fail();
    for (let i = 0; i < 12; i++) {
      const r = call("cloudformation", "describe-stacks", ["--stack-name", stackId], false);
      if (!r.ok) fail(); const v = stack(r.data);
      if (v.StackStatus === "CREATE_COMPLETE") { deployed = true; break; }
      if (!["REVIEW_IN_PROGRESS", "CREATE_IN_PROGRESS"].includes(v.StackStatus)) fail();
      if (i < 11) await input.wait();
    }
    if (!deployed) fail(); resources(false, true); readTemplate(false, false); roleOwnership(false, true); record("deployed-temporary");
    const result = await input.exercise();
    const observed = input.exerciseMode ? input.observedModelAttempts!() : 0;
    if (input.exerciseMode === "restricted-browser" && ![0, 1].includes(observed)) fail();
    const expectedExercise = input.exerciseMode === "expiry-contrast"
      ? { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 2, serverSideExpiryVerified: true }
      : input.exerciseMode === "restricted-browser"
      ? { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: observed, listenerClosed: true }
      : { assumptionVerified: true, credentialLeaseClosed: true, inferenceCalls: 0 };
    if (!same(result, expectedExercise) || input.exerciseMode === "expiry-contrast" && observed !== 2) fail();
    exercised = true; record(input.exerciseMode === "restricted-browser" ? "browser-exercise-complete" : input.exerciseMode === "expiry-contrast" ? "expiry-contrast-complete" : "credential-exercise-complete");
  } catch { primaryError = true; }
  finally {
    if (createAttempted) {
      try {
        let current: Json | undefined;
        for (let i = 0; i < 12; i++) {
          const r = call("cloudformation", "describe-stacks", ["--stack-name", stackId || name], true);
          if (!r.ok) {
            // Execution may still commit after an ambiguous/lost response.
            // Before our own deletion request, absence alone is never a cleanup
            // barrier, even if this proposal's ownership was verified earlier.
            // Automatic rollback deletion must be observed as its exact tombstone.
            fail();
          }
          if (!owned) {
            const d = call("cloudformation", "describe-change-set", ["--stack-name", name, "--change-set-name", name], true);
            if (!d.ok || r.data.Stacks?.length !== 1) fail();
            bindProposal(d.data, r.data.Stacks[0], readTemplate(true, true), false);
          }
          const v = stack(r.data);
          if (v.StackStatus === "DELETE_COMPLETE") { stackAbsent = true; break; }
          if (v.StackStatus === "REVIEW_IN_PROGRESS" && executeAttempted) {
            if (i < 11) await input.wait();
            continue;
          }
          if (["REVIEW_IN_PROGRESS", "CREATE_COMPLETE", "CREATE_FAILED", "ROLLBACK_COMPLETE", "ROLLBACK_FAILED", "DELETE_FAILED"].includes(v.StackStatus)) {
            current = v; break;
          }
          if (!["CREATE_IN_PROGRESS", "ROLLBACK_IN_PROGRESS", "DELETE_IN_PROGRESS"].includes(v.StackStatus)) fail();
          if (i < 11) await input.wait();
        }
        if (!stackAbsent) {
          if (!current) fail();
          readTemplate(true, current.StackStatus === "REVIEW_IN_PROGRESS"); resources(true, false);
          if (current.StackStatus === "REVIEW_IN_PROGRESS") {
            // Even an acknowledged execute can be temporarily invisible. Do not
            // delete a still-pending proposal after an ambiguous execute request.
            if (executeAttempted) fail();
            call("cloudformation", "delete-change-set", ["--stack-name", stackId, "--change-set-name", changeId], true);
            requireAbsent(call("cloudformation", "describe-change-set", ["--stack-name", stackId, "--change-set-name", changeId], true));
          }
          const fresh = call("cloudformation", "describe-stacks", ["--stack-name", stackId], true);
          if (!fresh.ok || stack(fresh.data).StackStatus !== current.StackStatus) fail();
          const rows = resources(true, false);
          // A failed creation may report a colliding physical name; that is not
          // evidence this stack created the surviving role. Fail closed unless
          // creation completed, or the ambiguous role is independently absent.
          if (rows.some((v: Json) => v.PhysicalResourceId === SYNTHETIC_LAB_ROLE_NAME && v.ResourceStatus === "CREATE_COMPLETE")) roleOwnership(true, false);
          else requireAbsent(call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], true));
          record("delete-intent"); deleteAttempted = true;
          deletionResponse = "UNVERIFIED"; // A throwing/lost transport is ambiguous too.
          const deleted = call("cloudformation", "delete-stack", ["--stack-name", stackId, "--client-request-token", tokens.delete], true);
          deletionResponse = deleted.ok ? "ACKNOWLEDGED" : deleted.code === "TOKEN_CONFLICT" ? "TOKEN_CONFLICT" : "UNVERIFIED";
          let absenceReads = 0;
          for (let i = 0; i < 12; i++) {
            const after = call("cloudformation", "describe-stacks", ["--stack-name", stackId], true);
            if (!after.ok) {
              if (after.code !== "ABSENT") fail();
              // A known rejection is not an accepted deletion barrier. Eventual
              // consistency cannot promote absent reads to a successful cleanup.
              // Only an exact tombstone can independently reconcile this case.
              if (!deleted.ok && deleted.code === "TOKEN_CONFLICT") fail();
              if (++absenceReads >= (deleted.ok ? 1 : 2)) { stackAbsent = true; break; }
            } else {
              const v = stack(after.data); absenceReads = 0;
              if (v.StackStatus === "DELETE_COMPLETE") { stackAbsent = true; break; }
              if (!["DELETE_IN_PROGRESS", current.StackStatus].includes(v.StackStatus)) fail();
            }
            if (i < 11) await input.wait();
          }
        }
        if (!stackAbsent) fail();
        for (let i = 0; i < 3; i++) {
          const r = call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], true);
          if (!r.ok) { if (r.code !== "ABSENT") fail(); roleAbsent = true; break; }
          if (i < 2) await input.wait();
        }
        if (!roleAbsent) fail();
      } catch { cleanupError = true; }
    }
    record("finished");
  }
  let inferenceCalls: number | null = 0;
  if (input.exerciseMode) {
    try { const n = input.observedModelAttempts!(); inferenceCalls = Number.isSafeInteger(n) && n >= 0 && n <= (input.exerciseMode === "restricted-browser" ? 1 : 2) ? n : null; }
    catch { inferenceCalls = null; }
    if (inferenceCalls === null) primaryError = true;
  }
  return { mode: "temporary-synthetic-role-rehearsal", completed: deployed && exercised && !primaryError && !cleanupError,
    createAttempted, executeAttempted, deployed, exercised, stackAbsent, roleAbsent, primaryError, cleanupError, deletionResponse,
    normalCalls, cleanupCalls, inferenceCalls, providerCalls: 0, durableDeployment: false,
    negativeAuthorizationVerified: false, allCredentialsRevoked: false, independentClosureRequired: true };
}

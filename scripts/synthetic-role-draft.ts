import { SYNTHETIC_LAB_ROLE_NAME } from "../shared/security/synthetic-lab-policy.js";
import { reviewOwnerIdentity } from "./private-owner-review.js";
import { reviewSyntheticRoleChangeSet, reviewSyntheticRoleDraftOwnership, reviewSyntheticRoleTemplate, syntheticRoleDraftTags } from "./synthetic-role-template-review.js";

type Json = Record<string, any>;
export type DraftResponse = { ok: true; data: Json } | { ok: false; code: "ABSENT" | "UNVERIFIED" | "TOKEN_CONFLICT" };
export type DraftCall = (service: "cloudformation" | "iam", operation: string, args: string[], cleanup: boolean) => DraftResponse;
function fail(): never { throw Error("SYNTHETIC_ROLE_DRAFT_UNVERIFIED"); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Injected candidate only: no executable, process spawning or live credentials.
 * It can propose one role, but has no ExecuteChangeSet/role mutation operation.
 * A future live adapter must enforce source/owner/cloud gates and per-call timeout.
 * Even an unexecuted CREATE change set owns a placeholder stack needing cleanup. */
export async function prepareSyntheticRoleDraft(input: {
  identity: Json; nonce: string; template: unknown; now: () => number;
  wait: () => Promise<void>; call: DraftCall; record: (state: Json) => void;
}) {
  const { account, ownerArn } = reviewOwnerIdentity(input.identity);
  const template = structuredClone(input.template);
  const review = reviewSyntheticRoleTemplate(template, ownerArn, account);
  const tags = syntheticRoleDraftTags(input.nonce), name = `gmai-synthetic-role-${input.nonce}`;
  const started = input.now();
  if (!Number.isSafeInteger(started) || started < 0) fail();
  let previous = started, normalCalls = 0, cleanupCalls = 0, stackId = "", changeId = "";
  let createAttempted = false, reviewed = false, absentConfirmed = false, roleAbsentConfirmed = false, primaryError = false, cleanupError = false;
  let proposalOwnershipVerified = false, deleteRequested = false;
  const journal = (stage: string) => input.record({ stage, stackName: name, verifiedStackId: stackId || null,
    verifiedChangeSetId: changeId || null, templateSha256: review.templateSha256, createAttempted, reviewed,
    absentConfirmed, normalCalls, cleanupCalls, executeCalls: 0 });
  const call: DraftCall = (service, operation, args, cleanup) => {
    // Reserve cleanup independently of reversed/expired wall clock.
    if (cleanup) { if (++cleanupCalls > 22) fail(); }
    else {
      const now = input.now();
      if (++normalCalls > 14 || !Number.isSafeInteger(now) || now < previous || now - started > 240000) fail();
      previous = now;
    }
    return input.call(service, operation, args, cleanup);
  };
  function ownedStack(data: Json, statuses: string[]) {
    if (!Array.isArray(data.Stacks) || data.Stacks.length !== 1) fail();
    const s = data.Stacks[0], created = Date.parse(s.CreationTime);
    const deleted = s.StackStatus === "DELETE_COMPLETE", deletionTime = Date.parse(s.DeletionTime);
    // Deleted-stack tombstones omit EnableTerminationProtection. This exception
    // is only reachable after the exact owned, empty stack's delete request;
    // missing protection on a live placeholder still fails before deletion.
    if (deleted && (!deleteRequested || stackId !== s.StackId || !Number.isFinite(deletionTime) || deletionTime < created)) fail();
    if (s.StackName !== name || !new RegExp(`^arn:aws:cloudformation:ap-northeast-1:${account}:stack/${name}/[a-zA-Z0-9-]+$`).test(s.StackId ?? "") ||
        stackId && stackId !== s.StackId || !statuses.includes(s.StackStatus) || !Number.isFinite(created) ||
        created < started - 1000 || created > started + 240000 || s.RoleARN !== undefined || s.ParentId !== undefined ||
        s.RootId !== undefined || s.EnableTerminationProtection !== false && !(deleted && s.EnableTerminationProtection === undefined) || !Array.isArray(s.Tags) ||
        !(same([...s.Tags].sort((a, b) => String(a.Key).localeCompare(String(b.Key))), tags) ||
          proposalOwnershipVerified && s.Tags.length === 0)) fail();
    stackId = s.StackId;
    return s;
  }
  function requireAbsent(response: DraftResponse) { if (response.ok || response.code !== "ABSENT") fail(); }
  function emptyResources() {
    const r = call("cloudformation", "list-stack-resources", ["--stack-name", stackId], true);
    if (!r.ok || !same(r.data.StackResourceSummaries, []) || r.data.NextToken !== undefined) fail();
  }
  try {
    requireAbsent(call("cloudformation", "describe-stacks", ["--stack-name", name], false));
    requireAbsent(call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], false));
    journal("pre-create");
    createAttempted = true; journal("create-intent");
    const created = call("cloudformation", "create-change-set", ["--stack-name", name, "--change-set-name", name,
      "--change-set-type", "CREATE", "--template-body", JSON.stringify(template), "--tags", JSON.stringify(tags),
      "--capabilities", "CAPABILITY_NAMED_IAM", "--on-stack-failure", "DELETE", "--no-include-nested-stacks",
      "--no-import-existing-resources", "--client-token", name, "--description", "Unexecuted isolated synthetic role review"], false);
    if (!created.ok) fail();
    let draft: Json | undefined;
    for (let i = 0; i < 6; i++) {
      const d = call("cloudformation", "describe-change-set", ["--stack-name", name, "--change-set-name", name], false);
      if (!d.ok) fail();
      if (d.data.Status === "CREATE_COMPLETE") { draft = d.data; break; }
      if (!["CREATE_PENDING", "CREATE_IN_PROGRESS"].includes(d.data.Status)) fail();
      if (i < 5) await input.wait();
    }
    if (!draft) fail();
    const s = call("cloudformation", "describe-stacks", ["--stack-name", name], false);
    if (!s.ok || !Array.isArray(s.data.Stacks) || s.data.Stacks.length !== 1) fail();
    const stack = s.data.Stacks[0];
    const t = call("cloudformation", "get-template", ["--stack-name", name, "--change-set-name", name, "--template-stage", "Original"], false);
    if (!t.ok) fail();
    const body = typeof t.data.TemplateBody === "string" ? JSON.parse(t.data.TemplateBody) : t.data.TemplateBody;
    const result = reviewSyntheticRoleChangeSet(draft, body, { ownerArn, account, nonce: input.nonce, startedAtMs: started, nowMs: input.now(), stack });
    if (result.templateSha256 !== review.templateSha256) fail();
    proposalOwnershipVerified = true; ownedStack(s.data, ["REVIEW_IN_PROGRESS"]);
    changeId = draft.ChangeSetId; reviewed = true; journal("reviewed-not-executed");
  } catch { primaryError = true; }
  finally {
    if (createAttempted) {
      try {
        let s = call("cloudformation", "describe-stacks", ["--stack-name", stackId || name], true);
        for (let i = 0; !s.ok && s.code === "ABSENT" && i < 2; i++) {
          await input.wait(); s = call("cloudformation", "describe-stacks", ["--stack-name", stackId || name], true);
        }
        // Ambiguous create followed only by absence cannot prove no late commit.
        if (!s.ok) fail();
        if (!proposalOwnershipVerified && Array.isArray(s.data.Stacks) && s.data.Stacks.length === 1 && same(s.data.Stacks[0].Tags, [])) {
          const d = call("cloudformation", "describe-change-set", ["--stack-name", name, "--change-set-name", name], true);
          const t = call("cloudformation", "get-template", ["--stack-name", name, "--change-set-name", name, "--template-stage", "Original"], true);
          if (!d.ok || !t.ok) fail();
          const body = typeof t.data.TemplateBody === "string" ? JSON.parse(t.data.TemplateBody) : t.data.TemplateBody;
          const binding = reviewSyntheticRoleDraftOwnership(d.data, body, { ownerArn, account, nonce: input.nonce, startedAtMs: started, stack: s.data.Stacks[0] });
          if (binding.templateSha256 !== review.templateSha256) fail();
          proposalOwnershipVerified = true; changeId = d.data.ChangeSetId;
        }
        ownedStack(s.data, ["REVIEW_IN_PROGRESS"]); emptyResources();
        journal("delete-intent");
        call("cloudformation", "delete-change-set", ["--stack-name", stackId, "--change-set-name", changeId || name], true);
        // A lost delete acknowledgement is not proof of either deletion or
        // failure. Require an independent absent read before deleting the shell.
        let draftAbsent = false;
        for (let i = 0; i < 3; i++) {
          const d = call("cloudformation", "describe-change-set", ["--stack-name", stackId, "--change-set-name", changeId || name], true);
          if (!d.ok) { if (d.code !== "ABSENT") fail(); draftAbsent = true; break; }
          if (d.data.StackId !== stackId || d.data.ChangeSetName !== name ||
              !["DELETE_PENDING", "DELETE_IN_PROGRESS", "DELETE_COMPLETE"].includes(d.data.Status)) fail();
          if (i < 2) await input.wait();
        }
        if (!draftAbsent) fail();
        // Re-read both state and emptiness after deleting the draft; never delete
        // a stack another actor executed, added resources to, or retagged.
        const fresh = call("cloudformation", "describe-stacks", ["--stack-name", stackId], true);
        if (!fresh.ok) fail(); ownedStack(fresh.data, ["REVIEW_IN_PROGRESS"]); emptyResources();
        deleteRequested = true;
        const deleted = call("cloudformation", "delete-stack", ["--stack-name", stackId, "--client-request-token", name], true);
        let absenceReads = 0;
        for (let i = 0; i < 6; i++) {
          const after = call("cloudformation", "describe-stacks", ["--stack-name", stackId], true);
          if (!after.ok) {
            if (after.code !== "ABSENT") fail();
            if (++absenceReads >= (deleted.ok ? 1 : 2)) { absentConfirmed = true; break; }
          } else {
            const st = ownedStack(after.data, ["DELETE_IN_PROGRESS", "DELETE_COMPLETE", "REVIEW_IN_PROGRESS"]);
            if (st.StackStatus === "DELETE_COMPLETE") { absentConfirmed = true; break; }
            absenceReads = 0;
          }
          if (i < 5) await input.wait();
        }
        if (!absentConfirmed) fail();
        requireAbsent(call("iam", "get-role", ["--role-name", SYNTHETIC_LAB_ROLE_NAME], true)); roleAbsentConfirmed = true;
      } catch { cleanupError = true; }
    }
    journal("finished");
  }
  return { mode: "unexecuted-synthetic-role-draft", completed: reviewed && !primaryError && !cleanupError,
    createAttempted, reviewed, absentConfirmed, roleAbsentConfirmed, primaryError, cleanupError, normalCalls, cleanupCalls,
    executeCalls: 0, roleCreateRequests: 0, inferenceCalls: 0, providerCalls: 0, independentClosureRequired: true };
}

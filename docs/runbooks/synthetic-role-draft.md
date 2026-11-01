# Synthetic lab role — unexecuted change-set review

Status: automated unexecuted proposal review/cleanup accepted on 2026-10-28,
with independent deletion/role-absence reads. This is not role deployment.
[Current evidence](../evidence/SYNTHETIC_ROLE_DRAFT_2026-10-28.md).
Earlier failed attempts and independent recovery are retained in
[historical evidence](../evidence/SYNTHETIC_ROLE_DRAFT_2026-10-27.md).
This is ADR 0021 preparation, not a new inference
entry or an extension of provider/Fargate permissions.

## Scope and prerequisites

- Supported patched Node runtime and a verified installed AWS CLI path.
- Existing `gmai-admin` temporary login; no permanent key, credential export,
  new account or weakened MFA. Browser login and CLI login are separate sessions.
- Recent (one hour) full current-source gate and isolated frozen-install clone
  receipts for the **same** source fingerprint. A failed or stale receipt stops
  before AWS calls. Keep source unchanged during proof and review.
- Read-only owner/account, budget and project readiness checks: provider flags
  disabled, circuit OPEN, zero running/pending tasks, services and occupied slots.
- An isolated rendered template containing one exact-owner/MFA role, Tokyo Nova
  Lite only, explicit Delete removal policies and no other resources/assets.

The entry is `scripts/synthetic-role-draft-live.ts`. Without arguments it is a
zero-effect plan. Its sole live flag is `--execute-unexecuted-role-draft`;
`GMAI_OWNER_GATE_RUN_ID` selects the current receipt and
`GMAI_CLONE_GATE_RUN_ID` selects the isolated-clone receipt. Use the trusted
runtime with `--import tsx`; never paste keys or account-specific output into docs.
There is no ExecuteChangeSet flag, IAM role-write operation, model call or upload.

## What it verifies

It first refuses a pre-existing stack or fixed model-role name, records intent,
then proposes one CREATE change set under a unique tagged name. It fetches the
server-side original template and independently reads the placeholder stack.
Review binds exact template bytes semantically, one Add role, owner/account,
Tokyo IDs, timestamps, named-IAM capability and REVIEW_IN_PROGRESS state.
The journal is ignored local evidence, not a publishable artifact.

Normal activity has 14 calls and a four-minute wall-clock bound; cleanup reserves
22 calls independently, each CLI process bounded to 20 seconds with no retry.
Pending reads/waits are finite. Abrupt PC/process termination still requires the
operator to inspect the owned journal and reconcile exact resources on restart.
These are not a service-side transaction or an account-wide spending cap.

## Cleanup and failure

Always reconcile after a creation attempt. Prove the unique stack ownership,
REVIEW_IN_PROGRESS status and empty unpaginated resource list before deletion.
AWS may leave the placeholder's Tags empty until execution. In that case require
the independently read proposal's exact unique tags, linked IDs, creation times
and original template before accepting ownership; empty tags alone are not proof.
Only absent DeploymentConfig or exact STANDARD / DisableRollback=false is allowed.
Pending/failed creation may use that historical ownership binding for cleanup,
not for execution or a successful proposal-review claim. The two extra reads fit
inside the same reserved cleanup call limit.
Delete the exact change set, independently verify absence, then recheck stack
state and emptiness. Delete only the verified stack ARN and confirm absence or
its exact DELETE_COMPLETE tombstone; verify the model role remains absent.
Only after the exact owned empty stack's deletion request may its DELETE_COMPLETE
tombstone omit EnableTerminationProtection; a valid deletion timestamp at/after
creation is required. An omitted protection field on any live stack is rejected.

Lost creation responses never mean no resource exists. Unknown ownership,
retagging, an executed/nonempty stack, truncated reads or unresolved deletion
are **unverified cleanup**, not success. Do not detach another policy, delete
an existing model role, force-delete or broaden the operation to recover.
Check the scoped cloud posture and local processes/listeners afterward, then
end CLI authentication. Browser sign-out does not stop AWS resources.

AWS documents that CREATE proposals leave a REVIEW_IN_PROGRESS stack before
execution, and deleting a proposal is distinct from deleting its parent stack.
[CreateChangeSet](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html),
[Delete change sets](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-delete.html).

This review creates no inference role and runs no paid inference. Retained AWS
storage and unrelated account usage remain outside this claim. Real deployment,
negative authorization/expiry tests and bounded inference require later evidence.

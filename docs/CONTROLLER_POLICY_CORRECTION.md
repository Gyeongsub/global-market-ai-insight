# Exclusive disabled controller-policy correction

This is a separate IAM-only workflow. It does not weaken the existing image-only
Compute rollout's refusal of an IAM delta, authorize Maintenance deployment,
enable jobs, clear the release checklist, or grant public/GitHub publication.

## Why this narrowly scoped correction exists

On 2026-10-10 evening, the human specifically approved this condition removal.
One reviewed update was applied. The original operator's reconciliation failed;
it was not rerun or labeled successful. Independent current history/candidate
hashes and two twenty-read snapshots bind the exact applied correction, and the
actual attached-role seventeen-case matrix passes. The original whole-stack
before/after settings comparison remains incomplete. See the
[current correction evidence](evidence/PHASE11_CONTROLLER_POLICY_ACCEPTANCE_2026-10-10_EVENING.md).
Keep jobs/display disabled and circuit OPEN. No Maintenance, live-job or
publication authorization follows.

The existing controller's `dynamodb:ConditionCheckItem` statement incorrectly
requires `dynamodb:EnclosingOperation`. AWS's
[DynamoDB authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html)
lists `LeadingKeys`, but not `EnclosingOperation`, for this read action.
The latter remains applicable to the separately scoped transaction writes.

Remove only that unsupported condition from the one existing statement. Keep
its exact Jobs table, `control_circuit` key restriction and non-null key guard.
Do not add an action, role, trust policy, table, circuit write, task revision,
secret access or model access. The 26-resource original Compute template is
the baseline, including code/image/environment/network/outputs and metadata.

The actual attached-role matrix, the proposed unattached-policy matrix, and
actual workload authorization are different evidence. Simulation success is
not proof that a live DynamoDB transaction completed.

## Default and bounded execution

`scripts/controller-policy-rollout.ts` without arguments is a zero-AWS plan.
The only execution opt-in is `--execute-one-reviewed-update`; generic execute,
deploy, target, template path and enable flags are rejected. Use the existing
`gmai-admin` temporary CLI profile and an absolute existing `aws.exe` path.
Importing the module performs no AWS or process action.

Historically, the app rejected actual IAM execution on 2026-10-08 before the process ran.
Specific approval for removing this exact unsupported controller condition is
required before future execution. A blanket autonomy instruction, a zero-AWS
plan, tests, a proposed simulation or an old deleted preview is not that approval.
Do not bypass an app rejection through another process, SDK or indirect tool.

The operator independently reads fourteen fixed readiness/ownership responses
and six template/controller-role responses. It requires jobs/display disabled,
the persisted OPEN circuit, empty task/service/slot inventories, the existing
digest-pinned hardened worker, one attached inline policy and no managed policy
or permission boundary. Every response, not just the last slot read, is bound.

It verifies fifteen proposed allow/deny cases, creates one uniquely named inline
UPDATE preview, and independently verifies exactly one non-replacing IAM Policy
Modify, its resolved before/after contexts and its prepared Original template.
All previous bootstrap/settings/role/tags/rollback configuration must match.
The private candidate is below the inline template size ceiling and protected
by verified private ACLs. No assets or image are uploaded.

Immediately before execution, it repeats all twenty reads, compares the full
original fingerprint and stack, and rechecks the exact still-available preview.
Only that fresh change set may execute once. The
[ExecuteChangeSet request](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/execute-change-set.html)
explicitly uses `--no-disable-rollback` and one unique client token. AWS retry is
disabled; an ambiguous create/execute acknowledgement is not resubmitted.

Main work has a fifteen-minute/145-call ceiling. Reconciliation has an independent
eight-minute/50-call reserve, including twenty post-state reads; it does not
consume a depleted main-work budget. No service invocation, task launch, secret
value read, job/slot/circuit write or schedule enable operation is available.

## Independent completion and failure handling

The terminal stack must be tied to this exact ChangeSetId and fresh update time,
not an older UPDATE_COMPLETE. On success, the actual Original template, attached
policy, role/trust, runtime, circuit, slots and ownership are re-read and compared.
Only this stack's update metadata and this IAM policy's update timestamp/status
may change; natural calculated spend may refresh, not the USD 5 budget settings.

An automatic rollback is failure, not successful rollout. Its original template,
policy and runtime must be independently restored. The shared readiness gate
continues to reject UPDATE_ROLLBACK_COMPLETE; the dedicated restoration check
normalizes it only internally after binding the exact terminal stack, and never
claims release or subsequent deployment approval.

Before execution, any failure removes only the exact fresh owned unexecuted
preview and verifies absence. After execution, only a terminal execution-history
entry or confirmed absence is accepted; it is not deleted as a pending draft.
In-progress or ambiguous failed reconciliation is never reported as safe/successful
and requires separate fresh inspection. The private temporary candidate is always
removed by a physically checked direct-child finally path.

Follow a successful update with the complete attached-role seventeen-case matrix
and independent eleven-core/twelve-reference safe-stop reads. Keep jobs/display
false and circuit OPEN even after permissions pass. Maintenance Logs evidence,
recovery rehearsal, notifications, hosting and publication remain separate gates.

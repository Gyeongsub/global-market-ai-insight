# Bounded stale-job recovery preparation — current checkpoint 2026-10-18

This is a future execution plan, **not live recovery acceptance**. No maintenance
function, role, rule, log group, schedule or cloud recovery write was deployed
in this checkpoint. Keep provider-backed jobs and live display disabled and
the persisted circuit OPEN. Do not create a stale job merely to fill a quota.

## Current local follow-up — 2026-10-18

The 20s sweep/10s reconcile budgets now check monotonic elapsed time and parent
cancellation before/after every SDK call. Late responses are discarded and
unconfirmed mutations are not counted as acknowledged success. Thirteen new
budget/deadline tests and four additional three-pass scenarios cover this
boundary; the original seventeen cases and all owner/STOPPED/conditional rules
remain. Cancellation cannot undo an accepted remote effect; independently read
state before recovery/retry. No call replays automatically. [Exact local scope,
AWS read gates and limits](evidence/PHASE11_MAINTENANCE_DEADLINE_2026-10-18.md).
No deployment or IAM simulator rerun occurred. The three original stream
controls and actual-service recovery are still blocked. Historical snapshots
below are not a new permission or execution instruction.

## Last measured permission status — 2026-10-11

The specifically approved controller correction executed once on 2026-10-10;
independent proof checked its applied state and all 17 actual attached-role
simulation cases. The original rollout nevertheless failed, and its original
full before/after settings comparison/precise primary cause remain incomplete.
Do not repeat the correction or relabel that run. Future local failure reports
now preserve fixed primary, cloud-cleanup and local-cleanup facts separately.
[Separate controller proof](evidence/PHASE11_CONTROLLER_POLICY_ACCEPTANCE_2026-10-10_EVENING.md),
[Local diagnostics](evidence/PHASE11_CONTROLLER_FAILURE_DIAGNOSTICS_2026-10-11.md).

Today's complete 64-read Maintenance run still verifies only 28/31 cases.
Three applicable stream cases have unverified same-resource positive controls.
All ten diagnostic cases deny today, including the non-acceptance group-input
controls; older group-input allows are historical. Maintenance deployment and
live stale-job recovery remain blocked. Do not widen policy, replace resource
inputs to pass, or use another role's existing log delivery as clearance.
[Fresh permission checkpoint](evidence/PHASE11_MAINTENANCE_PERMISSION_RECHECK_2026-10-11.md).

The blocking findings and resume sequence below record the 2026-10-08 state.
Their statements that the controller correction is unexecuted are historical,
not an instruction to apply it again. Current next work is the unresolved Logs
proof, then separately reviewed temporary deployment/recovery if all applicable
gates pass. Jobs/display remain disabled; OPEN and fresh empty inventory are
required at the start and end of any future cloud work.

## What is prepared

The real sweeper, reconciler and handler are exercised in sequence against
injected in-memory command senders. Seventeen fixed scenarios cover normal
expired RUNNING/QUEUED jobs, already-stopped tasks, delayed/ambiguous stops,
version races, replaced owners, ambiguous transaction acknowledgements,
missing/foreign tasks, failed reads, future deadlines and version exhaustion.
Three passes check retention first, independent STOPPED evidence next and
no duplicate effects last. This is not a DynamoDB emulator or AWS service proof.
An exhausted safe-integer version now retains the slot instead of overflowing
the conditional update's next version.

The reference-only CDK entry creates exactly one Maintenance stack with six
resources: one role, inline policy, function, log group, disabled rule and
rule-bound invoke permission. It imports no base-stack exports, performs no
lookups, and creates no table, cluster, task definition or API. The original
multi-stack entry rejects this mode rather than silently deploying base stacks.
The function has a 45-second timeout, 128 MB memory and two fixed slot keys.
Its account-shared concurrency is **not a concurrency-one guarantee**.

Default plans make zero AWS calls. The explicit existing-reference check has
at most fourteen reads: eleven core safety reads and three CloudFormation/
table-ownership reads. A fresh same-account/controller cluster ARN must agree
with CloudFormation's cluster **name** and the ACTIVE on-demand jobs table.
The fingerprint is consistency evidence only, not an ownership credential.

## Historical blocking findings — 2026-10-08

1. `ConditionCheckItem` was given `EnclosingOperation`, which its current
   service-authorization entry does not support. Isolated simulation denied
   that statement and allowed the exact-key statement without this condition.
   The local Maintenance and Compute/controller drafts are corrected. They
   still restrict the table and partition keys; no circuit-write grant is added.
   The current owned controller role also returned `implicitDeny` for its
   exact circuit check with all contexts supplied. This is a simulator finding,
   not a newly executed admission failure. The correction is **not deployed**.
   Keep jobs disabled. Do not enable admission or reuse the old fifteen-case
   success as clearance: the attached-role matrix now has seventeen cases.
   [AWS action-specific permission and condition-key reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html).

2. The unattached Maintenance matrix expects eleven allows and twenty denies.
   The historical sixty-read run verified nine allows/twenty denies but lacked
   positive-control validation for Logs denials. The current 64-read matrix
   requires an independent unattached allow at the identical action/resource
   for all four Logs cases, including expected denials. Its actual 2026-10-08
   run verified nine allows/nineteen denies; two stream allows and the other-group
   stream denial remain unverified. The latter must not be counted as a passing
   denial when its positive control is unverified. Full fourteen-read readiness
   captures, including Budget/slots/inventories, must agree before/after.
   The CLI still returns failure; no policy is attached by this operator.
   Diagnostic simulation also denied an exact stream against an Allow policy
   with Resource `*`, while accepting a group-wildcard evaluation input. This
   does **not** justify replacing the applicable resource input just to obtain
   a green result, widening a deployed role, or claiming service authorization.
   Reconcile the simulator/service behavior through an independently reviewed
   narrow proof before deployment. The original two cases remain required.
   [CloudWatch Logs action/resource reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html),
   [IAM simulator limitations](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html).

3. The former image-only Compute rollout rejects an IAM policy delta. That is
   intentional. Correcting the controller policy requires a new exact scoped
   diff, not weakening the image-patch gate. Existing code/notice/image proof
   must remain independent of this infrastructure change.

4. Complete distributed license/notice review and public-data display rights
   remain open. Existing three backend root-license gaps are not resolved by
   this rehearsal or a simulator result. No GitHub/public release is permitted.

## Future execution sequence and hard limits

| Stage | Required evidence | Stop condition |
| --- | --- | --- |
| Local preparation | Whole local gate, fixed rehearsal, strict six-resource preflight and real handler bundle/notice review | Missing tests, unknown resource/property/permission, or code not bound to the inspected artifact |
| Read-only baseline | Fresh Budget, healthy base stacks, absent Maintenance/Operations/AlarmCircuit, disabled flags, OPEN circuit, zero tasks/services/slots, exact existing references | Unknown owner, partial response, changed account/runtime or occupied capacity |
| IAM resolution | Applicable exact-resource allows and every deny; current controller correction separately reviewed | Missing context, unexplained denial or any unexpected allow |
| Exact temporary diff | Six additions, zero base-stack modifications; schedule DISABLED; bounded code object ownership; no retained resource or notification | Base stack/role/network changes mixed into Maintenance deployment |
| Empty runtime proof | At most one explicit manual invocation with empty inventory and bounded timeout; exact deployed code/log verification | Retry, schedule enablement, unexplained output, new task/job or altered circuit |
| Real stale-job case | A separately bounded, freshly owned legitimate job/task/slot with pre-recorded exact owner/version/deadline | Missing task identity or inability to prove independent STOPPED |
| Closing verification | Disable-first checks, exact owned-resource teardown, independent zero task/service/slot reads, verified CLI and console sign-out | Cleanup uncertain; do not infer success from handler response |

Never convert an old task/job into fresh acceptance evidence. For a real case,
the sweeper can stop only the task bound to the slot's job and startup identity.
It must re-describe STOPPED before conditional TIMED_OUT/version update. The
reconciler independently checks terminal job/version/task/creation identity and
atomically checks that job while deleting the still-matching slot. Replacement
owners, ambiguous effects and missing evidence retain capacity for review.
Only a confirmed controlled teardown may remove the newly created test state;
do not delete unrelated tasks, job records or cached credential directories.

Use a two-hour outer teardown deadline for a future temporary stack and keep
the schedule disabled throughout. If a run cannot finish and clean up within
the remaining account allowance/time, do only local/read-only work. A successful
empty invocation would not close the real stale-job recovery acceptance gate.

## Cost and privacy

Check current Tokyo pricing and exact account-specific changes before any
future deployment. USD 5 Budget alerts are delayed monitoring, not a hard cap.
The real cost controls are disabled admission, OPEN circuit, no recurring
schedule, fixed task/slot bounds, one invocation/no retry and confirmed teardown.
Even without workload execution, retained private ECR/S3/log/table storage and
prior request charges can appear later. Do not promise a zero account bill.

Sanitized reports contain enums/counts/hashes, not account/role/task/job owner
identifiers, private URLs, API-key content or raw cloud exceptions. Keep raw
screenshots/cache/archives in ignored local output only. Never disable endpoint,
transport, Windows security or credential protections to make a test pass.

## Historical resume instructions — 2026-10-08

The [2026-10-08 checkpoint](evidence/PHASE11_PERMISSION_CHECKPOINT_2026-10-08.md)
supersedes the interrupted attached-role read: sixteen of seventeen actual
cases are verified, not acceptance. The dedicated controller rollout remains
default-disabled and was blocked before execution by app security review.
Specific approval for the exact persistent condition removal is required;
another executor is not an alternative permission path. Jobs/display remain
false, OPEN/version 11 and empty inventories were independently rechecked.
Three Maintenance stream cases remain unverified under same-resource positive
controls. Do not widen permissions or treat another role's delivery as proof.

The following review is historical, not current execution approval.
The [2026-10-07 review](evidence/PHASE11_PERMISSION_REVIEW_2026-10-07.md) proved
an exclusive controller correction candidate in an unexecuted/deleted change
set; the attached policy is still original. One source-bound fixed unknown-route
invocation proved existing-controller log stream creation/delivery with no job
or IAM/configuration change. It is not Maintenance-role or recovery acceptance;
its original two simulator log allows remain unverified. Do not waive that gate.

Start with the two IAM findings above, not deployment. Re-run the fresh
reference gate after login; a dated fingerprint cannot replace current reads.
After resolving the log proof, review a dedicated controller-policy change
while keeping the current worker digest and admission disabled. Do not mix a
Compute policy correction, Maintenance deployment and live recovery into one
unreviewed operation. Notifications/hosting/publication remain separate phases.

See [historical preparation evidence](evidence/PHASE11_MAINTENANCE_PREPARATION_2026-10-06.md)
and [historical safe stop](evidence/LOCAL_SAFE_STOP_2026-10-07.md).
Today's final source gate and closing checks are in the
[2026-10-08 safe stop](evidence/LOCAL_SAFE_STOP_2026-10-08.md). Neither the
fifteen-case candidate proof nor local tests are live permission acceptance.

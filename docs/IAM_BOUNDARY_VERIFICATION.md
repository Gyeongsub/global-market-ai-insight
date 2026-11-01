# Owned IAM boundary verification

`operations:iam-boundary-proof` is default-zero with one execution mode,
`--execute-read-only`, for the current owned Tokyo Compute/controller/worker/
execution roles. No role assumption, secret-content retrieval, IAM grant,
ECS job or Bedrock invocation occurs.

Original template/physical resource IDs and live controller/task references
bind every role. Service-only trust, exact inline-policy names/documents and
empty managed-policy inventory are read before/after. CloudFormation's opaque
inline-policy physical ID is not mistaken for PolicyName; the original
template name and owned role are independently checked by GetRolePolicy.
Foreign references, boundary/attachment changes, partial replies, enabled
flags, altered runtime/policy/circuit or occupied inventory block the proof.
No caller policy/override/resource policy/exclusion/alternate identity is added.

The fixed matrix now expects six allows: approved revision/cluster launch,
PassRole of both exact roles to ECS tasks, execution-role secret injection and
worker job-key update and the controller's exact circuit condition check.
Eleven denies cover unapproved revision/cluster/role/
service, worker/execution role launch, worker PassRole, controller secret/model
access, worker circuit reset and checking a job instead of the circuit. These are **simulations**, not real service
operations. Nonexistent test resource names remain same-account synthetic
simulation inputs.

One complete exact-action/individual-resource result is required. Aggregate
and individual decisions must match with no missing contexts. Pagination,
extra actions/resources or a denied-case allow fail. Output contains fixed
case/decision facts, not role/account ARNs, policy documents or credentials.
The bound is 70 calls/15 minutes; failure never adds IAM writes.

All four known attached-policy condition keys are supplied with fixed safe
defaults, overridden only by each case's target condition. A missing-input
deny is not accepted as a resource boundary. AWS's optional empty-context
omission is distinct from null/malformed/nonempty missing-context fields.
[Real 15-case/65-call acceptance](evidence/PHASE12_SOURCE_AND_IAM_PROOFS_2026-10-05.md).
That historical result does not cover the two new cases. On 2026-10-06 a scoped
owned-role evaluation denied the controller circuit check with all contexts
supplied. The action's unsupported EnclosingOperation condition is corrected
locally, not deployed. Keep jobs/display disabled until a separately reviewed
policy correction and applicable proof pass. The expanded matrix is still
fail-closed, not grandfathered by the earlier result.
[Current finding and Maintenance limits](MAINTENANCE_RECOVERY_DRILL.md).

The [AWS API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulatePrincipalPolicy.html)
does not perform proposed operations. Read the
[per-resource contract](https://docs.aws.amazon.com/IAM/latest/APIReference/API_EvaluationResult.html)
and [limitations](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html).
Inputs and organization/resource/endpoint policies can differ from real
service behavior. This is not complete live authorization proof, role-trust
execution or a replacement for future scoped integration/security review.

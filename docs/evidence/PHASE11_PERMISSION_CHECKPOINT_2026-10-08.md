# Phase 11 permission checkpoint — 2026-10-08

This is scoped evidence, not publication, live-job or Maintenance approval.
Closing inventory and sign-out are recorded separately after completion.

## Existing-role matrix and controller correction

The fresh 67-call attached-role matrix completed all seventeen cases, unlike
yesterday's interrupted IAM read. Sixteen matched their expected decisions;
the controller's `ConditionCheckItem` allow did not. All eleven expected
denials and five other allows matched. Before/after roles/policies/runtime,
disabled admission/display, OPEN circuit and empty inventories remained stable.
No workload, IAM mutation or credentials/secret value retrieval occurred.

A fresh 55-read controller correction review verified four allows and eleven
denials. It independently matched the current original template, live inline
policy and owned runtime. The only candidate delta removes unsupported
`dynamodb:EnclosingOperation` from `ConditionCheckItem`, retaining the exact
table, `control_circuit` key and non-null guard. See the current
[DynamoDB authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html).
The proposed template/policy hashes are respectively
`711935517aa3c0e505f21666b78b2008eb05be4b9a3d5f73fddda0ad8cf4e955` and
`bb8af0027f5eb081ea9095821a9893f7e512fa643a4bb9d2ae2df40c7339c0d5`.
These are review evidence, not approval of a future or historical change set.

A separate [disabled IAM-only rollout](../CONTROLLER_POLICY_CORRECTION.md) is
implemented locally with exact current ownership, fresh simulations/preview,
before-execution rechecks, rollback explicitly enabled, one execution attempt,
bounded independent reconciliation, and private candidate cleanup. It neither
adds an enable flag nor weakens the existing image-only IAM-delta refusal.
Tests cover stale/widened/multiple deltas, drift, ambiguous create/execute,
verified rollback, definitively unstarted execution, and incomplete completion.

The attempted invocation of that operator was rejected by the app's automatic
security review **before process execution** because a persistent IAM boundary
change needs specific action approval. No new preview, execution, candidate,
IAM update or AWS deployment resulted. The denial was not retried, bypassed by
another executor, or treated as permission. Specific approval for that exact
controller condition removal remains necessary before its future execution.

## CloudWatch Logs evidence validity

Three fixed read-only calls evaluated exact-stream universal-resource controls
for CreateLogStream and PutLogEvents: both returned complete implicitDeny,
zero matched statements, no missing context, and no returned Organizations or
permission-boundary decision. That is not a policy-specific denial proof.

Seven further fixed read-only calls separated action/resource matching. The
same concrete stream was denied even under unattached `logs:*` or universal
action/resource controls; exact CreateLogStream with universal **resource input**,
DescribeLogGroups, and an independent S3 control were allowed. Lowercase action
under the concrete stream was still denied. No broad control was ever attached.

Six further reads bound an existing owned controller stream via metadata, not
log content. Even that actual stream and a synthetic stream in the same existing
group were denied under a universal-resource control. Existing and non-existing
group-wildcard inputs were allowed. Thus existence alone did not explain the
observations. The applicable action/resource shapes are documented in the
[CloudWatch Logs authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html).

Inference: this simulator observation does not establish policy-specific
authorization for these concrete stream inputs. It does **not** establish a
general service limitation or prove the hypothetical Maintenance role's actual
permissions. The API itself warns that
[simulation can differ from live authorization](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html).
Do not change the narrow attached/proposed grant, substitute a group-only input
for exact-stream acceptance, or reuse yesterday's existing-controller delivery
as proof of a not-yet-created Maintenance role.

The Maintenance matrix now requires an independent unattached **allow** control
for the same exact action/resource for all four Logs cases, including expected
denials. A failed/missing/truncated/substituted control marks the case unverified,
not a passing denial. Four fixed controls raise the maximum from 60 to 64 reads;
the 31-case matrix, ten-minute ceiling, zero writes/assumptions/invocations and
publication gate are unchanged. Every fourteen-read original readiness response
is now fingerprinted, including Budget, both slots and resource inventories.

The actual strengthened 64-read matrix verified 28 of 31 cases: nine allows
and nineteen denies. `create-only-maintenance-stream`,
`write-only-maintenance-stream` and `cannot-write-other-log-group` remain
unverified because their exact-resource positive controls did not establish
an allow. In particular the third is not a passing policy-specific denial.
The original fourteen-read readiness captures matched before/after; no policy
was attached. Final local/source verification and shutdown are recorded in the
[completed safe stop](LOCAL_SAFE_STOP_2026-10-08.md). Maintenance, recovery,
notifications, hosting/display rights and publication remain unfinished gates.

## Cost and security boundaries

Today's successful AWS operations in this checkpoint were bounded metadata/table
reads and hypothetical IAM simulations. A normal existing-profile CLI refresh
occurred; no long-lived credential or new trust/permission was created. No task,
Bedrock/provider request, Lambda invocation, new role/service, schedule, asset,
image or GitHub upload was performed. Read/storage costs and delayed earlier
usage remain possible; an observed Budget amount is not a finalized bill or cap.

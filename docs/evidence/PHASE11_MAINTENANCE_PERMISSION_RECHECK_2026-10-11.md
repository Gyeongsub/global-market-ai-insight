# Maintenance permission recheck — 2026-10-11

Scope: actual read-only policy simulations, not deployed-role/service or stale-
job recovery acceptance. No IAM/resource write, role assumption or Logs write.

## Fresh account baseline

The first core read stopped at expired CLI credentials. Ordinary sign-in to the
existing profile completed; a wholly new eleven-read gate then passed. That
first failed read was not relabeled as a pass. Chrome sign-in is independent
of CLI credentials.

The new gate verified Foundation/Compute UPDATE_COMPLETE, API CREATE_COMPLETE,
absent Operations/AlarmCircuit/Maintenance stacks, disabled jobs/live display,
OPEN/version 11, zero running/pending tasks/services/occupied slots, and the
existing digest-pinned nonroot/read-only worker/controller binding. Monthly
USD 5 Budget showed actual USD 0 and forecast USD 0.008. These are dated,
delayed observations, not an invoice, account-wide inventory or hard cost cap.

## Actual diagnostics: 38 reads/simulations

All ten fixed diagnostic simulations returned complete `implicitDeny`
observations, with identical exact inputs and no missing context/truncation.
Eight use applicable exact streams; two deliberately use group-wildcard
evaluation inputs and are explicitly not acceptance. Unattached universal-
resource controls and same-account caller/resource-owner controls also denied.
Full fourteen-read reference captures agreed before/after.

A later separate 38-read execution uses the same ten inputs but adds redacted
optional decision evidence; it is not a retry of any mutation or replacement
for the failed acceptance matrix. All ten still deny. Each reports aggregate
matched-statement count zero; per-resource matched statements and aggregate/
per-resource boundary/organization booleans are absent and remain `null`, not
"no guardrail" or an explanation of the denial. No policy IDs, statements,
positions, arbitrary decision-detail keys or raw responses leave the report.
Eight diagnostic and eleven policy-proof tests pass (19 total). Partial
responses discard the optional facts, and malformed/oversized optional fields
remain unknown. Original completeness and exact-stream gates are unchanged.

The [current aggregate response definition](https://docs.aws.amazon.com/IAM/latest/APIReference/API_EvaluationResult.html)
and [individual resource definition](https://docs.aws.amazon.com/IAM/latest/APIReference/API_ResourceSpecificResult.html)
describe these optional fields. The operators evaluate one fixed action/resource
at a time and require both matching aggregate and individual decisions; no old
aggregate-only resource inference is introduced.

The historical group-input allow was not reproduced today. Its older result
must not be substituted for today's denial, an exact-stream allow or a live
authorization proof. No universal control policy was attached.

## Actual acceptance matrix: 64 reads/simulations

The fixed 31-case matrix and four identical-action/resource positive controls
completed within the unchanged bound. The CLI correctly exited nonzero:

| Scope | Verified | Unverified |
| --- | ---: | ---: |
| Expected allows | 9 | 2 |
| Expected denies | 19 | 1 |
| Total | 28 | 3 |

Unverified cases are `create-only-maintenance-stream`,
`write-only-maintenance-stream`, and `cannot-write-other-log-group`. Their
unattached universal Allow controls did not validate the applicable stream
resource. Consequently the foreign-group denial cannot count as a passing
security boundary. The CreateLogGroup denial's same-resource positive control
did pass. Proposed policy/reference captures agreed before/after; proposed
policy SHA-256 is
`d217ee271595f604901a0ed89e53f4a51b32a8157e1e40fbb85aa04fadea8eeb`.

## Source-grounded interpretation, not a guessed cause

The [CloudWatch Logs authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html)
identifies log-stream resources for CreateLogStream/PutLogEvents. The
[simulation API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html)
evaluates supplied policies/resources without performing service operations.
[AWS's simulator guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
distinguishes simulated and live outcomes. These sources justify retaining
the exact resource and separate evidence scopes; they do not establish the
precise cause of today's denials.

Do not change evaluation resources solely to get a green result, attach a broad
policy, assume Maintenance permissions from another role's log delivery, or
deploy a temporary recovery function before its applicable gate is resolved.
No new support message or external report was sent. The previously corrected
controller condition is a separate historical gate, not this matrix's clearance.

## Resume and cost posture

Maintenance deployment, real stale-job recovery and notification acceptance
remain pending. Keep jobs/display disabled and circuit OPEN. Investigate the
simulator/service difference with a bounded independently reviewed narrow
proof; do not repeat the already-applied controller correction.

Today's simulations did not invoke Lambda/Fargate/provider/Bedrock, launch or
stop tasks, read API-key contents, attach policies or enable schedules. Reads,
retained storage and delayed prior charges may still appear. Fresh closing
state and console/CLI cleanup belong in the separate safe-stop record.

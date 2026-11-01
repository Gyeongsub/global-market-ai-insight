# Controller launch-identity hardening — 2026-10-03, local only

This source change is not a cloud deployment or a claim that today's source
has passed live Fargate acceptance. It creates no task, IAM change, provider
request or model invocation.

## What changed

The controller now requires CDK-supplied full ECS cluster and revision-pinned
task-definition ARNs in the configured partition, region and same account.
Short names, wildcard/unpinned revisions and conflicting scopes are rejected
before any sender is called. This validates format/scope, not account ownership
or authentication; exact IAM permissions and live identity checks still apply.

One Fargate request retains count 1, the deterministic idempotency token,
disabled ECS Exec, one fixed worker container and JOB_ID-only override. Subnet
configuration is copied to avoid caller/transport mutation redirecting a later
request. Deadlines must be finite integers within 500–15,000 milliseconds;
duplicate or unbounded subnet choices are refused.

A response is accepted only with exactly one task, no reported failures, and
matching full task/cluster/task-definition identity, modern cluster-qualified
task ARN, Fargate launch type, disabled Exec, startedBy prefix and full JOB_ID
ownership proof. Missing/conflicting proof, role or execution-changing overrides
produce the existing sanitized failure; raw response details are not logged or
returned. No automatic RunTask retry or broad StopTask action was added.

## Uncertain launch is still a cost boundary

An AWS request can have started work even when its response is unusable or
timed out. The existing repository retains the active-work slot on launch
failure. This change does not release capacity based on a rejection alone.
Unknown outcomes require exact owner/job/task STOPPED evidence and the existing
conditional reconciliation path; availability can remain blocked rather than
creating overlapping chargeable work. These guards cover this controller,
not administrator-issued tasks or an account-wide hard spending limit.

## Local verification

The 15 focused launcher/runtime-config tests passed, including positive
synthetic replies, wrong/missing identity fields, ambiguous responses, foreign
overrides, mutable inputs, invalid deadlines/job IDs and bounded abort with
one sender attempt. The all-zero account and task IDs are synthetic only.
Service type checking also passed. Additional full build/clean-source results
belong in the closing checkpoint once actually completed.

Before future redeployment, verify actual RunTask response compatibility with
this stricter policy in a bounded acceptance scenario and confirm unchanged
IAM, exact task stop, slot cleanup and disabled execution/display flags.
Do not weaken proof or retry blindly to make an incomplete response succeed.

Primary API references consulted read-only:
[RunTask](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html),
[Task](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Task.html).
Project boundaries: [API contract](../api.md),
[capacity/circuit decision](../adr/0010-persistent-circuit-and-capacity-slots.md).

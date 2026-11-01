# Phase 11 local observability draft — 2026-09-23

## Boundary

This is an opt-in **local CDK template**, not an AWS deployment. `GMAI_ENABLE_OPERATIONS=true` requires the IAM-protected API gate and a pinned worker image digest. The default assembly remains Foundation-only when no digest is provided. No AWS session, metric query, alarm creation, notification, timer, sweeper, task launch or circuit mutation was made in this checkpoint. Today's live account resources and billing were not audited.

## Proposed observability resources (OperationsStack only)

- One CloudWatch dashboard with API request/5xx counts and Lambda controller errors/throttles/p95 duration. It uses basic service metrics; route-level detailed API metrics and Container Insights remain disabled.
- Three standard five-minute count alarms: Lambda `Errors`, Lambda `Throttles`, HTTP API `5xx`. Each uses one breached datapoint, threshold `>=1`, missing data treated as not breaching, `ActionsEnabled=false` and no action ARN. They are observation candidates, **not operational notifications**.
- No SNS topic/subscription, EventBridge schedule, sweeper Lambda, custom-metric writer, automatic circuit action, new service or new public endpoint.

## Bounded stale-job logic prepared locally

`StaleJobSweeper` inspects at most the configured 1–5 exact `control_slot_*` keys. It never scans the table. It requires the slot owner's matching job creation time, an overdue non-terminal job, a pinned version and an exact task ARN in the reviewed ECS cluster. It additionally verifies the described task's `startedBy` and sole `worker` container override carry that same exact `JOB_ID`; it rechecks this ownership after a stop request. An active task receives one exact StopTask request, followed by a fresh DescribeTasks read; the job can be conditionally marked `TIMED_OUT` only after actual `STOPPED` is observed. The conditional update checks the prior state, version, task ARN, owner timestamp and deadline. Missing/foreign task evidence, an in-progress stop, SDK errors and racing updates retain the slot for review. The class does **not** delete capacity records; the existing separate reconciler still requires a terminal job and observed stopped task. This behavior was tested with mocked AWS senders only.

Local follow-up: a Node.js Lambda-compatible `handler` now composes sweep then reconciliation, accepts only the bounded Tokyo table/cluster/slot configuration, and emits count-only summaries. It was bundled locally but has **no deployed Lambda function, IAM role, trigger or recurring schedule**. Mock tests verify that reconciliation never runs if the sweep fails. The bundle is ignored by Git and no AWS call was made to build it.

Further local follow-up: a separately gated `MaintenanceStack` template now exists behind `GMAI_ENABLE_MAINTENANCE_DRAFT=true` **and** the operations/API gates and pinned digest. It proposes one Lambda, its log group/role/policy, one Lambda invoke permission and one EventBridge rule in `DISABLED` state at a five-minute rate. The role has exact job/slot-key DynamoDB conditions and task-ARN/cluster-scoped ECS DescribeTasks/StopTask; it has no provider-secret, Bedrock, RunTask or PassRole permission. Target retries are disabled. Local synthesis with a synthetic digest produced these six resource types and confirmed `State: DISABLED`; no AWS deployment, schedule activation or Lambda invocation occurred. Even a disabled draft deployment would require fresh cost/security approval, and the synthetic digest must never be deployed.

The full local checker passed **218 service/contract + 16 infrastructure + 19 frontend = 253 tests** after this addition, with type checks, lint, local bundles/smokes, Foundation synth, frontend audit and secret-pattern scan. The first full rerun caught a test-only TypeScript environment declaration error; it was corrected before the successful rerun.

Final checkpoint after the handler/template/publication-preflight tests: **221 service/contract + 19 infrastructure + 19 frontend + 7 publication-preflight = 266 tests** passed, together with the same local type, lint, bundle, synth, frontend and secret checks. No cloud execution was added.

Local opt-in synth with a **synthetic** digest succeeded. Its operations template has exactly one `AWS::CloudWatch::Dashboard` and three `AWS::CloudWatch::Alarm` resources. The synthetic digest must never be deployed; real image/account state still requires fresh verification.

## Cost and security implications before future deployment

CloudWatch alarms and dashboards can incur ongoing charges from the time they exist, including while the application is idle. Free-tier eligibility is account-wide and cannot be assumed from this template. A live deployment needs a fresh Tokyo-region cost review, exact resource diff, approval, teardown plan and notification design. `ActionsEnabled=false` means no email/page arrives when an alarm trips. Missing-as-not-breaching is suitable for sparse error counters but is not a liveness check. No alarm may be described as a hard spend limit or as proof that workers have stopped.

Official references reviewed: [Lambda metrics](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html), [HTTP API metrics](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-metrics.html), [missing-data treatment](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarms-and-missing-data.html), [CloudWatch pricing and free tier](https://aws.amazon.com/cloudwatch/pricing/).

## Remaining Phase 11 work

1. Decide notification recipient/security boundary and SNS topic/subscription, then test an actual notification after approval.
2. Review the exact maintenance IAM and disabled schedule template, then obtain a separate cost/security approval before any deployment or later schedule activation. A live failure drill and exact STOPPED/slot recovery evidence remain necessary.
3. Define structured log queries/custom metrics only where the extra value and query/storage cost justify them.
4. Run controlled provider/model/task-failure and stale-job drills, verify circuit behavior and clean up the exact affected task/slot. No such live drill was performed today.

# Phase 11 controlled live drill plan

Status: **Stages A–B passed and were torn down 2026-10-04; Stage C and other operations exit gates pending**
Prepared: 2026-09-30  
Revised: 2026-10-04  
Region: `ap-northeast-1` only

The reference-only path completed the real two-event log/alarm-to-OPEN drill
in 79 seconds, ending OPEN/version 11, and removed all temporary resources.
No live admission-denial request was made. The explicit low-quota temporary
mode has no function-level reserved-one cap and changes no account quota.
See [observed evidence](evidence/PHASE11_ALARM_ACCEPTANCE_2026-10-04.md),
[ADR 0014](adr/0014-low-quota-temporary-alarm-drill.md) and
[local Stage C preparation](evidence/PHASE11_CIRCUIT_DENIAL_PREPARATION_2026-10-04.md).
The historical planning assumptions below do not supersede that dated record
or authorize another deployment. Refresh pricing and all private state first.

This plan turns the locally tested Operations/custom-metric/alarm-circuit drafts
into a bounded future acceptance. Reading or testing this document performs no
AWS call. It is not standing approval to deploy, write logs, change the circuit,
enable provider-backed jobs, subscribe a recipient or incur cost.

## Existing-reference alternative — local only

Today's complete console export-name table lacked four of the ordinary path's
seven required imports. Values and the prior failure cause remain unverified.
A separate two-target assembly now references existing resources without
CloudFormation imports or base synthesis; this is not ownership transfer or a
bypass of cost/live/IAM review. See [ADR 0013](adr/0013-reference-only-operations-drill.md).

Prepare `pnpm operations:phase11-reference-preflight`, then obtain fresh
successful **core and reference** readiness before the dedicated entry-point
diff. The reference gate's twelve metadata reads cannot replace the core
gate's eleven Budget/work/slot/circuit reads. Defaults perform zero calls.
Use `infrastructure/bin/phase11-drill-app.ts` with matching fresh private
identity/API/fingerprint and paired cost flags. Review existing-log filter
attachments explicitly. All pricing, exact-version temporary CLOSE, automatic
OPEN, synthetic-signal, no-worker, notification separation and two-hour
teardown conditions below remain unchanged. No live step occurred today.

## Credential-free local approval packet

Before any AWS login, run:

```text
pnpm operations:phase11-preflight
```

This command removes credential-related environment variables from its child
process, disables EC2 metadata lookup, uses only a synthetic account identifier,
synthesizes to a temporary directory and deletes that directory. It performs
zero AWS calls and reports only resource-type counts, fixed gates and bounded
future mutation limits. It must fail if the intended assembly changes or if the
two target stacks contain SNS, a subscription, a KMS key, a schedule, an ECS
Service, a load balancer, a NAT gateway or an Elastic IP. It must also fail if
any target resource is retained or snapshotted, or if the new alarm-circuit log
group does not explicitly delete on stack deletion and replacement.

After a fresh temporary login, run the separate sanitized read-only gate before
generating any account-specific diff:

```text
pnpm operations:phase11-readiness -- --execute-read-only
```

Its default invocation is a zero-call plan. Execution requires
`AWS_PROFILE=gmai-admin`; an AWS CLI installed outside `PATH` may be supplied
through the uncommitted `GMAI_AWS_CLI_PATH` setting. A true
`readyForAccountSpecificDiff` permits only the exact diff review. It is not
deployment, circuit-write or cost approval.

## Learning goals

The user should personally verify four architecture decisions in the console or
reviewed template diff rather than merely copy commands:

1. **Signal:** a log metric filter matches a fixed JSON error code and publishes
   one dimensionless custom metric; `jobId` and request ID are not dimensions.
2. **Decision:** a CloudWatch alarm evaluates the metric separately from its
   notification/action paths.
3. **Control:** EventBridge receives the state-change envelope, while a narrowly
   scoped Lambda may update only `control_circuit` to `OPEN`.
4. **Recovery:** `OK` is not permission to resume spending. A human diagnoses,
   reads the current version, deliberately resets if appropriate, then restores
   the safer OPEN state before ending the drill.

## Exact first-drill scope

Keep notification and maintenance disabled. The proposed deployment delta is:

- Operations: 1 dashboard, 6 alarms total, and 3 custom metric filters.
- Alarm circuit: 1 EventBridge rule, 1 Lambda, 1 short-retention log group,
  reserved concurrency 1, 1 asynchronous invoke configuration and the exact
  execution role/policies/permission generated for that path.
- SNS topics/subscriptions: 0.
- customer-managed KMS keys: 0.
- recurring maintenance schedules: 0.
- ECS Services, ALB, NAT Gateway and VPC endpoints: 0.
- provider calls, Bedrock calls and Fargate launches during the signal-only
  stage: 0.

The two target stacks may exist for at most **two hours** from the first
successful deployment event. Teardown begins immediately after the bounded
evidence is captured or on any abort condition, whichever occurs first. This is
an operational time limit, not a billing hard cap.

The deployment flags proposed for a reviewed diff are:

```text
GMAI_ENABLE_API=true
GMAI_ENABLE_OPERATIONS=true
GMAI_ENABLE_CUSTOM_OPERATION_METRICS=true
GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST=true
GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION=true
GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST=true
GMAI_ENABLE_ALARM_NOTIFICATIONS=false
GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST=false
GMAI_ENABLE_MAINTENANCE_DRAFT=false
GMAI_ENABLE_INTERNAL_JOBS=false
```

The worker image digest must remain an already reviewed immutable digest. A new
image build/push is outside this drill.

## Approval packet before any mutation

Record without publishing identifiers or values:

- fresh STS identity, expected account and Tokyo Region;
- current USD 5 Budget status and verified recipient, while acknowledging delay;
- current running/pending task, ECS Service, occupied-slot and circuit state;
- current dashboard/alarm/metric-filter/EventBridge/Lambda/log-group inventory;
- current Tokyo prices or account-specific billing dimensions for the retained
  resources above;
- exact CloudFormation resource and IAM diff, including deletion policies;
- a complete fresh export inventory proving all target imports exist before
  an exclusive target deployment; never silently update upstream stacks;
- deployment and rollback commands with exact stack names;
- maximum calls/writes and the stop conditions below.

The public AWS pricing page reviewed on 2026-10-01 says that its Free Tier
includes 10 custom metrics, three custom dashboards of up to 50 metrics and 10
standard-resolution alarm metrics. It also says classic custom metrics,
dashboards and alarms are billed by the hour when chargeable. Account
eligibility and already-consumed allowances are unknown until the live preflight,
and paid rates vary by Region. Using AWS's public US example rates only as a
conservative planning reference, the three custom metrics, one dashboard and six
alarms total USD 4.50 for a full month; two hours is about USD 0.013 before tiny
logs, Lambda, EventBridge and DynamoDB effects. This is not a Tokyo quote or a
guarantee. The live approval packet must use current Tokyo/account facts and a
USD 0.05 drill planning ceiling; ambiguity aborts the drill.

Use the [local safety and private diagnostic helpers](evidence/PHASE11_LOCAL_DEPLOYMENT_SAFETY_2026-10-02.md)
before retrying the cleaned-up failed attempt. A signal category is not a cause
confirmation. The earlier execution and cleanup are documented in
[the safe stop](evidence/LOCAL_SAFE_STOP_2026-10-02.md).

Deployment, log injection, circuit mutation and any internal-job enablement are
cost/security actions and require the applicable user approval at that time.

## Stage A — deploy with no synthetic failure

1. Keep the circuit verified `OPEN` and internal jobs false during deployment.
2. Deploy only the reviewed Operations and alarm-circuit deltas.
3. Confirm three filters have no dimensions, metric value 1/default 0, and the
   three custom alarms use a five-minute Sum with threshold 2.
4. Confirm the rule contains six exact alarm names and `ALARM` only.
5. Confirm Lambda environment contains no secret and its role has only the
   exact circuit-key DynamoDB access plus exact log writes.
6. Verify there is no SNS/KMS/subscription, maintenance schedule or running ECS
   task/service created by this stage.

If the deployed diff differs from the reviewed packet, do not patch forward.
Keep the circuit OPEN and roll back the exact new stacks.

## Stage B — controlled CLOSED-to-OPEN proof, no worker

An already-OPEN circuit proves idempotence but cannot prove that the alarm
automation can perform the required state transition. Therefore, only after
internal jobs are verified false and task/service/occupied-slot counts are all
zero, obtain separate approval to perform one exact-version manual `CLOSED`
write. Immediately follow it with the single bounded synthetic log batch below.
Do not leave the circuit CLOSED while diagnosing, changing templates or waiting
for another approval.

Use one uniquely named temporary log stream in the existing controller log
group and one bounded batch containing exactly two single-line JSON events:

```json
{"level":"error","service":"controller","code":"TASK_LAUNCH_FAILED","drill":true}
```

No job, task ARN, account ID, endpoint, credential, provider/model result or
arbitrary exception belongs in the event. Expected mutation budget:

- CloudWatch Logs `CreateLogStream`: at most 1;
- CloudWatch Logs `PutLogEvents`: at most 1 batch / 2 events;
- metric observations: 2 on one dimensionless metric;
- EventBridge/Lambda delivery: one normal attempt with at most one bounded
  delivery retry and one bounded Lambda async retry;
- DynamoDB: one separately approved exact-version manual CLOSED write, then the
  handler's bounded consistent reads and at most one conditional OPEN write;
- provider/Bedrock/Fargate/API job calls: 0.

Wait no more than two alarm evaluation periods. Verify the metric, alarm state,
exact EventBridge match, Lambda outcome and stored circuit actor/reason/version
using sanitized views. Do not inject another batch to diagnose ambiguity. An
`OK` transition must leave the circuit OPEN. If automatic OPEN is not verified
within the bound, use the current freshly read version to restore OPEN manually,
then stop the drill; do not retry the signal.

## Optional Stage C — prove live admission denial

This stage is a **separate cost/security decision**, not implied by approval of
Stages A–B. It temporarily enables the internal-job path, which can launch paid
Fargate/provider/model work if a guard is wrong.

Proceed only after a fresh consistent read proves a valid persisted OPEN record
created by Stage B. Review the exact Compute configuration change, then submit
one signed request. Expected result is `503/CIRCUIT_OPEN`, with job writes 0,
task launches 0, provider calls 0 and Bedrock calls 0. An ambiguous response is
not permission to retry. Immediately verify tasks/slots and return the internal
execution flag to false through the reviewed deployment path.

If any task starts unexpectedly, stop only the exact verified project task,
retain the slot until exact STOPPED evidence, restore internal false, keep the
circuit OPEN and follow the existing reconciliation runbook. Do not submit a
second request.

## Manual recovery learning step

Only after internal execution is confirmed false and no task/slot is active:

1. Read and note the current circuit version and alarm cause.
2. Explain why alarm `OK` alone is insufficient recovery evidence.
3. Confirm that Stage B already exercised the exact-version manual close and
   automated reopen; do not repeat it merely to create another screenshot.
4. If a separate reset exercise is explicitly approved later, use the newly
   observed version and immediately restore OPEN. Never reuse historical version
   numbers from documentation.

The safe closing state for the session is OPEN, not CLOSED.

## Teardown and safe-stop proof

Destroy the alarm-circuit stack first, then remove the custom-metric Operations
variant according to the reviewed dependency order. Do not destroy shared
foundation/compute resources as a shortcut. Verify individually:

- EventBridge rule/target and Lambda invoke configuration absent;
- alarm-circuit Lambda, reserved concurrency, role/policy and log group absent;
- all six drill alarms, dashboard and three metric filters absent unless a
  separately reviewed retention scope applies; removal of filters stops new
  observations but does not delete historical custom metric data;
- no unexpected SNS topic/subscription or KMS key;
- internal jobs false, circuit valid OPEN, tasks/services/occupied slots zero;
- temporary CLI session logged out and console logout confirmed;
- Billing/Budget rechecked with the explicit note that data may be delayed.

Delete only the uniquely identified drill log stream after saving sanitized
evidence. It lives in the retained controller group: do not delete that shared
group as a cleanup shortcut. Retention expires old events, not necessarily the
stream itself. Do not publish its ARN/name or synthetic event timestamps.

These distinctions were rechecked against the official
[CloudWatch metric lifecycle](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_concepts.html)
and [log group/stream concepts](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html)
on 2026-10-02. Retained historical metrics are not evidence that their filters,
alarms or event automation remain active.

## Abort conditions

Stop without retrying or broadening scope if any of the following occurs:

- account/Region, stack diff, image digest, circuit version or Budget state is
  unknown;
- a template contains SNS/KMS/subscription/maintenance/internal-job resources
  not listed for the current stage;
- the metric filter has any dimension or does not match the exact fixed code;
- the circuit is missing/malformed, fails to reach verified OPEN, or a conflict
  does not resolve to a fresh OPEN read;
- a task/job/slot appears during Stage B;
- credentials, account IDs, full ARNs, endpoints or payloads appear in output;
- teardown cannot prove the retained-resource inventory.

On abort, keep/restore OPEN, keep internal jobs false, inspect the exact
resource state read-only, and request a new bounded decision rather than
blindly repeating deployment, log injection or job submission.

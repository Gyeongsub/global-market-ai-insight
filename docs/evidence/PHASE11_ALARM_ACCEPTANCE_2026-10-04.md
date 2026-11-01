# Phase 11 — bounded alarm-to-circuit acceptance

Date: 2026-10-04, Asia/Tokyo. This is a completed, temporary, private Tokyo
development drill, not permanent operations, hosting or publication approval.
Private account/API/ARN/asset references stayed in process memory; raw records,
credential material and provider/model content were not saved in this record.

## Preflight and exact scope

The fresh core eleven-read pass and separate twelve-read resource-reference
pass both succeeded before the account-specific diff and again before use.
The USD 5 Budget had delayed actual USD 0.00 and forecast USD 0.009; these are
not an immediate bill or a spending cap. Foundation/Compute/API were healthy;
Operations and AlarmCircuit were absent. Internal jobs and live result display
were explicitly false. Running/pending tasks, services and occupied slots were
zero, and the stored circuit was verified OPEN/version 9. The existing worker
was digest-pinned and hardened; neither its image nor the base stacks changed.

The three log-group metadata reads originally used limit 100. The AWS API
rejects that value: its maximum is 50. The shared exact-query guard now fixes
50, rejects alternatives before spawning a process, and still refuses
incomplete paginated results. No read budget or IAM permission was expanded.
This defect is not the established cause of an earlier deployment rollback.
[Official limit](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_DescribeLogGroups.html).

The fresh Lambda account read returned total/unreserved concurrency 10/10.
The normal function reservation of one was incompatible with that pool. The
explicit development reference-only mode in [ADR 0014](../adr/0014-low-quota-temporary-alarm-drill.md)
omitted reservation for this temporary drill; it did not raise the account
quota or guarantee a function-level concurrency-one cap. Default/main-app
behavior stays reserved-one and rejects the temporary flag.

Private assembly inspection and CDK's direct template diff covered exactly two
target stacks, **17 additions, zero removals and zero modifications**. No base
stack synthesis/update, context lookup, cross-stack import or exported output
was needed. Operations had six alarms, one dashboard and three metric filters.
AlarmCircuit had one each of rule, role, policy, function, async invoke config,
invocation permission and log group. There was no SNS/KMS, notification,
schedule, ECS service/task launch, network resource or public endpoint.

The role allowed only GetItem/UpdateItem on the exact jobs table's
`control_circuit` leading key, plus log-stream creation/writes under the new
function log group. No task launch, PassRole, secret, model or provider access
was granted. The handler checked account/Region/exact alarm and six-name
allowlist, used conditional OPEN writes, and could never close/reset. Timeout
was five seconds at 128 MiB; delivery/async retries were one within 60 seconds.

## Observed acceptance

Both temporary stacks reached CREATE_COMPLETE. Before the signal, all six
alarms were not ALARM, the function was healthy, and jobs/display stayed false
with tasks/services/slots zero.

1. Exactly one fresh-version conditional operator write changed OPEN/9 to
   CLOSED/10. No provider-backed job was enabled or submitted.
2. Exactly one batch of two structured synthetic `TASK_LAUNCH_FAILED` events
   was written to a uniquely owned controller log stream.
3. In **79 seconds**, the real TaskLaunchFailures alarm entered ALARM and the
   actual automation restored the stored circuit to **OPEN/version 11**.
   Its actor was `cloudwatch-alarm-automation` and reason identified the exact
   project TaskLaunchFailures alarm. No direct Lambda invoke or SetAlarmState
   shortcut was used; no manual restore was needed.

This proves the real log-filter → metric/alarm → EventBridge → Lambda →
conditional DynamoDB OPEN path. It does not prove a new signed request is
denied specifically by the circuit while internal jobs are enabled, nor
permanent monitoring, notification delivery, stale-task recovery, hosting or
the compatibility of currently undeployed worker/controller source changes.

## Verified teardown and logout

The bounded operator run finished in about eight minutes. Its finally cleanup
deleted AlarmCircuit then Operations and independently verified both absent.
It removed only the uniquely owned synthetic stream and **two newly created
exact bootstrap S3 object versions**, confirming those objects no longer
existed. Preexisting objects, the bootstrap bucket and retained base data were
not deleted. The private assembly was removed from its verified temporary root.

Independent checks then found zero target alarms, rule, temporary function/log
group, metric filters and dashboard. A final complete core readiness pass
confirmed healthy base stacks, absent targets, jobs/display false, tasks
running/pending/services zero, occupied slots zero and verified **OPEN/11**.
Operator and cleanup code counted 25 and 27 owned CLI calls respectively;
those counters exclude CDK-internal calls and separate readiness/diff passes
and must not be presented as total cloud-call counts.

The scoped CLI logout returned success. The console's Sign out returned the
public AWS sign-in page. All owned authentication/deployment/operator processes
finished; no loaded-token process was deliberately retained. CLI cache removal
does not revoke every token in other applications: AWS documents that already
loaded tokens can remain valid for up to 15 minutes.
[Logout semantics](https://docs.aws.amazon.com/cli/latest/reference/logout/).

Temporary recurring resources are gone, but previously emitted custom-metric
datapoints cannot be deleted and historical prorated/request/storage charges
may appear later. Existing ECR/S3/DynamoDB/log storage remains; this is not an
account-wide zero-cost claim. Current Tokyo prices and the USD 0.05 planning
allowance are documented in ADR 0014; neither the allowance nor Budget is a
hard spending lock. No Logs Insights query, Fargate task, Bedrock/Twelve Data
call, image push, GitHub upload or new subscription occurred in this drill.

Next live scope: separately refresh identity/readiness and review the exact
current worker/controller update and controlled signed denial/slot-recovery
acceptance. Do not reuse version 11 without a fresh read or treat this dated
proof as standing authority to deploy or publish.

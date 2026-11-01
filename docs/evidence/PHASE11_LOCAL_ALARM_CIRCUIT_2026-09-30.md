# Phase 11 local alarm-to-circuit checkpoint — 2026-09-30

## Scope and boundary

This checkpoint implemented and tested a local deployment draft for one-way
CloudWatch alarm response. It did not authenticate to AWS, synthesize against a
live account, deploy a stack, create an alarm/EventBridge rule/Lambda/log group,
invoke Bedrock or Fargate, change the DynamoDB circuit record, run a Logs
Insights query, subscribe an address or publish to GitHub.

## Implemented fail-safe path

- A separate `AlarmCircuitStack` keeps this response independent from the
  stale-job maintenance schedule.
- Default synthesis omits the stack. Inclusion requires the API and Operations
  gates, `GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION=true`, and the independent
  `GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST=true` acknowledgement.
- The EventBridge pattern allows only the six exact project alarm names (three
  standard service metrics and three separately gated structured-log metrics)
  and only transitions to `ALARM`. EventBridge delivery and Lambda
  asynchronous processing are each limited to one retry within 60 seconds;
  the handler remains idempotent if a duplicate is delivered.
- The Lambda independently validates `source`, detail type, Tokyo Region,
  expected 12-digit account, exact single alarm ARN, state and alarm allowlist.
- The function has 128 MiB memory, a 5-second timeout, reserved concurrency 1,
  no X-Ray tracing and a 7/14-day project retention log group.
- IAM permits only DynamoDB `GetItem` and `UpdateItem` on the jobs table with
  `dynamodb:LeadingKeys = control_circuit`, plus writes to the exact log group.
  It has no ECS, Bedrock, SSM, SNS, `iam:PassRole`, close/reset or delete path.
- A CLOSED or absent valid record is opened with a conditional version write.
  OPEN is an idempotent no-op. A conflict is accepted only when a fresh
  consistent read proves another writer already produced OPEN.

## Local validation

Targeted service and infrastructure checks covered malformed configuration,
untrusted source/Region/account/ARN/state/name, CLOSED-to-OPEN behavior,
already-OPEN idempotency, safe conditional conflicts, exact EventBridge
matching, bounded function settings, least-privilege IAM and entry-point gate
mismatches. A shared in-memory drill then passed one exact ALARM through the
automation and the real controller service boundary: the circuit reached
`OPEN/version 10`, a valid ANALYZE request returned `CIRCUIT_OPEN`, and both job
writes and task launches remained zero. An `OK` event was rejected and did not
close the circuit.

The full local checker passed **320 tests**: 14 publication/documentation guard
tests, 250 service/contract tests, 28 infrastructure assertions and 21 frontend
contract tests. The secret scan found zero high-confidence findings; 80 Markdown
files and 93 local links passed; the default foundation synthesis made no AWS
call; all bundle and static-build steps completed locally.

The event fields and retry bounds were cross-checked on 2026-09-30 against the
official [CloudWatch alarm event example](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch-metrics-insights-alarms-partial-data.html),
[EventBridge CloudWatch event reference](https://docs.aws.amazon.com/eventbridge/latest/ref/events-ref-cloudwatch.html),
[EventBridge retry policy](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_RetryPolicy.html),
and [Lambda asynchronous error handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-configuring.html).

## Remaining live gates

Before any deployment, review current Tokyo pricing, the exact CloudFormation
resource/IAM diff, retained log cost and teardown order, then obtain the
relevant cost/security approval. A controlled live drill must prove the alarm
opens the circuit, a new request launches no task, `OK` never auto-closes it,
manual reset requires a fresh version, and stack removal leaves no retained
automation resource. This automation reduces exposure but is not an AWS billing
cap and alarms can be delayed.

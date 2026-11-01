# ADR 0012: Isolate one-way alarm-to-circuit automation

- Status: Proposed and locally tested; not deployed
- Date: 2026-09-30

## Context

The controller already denies new jobs when the persisted application/cost
circuit is `OPEN`, and the operator command uses a version condition for manual
changes. CloudWatch alarms can identify controller/API failures, but an email
alone may be noticed too late to reduce repeated task/model/provider exposure.
An automatic response therefore needs enough authority to stop new admission
without gaining authority to launch work, recover capacity, read secrets or
silently restore spending.

Combining this response with the stale-job sweeper would couple two different
trust decisions: the sweeper can inspect/stop exact ECS tasks and reconcile
slots, while an alarm responder only needs a single DynamoDB control item.
Automatic closure is more dangerous than automatic opening because an `OK`
transition does not prove that the root cause, data-license condition or cost
concern is resolved.

## Decision

1. Put the response in an independent `AlarmCircuitStack`, absent from default
   synthesis and enabled only with the Operations gate plus a separate cost
   acknowledgement.
2. Match only the six exact project alarm names and only `ALARM` state-change
   events: three basic service alarms plus separately cost-gated task-launch,
   provider and model failure alarms. Revalidate inside Lambda the CloudWatch source/detail type, Tokyo
   Region, expected account, single exact alarm ARN, state and allowlist.
3. Give the role only DynamoDB `GetItem` and `UpdateItem` on
   `control_circuit`, plus its exact log group. Do not grant ECS, Bedrock, SSM,
   SNS, PassRole, delete, close or reset capabilities.
4. Read consistently and conditionally write the observed version to `OPEN`.
   Treat already OPEN as a no-op. After a write conflict, report success only
   when a fresh read proves a concurrent OPEN; never overwrite a newer state.
5. Never react to `OK` or `INSUFFICIENT_DATA` by closing. Diagnosis and reset
   remain manual, require a fresh version and explicit confirmation, and are
   audited separately.
6. Bound the function to 128 MiB, five seconds and reserved concurrency 1.
   Bound EventBridge delivery and Lambda asynchronous processing to one retry
   and 60 seconds each. Duplicate delivery remains safe because OPEN is
   idempotent.

## Alternatives considered

- **SNS/email only:** simplest and human-visible, but response time depends on
  a recipient. Retained as an independently gated notification path.
- **Alarm action directly invoking Lambda:** possible, but an EventBridge event
  supplies a standard envelope that can be filtered and validated. The rule is
  also independently removable and visible in the control flow.
- **Reuse the maintenance Lambda/role:** rejected because its ECS and job/slot
  permissions are unnecessary for alarm response and enlarge blast radius.
- **Automatic close on `OK` or cooldown:** rejected for the first release. It
  could restore task/provider/model spending before root-cause review.
- **Unlimited/default retries or an immediate DLQ:** default retries can process
  stale events for too long; a DLQ adds retained data, IAM, monitoring and cost.
  The first draft uses short bounded retries and treats a future DLQ as a
  separate reliability/cost decision.

## Consequences

- A verified alarm can quickly stop new admissions without cancelling or
  modifying already-admitted work.
- False positives reduce availability until a human resets the circuit. This
  is an intentional bias toward cost/security containment.
- A delivery failure can still prevent automatic opening; CloudWatch alarms and
  Budgets remain delayed signals, and this circuit is not a billing cap.
- The automation adds request-based Lambda/EventBridge/DynamoDB use plus a log
  group only if explicitly deployed. It must be included in the resource diff,
  current pricing review, controlled drill and teardown proof.
- Live acceptance must show exact ALARM → OPEN, zero new job/task launch, no
  auto-close on OK, manual versioned reset, and removal of every automation
  resource. Local tests alone do not satisfy that acceptance.

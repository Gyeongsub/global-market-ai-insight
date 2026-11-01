# Phase 11 local approval-packet evidence — 2026-10-01

## Scope

This checkpoint prepared a future controlled operations drill without logging
in to AWS. It did not query or mutate an AWS account, deploy a stack, publish a
log event, change the persisted circuit, launch Fargate, call a provider/model,
create a notification or push a repository.

## Credential-free approval packet

`pnpm operations:phase11-preflight`:

- removes AWS profile, static-key, session-token, web-identity, shared-config
  and container-credential environment variables from its child process;
- disables EC2 metadata credential discovery;
- uses a synthetic account and Tokyo Region only for local CDK synthesis;
- writes the assembly to an operating-system temporary directory and removes it;
- reports zero AWS calls, zero cloud mutations and only sanitized resource-type
  counts, fixed gates and future mutation limits.

The validated target inventory is:

- Operations: one dashboard, six alarms and three metric filters;
- alarm circuit: one EventBridge rule, one Lambda, one invoke configuration,
  one permission, one log group and its exact role/policy;
- zero SNS topics/subscriptions, KMS keys, schedules, ECS Services, load
  balancers, NAT gateways and Elastic IPs.

It also rejects any target resource with a retained or snapshot deletion or
replacement policy. The one newly created alarm-circuit log group must
synthesize with explicit `Delete` policies for both stack deletion and
replacement. This supports the two-hour teardown plan; it does not prove that
a future live stack deletion succeeded.

The packet also parses the synthesized policy and runtime configuration rather
than trusting source comments. It permits only DynamoDB `GetItem`/`UpdateItem`
on the `control_circuit` leading key plus log-stream writes; wildcard resources,
`ecs:RunTask`, `iam:PassRole`, DynamoDB create/delete and secret-valued Lambda
environment variables are rejected. It verifies 128 MiB, five-second timeout,
reserved concurrency one, one asynchronous retry/60-second event age and an
EventBridge target with the same retry/age bounds. The rule must contain six
exact alarm names and `ALARM` only.

The complete local assembly still contains the previously designed foundation,
compute and IAM-protected API stacks because the target stacks reference their
resources. They are dependencies for synthesis, not approval to redeploy them.

## Corrected state-transition drill

An already-OPEN circuit proves idempotence but cannot prove the automatic
CLOSED-to-OPEN transition. The future live drill now requires:

1. internal execution false and exact running/pending task, service and occupied
   slot counts all zero;
2. a separately approved exact-version temporary manual CLOSE;
3. one log stream and one batch containing exactly two sanitized
   `TASK_LAUNCH_FAILED` events;
4. automatic OPEN verification within two alarm periods; otherwise a current-
   version manual OPEN and immediate abort;
5. no repeat signal and teardown within two hours.

A deterministic local regression additionally proved that the fixed
`TASK_LAUNCH_FAILED`, `PROVIDER_ERROR` and `MODEL_ERROR` structured events map
to their exact allowlisted alarms and that each alarm path can restore OPEN.
No dynamic identifier becomes a metric dimension.

## Cost review

The [AWS CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/)
reviewed on 2026-10-01 lists Free Tier allowances of 10 custom metrics, three
custom dashboards of up to 50 metrics and 10 standard-resolution alarm metrics.
It states that classic custom metrics, dashboards and alarms are prorated by
the hour when chargeable, while rates vary by Region. Free Tier eligibility and
current account consumption are intentionally treated as unknown.

AWS's public US examples use USD 0.30/custom-metric-month and USD
0.10/standard-alarm-metric-month. Using USD 3/dashboard-month as a planning
reference gives USD 4.50/month for this inventory; two hours in October is about
USD 0.013 before very small logs, Lambda, EventBridge and DynamoDB effects. This
is not a Tokyo quote. The future live packet must verify current Tokyo/account
facts and uses USD 0.05 only as a planning ceiling, not a guaranteed billing cap.
[Lambda](https://aws.amazon.com/lambda/pricing/) is request/duration priced and
[EventBridge](https://aws.amazon.com/eventbridge/pricing/) is event-volume
priced; the bounded one-event path is expected to be negligible but still must
be included in the account-specific review.

## Verification

The focused local run passed the credential-free assembly, deletion-policy
inspection, three failure-signal drill paths and metric-catalog tests. The full
project gate passed 321 tests after the local implementation work.

## Remaining approval boundary

The following remain cost/security actions and were not performed:

- fresh AWS identity, Budget, retained-resource and current Tokyo price review;
- exact account-specific CloudFormation diff and IAM review;
- deployment of the two target stacks;
- temporary CLOSE, synthetic log batch and optional signed denial proof;
- exact teardown, logout and delayed-billing verification.

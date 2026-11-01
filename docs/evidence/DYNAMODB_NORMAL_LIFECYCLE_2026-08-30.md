# DynamoDB normal lifecycle acceptance — 2026-08-30

## Scope and approval boundary

The approved live check was limited to one internal-development `QLD` `PRICE`
job in Korean and exactly one Fargate task. Bedrock was outside the scope. The
task count was not retried, the worker was bounded by the existing 90-second job
deadline, and the total approval ceiling was USD `0.001` including small
request, logging, and storage effects.

The provider credential remained a Standard Parameter Store `SecureString`.
Only parameter metadata was inspected; the value was never decrypted, printed,
or written to this repository.

## Preflight

- Both project CloudFormation stacks were `UPDATE_COMPLETE`.
- The ECS cluster had zero running tasks and zero ECS Services.
- Task definition revision 3 was `ACTIVE`, with 0.25 vCPU, 512 MiB memory,
  non-root user `65532:65532`, and a read-only root filesystem.
- The monthly Budget limit was USD `5.0`; the pre-run displayed actual and
  forecast were USD `0.0` and USD `0.002` respectively.

## Execution and authoritative result

The controller-shaped record `gmai-price-20260830065209` was written once with
`attribute_not_exists(jobId)`, status `QUEUED`, version `1`, attempt count `0`,
and a 90-second deadline. One `RunTask` request returned one task and no
failures. No replacement task was started.

The authoritative final DynamoDB record was:

| Field | Result |
|---|---|
| Operation / symbol / locale | `PRICE` / `QLD` / `ko` |
| Status | `SUCCEEDED` |
| Version | `3` |
| Attempt count | `1` |
| Result kind / symbol | `PRICE` / `QLD` |
| Currency | `USD` |
| Market state / freshness | `CLOSED` / `LATEST_AVAILABLE` |
| Source | `twelve-data` |

Version `3` and attempt count `1` prove that the conditional record advanced
from `QUEUED` version 1, through `RUNNING` version 2, to `SUCCEEDED` version 3.
The numeric quote and change fields are deliberately omitted because the Basic
provider plan is restricted to internal non-display use.

The sanitized CloudWatch log contained only `STARTING` and `SUCCEEDED`; worker
duration was 893 ms. The Fargate task stopped normally with container exit code
`0`. Market timestamp, retrieval timestamp, market state, freshness, source,
and currency metadata were present and structurally valid.

## Cost and provider-credit boundary

At the reviewed Tokyo Linux/x86 rates, this task size has a one-minute minimum
compute estimate of approximately USD `0.00025675`. This is below the approved
USD `0.001` ceiling before delayed billing confirmation. DynamoDB on-demand
reads/writes and short CloudWatch logs add small usage effects.

Twelve Data documents `/quote` as one API credit per symbol. Runtime request
count is not instrumented, so this evidence does not assert the exact consumed
credit count. The normal successful path completed in 893 ms; the configured
retry ceiling remained three attempts for eligible transient failures.

## Acceptance decision

The normal real-cloud lifecycle gate passes. It demonstrates one successful
secret injection, provider-backed `PRICE` operation, conditional DynamoDB
lifecycle, sanitized logging, and clean one-shot container exit without a
Bedrock call or a persistent compute service.

# Phase 7 IAM-protected API deployment — 2026-09-05

Follow-up correction (2026-09-06): the prior transaction IAM action mapping was incorrect. Disabled-job smoke did not exercise that permission. The source fix and persistent admission guards are locally tested but not deployed; see [guard review](PHASE7_GUARD_REVIEW_2026-09-06.md). Historical deployment results below remain observations of the original disabled configuration, not live-admission acceptance.

## Approved scope

- Update the existing Compute stack with the controller Lambda and its seven-day log group.
- Deploy one API stack with four AWS-IAM-authorized routes, a default throttle, and a seven-day access log.
- Keep provider-backed job creation and live-result display disabled.
- Invoke only local-data controller paths; launch zero Fargate tasks and call neither Twelve Data nor Bedrock.

No account ID, role ARN, API endpoint, request ID, provider value, or credential is recorded here.

## Deployment result

The first Compute update attempted to reserve two Lambda concurrent executions. AWS rejected the function before creation because the account concurrency quota is 10 and the service requires 10 executions to remain unreserved. CloudFormation reached `UPDATE_ROLLBACK_COMPLETE` and removed the attempted Lambda and log group. No worker or external service ran.

The project did not request a quota increase. It removed function-level reserved concurrency and retained the stronger applicable controls: IAM route authorization, stage throttle, atomic new-job admission, SDK single-attempt behavior, deterministic ECS idempotency, and provider-job disablement. Infrastructure type checking, all six CDK assertions, and three-stack synthesis passed before retry.

The second deployment completed:

- Compute stack: `UPDATE_COMPLETE`
- API stack: `CREATE_COMPLETE`
- Foundation stack: no change
- API routes: exactly 4; all four report `AWS_IAM`

## Bounded acceptance

Three direct Lambda invocations were used so no browser credential or signing implementation was introduced:

1. Health returned `200`, `CLOSED`, and `jobCreationEnabled=false`.
2. Assets returned `200`, exactly `VOO, QLD, TSLA, SPCX, GOOG`, and `cache-control: no-store`.
3. A valid QLD/PRICE/Korean job request returned `503 DATA_UNAVAILABLE` before DynamoDB creation or ECS launch.

After acceptance, running ECS task count was `0`. Provider requests, Bedrock invocations, and Fargate launches were all `0` for this phase.

The closing Budget read showed a USD `5.0` limit, actual USD `0.0`, and forecast USD `0.026`. These figures can lag and do not prove a hard spending cap.

## Remaining Phase 7 gate

The deployed API is a signed developer surface, not an anonymous website API. The prepared browser client intentionally has no AWS credentials and is not connected. The plan's real `202 → terminal` API acceptance remains intentionally unmet while provider-backed jobs and live-result display are disabled. Enabling them requires current data-display rights, an active-work/circuit guard, a fresh IAM/cost review, and a separately bounded approval.

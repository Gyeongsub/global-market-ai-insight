# Phase 7 signed API acceptance — 2026-09-07

## Approved bound

- Existing Tokyo ComputeStack only; no new stack and no image push
- One `QLD / PRICE / ko` job and at most one Fargate task
- Existing worker image, `0.25 vCPU / 0.5 GB`, 90-second job deadline
- At most three retryable Twelve Data requests; zero Bedrock calls
- One health request, one non-retried POST, and at most sixteen status reads
- Provider result display remained disabled
- Conservative approved incremental AWS ceiling: USD 0.02 before tax/credits

## Preflight and reviewed diff

The expected temporary IAM user and Tokyo region were verified. The USD 5 Budget reported actual USD 0.00 and forecast USD 0.024. Running ECS tasks and ECS services were both zero. The persistent circuit was verified as `OPEN/version 1`.

The no-change-set CDK diff changed only the existing controller Lambda asset and environment: it added `API_AUTH_MODE=AWS_IAM` and temporarily changed `ENABLE_PROVIDER_BACKED_JOBS` from false to true. It reused the deployed immutable worker digest and created no ECR image, stack, service, ALB or NAT Gateway.

## Execution evidence

1. The ComputeStack reached `UPDATE_COMPLETE` with internal job execution enabled and live-result display false.
2. A conditional operator write changed the circuit from `OPEN/version 1` to `CLOSED/version 2`.
3. The SigV4 client submitted exactly one `QLD / PRICE / ko` job without POST retry.
4. Polling reached `SUCCEEDED` after six total API requests, below the maximum of eighteen.
5. The stored job reached `SUCCEEDED/version 3` with `attemptCount=1` and a stored result. The API did not return that result.
6. The exact ECS task was observed `STOPPED` with desired status `STOPPED` and container exit code `0`.
7. The circuit was conditionally restored to `OPEN/version 3`.
8. The conservative reconciler released one matching STOPPED slot; the other slot was empty. Final occupied slots were zero.
9. The ComputeStack was deployed again with internal job execution false and reached `UPDATE_COMPLETE`.

This proves real AWS authorization for the four-operation admission transaction, including the previously uncertain `ConditionCheckItem`, and proves the signed API Gateway `202 → terminal` PRICE path. It does not grant or prove public market-data display rights, browser authentication, live ANALYZE/Bedrock behavior, or deployed automatic sweeping.

## Closing safety state

- Circuit: verified `OPEN/version 3`
- Internal provider jobs: false
- Live-result display: false
- API auth mode: AWS IAM
- Running Fargate tasks: zero
- ECS services: zero
- Occupied capacity slots: zero
- Job task: STOPPED, exit code zero
- Budget: USD 5; delayed actual USD 0.00; forecast USD 0.024

No always-on compute was added. Existing storage and usage-based AWS resources remain subject to their normal small charges; Budget data is delayed and is not a hard spending cap.

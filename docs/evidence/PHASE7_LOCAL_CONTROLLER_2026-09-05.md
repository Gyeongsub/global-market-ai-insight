# Phase 7 local controller evidence — 2026-09-05

## Scope

This record covers local source, contract, bundle, test, and CDK synthesis work only. It contains no account ID, role ARN, endpoint URL, provider response, credential, or raw model output.

## Implemented controls

- Four exact HTTP API routes and a route-aware Lambda handler
- Strict body, symbol, locale, idempotency UUID, job ID, JSON media type, and 4 KiB request validation
- Deterministic hashed job ID; raw idempotency key is never persisted
- Atomic DynamoDB job creation and two-new-jobs-per-minute development admission record
- Idempotent replay without a second ECS launch; conflicting replay returns `409`
- Exactly one Fargate task request with fixed network/task settings, deterministic ECS client token, and `JOB_ID`-only override
- Conditional launch-failure compensation and sanitized public errors
- Public projection omits internal hashes and task ARN
- Fail-closed provider-job and live-result flags
- HTTPS-only browser client outside localhost, credentials omitted, no-store/no-referrer, 64 KiB response cap, bounded polling
- Lambda 128 MiB/15 seconds/no VPC; API throttle 1 request/second burst 2; seven-day logs
- AWS IAM SigV4 authorization on all four API routes; no browser AWS credentials

## Local evidence

- TypeScript service, infrastructure, and frontend type checks passed.
- Service/contract/frontend API tests passed, including invalid input, open circuit, exposure disabled, replay, rate limit, launch failure, internal-field rejection, and credential omission.
- Controller single-file bundle built and its no-network health smoke made zero AWS calls and launched zero tasks.
- CDK assertions found one HTTP API, four routes, one stage, no WAF, no NAT Gateway, no ALB, no ECS Service, and no ingress rule.
- An opt-in three-stack CDK assembly synthesized from a dummy image digest only; no deployment command was run.
- High-confidence secret scan found no credential pattern in the scanned source set.

## Unmet cloud exit criteria

No API endpoint was deployed and no API-to-Fargate job was run. The public UI remains fixture-backed. Provider-backed job creation and live-result display remain disabled because the current data entitlement is internal non-display. A real `202 → terminal` demonstration requires a separate Security/Cost decision, current identity/region/Budget verification, reviewed CDK diff, and a precisely bounded test.

## First deployment attempt

The first Compute update was rejected before Lambda creation because the account concurrency quota is 10 and AWS requires 10 unreserved executions. CloudFormation completed its automatic rollback and removed the attempted Lambda/log group. The implementation was changed to omit reserved concurrency; IAM authorization, API throttle, atomic job admission, and the fail-closed job flag remain in force. No Fargate, provider, or Bedrock call occurred during the failed deployment.

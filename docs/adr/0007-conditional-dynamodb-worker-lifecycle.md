# ADR 0007: Conditional DynamoDB authority for the one-shot worker

- Status: Accepted
- Date: 2026-08-23

## Context

A short-lived task can be started more than once, can race with the stale-job sweeper, or can finish after another actor has made the job terminal. A plain read followed by an unconditional write could therefore duplicate provider/Bedrock spend or overwrite a valid terminal result.

## Decision

- Store development jobs in one on-demand DynamoDB table keyed by `jobId`, with TTL on `expiresAt` and AWS-managed encryption.
- Load a worker job with `ConsistentRead: true`.
- Claim only `QUEUED` records and condition every update on both the expected `status` and `version`.
- Increment `attemptCount` only when the claim becomes `RUNNING`.
- Permit the worker lifecycle to write `RUNNING`, `SUCCEEDED`, `FAILED`, or a pre-execution `TIMED_OUT` result; domain transition rules continue to reject terminal overwrites.
- Store the bounded structured result as `resultJson` in DynamoDB and decode it at the repository boundary. The domain/API representation remains an object.
- Configure the DynamoDB SDK with `maxAttempts: 1` and a three-second operation timeout. An ambiguous response is reconciled by reloading status/version rather than silently repeating a write.
- Grant the ECS worker task role only `dynamodb:GetItem` and `dynamodb:UpdateItem` on the exact jobs table.

## Consequences

- A duplicate task that observes anything other than `QUEUED` performs no market-provider or Bedrock call.
- A completion that races with a timeout fails with a stable state-conflict error and does not overwrite the terminal job.
- The controller still needs a separate idempotent create/access pattern and narrow `PutItem`/task-launch permissions in Phase 7.
- TTL removes old development records eventually; it is not used for correctness or deadline enforcement.
- Injected DynamoDB senders and local CDK assertions remain the broad regression
  evidence. A bounded real worker acceptance on 2026-08-30 additionally proved a
  normal one-shot lifecycle could claim and finish its exact job, while later
  signed ANALYZE runs proved stored terminal results without overwriting them.
  These dated cases do not replace a full race/failure matrix in AWS. See
  [worker evidence](../evidence/CLOUD_WORKER_ACCEPTANCE_2026-08-30.md) and
  [analysis evidence](../evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md).

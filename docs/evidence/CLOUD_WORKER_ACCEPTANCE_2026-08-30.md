# Cloud worker acceptance evidence — 2026-08-30

## Scope and safety boundary

- Region: `ap-northeast-1`.
- User approval covered one immutable ECR push, one ComputeStack update, one
  already-expired DynamoDB job, and exactly one Fargate task.
- The task used 0.25 vCPU / 512 MiB, non-root user `65532:65532`, and a
  read-only root filesystem.
- No ECS Service, ALB, NAT Gateway, public listener, retry, or second task was
  added.
- The provider secret value was never decrypted, printed, or passed on the
  command line.

## Local correction and validation

The worker's `TIMED_OUT` DynamoDB transition declared an expression-name
placeholder that was not present in its update expression. DynamoDB correctly
rejected that request with `ValidationException`. Expression names and values
are now branch-specific, and tests verify that `RUNNING`, `SUCCEEDED`, and
`FAILED`/`TIMED_OUT` updates contain no unused placeholders.

- Full service/contract, infrastructure, frontend, bundle, lint, license, and
  secret gates passed before cloud mutation.
- Local image: `gmai-worker:acceptance-ad501778e2e2`.
- Local constrained smoke: `SUCCEEDED` with network disabled, a read-only root,
  all capabilities dropped, no-new-privileges, and bounded CPU/memory/PIDs.
- Local Trivy HIGH/CRITICAL result: `0` findings.
- Docker Desktop startup was recovered without factory reset or diagnostic
  upload by preserving and replacing stale Unix-socket runtime directories.
  Existing images and settings remained available.

## Immutable image and deployment

- ECR tag: `worker-20260830-ad501778e2e2`.
- OCI index digest:
  `sha256:48f8cbe69e35bbd6f55d0f847dc206077f6ee197d2ded2500ed9e6089e0c9c80`.
- Linux/amd64 runtime manifest digest:
  `sha256:65b21ccce4ec334add1d11a7695cd8a1ea7593159abc84765634ce923e163b8e`.
- ECR Basic scan: `COMPLETE`; finding severity counts were empty.
- CDK diff: Foundation had no difference; Compute replaced only the task
  definition image digest.
- ComputeStack: `UPDATE_COMPLETE`; task definition revision `3`.

## Bounded cloud acceptance

Job `gmai-accept-20260830051625` was inserted as `QUEUED` with a deadline well
before task startup. Exactly one revision-3 task was launched. The authoritative
DynamoDB result was:

- status: `TIMED_OUT`;
- version: `2`;
- attempt count: `0`;
- error code: `JOB_DEADLINE_EXCEEDED`; and
- message: `Job deadline expired before worker execution began.`

The task stopped with exit code `1` after the worker intentionally persisted the
terminal timeout and raised the bounded lifecycle error. Its log stream contains
only the sanitized `STARTING` event and the sanitized deadline error. Attempt
count `0` proves the job was never claimed as `RUNNING`, so the provider and
Bedrock operation path was not entered.

After the run, both stacks were `UPDATE_COMPLETE`, the ECS cluster had zero
running tasks and zero services, and the Compute stack contained no NAT Gateway
or load balancer. The USD 5 Budget was `HEALTHY` with actual USD `0.0` and
forecast USD `0.002` at the observation time. These billing values can be
delayed and are evidence of the dated observation, not a real-time spending cap.

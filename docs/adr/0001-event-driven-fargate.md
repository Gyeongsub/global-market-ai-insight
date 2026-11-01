# ADR 0001: On-demand Fargate worker

- Status: Accepted
- Date: 2026-08-08

## Decision

The main architecture creates an asynchronous DynamoDB job and starts one short-lived Fargate task with `ecs:RunTask`. It does not use an ECS Service or ALB.

## Why

This makes container packaging, task roles, networking, observability and idempotency visible while avoiding a permanently billed service for low portfolio traffic.

## Consequences

- Users see honest queued/running progress and cold-start latency.
- The controller must compensate for launch failure and enforce idempotency.
- A sweeper handles abandoned jobs/tasks.
- Phase 13 may compare a temporary ECS Service, but it is a separate stack and is removed immediately after evidence capture.

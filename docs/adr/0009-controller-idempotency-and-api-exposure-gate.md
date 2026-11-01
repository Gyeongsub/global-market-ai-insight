# ADR 0009: Controller idempotency and API exposure gate

Status: Accepted locally on 2026-09-05

## Context

The first release needs an asynchronous public contract, but each accepted request can start a billable Fargate task and consume provider/model capacity. The current market-data entitlement is internal non-display. CORS alone cannot prevent direct requests from non-browser clients, and AWS Budgets are delayed notifications rather than hard caps.

## Decision

- Derive a non-secret public job ID from 192 bits of the validated idempotency-key hash.
- Atomically create the job and increment a short-lived per-minute admission record in one DynamoDB transaction.
- Return an equivalent stored job on replay and reject a conflicting replay before ECS.
- Call ECS with `count=1`, a deterministic `clientToken`, fixed cluster/task/network settings, and a `JOB_ID`-only override.
- Keep provider-backed creation and live-result display behind separate fail-closed runtime flags.
- Require AWS IAM SigV4 authorization on all initial API routes and keep AWS credentials out of the browser.
- Omit `ApiStack` from the normal CDK assembly; require an explicit environment opt-in to synthesize it.
- Keep the prepared browser client disconnected from the fixture UI until both public-display rights and API deployment are approved.

## Consequences

Equivalent retries do not create another job or task, SDK retries are pinned to one, and ambiguous ECS retries can use the same service-side token. The design avoids a table scan and a new secondary index. The initial endpoint is suitable for signed developer acceptance calls but cannot be called by the unsigned browser client. The rate counter remains defense in depth rather than a monthly spending cap. Before an anonymous or end-user API is introduced, the project still needs a separate auth/abuse decision, reviewed active-work guard/circuit implementation, current provider rights, a CDK diff, and a separately approved bounded cloud test.

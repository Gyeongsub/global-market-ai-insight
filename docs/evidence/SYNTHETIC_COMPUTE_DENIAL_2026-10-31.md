# Synthetic model-role compute denial — 2026-10-31

## Outcome and limits

One temporary target role/stack and one restricted STS assumption were used for
one explicit EC2 RunTask request. The error-only transport accepted exact
`ecs:RunTask` explicit policy denial. There were no retries, model/provider
requests, Fargate selection, instance creation or public deployment.

The role session's credentials and transport were closed. Nonce-scoped task
reconciliation returned an empty list; no StopTask was needed. Parent automatic
cleanup removed the exact stack and role with an acknowledged delete. This
verifies this denied request, not every principal/action or a universal cost cap.

The request required a fresh empty-capacity snapshot and explicit EC2 launch
type. Those checks alone are not an atomic guarantee against concurrent capacity
changes. Invalid application overrides do not prevent ECS-agent secret injection.
These residuals and uncertain-outcome handling remain in the
[candidate runbook](../runbooks/synthetic-compute-denial-candidate.md).

## Source proofs

- Current gate: `74ceec80-0491-48a8-87a0-693842f51163`, completed
  `2026-10-31T01:09:46.060Z`.
- Frozen clone: `1295a55f-57bb-48a0-8cef-9660591aaad7`, completed
  `2026-10-31T01:12:37.756Z`.
- Matching 819 files / 7,360,473 bytes, SHA-256
  `2c073ba9fdef46f801a4dd5775276ed2b3f1efef04e83d4cfb82dee7ee94d1b5`.
- Both passed 90 steps, 1,864 tests and one skip. Clone installed 392 locked
  registry identities with lifecycle scripts disabled; no GitHub contact/upload.
  Each local HTTP proof closed its servers after 33 loopback requests. Temporary
  clone/install trees were removed.

## Closure evidence

The private ignored journal is
`outputs/local-gates/synthetic-role-rehearsal-160a813467c841dc9fe9c3ad98cc65cb.json`.
Do not publish it: it contains internal identifiers and the exact owned scope.

- Parent lifecycle: 17 normal / 10 cleanup calls, no primary or cleanup error.
- Exercise: four fresh scope reads, one restricted RunTask request and one
  nonce-task reconciliation read. `denialContradicted=false`, no unexpected task.
- Independent four-read check at `2026-10-31T01:16:54.918Z`: exact stack
  DELETE_COMPLETE, role absent, sole IAM resource DELETE_COMPLETE, nonce tasks
  absent.
- Subsequent 11-read posture check: foundation/compute UPDATE_COMPLETE, API
  CREATE_COMPLETE; operations/alarm-circuit/maintenance absent; running/pending
  tasks, services and occupied slots zero; execution/display disabled; OPEN v11.

## Security and cost

No secret value or raw AWS error was printed. One exact temporary model-only
role was removed; no durable role, broad policy or browser credential was added.
Clearing local keys and deleting a role are not claims of secure JS memory
erasure or instantaneous revocation of all previously copied credentials.

No inference or compute execution charge was intentionally initiated by this
denied cycle. Existing ECR/S3/DynamoDB/log storage can still incur costs. The
monthly USD 5 budget showed actual USD 0 / forecast USD 0.002, which is delayed
billing information, not proof of a zero final bill or an immediate spending cap.

CLI and console remain authenticated for the user-requested continuation; this
is not a final session-shutdown claim. Restricted browser runner cutover and
its live UI acceptance remain the next separate gate. No GitHub upload occurred.

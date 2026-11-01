# Compute-denial candidate — bounded, default-inert live entry

Date: 2026-10-31. This is local preparation for the remaining least-privilege
gate. **Follow-up: one bounded live request was explicitly denied and cleaned;
[dated evidence](../evidence/SYNTHETIC_COMPUTE_DENIAL_2026-10-31.md).** The source/target
alternate-principal cycle is already closed with
[independent cleanup evidence](../evidence/SYNTHETIC_ALTERNATE_PRINCIPAL_2026-10-31.md).

## Read-only feasibility observation

At 2026-10-31T00:41:03.613Z, four owner-authenticated read-only calls checked the
existing controller task-definition reference, exact active task definition,
cluster and registered instances. The definition reported EC2 and Fargate
compatibility and awsvpc networking. Registered/listed active container instances,
capacity providers and the default capacity strategy were zero. One container
secret binding exists; its value was not read or printed. This observation is
not reusable execution authority or a lock on future cluster state.

The [RunTask API](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_RunTask.html)
states that explicit EC2 uses registered cluster instances and that capacity
provider strategy is separate from explicit launch type. The candidate therefore
selects **EC2, never Fargate or a default capacity strategy**, and requires fresh
empty-capacity evidence. It does not create EC2 instances. This reduces the risk
of unexpected work but cannot exclude another operator registering capacity after
the read. NoContainerInstances/validation failure is not an IAM denial pass.

## Local implementation

- [Request proposal](../../services/local-owner/src/synthetic-compute-denial.ts)
  checks exact owner/controller/cluster/revision, disabled execution/display,
  active EC2-compatible 256 CPU / 512 MiB hardened pinned worker, two configured
  subnets and one security group. Complete empty inventory, no providers,
  no services/tasks and a snapshot younger than 30 seconds are required.
- Proposed request is exactly one EC2 task attempt with a nonce-bound client
  token/startedBy, no public IP and execute-command disabled. There is no assumed
  count-zero dry run. Runtime overrides deliberately make JOB_ID invalid and
  APP_ENV unsupported, so the current worker refuses application startup before
  provider/model/repository construction if unexpected placement occurs.
  **These overrides do not prevent ECS-agent secret injection or replace task
  cleanup.** Existing production task definitions must not be called casually.
- [Bounded transport candidate](../../services/local-owner/src/synthetic-compute-denial-transport.ts)
  fixes Tokyo ECS/SigV4, verified TLS 1.2+, explicit restricted credentials, one
  attempt, no retry and a 20-second elapsed deadline. Only bounded error envelopes
  are consumed; 200 responses are destroyed before successful data is read by the
  native reader. Malformed responses, capacity errors, wrong-action/PassRole
  errors and generic denials do not pass. Exact ecs:RunTask plus explicit session
  or identity policy denial is required. Failed transport close is not verified.
- [Exact-task reconciliation](../../scripts/synthetic-compute-denial-reconcile.ts)
  uses the recorded nonce and cluster, verifies task revision/launch type/overrides
  before any stop, stops at most one owned task, and observes STOPPED plus an empty
  active list. Lost stop acknowledgements are not retried. Unknown request outcomes
  followed by three empty reads remain **unresolved**, not proof of no commit.
- [Lifecycle composition](../../scripts/synthetic-compute-denial-exercise.ts)
  acquires one restricted session, collects four fresh scope reads, admits one
  request, closes credentials/transport, and reconciles even after cancellation.
  Journaling failure blocks admission; cleanup is not disabled by cancellation.
  Parent cleanup removes the temporary IAM stack even when the exercise fails.
- A distinct `--plan-compute-denial` is inert. The separate
  `--execute-temporary-role-compute-denial` entry requires fresh matching source
  gates, owner identity and disabled/idle/OPEN posture. Its administrator adapter
  has no RunTask permission path: only four scope reads and up to 15 exact-task
  reconciliation calls. The request is signed only by the restricted lease.
- 47 focused proposal, transport, parser, reconciliation, composition and entry
  tests passed locally; strict operator type checking also passed. These tests
  inject a zero-network wire and are not AWS authorization evidence. The pinned
  AWS CLI accepted the list-tasks argument shape in offline skeleton mode.

## Required before live acceptance

1. Require new current/frozen-clone source gates, current cloud posture and the
   precise bounded scope. Actual RunTask denial remains unverified; this document
   does not launch a task or waive the remaining approval/security boundaries.
2. Independently confirm no running/pending tasks, no occupied slots, disabled
   execution/display, OPEN circuit and absent temporary role/stack afterward.

Known residuals: IAM denies do not count dollars; browser/process close cannot
cancel work already accepted; ECS read consistency and concurrent configuration
changes require reconciliation rather than an absolute no-side-effect claim.
No model call, provider signup, permanent service, public endpoint or GitHub
publication is part of this candidate.

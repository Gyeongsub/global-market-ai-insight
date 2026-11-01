# Controller condition correction — 2026-10-10 evening

The human specifically approved deleting only the unsupported controller
`dynamodb:EnclosingOperation` condition on `ConditionCheckItem`. This is not
authorization for new grants, jobs, public display, Maintenance, hosting or
GitHub publication. The earlier app-review rejection was not bypassed; this
invocation followed the new specific approval.

## Actual mutation and incomplete original reconciliation

The bounded exclusive rollout executed one newly reviewed change set once.
It returned `CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED`, exit 1. The original
automatic full before/after reconciliation is **not passed**. Its precise
failure cause was not retained and is not established. No mutation retry or
second deployment was attempted; strict comparison guards were not weakened.

Independent four-read inspection found the exact current Compute stack healthy,
`UPDATE_COMPLETE`, rollback enabled, updated at 2026-10-10 20:29:45.225 JST.
Its owned history was created at 20:28:22.639 JST and is `CREATE_COMPLETE` /
`EXECUTE_COMPLETE`. It contains one non-replacing IAM Policy Modify, no resource
addition/deletion. The only unsupported condition is absent; exact table,
`control_circuit` LeadingKeys and the non-null guard are retained. There are
still 26 Compute resources. Executed terminal history is not a pending draft
and was not deleted as one.

## Independent current-state/history binding

`controller-policy-completion-proof.ts --execute-read-only` completed 43 reads
at **2026-10-10T11:44:16.793Z**, with zero writes or execution attempts:

- Entire current Original template matches the independently reviewed candidate
  SHA-256 `711935517aa3c0e505f21666b78b2008eb05be4b9a3d5f73fddda0ad8cf4e955`.
- Actual resolved attached inline policy matches SHA-256
  `bb8af0027f5eb081ea9095821a9893f7e512fa643a4bb9d2ae2df40c7339c0d5`.
- The current stack's terminal change-set identity, creation/update time,
  prepared whole template and resolved before/after policy contexts agree.
  Exactly the one condition changes; role attachment/context remains unchanged.
- Two complete twenty-read current snapshots match, including owned role/trust,
  runtime, circuit, inventories and flags. This is an **after/after stability
  check**, not a fabricated pre-mutation stack-settings snapshot.
- Original rollout reported success: false. Original full before/after stack
  settings comparison verified: false. Original reconciliation still incomplete:
  true. Actual workload authorization, live-job readiness and publication: false.

Six focused tests include synthetic structural history acceptance, fixed
production-hash refusal of that synthetic fixture, and stale/foreign/extra/
dynamic/widened policy rejection. Fixed production hashes/targets cannot be
overridden by command-line flags.

## Actual attached-role matrix and safe state

A separate 67-read, 17-case actual attached-role simulation passed all expected
decisions: six allows and eleven denies. The controller can condition-check
only the circuit key, not a job key; unapproved tasks/clusters/roles/services,
worker/execution role task launches, controller secret/model access and worker
circuit reset remain denied. There were no role assumptions, secret reads,
actual workload calls or IAM writes in that proof. Simulation is not a live
DynamoDB transaction/Fargate execution or release authorization.

The independent emergency eleven-read gate and both current-state snapshots
verified jobs/display false, persisted circuit **OPEN/version 11**, running and
pending tasks/services/slots all zero, absent Operations/AlarmCircuit/Maintenance
stacks and the digest-pinned nonroot/read-only worker. Budget USD 5: actual USD 0,
forecast USD 0.008 at the read. Storage/read/delayed fees remain possible.

The failed rollout's exact actual request count was not emitted; its reviewed
upper bound is 145 main plus 50 reconciliation calls. Do not invent a successful
rollout packet or precise call count. Closing reads, logout and local cleanup
receive their own later safe-stop evidence.

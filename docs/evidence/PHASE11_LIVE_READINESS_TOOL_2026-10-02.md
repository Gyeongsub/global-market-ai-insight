# Phase 11 sanitized live-readiness tool — 2026-10-02

## Purpose and boundary

`pnpm operations:phase11-readiness` prepares the next live-drill decision
without treating a valid login as deployment approval. Its default mode makes
zero AWS calls and reports the maximum read-only call count.

The explicit `--execute-read-only` mode requires the temporary `gmai-admin`
profile. It issues at most 11 reads across STS, Budgets, CloudFormation,
Lambda, ECS and DynamoDB. It has no create, update, delete, invoke, task-run,
circuit-write, log-write, provider or Bedrock path.

The AWS CLI executable may be supplied through `GMAI_AWS_CLI_PATH` for a local
installation not present on `PATH`. That value is local operator configuration
and must not be committed.

## Sanitized decision facts

The output contains only:

- whether the account shape and expected IAM principal match;
- the count of monthly USD 5 cost Budgets and their delayed actual/forecast
  USD values;
- status labels for the exact foundation, compute, API, operations and alarm-
  circuit stacks;
- booleans for internal execution, live result display, digest pinning, task-
  definition consistency and non-root/read-only worker hardening;
- running task, pending task, ECS Service and occupied slot counts;
- whether the persistent circuit is a verified `OPEN` record and its version.

It does not print account IDs, user IDs, ARNs, API endpoints, table contents,
job owners, image repository names or image digests. Raw CLI errors and
responses are suppressed.

## Fail-closed rule

The later [deployment-safety follow-up](PHASE11_LOCAL_DEPLOYMENT_SAFETY_2026-10-02.md)
strengthens completeness, explicit-disabled flags, spend bounds, exact
account/Region scope and the single-page/retry bound. Missing information is
unknown, not zero or disabled. The earlier live pass below predates these
stronger rules and must be repeated before another live attempt.

`readyForAccountSpecificDiff` can be true only when all of the following hold:

1. the expected temporary principal and account shape validate;
2. exactly one matching USD 5 monthly cost Budget exists, with complete
   nonnegative actual/forecast USD figures below its limit;
3. foundation, compute and API stacks are healthy;
4. both Phase 11 target stacks are still absent;
5. provider-backed jobs and live result display are explicitly the string false;
6. complete non-paginated running/pending task and service lists and exactly two
   valid slot responses prove all counts zero;
7. the referenced task definition matches a single digest-pinned,
   non-root/read-only worker container;
8. the persisted circuit is verified `OPEN` with a positive version.

Even then `readyForDeployment` is always false. Current Tokyo pricing, the
exact CloudFormation/IAM diff, two-stack deployment, temporary exact-version
`CLOSED`, one synthetic log batch and verified teardown remain separate
security/cost approvals.

## Local verification

Two no-network tests prove that a healthy synthetic snapshot emits only
bounded facts and that ambiguous spending/capacity state fails closed without
leaking the synthetic account, ARN, image address or job owner. The dry run
reported zero AWS calls and zero cloud mutations.

After the temporary login was refreshed, the sanitized live read passed. It
found one USD 5 monthly cost Budget, healthy foundation/compute/API stacks,
both Phase 11 targets absent, internal execution and result display disabled,
zero running/pending tasks, ECS Services and occupied slots, the expected
digest-pinned non-root/read-only worker, and a verified `OPEN` circuit at
version 9. The delayed Budget view reported USD 0 actual and USD 0.001 forecast
at that time. The account-specific template-only diff then completed without a
CloudFormation change set or cloud mutation.

The subsequent two-stack deployment command did not complete. The Operations
stack reached `ROLLBACK_COMPLETE` before retaining any stack resource; the
alarm-circuit stack was never created. A read showed zero stack resources, the
empty failed stack record was deleted, and the full sanitized readiness check
was repeated. The closing state again showed both target stacks absent, the
circuit verified `OPEN` at version 9, execution/display disabled and every
task/service/slot count zero. No synthetic log event, circuit close, provider,
Bedrock or Fargate call occurred. The next session must improve stack-level
failure classification and perform a fresh diff before any reattempt.

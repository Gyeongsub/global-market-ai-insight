# Phase 7 guard review and deploy — 2026-09-06

> Historical checkpoint: the live-admission uncertainties and approval gates recorded below were resolved by the separately approved 2026-09-07 acceptance. See [Phase 7 signed API acceptance](PHASE7_SIGNED_API_ACCEPTANCE_2026-09-07.md). The statements below remain the evidence available at the end of 2026-09-06.

## Scope and outcome

The implementation was first reviewed locally, then the user separately approved a bounded Compute update. Existing cloud storage costs are not thereby eliminated; this record is not a complete billing/resource inventory.

- Added persistent, versioned fail-closed circuit read/change adapters and a dry-run-first operator command.
- Added atomic fixed-capacity admission and a STOPPED-evidence slot-reconciliation library.
- Corrected the controller transaction IAM action mapping and separated worker/job access from control keys.
- Added in-flight request cancellation to the browser polling deadline.

## Verification

- `pnpm check`: passed, including 88 service/contract/API-client tests, six infrastructure assertions, controller/worker builds and local smoke, frontend typing/lint/build and four rendered-output checks.
- Standalone circuit operator TypeScript check: passed. OPEN initialization plan: dry-run, zero AWS calls. These checks are also included in the common check runner.
- Local opt-in synthesis produced Foundation, Compute and API templates in an ignored review directory. This does not deploy or establish live IAM effectiveness.
- Mocked atomic store: 20 concurrent distinct requests admitted only two jobs; ten equivalent requests produced one job. Minute changes did not release occupied slots. Circuit races, lost write acknowledgements, unknown failures and conflicting ownership were covered.
- Reconciliation tests retained slots without exact terminal-job/STOPPED-task evidence, including reused job IDs and CAS conflicts. These mocks do not replace a real DynamoDB/ECS test.

## Correction to previous evidence

The 2026-09-05 API smoke used direct Lambda invocations with job creation disabled; it did not exercise the admission transaction or signed API Gateway HTTP traffic. The previous transaction IAM action was incorrect and is now corrected in the deployed Compute policy. Do not describe the controller as validated for live job admission yet.

## Bounded cloud update

- Temporary `gmai-admin` identity, the previously used account and Tokyo region were verified before mutation. Identifiers are intentionally omitted.
- The existing Compute stack reached `UPDATE_COMPLETE`. CloudFormation updated the controller/worker inline policies and controller Lambda; no new stack, image push, operations schedule or operator role was created.
- The immutable worker digest, task definition revision, task sizing and four IAM-protected API routes were retained. Provider jobs and live-result display remained false; `MAX_ACTIVE_JOBS=2` was present in the deployed Lambda.
- Exactly three direct Lambda calls were made. Health returned 200 with effective OPEN because no valid persistent circuit is present; assets returned 200 with five allowlisted symbols; valid disabled POST returned 503 `DATA_UNAVAILABLE` before admission or launch.
- Closing inventory found zero running Fargate tasks and zero ECS services. Twelve Data and Bedrock calls were zero.
- The existing monthly Budget remained USD 5. Its closing view reported actual USD 0.0 and forecast USD 0.026; these delayed values are observations, not a hard cap or guarantee.

## IAM evidence and remaining uncertainty

Eleven intended allow/deny IAM simulator decisions matched, including worker control-key denials and controller circuit-write/slot-delete denials. The simulator returned `implicitDeny` for controller `dynamodb:ConditionCheckItem` despite the deployed exact action/resource/conditions being present. A minimal custom policy allowed the action, each condition independently, and both conditions together. AWS Access Analyzer returned zero findings for the deployed controller policy.

AWS documentation states that transaction `ConditionCheck` uses `dynamodb:ConditionCheckItem` and shows `dynamodb:EnclosingOperation=TransactWriteItems`; it also documents `dynamodb:LeadingKeys` for the action. Nevertheless, no real controller transaction was permitted in this acceptance because job creation remained disabled. Treat ConditionCheck runtime authorization as unproved until a separately approved, bounded live admission test. Do not weaken the exact table/key restrictions merely to make the simulator report allowed.

References: [DynamoDB transaction IAM permissions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html), [DynamoDB authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html), [IAM simulator limitations](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html).

## Circuit initialization learning step

After reviewing a zero-AWS-call dry-run, the user executed the operator command directly. One conditional DynamoDB write initialized `control_circuit` as explicit OPEN with reason `dev-initialize` and version 1. A separate consistent status read returned `effectiveState=OPEN`, `version=1`, and `verifiedRecord=true`. No Fargate, provider or Bedrock call was involved. This demonstrates the difference between fail-closed effective state caused by a missing record and a verified, auditable stored OPEN state.

## Next approval boundary

Closing the circuit is deliberately separate: it requires the freshly observed version, explicit confirmation and a reason code. Signed HTTP E2E, live admission/recovery, provider and Bedrock tests also remain separately bounded gates. Do not close the circuit until the exact task count, provider/model call count, timeout, cleanup and maximum cost are reviewed.

## Post-initialization local preparation

After OPEN initialization, internal provider execution was separated from public result display in local source. Default synthesis remains false/false. An explicit internal opt-in synthesizes provider jobs true only with the API gate, while `API_AUTH_MODE=AWS_IAM`, live display false, maximum active jobs 2, all four routes IAM-authorized, and no ECS Service/ALB/NAT remain enforced. Service tests increased to 89 and infrastructure assertions to 7. This candidate has not been deployed and performed zero additional AWS calls.

## Signed acceptance and recovery tooling prepared locally

The terminal job projection now remains status-readable while omitting the licensed provider result whenever live display is false. A dedicated SigV4 client accepts only the Tokyo HTTPS execute-api host and four reviewed route shapes, obtains temporary credentials from the fixed `gmai-admin` profile, limits responses to 64 KiB, and never persists or prints credentials. Its live flow has no POST retry: one health preflight, one `PRICE/QLD/ko` submission, and at most 16 status reads at six-second intervals. The existing proven worker caps retryable provider attempts at three. Any provider result or internal field in an API response fails the privacy gate.

The separate slot operator is also dry-run-first. Execution requires two explicit flags and permits at most the configured two slots. It reads the exact cluster, then delegates to the conservative reconciler, which deletes a slot only after matching terminal job/version/creation time and exact ECS `STOPPED` evidence. Neither local dry run made an AWS, provider, Bedrock or Fargate call. Live deployment, circuit close, the single signed job, reconciliation, circuit reopen and flag rollback remain an explicit Security/Cost gate.

## End-of-session checkpoint

The common local gate passed with 93 service/contract tests, 7 infrastructure assertions and 4 frontend contract tests. Type checks, lint, controller/worker bundles, no-network smoke tests, CDK synthesis, production-license inventory and high-confidence secret scan also passed. A final focused check after correcting the provider-call ceiling passed as well.

A read-only Tokyo preflight confirmed the expected IAM user, USD 5 Budget (actual USD 0.00, forecast USD 0.026), zero running ECS tasks, zero ECS services, and deployed provider/display flags both false. The read-only circuit/auth parsing in that combined probe was inconclusive, so it does not replace the user's immediately preceding verified `OPEN/version 1` status evidence. No stack update, circuit mutation, provider request, Bedrock call or Fargate launch occurred. The next session should begin with a fresh identity/region/Budget/circuit read and a reviewed Compute diff before asking for the separately bounded live acceptance approval.

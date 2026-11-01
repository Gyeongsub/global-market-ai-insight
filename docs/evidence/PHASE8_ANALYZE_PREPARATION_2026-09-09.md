# Phase 8 ANALYZE preparation — 2026-09-09

Historical checkpoint: the single Korean QLD cloud analysis was subsequently completed on 2026-09-10. See [live acceptance and cleanup](PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md); the statements below describe only the 2026-09-09 session.

## Session scope

The user requested a self-contained task within 30 minutes. This session completed local ANALYZE acceptance tooling and regression validation. No AWS credentials were requested, no AWS/provider/Bedrock calls were made, and no deployment, image push, circuit change or persistent process was started. The existing Chrome login was not used or changed.

## Changes

- Reused the signed PRICE acceptance flow for a single `ANALYZE/QLD/ko` submission. PRICE remains the default and its exported compatibility entry point remains available.
- Strict argument parsing rejects unknown/duplicate flags and invalid operations before credential or endpoint access. Dry-run is zero-call; live ANALYZE requires explicit one-task and one-Bedrock-call flags.
- Retained one non-retried POST and at most 16 status reads (18 total API requests). Ambiguous submission is not retried. Polling rejects mismatched job identity, invalid status and result/internal-field exposure. Submission responses also pass the exposure check.
- FAILED and TIMED_OUT are terminal observations, but the CLI reports `passed=false` and exits nonzero. A terminal result alone is not evidence that ECS has stopped.
- Added three-language metadata, disclaimer, provenance and QLD risk checks through the real analysis adapter with an injected fake model transport. Model refusal, truncation and missing mandatory QLD selections fail after one attempt.

## Cost and data boundaries

The current worker adapter has a single SDK attempt, no paid repair/retry, a 20-second model-request timeout and a maximum of 512 output tokens. Its 1,500-input-token usage validation happens **after** the model response, so it is not a pre-inference spending cap. Review the bounded actual request and current pricing before live use.

The acceptance plan permits one Fargate task, up to three provider attempts and one model call for ANALYZE. Its declared 90-second worker job deadline does not itself prove task termination or place a 90-second total limit on operator polling. The operator must verify the exact ECS task is STOPPED and restore circuit OPEN/internal jobs false even when acceptance fails. No scheduled sweeper is claimed.

ADR 0005 remains in force: Bedrock selects approved insight IDs; application templates render localized prose. Public provider-derived result display stays disabled.

## Verification

- Focused signed API and Bedrock adapter tests: 13 passed.
- Full local gate (`node scripts/check-all.mjs`): passed; 99 service/contract tests, 7 infrastructure tests and 4 frontend contract tests (110 total). Operator/service/infrastructure/frontend type checks, controller/worker bundles and local smoke, CDK synthesis, frontend lint/build, license review and high-confidence secret scan passed.
- The first sandboxed run passed all 99 service tests but stopped when esbuild could not read an ancestor directory. The authorized retry outside that sandbox completed with exit code 0; assertions were not weakened.
- Both PRICE and ANALYZE dry-runs report zero AWS/task/provider/model calls.

## Next bounded cloud session

1. Verify fresh temporary identity, Tokyo region, Budget, circuit version, no running project tasks/services and no occupied slots. Chrome login alone does not establish CLI credentials.
2. Review current model availability/pricing and the deployed immutable image/model configuration. Confirm the existing single-call/output-token bounds apply to the deployed worker; the local CLI does not configure them remotely.
3. Review the exact Compute enable and rollback diff and reserve time for cleanup before enabling internal jobs. Preserve IAM authentication and result-display false.
4. Submit exactly one ANALYZE job using the new tool. Independently inspect only that job's stored analysis in memory and emit validation booleans for result kind, locale, timestamps, model/prompt metadata, QLD risks and disclaimer. Do not print raw data or analysis.
5. Restore OPEN using the fresh circuit version, verify exact task STOPPED, reconcile only its terminal/STOPPED slot, restore internal execution false and record final task/service/slot counts.

Signed API status success and local fixtures are not cloud evidence for the full analysis output. Live ANALYZE acceptance, current AWS inventory and current pricing were not verified in this session. The prior 2026-09-07 closing state remains historical evidence only.

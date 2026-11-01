# Phase 8 acceptance selection — 2026-09-11

## Bounded local scope

Prepared the next single-job language/symbol acceptance within a 30-minute session. No AWS, Twelve Data or Bedrock call, deployment, Docker launch, login, public publication or paid test was performed. The deployed worker image and cloud execution gates were not changed.

## Implementation

- The acceptance planner accepts one `--symbol` and one `--locale`, using the existing controller contract's five symbols and three locales. Missing, unknown, duplicate and bulk selectors fail before credentials or transport use.
- The execution entrypoint passes the reviewed selection through to the existing signed single-job runner. Historical operator defaults remain PRICE/QLD/ko; the product still defaults to English.
- All execution gates and limits remain: explicit execution/task flags, extra Bedrock confirmation for ANALYZE, one non-retried POST, at most 16 status reads, no public result exposure and no batch mode.
- The local full-check command now previews ANALYZE/TSLA/en with zero cloud calls.
- Added 30 synthetic selection cases (two operations × five symbols × three locales), plus malformed-selection and direct-caller rejection tests. The synthetic SPCX failure verifies failure preservation, not real provider availability or the provider's DATA_UNAVAILABLE mapping.

## Verification boundaries

These tests prove selection propagation and single-job limits, not live market-data availability, model quality, translated analysis content, or all-symbol cloud coverage. Existing Bedrock/grounded-language tests run separately in the regression suite. The last real signed analysis remains [QLD/ko on 2026-09-10](PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md).

Initial sandbox run passed 132 service/contract tests, then esbuild failed reading a parent directory with Access denied. The permitted local-only rerun of `node scripts/check-all.mjs` completed successfully: 132 service/contract tests, 7 infrastructure assertions and 4 frontend contract tests (143 total), operator/service/infrastructure/frontend type checks, frontend lint/build, both bundles and no-network smoke checks, foundation synth, secret scan (zero high-confidence findings), and production license check (34 packages). This was an execution-environment permission issue, not a test assertion failure. No dependency or infrastructure source change was needed.

## Next cloud step (not executed)

Use the explicit TSLA/en dry-run in the runbook, then fresh temporary identity/region/Budget/circuit checks and a reviewed one-task enable/restore cycle. Inspect the exact stored result against TSLA/en metadata and its canonical disclaimer, not the prior QLD/ko-only temporary inspector. Verify the exact task STOPPED, reconcile its slot, and restore internal execution false/display false/circuit OPEN. Do not run the synthetic matrix against AWS or infer approval for a batch.

## Cost and shutdown scope

Today's changes introduce no cloud execution or new recurring resource. AWS state and billing were not queried today; yesterday's zero-running-compute evidence is a dated snapshot, not today's inventory. Existing storage/log resources may still incur small charges. No new credential session was opened, so there is no session created by this task to revoke.

Final local process inspection found zero matching check/test/acceptance/frontend-build/Vite/ESLint Node processes. The full-check process exited successfully; no background server was started by this session. The post-documentation secret scan also passed. Work finished within the requested 30-minute window.

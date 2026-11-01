# Phase 9 runner and UI matrix checkpoint — 2026-09-19 (second session)

## Scope

Local-only implementation, deterministic tests, browser checks and documentation. No AWS login/API, provider/Bedrock call, deployment, image push, publication, dependency installation or subscription change. The user's existing Chrome/AWS sessions were not changed. Existing cloud inventory and billing were not re-audited.

## Changes

- Extracted the local demo scheduler into `frontend/src/data/demo-runner.ts` with an injected clock. `MarketDashboard` uses this runner for pending-work guards and effect cleanup.
- Cancellation clears all owned timer handles and increments a generation marker. A callback already queued before cancellation cannot change the next run or re-enable/overwrite the current UI. Repeated cleanup is safe; invalid input does not lock the runner.
- Preserved the existing local-only scenario contract. This cancellation is not an AWS worker stop command and does not replace server idempotency.
- Named the two compressed demo timing values. No real job timeout was changed.
- Fixed the common three-language analysis sentence that incorrectly described every quote as positive, including the negative TSLA fixture. The replacement describes the single-session observation without claiming direction or trend.
- Raised the secondary-label color from `#5d6b67` to `#90a198` and added a base-palette contrast regression. This is not a full accessibility certification; gradients, compositing, all states and assistive technology remain separate checks.

## Automated verification

`node scripts/check-all.mjs` passed after all source changes, using the configured bundled Node runtime and approved local build permissions. No network-backed cloud test was run.

- **205 TypeScript tests + 7 infrastructure assertions + 8 frontend contracts = 220 unique tests passed.**
- 21 new TypeScript tests: five scheduler lifecycle/guard cases, 15 asset/locale fixture-and-runner cases, one negative-TSLA wording regression. Each matrix case exercises PRICE/ANALYZE across four scenarios with a fake clock (120 local combinations). These are not browser E2E tests.
- Lifecycle coverage includes 20 immediate duplicate starts, normal unlock, cancel/restart, callbacks forced after cancellation, repeated cleanup, immediate circuit rejection, malformed input and cancellation during initial notification.
- One new palette test checks ink/muted/subtle against navy/panel/panel-raised at a 4.5 contrast threshold; it does not assert every composited pixel meets that ratio.
- Frontend type checking, accessibility lint, static build, backend bundle no-network smokes, zero-call operator plans, production-license report and high-confidence secret-pattern scan passed; 0 high-confidence findings. A pattern scan is not exhaustive leak detection.

## Actual browser checks

In-app browser at `http://127.0.0.1:4173/`, with synthetic fixtures only. No live data or backend authorization was introduced.

| Locale | VOO PRICE / ANALYZE | QLD PRICE / ANALYZE | TSLA PRICE / ANALYZE | SPCX PRICE / ANALYZE | GOOG PRICE / ANALYZE |
| --- | --- | --- | --- | --- | --- |
| English | pass / pass | pass / pass | pass / pass | pass / pass | pass / pass |
| Japanese | pass / pass | pass / pass | pass / pass | pass / pass | pass / pass |
| Korean | pass / pass | pass / pass | pass / pass | pass / pass | pass / pass |

30 unique normal-path combinations were verified. Each check selected the asset, invoked the actual UI action, waited for the localized success badge, then asserted document language, selected symbol, no error, unlocked buttons and analysis visibility only for ANALYZE. Initial pending-button locking was observed; rapid duplicate scheduling is additionally covered deterministically, not claimed as a browser double-click count test.

Additional checks:

- Korean unavailable/timeout/circuit scenarios after the runner change: correct error code, no insight, unlocked controls.
- Reload during QUEUED: READY afterward with no old insight. Unit tests separately force late callbacks after cleanup.
- Keyboard: Tab reaches the skip link with visible outline; Enter focuses main; next Tab/Enter opens the scenario disclosure; next Tab reaches its labeled select with visible outline. This is a focused keyboard check, not an exhaustive screen-reader test.
- 390px Japanese QLD PRICE/ANALYZE: both pass; client/scroll widths 375/375; risk disclosure has no horizontal clipping; secondary label computed color `rgb(144, 161, 152)`. Screenshot and DOM checks used; no public screenshot artifact was published.
- Captured browser error log list was empty at the keyboard checkpoint.

### Tool limitations recorded honestly

An initial long batch exceeded the browser tool's 30-second execution limit and lost its in-memory result list; it was not counted. The verified matrix was rebuilt in smaller batches. A semantic TSLA asset click then timed out twice despite a visible enabled match; changing browser visibility alone did not fix it. Fresh accessibility-tree selection worked, with DOM verification afterward. Remaining selections used that documented alternative. No application failure or successful full matrix was inferred from the failed batch.

## Cleanup and next checkpoint

Original Korean preference restored. Reload confirmed normal scenario, READY and no disabled buttons. Temporary viewport reset; agent-created tab closed; loopback preview process stopped; port 4173 listener count confirmed **0**. No new AWS execution or credential session was created, so none needed cloud cleanup. Historical cloud safety observations are not a guarantee of current account costs.

Phase 9 remains partial. Normal local asset/language/action matrix and local scheduler regression coverage are now complete for this checkpoint. Next: focused assistive-technology review and remaining mobile/failure combinations, then review the authorization and market-data display-license gate before any live browser/API integration or Phase 10 hosting deployment. Do not silently enable public data or deploy infrastructure.

Usage checkpoints: five-hour allowance 99%, 89%, 73%, 46%, 36%, 23% before cleanup and 15% after cleanup. The preview listener count was reconfirmed as 0. Finished above the requested 5–10% reserve at this verified boundary rather than opening a new workstream only to consume allowance. No reset credit used. No new feature was opened during cleanup.

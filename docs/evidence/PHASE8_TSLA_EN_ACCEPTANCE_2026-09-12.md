# Phase 8 TSLA English acceptance — 2026-09-12

## Scope

One real signed ANALYZE/TSLA/en job succeeded. Local private-result inspection and multilingual worker tests were extended. No new stack, image push, IAM/network expansion, public access or recurring resource was introduced. Existing task definition revision 3 was retained.

Start usage: five-hour allowance 89% remaining, weekly 67%. Subsequent five-hour checkpoints: 75%, 63%, 48%, 36%, 25%. Cleanup took priority over consuming the allowance; no reset credit was redeemed. These account-wide percentages are not exact token counts.

## Live preflight

- Expected temporary IAM user/account and Tokyo region verified; identifiers omitted here.
- Compute UPDATE_COMPLETE; running tasks 0; ECS services 0; internal jobs false; live display false; AWS_IAM.
- Circuit verified OPEN/version 5; slots 0.
- USD 5 Budget: actual USD 0.00, forecast USD 0.02 at preflight. Delayed values do not measure the test's bill.
- Nova Lite `amazon.nova-lite-v1:0` ACTIVE with ON_DEMAND support.
- AWS Price List: Tokyo standard input USD 0.000072/1K tokens, output USD 0.000288/1K tokens; effective 2026-08-01. [AWS pricing](https://aws.amazon.com/bedrock/pricing/).
- CDK diff: Foundation unchanged; only existing controller internal execution false → true. No public-display/image/IAM/network change.

Limits: one task, at most three provider attempts, one Bedrock attempt, 512 output tokens, 18 signed API calls, 90-second worker deadline. No automatic model repair/retry or POST retry. Input-token checking is post-inference, not a pre-inference spend cap. Communicated whole-test estimate: approximately USD 0.02 or less, not an enforced ceiling. Actual token usage and per-test billing were not collected.

## Execution and shutdown

1. Enable deployment UPDATE_COMPLETE; conditional circuit OPEN/version 5 → CLOSED/version 6.
2. Exactly one ANALYZE/TSLA/en submission: SUCCEEDED in 7 signed API calls.
3. Execution wrapper's finally path restored OPEN/version 7 before inspection. Independent cleanup restored internal execution false; deployment UPDATE_COMPLETE. A failed circuit write would not skip flag restoration.
4. Exact stored job: expected operation/symbol/locale, SUCCEEDED, attemptCount 1. Exact associated task: STOPPED, desired STOPPED, container exit code 0.
5. Boolean-only inspection passed shared-schema constraints, expected model/prompt/symbol/locale, canonical English disclaimer, canonical risk/uncertainty and existing application safety checks. No price, raw result or prompt was printed or copied here.
6. STOPPED/terminal-evidence reconciliation: released 1, retained 0, other slot empty.
7. Separate final short reads: verified circuit OPEN/version 7, occupied slots 0, running ECS tasks 0.
8. CLI logout removed cached temporary credentials; previously loaded access tokens can remain valid up to 15 minutes. User confirmed AWS console logout.

A slower combined final identity/config/Budget query overlapped logout and ultimately failed with no cached session. There is **no successful post-test Budget/config/service-count read from that query**. Flag restoration is evidenced by the reviewed CloudFormation deployment; services 0 is preflight inventory with no service changes. Circuit/slot/task final values came from the successful separate reads. Do not describe every final query as successful.

Computer Use initialization and the alternative browser connection timed out; no automated browser input occurred. Console logout was handed to the user and confirmed. No new login followed cleanup.

## Local implementation and verification

- `analysis-inspection.ts` under the API-smoke operation: boolean-only private validation for all five symbols/three locales; shared schema constraints, metadata, canonical disclaimer, risk/uncertainty, QLD daily-reset context and existing safety rules. No raw data in diagnostics.
- `analysis-inspection.test.ts`: 15 combination cases with malformed shape/date/metadata/disclaimer/risk/unsafe-content variants.
- `multilingual-operation.test.ts`: 15 synthetic provider → worker → actual Bedrock adapter with fake transport → localized result cases; one additional test proves unavailable SPCX and wrong provider identity never invoke Bedrock across all locales. Synthetic SPCX success does not prove provider availability.
- Ignored `.tmp` helpers contain private operational configuration and are not publication artifacts.

`node scripts/check-all.mjs` passed: **163 service/contract + 7 infrastructure + 4 frontend tests = 174 tests**. Operator/service/infrastructure/frontend type checks, bundles, no-network smokes, foundation synth, frontend lint/build, secret-pattern scan (0 high-confidence findings), production license check (34 packages) passed. Local commands were unusually slow but completed without weaker assertions or dependency changes.

## Limits and next step

The inspector confirms bounded structure, declared metadata and canonical risk/disclaimer/uncertainty text. It does not independently re-fetch a quote or prove market prices, and is not a general JSON Schema engine or comprehensive natural-language safety classifier. Grounded-selection rendering remains the primary content control.

Real cloud coverage now includes QLD/ko and TSLA/en. Japanese live analysis, broader provider coverage, browser/API integration and display rights, deployed sweeper/observability drills and portfolio release remain open. Next: one Japanese analysis with fresh preflight and the same one-job/cleanup limits, or local UI review. Public live display remains disabled under the internal-development license.

Retained ECR images/logs/storage can incur small charges despite zero running tasks. No new chargeable workload or recurring resource was left running by this session.

Final local verification: zero matching project-check/build/acceptance or gmai-admin AWS CLI processes; post-documentation secret-pattern scan passed with zero high-confidence findings. Final usage checkpoint was five-hour 11% remaining and weekly 55%. Work stopped at the safe completed boundary rather than starting another task just to consume the remainder.

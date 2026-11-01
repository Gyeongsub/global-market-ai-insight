# Phase 8 QLD Japanese acceptance — 2026-09-13 morning

Recorded during the evening restart from the earlier session's tool results and the user's subsequent console-logout confirmation. This is not a new AWS test or fresh inventory.

## Scope

One signed ANALYZE/QLD/ja request; one Fargate task; at most three provider attempts, one Nova Lite attempt, 512 output tokens, 18 signed API calls and a 90-second worker deadline. No automatic model repair or POST retry. Existing worker revision 3 retained; no image push, new stack, IAM/network expansion or recurring resource. Public results stayed disabled.

Preflight verified the expected temporary IAM identity/account and Tokyo region, circuit OPEN/version 7, slots/tasks/services zero, internal/display false, AWS_IAM and Compute UPDATE_COMPLETE. Nova Lite was ACTIVE with on-demand support. AWS Price List returned Tokyo input USD 0.000072/1K and output USD 0.000288/1K tokens. Per-job token usage and billing were not collected.

## Execution and final verification

1. Reviewed CDK diff: Foundation unchanged; only Compute internal-job flag false → true. Deployment succeeded.
2. Conditional circuit OPEN/version 7 → CLOSED/version 8. Exactly one QLD/ja job SUCCEEDED in 7 signed API calls.
3. Wrapper finally restored OPEN/version 9 and internal false; Compute UPDATE_COMPLETE. Independent cleanup paths prevented a circuit-write failure from skipping flag restoration.
4. Exact-job inspector used two read-only calls: expected job/operation/symbol/locale, SUCCEEDED with attemptCount 1; exact ECS task/cluster, desired and actual STOPPED, sole worker container exit 0. Boolean-only schema, metadata, canonical Japanese disclaimer and QLD risk/uncertainty/safety checks passed. No raw quote/result/prompt is reproduced here.
5. Exact terminal-job/STOPPED reconciliation released 1 slot, retained 0, other slot empty.
6. Final successful reads: internal false, display false, AWS_IAM; running/pending/services 0, cluster lookup failures 0; Compute UPDATE_COMPLETE; verified OPEN/version 9, occupied slots 0.
7. Final USD 5 Budget: actual USD 0.00, forecast USD 0.019. These are delayed budget observations, not the test's bill or a spending lock.
8. All final queries completed before CLI logout removed cached credentials. Already-loaded tokens may remain valid until expiry. Computer Use found Chrome but stopped because it could not confidently identify the browser URL; no logout click occurred. The user confirmed manual console logout afterwards.

## Local checks and limits

Earlier session full check: 168 service/contract + 7 infrastructure + 4 frontend = 179 tests passed, plus types, builds, no-network smokes, secret-pattern scan and license checks.

`scripts/inspect-analysis-job.ts` is dry-run-first. Live execution requires a fresh operator-verified account/profile, at most two exact reads, a 15-second SDK abort signal and no SDK retries. It prints booleans/counts and performs no stop or reconciliation writes. The supplied account environment variable is not independent STS proof.

Inspection is not independent price verification, a general JSON Schema engine or a comprehensive natural-language classifier. Real samples now cover QLD/ko, TSLA/en and QLD/ja, not all symbol/locale combinations or live browser integration. Public-display rights, UI/API integration and deployed operations remain open.

Retained ECR/log/storage resources may incur small charges despite no running tasks. Historical versions must not be reused for future writes without a fresh read.

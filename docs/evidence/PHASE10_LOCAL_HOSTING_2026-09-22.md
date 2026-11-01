# Phase 10 local hosting preparation — 2026-09-22

## Outcome and boundaries

Implemented a separate, opt-in frontend CDK entry point and fixture release audit. **No AWS login, SDK call, deployment, object upload, provider/model invocation, GitHub push or subscription change was performed.** This is preparation, not a deployed website or completed Phase 10 acceptance.

The generated frontend template contains exactly six resources: one S3 bucket, one bucket policy, one CloudFront distribution, one OAC, one response-headers policy and one CloudFront Function. The distribution has `Enabled: false`. No compute/backend/deployment-helper resource is present. Default Foundation/Compute/API source entry point is unchanged.

## Files and design

- `infrastructure/lib/frontend-stack.ts`: private S3, distribution-scoped OAC, GET/HEAD + HTTPS-only, fixture CSP, safe navigation rewriting, separate HTML/assets cache policies. No object auto-delete helper or live API connection.
- `infrastructure/bin/frontend.ts`: explicit `GMAI_ENABLE_FRONTEND=true` gate; ignored `cdk.out/frontend` output.
- `infrastructure/tests/frontend.test.ts`: six local assertions including negative live-display configuration and missing-file/API URI preservation.
- `frontend/scripts/release-audit.mjs`: current four-file-type allowlist, link rejection, bounded file sizes, content hashes, selected credential/internal-identifier checks, built HTML reference checks and proposed cache metadata. Reports `awsCalls: 0`, `uploaded: false`.
- `frontend/tests/release-audit.test.mjs`: four normal/negative tests. Test-only temporary directories are removed by registered cleanup hooks.
- `scripts/check-all.mjs` and `package.json`: include the new checks.
- [ADR 0011](../adr/0011-fixture-frontend-hosting-preparation.md): proposed behavior, TLS limitation, cost/logging/cleanup decisions and official source links.

## Verification performed

- Full checker completed: **211 TypeScript tests + 13 infrastructure assertions + 13 frontend contracts/audit tests = 237 tests passed**.
- Type checks, lint, static build, no-network worker/controller smokes, foundation synth, operator dry runs, 34-package production-license report and secret-pattern scan passed (0 high-confidence findings).
- Standalone frontend entry point synthesized successfully. Parsed template confirmed resource counts above and disabled distribution.
- Negative entry-point check with `GMAI_ENABLE_FRONTEND=false` rejected synthesis as expected. Final release-audit tests passed again and the source secret-pattern scan still reported 0 high-confidence findings after documentation changes.
- Release audit of the freshly built output passed: four files, total **1,767,700 bytes**, SHA-256 values and proposed cache controls emitted locally; nothing uploaded. Unknown secrets, image metadata and content licensing remain manual review requirements.
- A temporary loopback HTTP server served only audited files, with the exact draft CSP and `nosniff`. It used the same navigation function. Browser checks confirmed Korean PRICE/ANALYZE, English ANALYZE, Japanese ANALYZE, stylesheet loading, visible bar heights and root-shell fallback at `/ja/market`. Captured error logs were empty after successful checks. This is not an AWS HTTPS/OAC/cache-invalidation test or an exhaustive CSP attack test.

## Failures and recovery

- Initial sandboxed full checker passed 211 TypeScript tests but esbuild could not read a parent directory. The same local checker was rerun under the approved build permission and completed. No IAM or source safety assertion was weakened.
- First temporary preview launch had a PowerShell quoting error and exited before listening; corrected quoting started the scoped loopback server.
- One browser action tried the English Analyze label after switching to Japanese. Fresh DOM inspection showed the Japanese label; corrected selection completed normally. The failed click is not counted as a product failure or successful test.

## Remaining gates

1. Default CloudFront certificate does not enforce a TLS 1.2 minimum according to the AWS documentation reviewed today. Resolve the explicit security decision before enabling publication; do not silently add a custom domain/certificate or accept the limitation on the user's behalf.
2. Review live identity/region, exact diff, current pricing and expected storage/request/transfer exposure before any resource deployment. Price class 200 remains a proposal. Budget alerts are not a spending ceiling.
3. Prepare/review bounded file publishing and rollback: assets first, HTML last, preserve referenced hashes, verify metadata and only approved invalidations. No publisher was executed or added in this checkpoint.
4. Live browser/API authentication and external market-data display rights remain unresolved. Current UI is synthetic and CSP intentionally disallows API connections. API CORS was not changed.
5. CloudFront/S3 denial/HTTPS tests, live cache behavior, full assistive-technology review, operations deployment and final portfolio/privacy release remain pending.

## Safe stop

Restored Korean browser preference, closed the agent-created tab and terminated the loopback preview. Port 4173 listener count verified **0**. Both successful checker and standalone synth exited. No cloud sessions were opened and no cloud resource was created to clean up. Existing AWS resources/billing were **not** audited today; historical zero-task observations are not a current zero-cost claim.

Allowance checkpoints: 96% initially, 69%, 59%, 39% after browser cleanup and **33% remaining at the final check**. Finished above the requested 5–10% reserve at the verified local-preparation boundary rather than entering an unapproved publication/TLS/cost decision. No reset credit used.

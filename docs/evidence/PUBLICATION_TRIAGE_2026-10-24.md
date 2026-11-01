# Publication finding triage — 2026-10-24 Tokyo

Read-only review, not an exception list, history/privacy/legal clearance or
permission to publish. No original artifact or detector rule was changed.
The measured pre-handoff audit covered **604 candidates, 32 findings across
29 files**, `readyForPublication:false`. Today's new signed-response test adds
one synthetic endpoint finding to yesterday's 31; that is not an observed leak.

| Finding class | Findings | Observed context | Retained action |
| --- | ---: | --- | --- |
| Cloud identifiers | 21 | Synthetic zero/documentation account shapes, dummy API labels and one synthetic ECR image in fixtures/proofs/support draft | Keep negative tests and exact-resource assertions; review context again before export. Not actual deployed identifiers or permission acceptance. |
| Email-shaped test strings | 6 | Invalid user-info URL, placeholder config owner, private sentinel, or detector/redaction fixture | Preserve test strength; do not whitelist file paths or treat the regex as privacy clearance. |
| Historical SBOM email-shaped strings | 1 | Supplier/package-maintainer metadata; heuristic also matches package references/advisory URLs | Preserve original bytes. Review a separate minimal publication copy if needed, not an in-place historical edit. |
| Personal-path-shaped fixtures | 3 | Synthetic/private-path denial and redaction tests | Preserve negative fixtures; not the user's real filesystem identity. |
| Original PNG metadata | 1 | Original asset has an embedded non-pixel/provenance chunk; only generated frontend copy is stripped | Preserve original and provenance. Its actual contents/rights still need final review before repository publication. |

## Exact cloud-finding file membership

All matching ARN account fields in these 21 files were checked in the original
and bounded quoted-inspection forms. Only the synthetic all-zero, documentation,
or repeating-one shapes occurred. The API labels are short synthetic examples;
the ECR image uses the documentation account. No raw private identifier is copied
into this report. This checks these matching shapes, not every possible encoded
identifier or all Git history.

```text
docs/evidence/PHASE11_SUPPORT_REVIEW_DRAFT_2026-10-15.md
frontend/tests/api-client.test.ts
scripts/local-iam-wire-proof.mjs
scripts/maintenance-recovery-rehearsal.ts
scripts/smoke-controller-bundle.mjs
scripts/tests/maintenance-log-diagnostics.test.ts
scripts/tests/maintenance-reference-readiness.test.ts
scripts/tests/phase11-live-readiness.test.ts
scripts/tests/publication-audit.test.mjs
scripts/tests/verify-worker-release.test.ts
services/controller/tests/aws-call-deadline.test.ts
services/controller/tests/ecs-task-launcher.test.ts
services/controller/tests/runtime-config.test.ts
services/operations/api-smoke/tests/circuit-denial.test.ts
services/operations/api-smoke/tests/job-inspection.test.ts
services/operations/api-smoke/tests/signed-api-client.test.ts
services/operations/api-smoke/tests/signed-api-response.test.ts
services/operations/sweeper/tests/handler.test.ts
services/operations/sweeper/tests/maintenance-deadline.test.ts
services/operations/sweeper/tests/slot-reconciler.test.ts
services/operations/sweeper/tests/stale-job-sweeper.test.ts
```

The six test email findings are in frontend API-client, infrastructure config,
candidate-vulnerability-triage, local-check-step, public-base-notice-proof and
publication-audit tests. The three path findings are in check-document-links,
local-safe-stop-inventory and publication-audit tests. In particular, the
public-base-notice fixture is rejected URL user-info, not a contact transmission.

The original worker-image SBOM was read as JSON only: matches occur in supplier
names, package references and advisory URLs. No user email or private metadata
is copied here; this is not complete package-contact consent or image rights
review. The PNG was only hash checked; its metadata content was not declared safe.
The six + one email distinction explains the same seven machine categories,
not a reduction in the audit count.

The source scanner still reports all 32 findings. Publication stays blocked;
complete-project consent, exact final export/history review, attribution/rights
and approved CI remain necessary. Today's full code proof predates this handoff-
only document. [Safe stop and exact scopes](LOCAL_SAFE_STOP_2026-10-24.md).

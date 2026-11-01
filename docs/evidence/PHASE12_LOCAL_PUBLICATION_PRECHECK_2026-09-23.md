# Phase 12 local publication precheck — 2026-09-23

## Scope

No GitHub remote, push, release, public repository, workflow run or network call was created. This is a read-only inspection of the files Git would currently consider for an initial commit (`git ls-files --cached --others --exclude-standard`). The user's instruction to publish **only after project completion and a full security/privacy review** remains in force.

`scripts/publication-audit.mjs` checks candidate file names, selected text patterns and PNG chunk types. It reports only file names and finding categories, never matching values. It flags credential-looking files even if a file is tracked despite ignore rules, generated/private directories and source maps, user-specific absolute paths, high-confidence credential patterns, email-shaped text, AWS account-bearing ARNs/API endpoints, image metadata and unreviewed or unknown file types. Known extensionless configuration files and Dockerfile are inspected as text. It always returns `readyForPublication: false`; a clean pattern scan is not authorization to publish.

Follow-up 2026-09-24: any future `.github/workflows/` candidate is now independently flagged for automation, credential and usage-cost review even if its YAML has no literal secret. This is a local guard; no workflow was created or run. The added test brings the latest full checker to 269 tests.

The later same-day hardening pass also reports a tracked-but-deleted file instead of aborting, and checks a candidate's resolved physical path before reading it. A staged path redirected through an external directory junction is flagged without reading the target. Both cases have local temporary-repository tests. This is a preflight guard, not a sandbox against concurrent malicious filesystem changes.

## Current findings

The latest local preflight inspected **215 Git candidate files** and reported **12 review findings across 10 files**:

- `frontend/public/og.png`: embedded `caBX` provenance metadata is still in the source file. The deployed-build copy is cleaned; the original would be part of a source-code publication unless separately reviewed or excluded.
- `docs/evidence/worker-image-20260810.cdx.json`: third-party package-maintainer email strings in the SBOM need a publication/right-to-share review.
- Three test source files contain example email strings. They appear synthetic but still require a final human review before publication.
- Seven test source files contain account-shaped ARNs or API endpoint examples. These appear synthetic, but their exact content and publication suitability require final review; the scanner does not print their values.

No user email or high-confidence credential value was reported by this limited pass. That does **not** prove none exists: generated files, binary contents, Git history, screenshots, metadata variants, embedded URLs and platform settings still need a complete manual review. The scanner's nonzero result is intentional while findings remain. No remediation involving publication was performed.

## Required later gate

After product completion: inspect candidate files and entire Git history, verify no credentials/PII/account IDs or sensitive screenshots/outputs, review image provenance and licenses, assess any CI workflow's cost/secrets, then request the user's explicit approval before creating a GitHub remote or pushing. Re-run this audit and the high-confidence secret scan immediately before that approval decision.

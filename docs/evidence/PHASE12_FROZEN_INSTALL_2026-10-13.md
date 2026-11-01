# Final fresh install — 2026-10-13

The final declared-tool frozen install completed and its durable result was
independently read. Do not reuse the October 12 455-file/941-test outcome for
today's source changes.

Today's changes add the non-authorizing same-request CLI comparison and its
negative guards, a confined privacy-minimized runtime dependency SBOM review
preview, fixed public-schema structural review and deterministic peer-edge
validation. Existing IAM acceptance, source/output ownership, zero-action
defaults, the four test groups, all previous assertions, the 360,000 ms ceiling,
lockfile/dependency versions and reviewed worker Dockerfile are unchanged.

Explicit isolated install uses actual pnpm 11.16.0 with a fresh store/profile,
disabled lifecycle scripts and no existing dependency reuse. Public tool/package
downloads occur, but no private registry/AWS credentials are passed. The default
whole gate never opts into schema downloads, IAM reads, writes or publication.

## Actual final snapshot

Run `38540936-7f72-4623-b475-ce7977563dbf` started at
2026-10-13T12:39:22.269Z and completed at 2026-10-13T12:46:59.977Z.
Durable ignored result:
`outputs/local-gates/fresh-38540936-7f72-4623-b475-ce7977563dbf.json`.
Its completed/passed fields, exact source hash, test/step counts and no-retained-
tree observation were independently read after execution.

The source copy contains 462 files / 4,789,430 bytes, SHA-256
`b26a25f89b18583674ee926d432cee3e697121134091b4935ff2144b0b96b593`.
Actual pnpm 11.16.0 tool integrity matched archive SHA-256
`3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa`
with 891 tool files. All 391 locked identities use registry resolutions; the
lock remained unchanged. No dependency reuse, lifecycle scripts, private
registry credentials, AWS calls or modification of the user's installation.

All 75 ordered steps passed with complete validated timing records. Four groups
reported 964 tests: 963 passed, one existing Windows privilege skip. Install
elapsed 64,628 ms; gate elapsed 355,126 ms under the unchanged 360,000 ms ceiling.
The 4,874 ms remaining timing margin is narrow, not a guarantee for future
machine load or CI. No assertion, deadline or original test was waived.
All 33 loopback HTTP checks passed; servers closed and no temp tree was retained.

Independent normal/restricted context cleanup and actual session/cloud closure
are recorded in [safe stop](LOCAL_SAFE_STOP_2026-10-13.md). This is not a clean Git
clone, CI execution, full licensing/privacy approval or deployment. Final handoff
documentation follows the exact snapshot and receives separate source/link/
publication scans rather than borrowed hash coverage.

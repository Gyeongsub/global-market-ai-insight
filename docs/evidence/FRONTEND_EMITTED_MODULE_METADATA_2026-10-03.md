# Frontend emitted-module metadata — 2026-10-03, local only

This later build checkpoint supplements, not replaces, the
[declared runtime notice graph](PHASE12_RUNTIME_ATTRIBUTION_2026-10-03.md).
It changes no hosted resource, entitlement, credential or publication permission.

## Actual current output

A build-only post hook reads the compiler's output-module metadata. It emits
only safe package/version/license counts and public chunk keys, byte lengths
and SHA-256 values: no absolute module IDs, source code, maintainer/email fields
or source maps. Package identities/documents must still agree with the pinned
runtime graph before build. A fixed physical dist/assets boundary verifies
the just-written JS bytes; redirected files, arbitrary keys or hash/length
mismatches cannot supply success evidence.

The current JS output remains `assets/index-BJPfHW0I.js`, 223,132 bytes,
SHA-256 `c1375e06f77dbe521569ef96b303d78e634936c2bcd782c85aa38dceb27d2d3c`.
The compiler reported 25 distinct module IDs:

- 13 frontend-source IDs;
- 10 locked runtime-package IDs: React 19.2.8 (four), React DOM 19.2.8 (four),
  Scheduler 0.27.0 (two), all declaring MIT;
- two virtual/generated IDs;
- zero unclassified ordinary IDs.

This records module **metadata**, not exact emitted-code/rights coverage.
Tree-shaken module entries, inline compiler helpers and virtual-generated code
need interpretation. The two virtual entries require a separate generated-
helper provenance/license review. A three-package notice file or zero
unclassified ordinary IDs must **not** be described as complete distribution
attribution. Reports always retain `completeAttributionVerified=false`,
`legalReviewApproved=false` and `publicationPerformed=false`.

## Verification

Seven focused tests passed: hash/count privacy, virtual/foreign classification,
cross-chunk de-duplication, generic malformed identity/document failures,
fixed written-byte/hash validation and redirected-directory rejection.
Type checking, targeted lint and a fresh frontend build also passed. The
five-file artifact allowlist is unchanged; no module report or source map is
added to the public distribution. Final full-gate/copy results are recorded
only once complete in [the later closing checkpoint](LOCAL_SAFE_STOP_FOLLOWUP_2026-10-03.md).

The hook uses the pinned compiler's ordinary build/plugin interfaces. Reference:
[Vite JavaScript API](https://vite.dev/guide/api-javascript.html).
No fresh dependency installation, advisory query or container-image scan is
implied, and no cloud/GitHub upload occurred.

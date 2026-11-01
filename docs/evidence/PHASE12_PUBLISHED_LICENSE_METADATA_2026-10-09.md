# Other-platform license declarations — 2026-10-09

The installed lock-aligned inventory still knows 342 of 391 exact identities;
49 other-platform manifests are not installed. A separate bounded public read
verified their publisher declarations without changing that local unknown state.

The explicit operator performed 49 fixed public npm metadata reads. Each
response matched the reviewed lock name/version, exact SHA-512 integrity and
canonical public tarball URL; raw JSON bytes were hashed before retaining only
safe fields. No tarball was downloaded, package installed, downloaded code
executed, file uploaded or AWS operation performed. Raw authors and other
arbitrary publisher fields were not retained. Maximum target count is 64,
each body 100 KB, per-request time 20 seconds and overall time four minutes.
Redirect/private fallback or conflicting installed metadata aborts the proof.
Changed lock fingerprints before/after the query also abort it.

The sanitized [49 exact declaration fingerprints](phase12-public-license-metadata-2026-10-09.json)
retain public name/version/expression and raw metadata SHA-256 only. They do not
include full publisher JSON, author details, credentials or workstation paths.

## Mixed-source declarations, not legal clearance

342 local installed declarations plus 49 publisher declarations cover the
391 locked identities in this particular metadata snapshot:

| Declared expression | Identities |
| --- | ---: |
| MIT | 298 |
| Apache-2.0 | 55 |
| MPL-2.0 | 13 |
| ISC | 11 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 2 |
| 0BSD | 1 |
| BlueOak-1.0.0 | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |
| Python-2.0 | 1 |

These are declared expressions, not a new production allowlist or a choice of
license branch. Historical diagnostics of a different installation are not
silently reused as the current graph's counts. Unknown installed manifests,
actual other-platform binaries/sources, license/notice bytes, development/OS
notice packaging and legal obligations are still unverified. Publication and
complete provenance flags remain false. The three missing backend runtime
document sets are a different unresolved issue; these metadata reads do not
replace them with a generic license.

Default execution makes zero requests. Tests simulate all 49 responses and
verify bounds, exact identity/raw-byte binding, no private fields, no conflict
fallback and fail-closed partial/oversized/malformed results. Final full totals
and source hash belong to the later safe-stop snapshot.
See [notices boundary](../../THIRD_PARTY_NOTICES.md) and
[CI design](../CI_RELEASE_DESIGN.md).

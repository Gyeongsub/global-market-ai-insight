# Declared-runtime installed bytes — 2026-10-15

Read-only package-content evidence, not a package installation, extraction,
execution, signature/source/build proof, legal approval or release authorization.
No AWS/API key/provider request, upload or existing-file repair occurred.

## Measured package-content snapshot

The final explicit observation fetched exactly 37 fixed official npm archives,
3,096,993 compressed bytes and 21,167,616 expanded tar bytes, in memory only.
All 3,716 regular-file names, lengths and SHA-256 hashes matched the exact
installed file sets of the reviewed 37-component/169-edge declared-runtime BOM.
No downloaded code was executed or extracted. Root/package links and additional
unreviewed files cannot be followed, ignored or opened to force a match.

- Lock SHA-256: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- Runtime BOM SHA-256: `b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
- Current whole-manifest runtime-source metadata SHA-256:
  `e78ba63281c8b6ceda6467c8f404d3494909d1f74acc31d8788f640053524df4`.
- Manifests, lock, resolved graph and whole installed-file metadata brackets
  were stable across this observation; `immutableSnapshotClaimed` remains false.

An earlier successful 37-archive observation used source metadata
`628566ed35e15307f943991b0fecc6e1dc3f090897efa77fab4dcbd6e687833b` before
the task alias and whole-installation metadata brackets. It is a separate
revision, not the final revision's proof. Neither hash identifies all project
source or the later complete-test snapshot.

The subsequently changed test:infra task alias changes whole-manifest metadata,
not the reviewed lock/BOM or package-content scope. The hash above belongs to
the measured archive observation, not that later manifest/source revision. Do
not borrow it as a complete current-source or later whole-test fingerprint.
No third identical archive download was performed to obscure that distinction.

## Fail-closed boundaries

The reviewed lock/BOM are required before any GET. A shared 120-second network/
comparison phase permits at most 37 GETs, 5 MB compressed per archive, 50 MB
compressed aggregate, 100 MB expanded aggregate and 25,000 entries. Existing
per-archive USTAR format, integrity, UTF8, checksum, padding and path checks stay
in force. A runtime-only 0BSD profile does not broaden backend/helper profiles.
Redirects, credentials, referrers and private coordinates are prohibited.

The full publisher path set is validated before local content reads. Windows
absolute/device/ADS/traversal/reserved names, case aliases, links, duplicate,
missing, additional or changed files fail. Read-only handles compare BigInt
file identity/size/timestamps before and after hashing. Private metadata
snapshots bracket all local comparisons, without printing file IDs or paths.
This is bounded race detection, not an adversarial immutable-filesystem claim.

Eleven content tests and 15 archive tests passed after the final bracketing
revision. They cover invalid replies before installation traversal, exact sets,
same-size corruption, extra private files, junction refusal, forged snapshots,
post-read metadata changes, response limits/cancellation and zero-action CLI.
Ordinary whole checks run the plan/tests only, never this external opt-in.

## Gates retained

The separate [signature observation](PHASE12_RUNTIME_SIGNATURE_COVERAGE_2026-10-15.md)
verified 34 components and left three unverified; byte matching does not clear
those keys, missing license/notice obligations, development/native/OS/image
coverage, vulnerabilities or publisher/build provenance. No installed content
was repaired and no dependency version or lock was changed. Publication remains
false, and no cloud workload or permission change follows this result.

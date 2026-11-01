# Fixed retired registry key observation — 2026-10-16 resumed session

This narrows three earlier unknown key observations; it does not change the
current active-key verifier, install/update a package, establish trusted signing
time or authorize release. The existing current-policy result remains 34 active-
key verified components / three not accepted under that policy, not 37 cleared.

## Actual bounded observation

Ignored independently reread receipt:
`outputs/local-gates/retired-key-c216dc25-8df3-4bb6-8488-a796a8986caa.json`.
Observed 2026-10-16T12:41:28.558Z after starting 12:41:27.300Z.
Four fixed anonymous official npm GETs returned 9,168 metadata bytes: the public
key set and exact mnemonist 0.38.3, obliterator 1.6.1, tslib 2.8.1 metadata.
No advisory inventory POST, private name, source tree, personal/account data,
credential, archive, installation, script execution, AWS call or cloud mutation.
Three additional fixed metadata GETs retained only minimal public signature/
integrity fields for deterministic regression fixtures; no author/contact body.

All three signature equations match the exact locked name/version/SHA-512
message under the same official retired key. Public SPKI SHA-256:
`1e908a55459fe6ddac1ccbc137ea8631ee837032fec2a2ccc528b38d81f17108`.
The key set advertises expiry `2025-01-29T00:00:00.000Z`; it is expired now.
The unchanged lock SHA-256 is
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.

This proves the equation for a public registry key and locked integrity. It
does NOT independently prove when the signature was made, historical key custody,
publisher identity, source commit/build attestation, all installed archive bytes,
vulnerability absence, license compliance or complete current runtime coverage.
Unsigned publication-time fields would not resolve trusted signing time. No
expired key was added to current trust or used to override a failed signature.
No package update was made merely to eliminate an unknown classification.

## Boundaries and regressions

The explicit operator permits only those four HTTPS destinations, GET, redirect
error, credentials omit and no referrer. Metadata is streamed with per-record
100,000-byte, aggregate 320,000-byte, 4,096-chunk and 30-second limits. The active
key-set validator still runs before the separately pinned retired-key inspection.
Only its private branded proof can verify one exact retired signature. Duplicate,
foreign/mixed-key, changed identity/integrity/URL or corrupt signatures fail; no
partial result is reported. Remote exceptions and document text are suppressed.
The output includes public decisions/hashes only, not raw metadata or public-key
objects. Default/import/ordinary checker modes do no network or file writes.

Ten local tests include real minimal public signatures for all three packages,
corrupt/mixed inputs, forged/copied proof, key/expiry/active-policy changes,
four-GET synthetic completion, private response/error suppression, size and
aggregate cancellation, and inert/invalid CLI selectors. The collector's later
failure-suppression/MIME refinements are locally tested, not represented as a
second live observation or a current-source image/whole-build proof.

Primary references read: [npm signature specification](https://docs.npmjs.com/about-registry-signatures/)
and [official public key set](https://registry.npmjs.org/-/npm/v1/keys).
[Prior separate coverage](PHASE12_RUNTIME_SIGNATURE_COVERAGE_2026-10-15.md)
and [installed-byte proof](PHASE12_RUNTIME_PACKAGE_BYTES_2026-10-15.md) retain
their own scope and date; none is replaced by this smaller observation.

The ordinary checker adds just this zero-action plan, bringing the resumed
total to 81 ordered steps / four groups / concurrency two / 360,000 ms. All
image MEDIUM/LOW, source/legal, provider/IAM, browser/hosting, CI and publication
decisions remain separate. GitHub publication is still deferred by the user.

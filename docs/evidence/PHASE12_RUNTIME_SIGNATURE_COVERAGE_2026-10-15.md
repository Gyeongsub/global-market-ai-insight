# Declared-runtime registry signature coverage — 2026-10-15

Reporting-only public metadata evidence. No new package, dependency version,
lockfile, artifact, IAM/resource change, application request, upload or public
release. This is not publisher/build/source provenance or a vulnerability scan.

## Measured scope

One explicit run made 38 fixed public GETs: the official npm key set plus one
metadata record for each of 37 reviewed declared-runtime components. Metadata
bytes: 119,445; no package archive was fetched or extracted. The shared network
phase is limited to 60 seconds, 100,000 bytes per metadata record and 2,000,000
aggregate metadata bytes, with no retry/redirect/credentials/referrer or private
package coordinate. Defaults/ordinary whole checks do zero requests.

The exact reviewed lock and runtime BOM are required before any request:

- Lock SHA-256: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- BOM SHA-256: `b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
- This observation's full runtime-source metadata SHA-256:
  `8092d189d8333cfc5d1cf73996f850c12e6c2f765c3060fecc56e611ed212ae4`.

Before/after manifests and both exact declaration/peer graphs agreed for that
run. The subsequently added package-task alias changes whole-manifest metadata,
not the lock or component graph; do not reuse this source hash for that later
manifest revision. The 37-component/169-edge BOM is a declared superset, not
proof of every emitted module, installed package byte, development graph or OS.

## Result — NOT all verified

34 component metadata signatures verified with the separately reviewed active
registry key. Three components use a key outside that active-key review:

| Package | Locked version | Result |
|---|---|---|
| `mnemonist` | 0.38.3 | unreviewed-signing-key; unverified |
| `obliterator` | 1.6.1 | unreviewed-signing-key; unverified |
| `tslib` | 2.8.1 | unreviewed-signing-key; unverified |

`allRegistrySignaturesVerified` remains false. This does not by itself identify
malware, a vulnerable version, an invalid historical signature or a legal
violation. No key is automatically trusted and no package is automatically
upgraded. Historical-key/expiry/source obligations require separate evidence.
Even a fully verified registry-signature set would not authorize release.

Missing signatures are distinct from unreviewed keys. Malformed metadata,
duplicate signatures, foreign sources or invalid reviewed-key signatures fail
the collection; an unreviewed additional key cannot hide a corrupt reviewed-key
signature. Unknown coverage never becomes a success count. All partial outputs
and raw remote errors are suppressed if the bounded observation fails.

[Narrow registry key/signature and archive scope](PHASE12_REGISTRY_SIGNATURE_AND_ARCHIVE_2026-10-15.md).
That separate three-package proof fetches archives; this 37-component metadata
report does not. npm's [signature specification](https://docs.npmjs.com/about-registry-signatures/)
and [provenance guidance](https://docs.npmjs.com/viewing-package-provenance/)
describe distinct trust claims. No repository field, publisher, source commit,
build attestation, vulnerability or license approval is inferred here.

Ten new local tests cover a known real public signature; absent and unreviewed
keys; corrupt signatures mixed with unknown keys; wrong identity/integrity/URL;
malformed/duplicate signatures; complete all-unknown synthetic coverage; response
limits/encoding/redirect/cancellation; aggregate limits; default/CLI/root refusal.
Synthetic completion is explicitly not live registry coverage or authorization.

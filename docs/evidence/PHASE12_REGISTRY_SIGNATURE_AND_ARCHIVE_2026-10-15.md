# Registry signature and package-archive boundary — 2026-10-15

Local/read-only supply-chain evidence, not publisher/build/source provenance,
complete license compliance, deployment or publication approval. No dependency
version or lockfile change, install, extraction, downloaded code execution,
AWS mutation or GitHub upload is part of these operators.

## Exact public package scope

The three previously missing-document packages remain fixed:

| Package | Version | Archive SHA-256 | Regular entries |
|---|---|---|---:|
| `@aws-sdk/credential-provider-http` | 3.972.72 | `2fdfd740abe32d1bf93fd12fe3bc7aecdf253b56ed00de36555178b6eb681a53` | 27 |
| `@aws-sdk/credential-provider-login` | 3.972.77 | `c8f4051ea210213c7bf60fc0c4e757e295c5e33ea3addc1ef98b678690661234` | 15 |
| `@aws-sdk/nested-clients` | 3.997.44 | `bfadc489d5343dc2908b9bb8c0a462d85fbca0ed6a41f7cf73b7c67ed5303951` | 357 |

Official metadata and lock SHA-512 agree; lock SHA-256 remains
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
All 399 observed package headers use USTAR. Their root LICENSE/NOTICE documents
remain absent. None of these metadata responses advertises `gitHead` or build
attestations. This is not proof that provenance cannot exist elsewhere; no
guessed Git tag/current repository license is promoted to an exact-version
mapping, and missing root documents are not automatically labelled a violation.

## Narrow cryptographic claim

The [npm signature specification](https://docs.npmjs.com/about-registry-signatures/)
defines the signed name/version/integrity message and the fixed public-key
endpoint. The current reviewed key is pinned by its SPKI SHA-256:
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
It was obtained from the [official key endpoint](https://registry.npmjs.org/-/npm/v1/keys).
The published registry key ID is a separately matched identifier, not a claim
that its text equals a digest of DER/SPKI. The selected key must retain its
reviewed bytes, EC P-256 algorithm and null expiry; rotation/expiry requires
review, not an automatic new trust anchor. Other malformed key records fail.

Node's verifier accepted both distinct current registry signatures for each of
the three exact locked archives. This authenticates only the signed package
identity/integrity with that reviewed registry key. Repository/license metadata,
publisher authorship, upstream source commit, build process, vulnerabilities and
legal obligations are NOT authenticated by that signature. The key endpoint is
the same HTTPS registry trust source, not an independent publisher trust chain.
See npm's separate [provenance guidance](https://docs.npmjs.com/viewing-package-provenance/).

The reusable signature operator is zero-action by default. Its explicit public
mode is at most seven fixed GETs (one key set, three metadata, three archives),
with a shared 60-second bound and no redirect, credentials, referrer, private
package coordinates, installation or output file. Lock drift fails before
network and again before the result. Raw metadata/signatures/paths are not in
its result. Ordinary whole checks run only the plan and local guards.

## Archive and transport correction

The shared package inspector now accepts the observed regular-file USTAR subset
only, with exact magic/version and no GNU/PAX/legacy prefix borrowing. Header
string tails, checksum/size numeric encoding, regular link fields and unused
padding fail closed. Leading BOM/invalid UTF8 cannot normalize a manifest into
evidence. It still checks archive integrity, bounded gzip expansion, entry/path
uniqueness, padding and termination without extracting or executing files.
Synthetic archive fixtures now declare their actual USTAR format explicitly;
no real-parser assertion was removed or relaxed.

Both public package transports omit credentials/referrers and cancel unread
streams even when status, declared size or redirect validation fails. The fixed
Vite 8.2.1 and Rolldown 1.2.3 public archives also passed the stricter reader,
with their exact local manifest/full notice bytes matched (36 and 54 entries).
This does not verify native generated helper origin or full distributed rights.

Thirty-five focused local tests passed: real PUBLIC signature fixtures, changed
identity/integrity/signatures/keys, expiry/rotation, forged proof, bounded key
responses, cancellation, unsupported CLI input, archive formats and hidden
bytes, valid prefix and invalid manifest encodings. Those are not a complete
whole-check/frozen-install result; later source-specific results are separate.

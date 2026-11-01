# Phase 12 — integrity-matched published package document proof

Date: 2026-10-04, Asia/Tokyo. Public read-only provenance work; no install,
archive extraction, package execution, cloud call or upload.

The three root-document gaps from the
[2026-10-03 attribution review](PHASE12_RUNTIME_ATTRIBUTION_2026-10-03.md)
were checked against each exact npm version's public metadata and tarball.
Registry SHA-512 declarations and downloaded bytes both match the existing
lockfile integrity, whose SHA-256 remains
`d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.
The package manifests agree on identity/version/Apache-2.0. The registry
repository is AWS's official SDK repository. All three metadata records have
no `gitHead`, so this does not prove a precise source commit or supply missing
license/NOTICE texts.

| Exact package | Regular tar files inspected | Root license/notice/copyright documents | Compressed SHA-256 |
| --- | ---: | ---: | --- |
| `@aws-sdk/credential-provider-http` 3.972.72 | 27 | 0 | `2fdfd740abe32d1bf93fd12fe3bc7aecdf253b56ed00de36555178b6eb681a53` |
| `@aws-sdk/credential-provider-login` 3.972.77 | 15 | 0 | `c8f4051ea210213c7bf60fc0c4e757e295c5e33ea3addc1ef98b678690661234` |
| `@aws-sdk/nested-clients` 3.997.44 | 357 | 0 | `bfadc489d5343dc2908b9bb8c0a462d85fbca0ed6a41f7cf73b7c67ed5303951` |

Thus the observed local gaps also exist in the integrity-matched published
archives; reinstalling identical tarballs would not provide those root files.
This is a root-document presence result, not proof of every nested file's
rights, legal noncompliance, a vulnerability verdict or legal approval. Keep
backend attribution incomplete. Do not borrow another package's general
Apache document or modify the installed dependency store to bypass the gate.

`scripts/published-license-proof.mjs` defaults to zero network reads. Its
explicit public-metadata mode permits six fixed registry requests only for
these three pinned versions. Redirects or alternate repository/tarball URLs,
wrong identity/license/integrity, oversized responses, corrupt gzip/tar,
bad checksums, unsafe or duplicate paths, links, unsupported archive entry
types and incomplete endings fail closed. Maximum compressed/extracted bytes
are 2 MB/10 MB, at most 2,000 regular entries, with a 20-second request timeout.
Nothing is extracted or saved. Output contains hashes/counts, never document
content, private source paths, credentials or provider data.

Seven local tests passed, including checksum/truncation/link/expansion limits,
fixed destination validation, root versus nested scope, zero-network CLI
defaults and mock-network failure/redirect/stream-size checks. The normal
project check runs only the offline plan and these tests.
Changing a package version requires a new review; this is not a generic fetch
or install facility. Exact-source/legal attribution remains a release gate.

Public sources: [HTTP provider version](https://registry.npmjs.org/%40aws-sdk%2Fcredential-provider-http/3.972.72),
[login provider version](https://registry.npmjs.org/%40aws-sdk%2Fcredential-provider-login/3.972.77),
[nested-clients version](https://registry.npmjs.org/%40aws-sdk%2Fnested-clients/3.997.44),
[AWS SDK source repository](https://github.com/aws/aws-sdk-js-v3).

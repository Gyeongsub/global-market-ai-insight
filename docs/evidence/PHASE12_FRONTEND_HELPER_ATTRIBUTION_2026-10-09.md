# Frontend helper attribution — 2026-10-09

Local/public-package evidence only. No hosting, deployment, repository upload,
cloud configuration change or legal approval follows from these checks.

## Bound inputs and conservative notices

The collector retains React/React DOM 19.2.8 and Scheduler 0.27.0's complete
runtime license documents and adds the complete producer documents for the
exact Vite 8.2.1 and Rolldown 1.2.3 installation. It checks package identity,
importer/snapshot pins, integrity, physical pnpm confinement, repository and
document bytes. MIT producer metadata does not relicense bundled third parties.

| Document | Bytes | SHA-256 |
| --- | ---: | --- |
| Vite LICENSE.md | 112425 | `387dd7baa307083401a27c58c362c30832f5ba1dba84f10cc22c33401523f45c` |
| Rolldown LICENSE | 1302 | `23ecfff35a5a2e80d92142f75228912c3b1abc4b5a8337a821ff4397e2f9f734` |
| Rolldown THIRD-PARTY-LICENSE | 2209 | `a877291d800ed43692f3f9ae09d8e01cc6f7293ad39d43896059c188ffbb8b7c` |

Full third-party text and copyright lines are preserved, not summarized away.
The generic runtime collector accepts no arbitrary document path: its optional
extra filename is only the fixed THIRD-PARTY-LICENSE. New helper consumers use
the composed collector; the old declared-runtime diagnostic remains narrower.

An explicit four-request proof read the two exact official npm metadata records
and integrity-matched tarballs in memory. No archive was extracted, installed or
executed. Installed manifest/document bytes matched. Vite's archive contained
36 regular files, Rolldown's 54. Bounded tar parsing rejects unsafe paths,
duplicates, nonregular entries, invalid checksums/UTF-8 and invalid end padding.
The initial proof used the earlier lock snapshot; the later
[exact single-package lock correction](PHASE12_DEPENDENCY_ADVISORY_RECHECK_2026-10-09.md)
left both producer package records/integrities unchanged.

## Generated modules are not exact native-source proof

Compiler metadata records only two recognized fixed helper labels. It recaptures
their bytes at bundle write, refuses a changed producer/helper set, and checks
actual chunk bytes. No source/module IDs or absolute workstation paths are
serialized. Unrecognized helpers fail closed.

| Helper | Rendered bytes | Rendered SHA-256 |
| --- | ---: | --- |
| rolldown-runtime | 161 | `c4411ac2dc26cbd98f4bb3cb561cd7556cd40be8c02963210d90743def7d440e` |
| vite-modulepreload-polyfill | 1205 | `ea1ff0400b4ae1d83286c7965bfeebb8037a64b26f87ed89a91b1bbd9a9b907d` |

Vite's available source metadata is 1356 bytes, SHA-256
`dd838b55e315f155e8a0093fdc4a80b2da5f069c433fc49a15b9962807791374`.
Rolldown runtime source metadata is unavailable and remains null. Neither
publisher declares gitHead here. Complete producer notice coverage is a
conservative attribution improvement, not a mapping to every exact native
source or legal clearance. Origin/complete legal approval stay false.

## Written artifacts and checks

After the source-map correction the fixed five-file frontend allowlist passed:
HTML, one JS, one CSS, sanitized social image and THIRD_PARTY_NOTICES.txt.
The complete notice artifact is 119940 bytes, SHA-256
`11f80c674f3e19860a37e1ed4bb426e26d6a7bbf95b27657b434e4039898f10b`.
The JS remains 223132 bytes, SHA-256
`c1375e06f77dbe521569ef96b303d78e634936c2bcd782c85aa38dceb27d2d3c`.
No source map, credential, private path or internal endpoint was found by the
bounded artifact gate. The social-image source/provenance remains untouched;
only the built public candidate is metadata-stripped.

The focused helper/runtime/module suite had 67 tests: 66 pass and one Windows
file-link privilege skip. It is not the later full source snapshot proof.
The initial independent frozen install passed 798 tests (797 pass/one skip)
before subsequent advisory/declaration changes. The final full proof belongs
in the dated safe-stop record, not in a recycled earlier source hash.

Three exact-version backend package documents, complete development/container
OS/source attribution, image/privacy rights and publication review remain open.
See [release gates](../FRONTEND_RELEASE_GATES.md).

# Phase 12 lock-aligned license metadata — 2026-10-03

Local metadata inspection only: zero network/AWS calls or installation scripts;
no dependency/lockfile update. `pnpm audit:license-metadata` uses installed
js-yaml 4.3.2 and bounded regular manifests confined to the physical local
pnpm store. Exact lock name/version matching, duplicate-expression agreement
and missing/conflicting metadata checks are mandatory. Author/contact/private
path fields are omitted.

- Locked identities: **391**; matching license metadata: **342**.
- Missing/conflicting: **49**, all missing installed manifests in this run,
  including other-platform esbuild/rolldown/lightningcss bindings and fsevents.
- Complete lock metadata: **false**; publication ready: **false**.
- Lock SHA-256: `d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.

| Expression | Available count |
| --- | ---: |
| MIT | 259 |
| Apache-2.0 | 55 |
| ISC | 11 |
| BSD-2-Clause | 7 |
| MPL-2.0 | 3 |
| BSD-3-Clause | 2 |
| 0BSD | 1 |
| BlueOak-1.0.0 | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |
| Python-2.0 | 1 |

All five direct runtime identities are represented: three AWS SDK clients
(Apache-2.0) and React/React DOM 19.2.8 (MIT). The backend's 34-package gate is
not the entire frontend/development inventory.

BlueOak-1.0.0, CC-BY-4.0, MPL-2.0 and Python-2.0 remain manual expression/notice
review items. The tool does not interpret legal obligations, select a dual-
license branch, inspect distributed attribution/source requirements or grant
publication approval. Dual expressions are retained exactly, not relabeled MIT.
The older generic metadata list is not this lock-aligned/current count.

Complete relevant package texts, final release-platform install, actual-
artifact notices, current advisory/exact-image checks and original image/SBOM/
privacy/history review remain required. No GitHub upload was performed or
authorized by this inventory or a clean secret-pattern scan.

## Root-level license/notice document evidence

The same read-only tool now confines candidate package roots and regular
license/notice documents to the physical installed store. A linked root/file,
empty/oversized document, nested selected directory or conflicting peer hash
is not silently treated as inspected. Maximums are 1,000 root entries, sixteen
selected documents and 500,000 bytes per regular document. Reports retain only
document kind, byte count and SHA-256, not text, author/contact or private path.
This is deliberately **root-level only**, not a recursive attribution audit.

- Package roots inventoried: **342 of 391** exact lock identities.
- Identities with a verified root license file: **330**.
- Identities with a root NOTICE file: **6**.
- Without a verified root license file: **61** — the 49 unavailable manifests
  plus twelve installed packages with no selected root license file.
- All five direct runtime dependencies have a root license document.

Absence of NOTICE is **not** classified as a legal violation. Presence or a
hash does not validate the declared expression, copyright, attribution/source
requirements or notices in a shipped artifact. Legal review, distributed
notice completeness and publication readiness remain false.

The independent 34-package backend gate was also hardened: dependency identity,
physical store scope, bounded regular metadata and malformed/unreviewed license
values fail closed. It never follows a dependency to unrelated parent storage,
and its CLI suppresses raw private paths/metadata on failure. This does not
broaden the reviewed allowlist or claim the frontend graph is included.

Seven document-proof tests and six backend-gate negative tests passed, alongside
the six metadata tests. No network/install/registry lookup or package execution
was required by these inventories. The locally installed YAML reader remains
the explicitly pinned dependency described above.

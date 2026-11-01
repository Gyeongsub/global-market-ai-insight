# Lint-only Zod security refresh — 2026-10-24 Tokyo

No cloud mutation, provider/model/Fargate job, image push, public hosting,
subscription, Git workflow/remote/staging/commit/push or publication.

## Actual discovery and upstream scope

The fixed 392-coordinate official npm query at **2026-10-23 21:02:56.801 UTC**
(October 24 Tokyo) returned one HIGH match: Zod 4.4.3,
`GHSA-mrhx-c7xc-m3w5` / `CVE-2023-54404`. The declared 37-component runtime
had no match. This is the lint chain `eslint-plugin-react-hooks` → Zod, not a
worker/browser runtime dependency. It is not evidence of compromise or a
justification for ignoring development-tool risk. The preview was already closed.

[The reviewed advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
was updated October 23 and identifies 4.6.6 as fixed. The maintainer's
[merged fix](https://github.com/colinhacks/zod/pull/6652) and
[source change](https://github.com/colinhacks/zod/commit/a0ebf97) describe checking
constrained collection sizes before walking elements. We did not run an OOM
or million-element exploit on this PC. This does not assert that an unconstrained
schema imposes an application input limit.

## Exact minimal repair and review

`pnpm-workspace.yaml` overrides **only `zod@4.4.3` to 4.6.6**. No direct dependency
or unrelated package update. The public metadata declares MIT, the same
`colinhacks/zod` repository and no runtime dependencies. Fixed official tarball
SHA-512 matches the new lock. Pure archive inspection found 840 regular files;
root LICENSE 1,072 bytes, SHA-256
`3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8`.
Archive SHA-256 `312553620ac82cbb25d505100fbb41c1e219b3cd6979cf93c3a1b4dd5b79e039`.
The initial review observed signature presence only. A later two-public-GET
check at **21:22:16.457 UTC** independently verified one registry signature
against the existing pinned active npm key and exact locked identity/integrity.
This is not publisher signature, signed repository/source-commit/build provenance
or legal approval; those booleans remain false. No key/trust policy was changed.

The lock replaces one identity and retains **392 total**. All 391 shared
integrities and both importers are unchanged. The existing Zod-validation-error
peer record and its/react-hooks snapshots resolve the replacement consistently;
their package integrities are unchanged. Old lock SHA-256
`375f6bd61b89fedaf8f305daa42d29899c648e4c13c09ef885c2867aa91e9d2c`;
new lock `f4eda72802c41606a4b8a6ca5d59770ad3ed8e8c13351c7d9e7740878a1d11d6`.
The original 127,964-byte lock recovery copy is retained in ignored history at
`outputs/history/pnpm-lock_before_zod_20261024.yaml`; its hash was independently
rechecked before the owned tool/store directory was removed.

Exact pnpm 11.16.0 was SHA-512/archive checked, then used with a fixed public
registry, projected environment, no private user/global registry config and
`--ignore-scripts`. The current installation's frozen reconstruction completed
successfully in 87.5 seconds with 342 platform-compatible packages. The tool's
temporary store is owned and removable; no user/global cache prune is permitted.

Two small installed-code tests verify the lint package resolves 4.6.6/MIT and
that `.max(1)`/`.length(1)` reject four strings before element callbacks, including
async parsing. Within-limit input still validates. No input larger than four
items is used. These checks are not exhaustive upstream security acceptance.

The 37-component/169-edge runtime SBOM remains byte-identical, 20,638 bytes,
SHA-256 `b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
All three retired-key targets and fixed compiler/AWS SDK target records retain
their exact identities/integrities. Lock bindings were updated only after that
review. Expired-key distrust, signature/source/legal limitations and negative
checks remain intact. No unchanged external signature/image proof was rerun
just to manufacture a new pass.

## Post-repair observation and limitations

The first post-change query was correctly blocked **before network access** by
the old reviewed-lock binding. It is UNKNOWN, not a zero-match query. After exact
coordinate review/rebinding, the actual fixed query at **21:09:52.336 UTC**
returned **zero advisories/matches** for 392 identities, including 37 runtime.
Coordinate SHA-256 `1d5de80d698720f09c579580599632e7f5a9d3df41d0b52dc740291e277510e8`;
response SHA-256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
Only public names/versions were sent, not code, private package-tree metadata,
credentials, account identifiers or user files. This is a dated registry snapshot,
not a current image/OS scan, universal clearance or a future guarantee.

Final changed-source whole/frozen verification and independent cleanup are
separate and belong in [today's safe-stop record](LOCAL_SAFE_STOP_2026-10-24.md).
Retain worker MEDIUM 23/LOW 8 and all original Maintenance, rights, authentication,
TLS/billing, native/source/licenses, privacy/history, clean-clone/CI and final
publication gates. No new AWS rollout is authorized by this development fix.

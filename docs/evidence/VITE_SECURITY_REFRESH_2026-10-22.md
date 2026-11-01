# Vite development-tool security refresh — 2026-10-22 Tokyo

No public hosting, GitHub upload, cloud mutation or live provider/model job.
This follows the separate [Node/CA repair](WORKER_CA_REMEDIATION_2026-10-22.md).

## Discovery and containment

At **10:46:10.973 UTC**, one fixed npm bulk query for the previously reviewed
391 public identities returned six matching Vite 8.2.1 advisories: one HIGH,
four moderate, one low. Declared runtime 37 identities had no matching entry.
No long-lived development server was running. This is not evidence of an
observed compromise or a reason to disregard development-only risk.

Upstream advisories identify 8.2.4 as a fixed 8.2-line version:

- [Windows editor path bypass](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm)
- [Windows command escaping](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv)
- [Editor argument interpretation](https://github.com/vitejs/launch-editor/security/advisories/GHSA-r825-w8mm-5pxw)
- [Cross-origin middleware script](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw)
- [Filesystem allow-boundary bypass](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)
- [Wasm error prefix disclosure](https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg)

These were published earlier and updated October 20/21, not all first published
today. The [official 8.2.4 release](https://github.com/vitejs/vite/releases/tag/v8.2.4)
and public npm artifact were reviewed; no arbitrary exploit was run on this PC.

## Minimal release-line update and explicit coordinate review

Vite is pinned to **8.2.4**, not a new minor/major. Its compatible compiler range
resolved to exact **Rolldown 1.2.14**, with Oxc types 0.154.0 and fixed platform
bindings. The lock changes 17 old coordinates into 18 new ones: **392 total**.
All shared package records/integrities, backend and frontend production importer
dependencies are unchanged. No unrelated package update or private resolution.
The new lock SHA-256 is
`375f6bd61b89fedaf8f305daa42d29899c648e4c13c09ef885c2867aa91e9d2c`.

Before installation, all 18 new public coordinates were checked against exact
npm identity/integrity, MIT declaration and the Vite/Rolldown/Oxc public source
repositories. Signature fields were present, **not independently verified by
that review**. Fixed pnpm 11.16.0 was separately SHA-512 checked; user registry
credentials/configuration and lifecycle scripts were not used. The current
project's managed node_modules was reconstructed by frozen/ignore-scripts
installation; original source and user Docker images/volumes/caches remain.
The previous lock was kept in the task-owned ignored tooling directory until
closure; the old digest and exact change are recorded here for recovery review.

Frontend setup/config also enforces the supported Node security baseline.
Loopback-only host, strict ports, fs allow/deny, no dotenv/env-prefix exposure,
fixture headers and all existing HTTP checks remain; no security exception was
added to fix the advisories. Native/generated-source and licensing review are
still independent requirements.

## Post-update observations, not a universal clearance

At **10:58:48.845 UTC**, one reviewed 392-coordinate npm bulk query returned
**zero advisories/matches**, including the 37 declared runtime identities.
Response SHA-256 `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`;
coordinate SHA-256 `76d182638141129bbf821492558bfaba64d1b63ce18768e9a27c0acbc4a9abdc`.
Only public names/versions were sent, not source, project trees or credentials.
This is a dated registry result, not an image/native/source scan or future
guarantee. Worker OS MEDIUM 23/LOW 8 remain separately recorded.

Four additional fixed public reads matched the installed Vite/Rolldown manifests
and all three whole producer notice documents against integrity-bound archives.
Vite tarball SHA-256 `1d132a84f4980b2cbb15e1c1c78728aed90f5eb81c70791ed0cf133a1211139a`;
Rolldown `9c142fca1d5bfb9c9a6b58a3da16db75d9d30f3e6f8778d94a75b976c806e53d`.
The notice bytes/hashes are unchanged, not replaced with generic MIT text.

Local metadata: 342 installed declarations, 50 absent/conflicting-platform
records. Fifty bounded public metadata reads matched the latter declarations
to their locked integrities; this completes mixed-source declarations only.
Root license files: 330 identities; NOTICE files: six; **62 identities lack a
verified root license file**. The three previously missing AWS SDK package
documents remain missing. No full legal/native/publisher-provenance approval.
The declared-runtime SBOM is still 37 components/169 edges/20,638 bytes, SHA-256
`b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
Original historical SBOM/PNG were not read-rewritten or published.

## Verification failures are retained, not waived

The first frozen run `6ed9e799-17e9-4283-a2dd-c455454d269b` failed at step 65
(JS helpers), without timeout. It is not a successful final proof. Independent
OS-capable reproduction isolated one stale pre-security-update Dockerfile
comparison hash; both exact current-file and exact one-COPY removal assertions
remain, updated to the reviewed new bytes. A separate restricted reproduction
also hit Windows junction EPERM; no host policy, test skip or assertion was
changed to evade that limitation.

After the Vite update, exact-count fixtures correctly failed for 392 versus391
and 50 versus49. They were updated to the reviewed complete counts, with extra
exact Vite/Rolldown assertions. The retired-signature collector's lock binding
was refreshed only after verifying its three target identities/integrities and
the 37-component SBOM were unchanged. The expired key remains untrusted under
current policy; its expiry, timestamp uncertainty and negative tests are intact.
Final whole/frozen/image/closure evidence must be recorded separately.

Final frozen run `696897d1-e9e5-4863-9869-c0d83ce0459d` reached step 85
(frontend contracts) and failed without timeout/buffer overflow after 357,419 ms.
Its copied source matched the final image's 588-file fingerprint. Two frontend
notice expectations still used Vite 8.2.1/Rolldown 1.2.3; exact assertions were
updated to 8.2.4/1.2.14, not weakened. OS-capable frontend tests then passed
62/62, and separate release inventory/plan plus 33 HTTP checks passed with
servers/fixtures closed. Restricted reproduction's junction EPERM is a separate
environment limitation, not ignored or resolved through a host policy change.
The final whole/frozen success remains unverified; no new unchanged run was
started near the allowance reserve. [Safe stop](LOCAL_SAFE_STOP_2026-10-22.md).

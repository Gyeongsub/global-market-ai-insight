# Worker CA advisory and fail-closed evidence — 2026-10-21 Tokyo

No AWS resource/IAM mutation, real provider/model job, image push, hosting,
subscription or publication. This is discovery and execution prevention, **not
a completed certificate remediation or clean current-image acceptance**.

## New advisory, not a missing CVE to ignore

The current image scan reports `DSA-6572-1` for `ca-certificates` installed
`20250419`, with `20250419+deb13u1` advertised as fixed. Its severity is
**UNKNOWN**, not LOW, zero or a guessed HIGH. Scanner status `fixed` means a fix
is available in this record; it does not mean the installed version is fixed.
The official [Debian tracker](https://security-tracker.debian.org/tracker/DSA-6572-1)
and [October 20 announcement](https://lists.debian.org/debian-security-announce/2026/msg00487.html)
were separately fetched anonymously and confirmed the package/version pair.
This concerns compromised CA trust material, not an observed credential leak.

The former coordinate parser accepted only CVE identifiers. It now also retains
strict bounded Debian DSA identifiers, without changing severities, filtering
records or accepting malformed/foreign identifiers. The existing raw image/DB/
inventory/source-coordinate parser is reused; binary/source Debian epoch and
revision reconstruction is shared, not interpreted as version ordering.

The per-build journal now includes only bounded package/version/advisory/status/
fix fields. No raw paths, URLs, titles, descriptions, maintainer/contact fields,
secret matches or scanner report are copied. Fixed private-branded diagnostic
codes and a constrained public identifier can explain failures without logging
arbitrary exception text. Duplicate/count/source/image mismatches fail closed.

## Actual current blocked image

Build observation `worker-6d68a7f7-adac-42f7-aa63-e4a63fdfc59b` and owned session
`worker-session-45c2d4ee-9807-4f1b-a20d-781eb2504bb5` are ignored private receipts.
The latter completed **11:25:36.874 UTC**, explicitly `passed:false`, stage
`build-scan`, after normal owned Desktop stop and temporary-configuration removal.

Strict independent reread confirmed the finite blocked observation, refused the
clean validator, matched both receipts to the then-current source and confirmed
the worker module. Source: **579 files/5,719,295 bytes**, SHA-256
`5d657c063d3afb6d59f38f86018084dce1c827976a66848a89a9c82057e75e5b`.
Image: `sha256:f4b092ef175f7fec97f704872e74944f0652743e2833414dc02905faa558f142`.
Application module remains **1,492,833 bytes**, SHA-256
`f59047dae4177cde1de7be5d9c0652716b0d7d84364865850bfabd3e75421c34`.

Fresh scan: **UNKNOWN 1/MEDIUM 23/LOW 8/HIGH 0/CRITICAL 0/secrets 0**.
There are 32 package/advisory occurrences: 25 distinct CVEs plus one DSA;
duplicates across distinct binary packages remain. One occurrence advertises a
fix, 31 do not. No non-OS vulnerability match was counted by this projection;
that is not complete bundled application/native-source coverage.

Finite blocked observations are deliberately separate from clean acceptance.
`safeWorkerCandidateResult` still refuses them; journals have `passed:false`
and `WORKER_IMAGE_SCAN_BLOCKED`. The owning workflow does not advance to
application runtime, promotion or deployment. **No 45+18+3 runtime acceptance
was performed today**; October 20's historical pass does not clear today's DB.

Six preceding actual attempts remain failed, not successful trials. The first
two did not preserve a precise parser cause, later diagnostics narrowed the
failure to finding identity/ID, and the sixth preserved the actual DSA. A split
version fixture and prior parser were reused during investigation; no evidence
attributes every earlier failure to that field. All owned sessions normally
stopped and retained their receipts. No assertion, scan severity or timeout was
waived to turn an attempt into success.

## Investigated upstream candidate — not adopted

Anonymous GCR metadata selected linux/amd64 manifest
`sha256:27955a746532351a5b6498222a09a6df67624b07b37e6b358918fc2496d31eac`,
config `sha256:ae8bc031e1ceffcb9d0e753c7f7748ada44ffc7d7a02992f393c1875c8da703e`.
Node remains 22.23.3, user 65532, 22 layers. At **11:17:16.098 UTC**, a separate
anonymous 38-request/54,617,227-byte public-layer inspection verified manifest,
config, layer hashes and diff-IDs in memory, without extraction/execution.
Its CA package declaration still says `20250419`, not the fixed package version.

Its base entrypoint also adds `--use-openssl-ca`. The current worker Dockerfile
overrides the base entrypoint, so blindly changing only FROM would discard that
choice. [Node's documented CA-store distinction](https://nodejs.org/download/release/v22.23.0/docs/api/cli.html#--use-bundled-ca---use-openssl-ca)
means OS trust material and the bundled Node store cannot be assumed equivalent.
No active trust-store/handshake, complete certificate-difference or vulnerability
acceptance was established for the proposed candidate. A different digest or
smaller layer is not proof that every relevant trust path is fixed.

The experimental base/entrypoint/validator/fixture edits were **reverted** after
this observation; only task-created experimental helper files were removed.
Original Dockerfile SHA-256 is again
`c0796d5ab202b1db887b46cc3961523a20ad02df0c46ddcfcab5bdaf2c0ba23e`.
No new candidate image was built, pulled as an executable, promoted or deployed.
Existing user images, volumes/caches, original PNG/SBOM and recoverable stopped
socket backups remain. No host Windows trust store/security setting changed.

## Next gate

Keep jobs/display false and circuit OPEN. Obtain/review a correctly fixed
distribution/base and the effective Node CA-store configuration, retain exact
package/artifact/trust evidence, then perform fresh exact-image scan and bounded
offline runtime before considering any cloud rollout. Do not set UNKNOWN to zero,
ignore DSA records, use an old clean receipt, silently mix distributions or add
a VEX/risk waiver to pass. Maintenance 28/31, rights/auth/hosting, native/license,
clean-clone/CI and final privacy/history/publication gates remain independent.
Whole/frozen local verification and final closure are recorded separately.

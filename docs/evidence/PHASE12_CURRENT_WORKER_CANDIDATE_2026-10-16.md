# Current local worker candidate — 2026-10-16

One copied-source local Linux/amd64 build and archive-only scanner completed.
No AWS calls, ECR credential retrieval/push, application container execution,
deployment, hosting, GitHub workflow or publication occurred. This does not
resolve the deployed image/source mismatch or the remaining legal/IAM gates.

## Separate dated scope and safe local environment

The new `--plan-20261016-candidate`/`--execute-20261016-local-build-scan` path has
its own exact UTC-day guard and absent-tag requirement. October 4/12 tags and
their historical expiry/promotion rules were not generalized or bypassed. No
clock, scanner, image identity, ACL or publication restriction was weakened.
The new scope cannot retrieve registry credentials, push, deploy or enable jobs.

Before the build, child environments were hardened to discard inherited Buildx/
BuildKit builder/config/remote-host selection, telemetry/proxy/credential paths,
Node cache/coverage destinations and TLS-disable settings. Only the explicit
local Desktop Linux pipe and an owned empty Docker configuration with the
trusted installed plugin path are used. TLS remains verified; no global user
configuration/security/telemetry setting was changed. Thirty-five focused
candidate/scanner tests and the two strict operator typechecks passed.

## Actual independently reread result

Receipt: `outputs/local-gates/worker-83768a05-ae1a-418e-91ee-78b2a450abd9.json`.
Started 2026-10-16T01:26:13.344Z; completed 01:28:18.162Z, completed/passed true.
The copied source and independent current-source read matched before the later
CLI-test/handoff edits: 492 files, 5,065,560 bytes, SHA-256
`fc11cfef6ca74ca8ca505dd2a884e0401b4eeca6923c89ac464db025615efe7f`.

- Candidate: `gmai-worker:local-20261016-release`, Linux/amd64, user 65532:65532.
- Local image/runtime digest:
  `sha256:6785f39e1e182c633e4e2f588f7814229b7a7be5e88e24eb07281900ed50865f`.
- Config:
  `sha256:b5e3280f6c650cb557255c7276fb7b0a45b2ae7cbac5edc773954eaad234d98a`.
- Export: 54,920,704 bytes; 26 independently hashed blobs.
- Reviewed 22-layer public base descriptor/config diff-ID prefix plus two
  application layers matched. Final layers refused links, whiteouts, redirects
  and wrong ownership; no archive extraction or image execution.
- All three current application files matched. Module: 1,482,376 bytes, SHA-256
  `12ef0692affb3b2657b740997cddaf736802c3cdaf63ecf46dcd660399dc73e3`.
- Fresh database, 14 OS packages: UNKNOWN/HIGH/CRITICAL/secrets 0; MEDIUM 23,
  LOW 8 remain for review. This is not complete bundled application dependency,
  complete OS/source/generated license, publisher signature or live deployment
  coverage. Deployment/execution/publication/promotion readiness remain false.

The result was independently read from disk; current source/copy hashes and
the local Docker image ID/platform/nonroot identity agreed. Running local
containers were zero, the owned scanner was absent and private archive/cache/
copied source were removed. The stopped candidate image is intentionally kept
for inspection, not uploaded or counted as a running workload.

## Docker recovery and stop

The existing vendor installation/signature was rediscovered. With Desktop and
backend stopped, the reviewed helper preserved two fixed zero-byte transient
socket directories as recoverable same-parent backups, scope
`3be02303919e4dbc9fcf4ba6c01e9aca`. Helper source SHA-256:
`0f5cd327aecee063fe7eb546cfb6ce7f77e29037d4a2b2c15349d8c2ebeed071`.
Engine 29.6.2 then started normally. No factory reset, image/volume pruning,
WSL/data-root removal, policy bypass or diagnostics upload occurred. Older
backups/user data remain intact; this is not a permanent upstream bug fix.

After the independent zero-container check, normal Desktop stop completed.
Final independent process/listener/temp inventory is recorded in the separate
safe stop. Later documentation/CLI-test revisions do not inherit this earlier
whole-source fingerprint; current worker bytes were not changed by those edits.

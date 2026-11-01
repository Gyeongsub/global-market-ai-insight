# Worker image recheck — 2026-10-11 resumed session

This is a bounded observation of the existing disabled project image, not a
release, whole-account inventory, legal conclusion or authorization to execute.
No ECR image was pulled or pushed, and no worker/Fargate/Bedrock/provider job was
started. Current-source equality and complete dependency/license coverage remain
independent gates.

## Recoverable Docker startup

The per-user Docker Desktop installation was rediscovered rather than assuming
the Program Files location. With Desktop/backend stopped and zero running local
containers, the existing reviewed preflight moved only two fixed transient
socket directories to recoverable sibling backups:

- `%LOCALAPPDATA%/Docker/run.stale-gmai-f2ebec9988fc44e0828d89998fd57d7c`
- `%LOCALAPPDATA%/docker-secrets-engine.stale-gmai-f2ebec9988fc44e0828d89998fd57d7c`

The preflight verified physical parents, stopped processes, exact known
zero-byte socket entries and both destination paths. It deleted no files and
changed no global settings, image, volume, WSL distribution or security policy.
Its scope was `f2ebec9988fc44e0828d89998fd57d7c`; its reviewed source SHA-256 was
`0f5cd327aecee063fe7eb546cfb6ce7f77e29037d4a2b2c15349d8c2ebeed071`.
Desktop then started hidden and the exact Linux engine reported version 29.6.2.
This is not a permanent upstream fix. The recoverable backups are retained.

## Current source comparison — failed, not waived

The worker bundle was freshly rebuilt from local source without AWS calls.
The existing cached, digest-bound live image was saved to an ACL-verified owned
archive, not extracted or executed. The manifest, image configuration, reviewed
base/diff-ID prefix and two final application layers were checked before byte
comparison of the three fixed application artifacts.

The first execution returned `WORKER_PROOF_SOURCE_BYTES_MISMATCH`. A narrow local
diagnostic change now reports only fixed artifact labels through a branded,
immutable failure packet; it never exposes archive contents, private paths,
cloud identifiers, arbitrary error messages or statement text. Focused worker,
base-identity and cached-archive tests passed 45 cases, and strict checks passed
for all 33 existing operator entrypoints.

The second actual execution still exited 1, now identifying only
`THIRD_PARTY_NOTICES.md` as different. The inspected `main.mjs` and copied Apache
license body matched the current bundle; the whole three-file source proof did
**not** pass. The updated notices must not be rolled back, ignored or silently
excluded to make this check green. Full closing reads were not completed by
these failed executions, so their intermediate observations do not substitute
for the session's independent final safe-stop check.

## One Basic ECR scan — completed

The fixed existing-image operator made 23 AWS calls, including exactly one
Basic scan start and one completion poll. It verified before/after disabled
controller ownership and exact runtime image binding. The completed scan and
source metadata were fresh within the configured 24-hour limit. All reported
Basic severity counts were zero.

Only scan metadata was changed. The registry scan configuration was not changed;
Enhanced/Inspector scanning was not enabled. This OS-oriented result is not
complete bundled application dependency, secrets, source-deployment or license
coverage and does not authorize execution or publication.

## Independent cached archive scan — completed second attempt

The first attempt ended with `LIVE_IMAGE_RESPONSE_INVALID`; no scan success or
specific cause is inferred from that failed result. It ran while the separate
Basic refresh was active, but concurrency alone does not establish the cause.

After Basic completion, the second attempt made 20 AWS reads and no cloud
mutation. It bound the existing image's OCI index/amd64 child/configuration and
54,918,656-byte cached archive, verified 26 hashed blobs, and used the reviewed
cached immutable Trivy image with a fresh database. Results were:

| Independent archive observation | Count |
| --- | ---: |
| OS packages inspected | 14 |
| UNKNOWN / HIGH / CRITICAL | 0 / 0 / 0 |
| MEDIUM | 23 |
| LOW | 8 |
| Detected secrets | 0 |

The scanner used no image pull, Docker socket, source/home/AWS-credential mount,
dependency API lookup or telemetry. Public vulnerability database downloads
were allowed; raw report contents were not printed. The exact owned scanner
container was verified absent and the temporary archive/cache were removed.
This limited archive gate passed, **not** the entire release: complete bundled
application dependency scanning, complete license provenance and current-source
deployment remained unverified; `readyForExecution` and `readyForPublication`
were false. Basic zero findings and independent LOW/MEDIUM findings must remain
separate, dated scanner observations.

## Safe failure-location reporting

After these actual scans, the image-read and cached-scan diagnostic packets were
hardened locally. Fixed trusted image stages now survive through the cached
scanner wrapper; mutable Error text/properties, matching message prefixes,
forged prototypes and hostile proxies cannot reflect private response content.
Internal packets are branded and immutable. The archive, freshness, ownership,
deadline and cleanup gates are unchanged. The failed first scan's old output
cannot be retroactively given a stage or attributed to a particular cause.
The focused image-read/cached-scan/worker suites passed 63 cases, including four
new privacy tests, and strict checking passed all 33 operator entrypoints.
These reporting-only changes caused no additional AWS/Docker scan execution.

## Next boundary

Keep jobs/display disabled and the circuit OPEN. Resolve the current notice
artifact/image mismatch using a reviewed future candidate; do not repush the
old hard-coded patch or redeploy merely because an OS scan passed. The blocked
Maintenance exact-stream IAM acceptance and final privacy/licensing/publication
checks are separate from this image inspection. Session closing facts belong
in a new safe-stop record, not in a borrowed earlier successful shutdown.

# Source-bound offline worker runtime — 2026-10-18 Tokyo

Local-only acceptance scopes are separate snapshots below. No cloud deployment,
image push, real provider/model call, public data display or GitHub publication.
Actual image/container and whole-install observations cannot substitute for one
another or cover later source edits.

## Local candidate scope

The new source-bound namespace uses the current Tokyo day and **entire source
SHA-256** in a local tag. CLI arguments cannot supply another tag, date, source
hash, remote repository or clock override. An existing exact tag is never
overwritten. The copied source, current bundle, archive application files,
reviewed public base prefix and closing source/day must agree. Historical
October 4/12/16/17 tags, expiries, archive-verifier allowlist and private
promotion acceptance remain unchanged. This is not a generic ECR promotion.

The default and whole-checker plans perform zero Docker/AWS operations. Explicit
preparation is at most one copied-source build and one isolated archive scan,
with a fixed ten-minute ceiling and bounded children. Existing images/caches
are retained, not pruned. A later source edit creates a different identity and
cannot inherit the earlier candidate's scan or runtime result.

## Actual-adapter fixture, not actual remote services

An inert synthetic fixture calls the exported production worker lifecycle and
Twelve Data/Bedrock adapters with injected in-memory repository/transports.
Thirty normal combinations cover five symbols, three locales and PRICE/ANALYZE.
The first nine negatives cover expired/slow claim, provider expiry, in-flight provider/
model cancellation, default backoff cancellation, discarded late model output,
duplicate terminal execution and invalid model output. PRICE invokes no model;
ANALYZE invokes at most one. Total mock requests are 37 provider / 18 model
(15 normal analyses + two in-flight cases + one invalid output), not 19.
An initial unit expectation of 19 was corrected to that explicit arithmetic;
no application attempt limit, scenario or assertion was removed.

The host fixture passed both tests and all 39 nested scenarios. Seven operator
guard tests pass: inert defaults/import, bounded command, exact ownership,
isolation, private-field/result refusal, fresh source-bound scan and fixed
fixture program. The original and added candidate/promotion tests all pass.
These host results alone do not establish Linux Node 22 container acceptance.

The later fixture adds two negatives for valid responses arriving after the
individual provider/model adapter timeout: **41 cases (30 normal/11 negative)**,
39 mocked provider requests / 19 mocked model requests. These are local calls
into injected transports, not provider/model service transactions.

## Initial actual container observation, before the later adapter correction

At 00:52:26.122 UTC the initial recorded local build/static scan completed for
source SHA-256 `708b1d9d74d312fe1e46aa4698ec7256c739fd4037d32b79633b0c434c4403fa`
(525 files / 5,339,393 bytes). The 54,922,240-byte archive matched three current
application files and the reviewed base. Its image manifest was
`sha256:83acc807a8bd43599a09c67a2d6a9cd75ca51bfa0c14cabd7b9c35ecdb6625a8`.
Worker module: 1,487,623 bytes /
`a67cbd6a9006d784ce05e90dae682d4624363702b332f07eb765ed31652fee15`.
Fresh scan: UNKNOWN/HIGH/CRITICAL/secrets zero, MEDIUM 23 / LOW 8 retained.

Runtime receipt `8c068407-234c-4675-8013-b35836bb5124` completed at 00:52:54.318
UTC: Linux x64 Node 22.23.3, UID/GID 65532, original 39 cases, exit zero, exact
isolation/ownership and scanner binding. Owned container/archive/config were
removed. At 00:53:07.581 UTC an independent source/two-receipt reread matched;
global running containers were zero and normal Docker stop succeeded. This
image does **not** contain the subsequent individual-adapter timeout fix or
the reusable journal operator; its pass is not reused for that later scope.

## Subsequent reproducible journals and own-adapter timeout correction

A later Docker restart reproduced the user's `dockerInference` socket error.
Normal stop timed out; the installed official `desktop stop --force --timeout
20` succeeded, independently leaving zero Docker processes. The unchanged
stopped-only guard preserved two directories under backup scope
`7fb3f633c06f4ee69fe29b056c4233b6` (source SHA-256
`0f5cd327aecee063fe7eb546cfb6ce7f77e29037d4a2b2c15349d8c2ebeed071`).
No deletion/image/volume/settings/security-policy change. Normal restart then
returned engine 29.6.2 with a bounded read. Preserve backups and use preflight
before every future start; this workaround does not fix upstream recurrence.

`record-worker-candidate.mjs` replaces ad-hoc result recording for future runs.
Its default/import perform zero Docker/AWS/write actions. Explicit execution
uses only the fixed source-bound producer once and creates a random ignored
receipt before any operation. Unknown fields at every result depth, private
exceptions, invalid identities, unsafe findings or incomplete cleanup cannot
be saved as success. Existing/altered initial records are never overwritten.
The runtime journal now applies the equivalent exact finite-field guard.
Six image-journal and eleven runtime-operator tests pass, without Docker/AWS.

Four new adapter regressions first failed: valid late provider fetch, valid
late body, a stale first quote accepted instead of bounded retry, and valid late
model response. Both adapters now reject their own aborted request's response
even if the transport resolves normally. Parent job cancellation still prevents
retry; provider attempts remain capped at three, model at one. The 53 focused
provider/model/operation/lifecycle tests then passed. No remote cancellation or
billing guarantee is inferred. A non-cooperative transport that never settles
still requires independent task stop/sweeper controls; this change discards
late completion, not a forced termination of arbitrary in-process code.

## Explicit container gate

The runtime operator derives its own current local tag; it accepts no caller
image/command/receipt path. Before creation it rechecks the current written
bundles against bracketed source builds, exact archive application/base bytes,
and a successful same-source/image/module scan receipt no older than one hour.
UNKNOWN/HIGH/CRITICAL/secrets must be zero; MEDIUM/LOW are retained, not waived.
Afterward it rechecks image, source, fixture bytes, scan and Tokyo day.

At most one container runs the fixed fixture under Linux/amd64 Node 22,
UID/GID 65532, network none, read-only root, no capabilities/new privileges,
64 PIDs, 256 MiB RAM, CPU 0.5 and a bounded noexec temporary filesystem. No
source/home/Docker socket/credential mount, environment-file or published port.
Create/inspect precedes start; actual isolation and fixed command are inspected
again after successful exit. Client timeout is not cleanup: exact random
name/image/labels must match before stopping/removing an owned container, and
absence plus physical temporary-directory removal must be verified.

Default: `node scripts/worker-runtime-smoke.mjs` (zero actions).
Explicit local build/scan with a durable result and verified Docker path:
`node --import tsx scripts/record-worker-candidate.mjs --execute-source-bound-local-build-scan`.
Then explicit local execution with the same unchanged source:
`node --import tsx scripts/worker-runtime-smoke.mjs --execute-local-runtime-smoke`.
Only the new local namespace is accepted. A durable ignored receipt remains
incomplete until the fixed producer and its cleanup complete.

The fixed 86-step whole checker includes only the three zero-action plans; four
test groups, concurrency two and the 360,000 ms ceiling are unchanged. Container
results are separate from whole-install results and current live-cloud proofs.

## Remaining limits

Even a successful local run is synthetic: no DynamoDB IAM/service transaction,
real market coverage/freshness, remote model cancellation/billing, Fargate
startup/STOPPED evidence, complete notice/source/native/OS attribution or
publication rights are accepted by it. Initial clock and local Docker daemon
are trusted; this is not a malicious concurrent-host sandbox. Keep cloud jobs/
display false and circuit OPEN. The actual runtime/image/frozen/safe-stop
observations for the later corrected scope are pending, not implied by the
initial runtime or focused host tests.

## Corrected-scope observations completed later

The later recorded image and **41-case actual Linux Node 22** runtime both
passed. A genuine frozen install then passed **86 steps / 1,194 tests**
(1,193 pass / one existing Windows privilege skip) in 323,086 ms under the same
360,000 ms ceiling. At 01:12:31.073 UTC all three completed/passed receipts
passed strict validators and independently matched the exact same current
528-file source. [Precise identities/times](PHASE12_LOCAL_GATES_2026-10-18.md),
[independent safe stop](LOCAL_SAFE_STOP_2026-10-18.md). This supersedes the
preparation-stage pending observation above only for that recorded snapshot;
later handoff edits, live AWS release and rights remain separate gates.

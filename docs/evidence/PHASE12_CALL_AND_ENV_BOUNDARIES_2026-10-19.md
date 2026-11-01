# Local call and build-environment boundaries — 2026-10-19 Tokyo

Local implementation only. No deployment, IAM change, circuit mutation, cloud
workload, provider/model call, image push, public hosting or GitHub publication.
Permission, data-rights, image/license, hosting/auth and final privacy/history
release gates remain unchanged.

## Build/test child environment

Three red reproductions found an unrecognized application credential could
survive the previous denylist, including into a real Node child, and direct
check steps inherited the operator environment by default. A shared allowlist
now keeps OS bootstrap paths/locale only, adds fixed metadata/TLS/compile-cache
safety values and rejects malformed/conflicting case aliases. Unknown tokens,
application settings, Git/SSH/proxy configuration, extra CA/key-log/preload/
compiler settings and cloud opt-ins are not inherited. Caller values are not
modified or printed. Explicit source-owned fixture/foundation-only overrides
are added afterwards; no deployment flag is enabled. Standalone service/infra
test entrypoints use the same boundary.

This is not an OS/filesystem sandbox or proof the parent started without runtime
overrides. OS paths and user-readable files still exist. It does not authorize
arbitrary dependencies, code or commands. Existing compiler, source/archive,
network and publication controls remain independently required.

The initial sandbox run reproduced the three new failures, plus six existing
directory-link restrictions/two privilege skips. No assertion or privilege check
was weakened. An authorized local OS-capable focused run passed 48 tests; two
later shape/entrypoint guards belong to the final separate validation scope.

## AWS acknowledgement deadline

Five red application tests reproduced normal-looking responses returned after
the existing abort timers. A controller could launch after late admission
evidence; a worker could begin provider work after a late claim. Reads and
RunTask acknowledgements could also appear successful after expiry.

Controller/worker DynamoDB and controller ECS calls now share a per-call guard.
Existing configured limits and single SDK attempt remain unchanged. A monotonic
clock brackets dispatch/acknowledgement, an uncooperative sender is raced against
cancellation, late completion is discarded, late rejection stays observed and
timer/listener are disposed. Invalid/backwards clocks are timeout/unknown, never
permission to continue. No conditional expression, idempotency token, task scope,
IAM grant, job deadline or public error vocabulary is broadened. Non-finite or
fractional controller repository timeouts are rejected.

Six new primitive tests and six application tests plus unchanged repository/
launcher coverage pass **40 tests**; service TypeScript passes. Synthetic late
admission causes zero task launches and late worker claim causes zero provider/
model calls. These are injected local SDK observations, not actual AWS timeout/
role acceptance, a current container proof or a deployment.

Abort cannot undo an AWS request already accepted. Timed-out admission, claim,
update or RunTask may have committed despite missing timely acknowledgement.
There is no automatic retry, rollback, success claim, slot deletion or invented
task ARN. Existing conditional compensation, terminal checks and independent
operator reconciliation remain necessary. A job/slot without a verified task
reference is retained for review; Maintenance 28/31 is not cleared.

## Whole-proof scopes

Initial environment-only native receipt
`outputs/local-gates/aff52275-4b8f-437a-bcdc-d37c17fb2e26.json` stays **failed**:
360,029 ms/timeout, 82 completed successful timing records, no complete gate or
four-group test proof. Its unchanged 556-file source SHA-256 was
`da44a08b43a7ad4a2c031006e1c83cdfabc9cb9c327366484da2f43d89a3f01d`.
Later call/tests/docs are outside that fingerprint. No test, process isolation,
concurrency or 360,000 ms ceiling was waived. A subsequent frozen-install result
needs its own exact source/result and independent cleanup, not October 18 success.

## Separate cloud observation

The current console session refreshed the same temporary `gmai-admin` profile,
without a new key/role, broader access or MFA bypass. Fixed 11 core/12 reference
reads passed: expected identity/region, healthy base stacks, absent Operations/
AlarmCircuit/Maintenance, jobs/display false, OPEN/version 11 and zero running/
pending tasks, services and occupied slots. All six resource ownerships/private
IAM API routes matched. Reference fingerprint:
`b96088d955a64c1c37a996f7333b47d1587b949423847681b140e80ce57de10a`.

Monthly USD 5 Budget read: actual USD 0/forecast USD 0.007. Console current and
forecast values rounded to USD 0.01. These narrow dated readings are not a hard
cap, invoice guarantee or all-region inventory. Storage/read/delayed fees remain
possible. Closing reads/logout and local residue must be recorded separately.

# Whole local gate investigation — 2026-10-16

No timeout, test, assertion, group or permission boundary is waived. Focused
success is not whole-gate success; each source fingerprint/result is separate.
The fixed ceiling remains 360,000 ms, four test groups and 79 ordered steps.

## First current-installation observation — failed, retained

Durable receipt: `outputs/local-gates/bd686138-55c6-4fc1-9fc2-37dd38d8c21f.json`.
Started 2026-10-16T00:42:21.662Z; completed 00:48:26.901Z. Passed false,
timeout true, bufferLimit false, elapsed 360,030 ms. Source before/after matched:
488 files, 5,022,711 bytes, SHA-256
`fb3c80c8d14081a9266a176c652691f589da6347dea62df4709fae7bbe853d2c`.
Only 74 valid completed timing records existed. Their failure count was zero;
the remaining five steps did not complete, so the whole observation FAILED.

Slow completed steps: infrastructure 110,394 ms; service tests 45,573 ms; lint
40,710 ms; operator typecheck 36,934 ms; MJS tests 26,014 ms; maintenance local
preflight 22,089 ms. Those are observations, not an antivirus/filesystem or
implementation root-cause diagnosis. Later revisions cannot inherit this hash.

## Bounded module-startup investigation — no cache adopted

First observation used three fixed imports, disabled/cold/warm processes:
TypeScript 684/315/309 ms, CDK 157/111/109 ms, ESLint API 3558/1024/1012 ms.
It could not separate earlier/later file warming from compilation caching.

A revised diagnostic used the actual lint configuration instead of only its API
and ended each target with another disabled-cache process. Disabled/cold/warm/
disabled-after observations were TypeScript 267/318/142/242 ms, CDK
91/112/88/89 ms and lint config 2807/6650/2924/2696 ms. Twelve fixed children
completed with no external network/AWS/install. Empty owned caches were removed.
This does not establish an overall speedup: cold lint cache was slower. Therefore
no compile cache is introduced into the whole gate or isolated installer.

[Node's primary documentation](https://nodejs.org/download/release/v24.10.0/docs/api/module.html#module-compile-cache)
distinguishes compiled-code reuse from module execution and cautions about first
load/coverage behavior. The experiment does not claim cached test results,
coverage percentages, source/build provenance or a completed fresh install.

Separate unchanged-rule lint observations passed: the first full lint took
45,261 ms; the later diagnostic had about 902 ms of measured rule time, with
the slowest rule about 596 ms. Different process/file-warming conditions mean
this is not a causal before/after comparison or permission to disable a rule.

## Revised execution and failure boundaries

The service-test collector now refuses linked/redirected directories, invalid
roots, nonregular entries, excessive nesting and caller-selected/skip CLI args,
while discovering every existing and future nested test exactly once with the
original two-file concurrency. Current infra discovery/coverage is unchanged.

Proof child environments discard inherited Node injection/cache/coverage paths
and TLS-disable settings, explicitly retaining TLS verification and disabled
compile caching. This does not change Windows security or persistent settings.

Dedicated Phase 11/Maintenance entries validate scope/config before CDK runtime
imports. The Phase 11 parser is extracted unchanged and re-exported for existing
callers; valid stack builders still revalidate inputs. An isolated no-CDK test
confirms invalid requests return fixed refusals without an assembly or private
value. Existing valid synth/assertions are not replaced by this negative test.

Whole-check TypeScript children now use direct Node `--import tsx`, already
used by the test runners. Only the redundant CLI launcher is removed: entry,
arguments, cwd, environment, order, tests and whole deadline remain. A real
zero-AWS circuit plan matches the old launcher packet; invalid/escaped inputs
are refused. This is not a measured whole-gate speedup or a result cache.

Failed frozen whole gates now retain a private-map-derived observation with the
copied-before-gate public source hash, numeric timings and fixed classifications.
It explicitly does NOT verify unchanged/immutable source or successful install.
Unrecognized/forged exception fields cannot become durable evidence; a cleanup
exception replaces the marked failure and still requires independent closure.
Eighteen focused installer/recorder tests passed, including read-back, private
field suppression and failure remaining failed. Final whole results follow only
after their actual completion and independent reread.

[Application/privacy regression scope](LOCAL_BOUNDARIES_2026-10-16.md).

## First revised genuine frozen result — passed, separate source

Receipt `outputs/local-gates/fresh-f6b3d52c-898a-432f-a73c-c7e3f53766b3.json`
started 00:59:26.019Z and completed 01:06:14.452Z on October 16. It passed all
79 ordered steps/four groups: 1,068 tests, 1,067 pass and one existing Windows
privilege skip. Gate elapsed 299,528 ms; fresh install 74,409 ms. Pinned pnpm
tool archive SHA-256 remained
`3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa`,
891 inspected tool files, 391 locked identities, unchanged lock, no dependency
reuse/lifecycle scripts/private registry credentials/existing-install mutation.

The independently reread receipt and current-source fingerprint matched:
491 files, 5,050,350 bytes, SHA-256
`94f3aa23df194573345b5ec6c7b41486328f55d3d1fbbb4c79c6e047cadaa82a`.
All 79 timings were valid, no failed completed step; infrastructure 71,538 ms,
operator typecheck 38,949 ms, lint 38,691 ms, service tests 35,715 ms. This is an
actual revised-source pass, not a causal comparison with the earlier timeout.
The initial native observation overlapped CLI login/readiness checks; host load
and source differ, so a unique performance root cause is not established.

Thirty-three loopback requests passed, both local servers closed, fixture removed,
AWS/cloud mutations zero and readiness/publication false. Independent normal-
context temporary-directory inventory found zero owned proof trees afterward.
No code cache was adopted. After this read-back, escaped-string privacy changes
were made; that later revision does not inherit this earlier frozen source hash.

## Escaped-string frozen result — passed, separate source

Receipt `outputs/local-gates/fresh-4976c23e-a85a-460c-9b13-520b8e18eace.json`
started 01:12:31.797Z and completed 01:18:48.320Z. The genuine isolated install
passed all 79 steps/four groups: 1,075 tests, 1,074 pass/one existing privilege
skip; install 59,348 ms and gate 284,782 ms. Source: 492 files, 5,061,487 bytes,
SHA-256 `0ce679e6f3e529da63391f3d5d295e5a14edf718c2f008e963a11c462285eaa6`.
An independent receipt/current-source reread matched before subsequent local
candidate-operator revisions. No dependency reuse, lifecycle script, code cache,
AWS call or publication; all 33 loopback checks closed their servers/fixture.

Those later operator-only changes introduce an exact October 16 local image
scope, preserve historical expiries, and remove inherited remote-builder/trace
settings. Their focused 35 tests pass, but they do not borrow this earlier whole
fingerprint. A separately measured final whole result is required. The candidate
build/scan has its own [dated evidence](PHASE12_CURRENT_WORKER_CANDIDATE_2026-10-16.md).

## Final post-candidate frozen result — passed, separate source

Receipt `outputs/local-gates/fresh-8b1f81b1-183c-4ad3-8c3e-558b4dd9b73a.json`
started 01:39:18.305Z and completed 01:45:49.893Z. This final implementation
snapshot passed all 79 steps/four groups: 1,078 tests, 1,077 pass/one existing
Windows privilege skip, no failures/cancellations. Install 61,905 ms; whole
gate 295,801 ms below the unchanged 360,000-ms ceiling. Source: 494 files,
5,079,775 bytes, SHA-256
`7d33060ccc83d9e8100ca60b2bd14e5c2cdc4418a5a823abca7d5d307e119bcd`.
All 79 timings were valid; failed completed steps zero. The receipt was freshly
read, strictly revalidated and matched an independent current-source fingerprint
before later final handoff Markdown. No copied dependency reuse, lifecycle
script, code cache, AWS/Docker/model/provider operation, CI or publication.

All 33 loopback checks passed, servers/fixture closed. External sessions and
Docker had already been closed before this final proof. Independent post-proof
local inventory and final source/link/publication/Git observations are recorded
in [the safe stop](LOCAL_SAFE_STOP_2026-10-16.md). Later handoff-only text receives
its own scans and does not retroactively enter this earlier frozen hash. All
historical failures and distinct successful snapshots remain separate evidence.

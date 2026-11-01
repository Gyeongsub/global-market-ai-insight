# Whole local gate observations — 2026-10-15

Every source revision and result is separate. Focused tests, old frozen installs,
unreturned output, stable source or completed earlier steps are not full success.
No AWS/image/policy/workload change, CI, upload or release follows these checks.

## First native observation — failed timeout, preserved

Independently readable receipt:
`outputs/local-gates/8f1aa8a2-2378-4e6c-add8-19445445241b.json`.
It completed at 2026-10-15T11:00:07.603Z with passed:false, timeout:true,
elapsed 360,023 ms, bufferLimit:false. Source fingerprints matched before/after:
482 files, 4,983,214 bytes, SHA-256
`f60a5e8fa69b707f45077827eca5c9fbd901e5a7ed9c0bd79fbc6298c6d621b7`.

Only 75 of 79 timing records completed. The 75 valid records contained no failed
completed step, but later steps were not completed and the whole gate failed.
Slow measured steps included infrastructure assertions 111,109 ms, lint 53,476
ms, service tests 37,613 ms and operator typecheck 33,201 ms. These are timings,
not proof of a filesystem, antivirus, cloud-probe or implementation root cause.
Normal-context process inspection after completion found no owned check child;
tool-host processes were explicitly preserved. Final closure is separate.

The existing 360,000-ms ceiling, four groups, every test/assertion and two-file
test concurrency remain unchanged. No rerun of identical source is used to hide
this failure. Subsequent empty-error response and primitive-version guards/tests
are later revisions; their complete/frozen observations must be recorded as
new evidence, not attributed to this earlier source.

## Later bounded source revisions

The provider's empty-error-body regression was reproduced as one failed test,
corrected, and the final focused controller/provider run passed 19/19. The pure
registry verifier now requires bounded primitive version strings; coercible
arrays/objects cannot borrow a genuine signature's textual identity. Complete
installation checks below are claimed only when the actual durable receipt and
independent reread are available. Final handoff documents require separate scans
and do not inherit an earlier source fingerprint.

## First isolated frozen-install observation — failed timeout, preserved

Receipt `outputs/local-gates/fresh-fcae0cbd-5fec-45fb-9370-470cbab7c31e.json`
was independently reread: completed:true, passed:false,
RECORDED_FRESH_INSTALL_INCOMPLETE; 2026-10-15T11:03:15.145Z through
11:11:25.472Z. The producer reported a whole-gate timeout at 360,035 ms,
bufferLimit:false, 73 valid completed timing records and zero failed completed
steps. Completed timing sum was 337,923 ms; unfinished work still failed.
Infrastructure assertions took 105,817 ms, operator typecheck 43,857 ms, service
tests 42,744 ms and local guard tests 35,227 ms. No successful full test total,
fresh-install proof or source fingerprint is inferred from this failed receipt.

The pinned install used isolated tooling/store and disabled lifecycle scripts;
public dependency downloads occurred. This does not prove complete build/release
success. Original source/dependency versions were not repaired or upgraded.
Temporary-tree cleanup returned before the failed durable result; independent
final process/directory checks remain required. This later failure does not
overwrite the earlier native failure or become an older snapshot's pass.

## Infrastructure runner revision — no acceptance waiver

A direct Node TypeScript-import runner replaces only the extra CLI launcher and
discovers every infrastructure .test.ts file, including new nested additions.
The current nine files, two-file concurrency, assertions, four whole-test groups,
79 ordered steps and 360,000-ms gate remain. Empty/missing/redirected/non-regular
scopes and caller-selected file/skip arguments fail; import alone runs nothing.
Four new runner tests plus two original service-discovery tests passed 6/6.
This is a coverage/launcher correction, not a promise of any timing improvement
or a diagnosis of the earlier timeouts. Actual group and later whole results
must be recorded separately after completion.

The actual revised direct group completed all nine files/55 tests with 55 pass,
zero failure/skip/cancellation in 100,738 ms, credentials stripped and no AWS.
The earlier observations were 111,109 ms (native) and 105,817 ms (frozen);
different conditions/revisions prevent a causal speedup or future-time promise.
No new code cache, cached test result, longer deadline or reduced assertion was
introduced. The new current-installation whole observation remains separate.

## Final implementation snapshot — native whole gate passed

Receipt `outputs/local-gates/74f25e70-fe76-4c49-9195-c5bc1952c32d.json` completed
at 2026-10-15T11:22:33.401Z with passed:true. It was independently reread twice,
including after the final isolated-install attempt, and matched the root before
handoff edits: 486 files, 5,000,264 bytes, SHA-256
`689f7c6345cac877cd4b47ca7e281e8af2d25168c90c659c88dfc12c9d72ad0f`.
Before/after source agreed; elapsed 314,879 ms under the unchanged 360,000 ms.

All 79 ordered steps/four groups completed: 1,053 tests, 1,052 passed and one
existing Windows-privilege skip. All timing records were valid, failed steps
zero, no timeout/buffer limit. Thirty-three loopback HTTP checks passed with
servers closed and no retained fixture; AWS/external calls zero. This is a
current-installation proof, not a fresh-install, immutable snapshot, dependency
byte, clean Git clone, CI, deployment or publication claim. Earlier failures
remain failed; final Markdown handoff edits receive separate scans.

## Final isolated-install attempt — failed, not borrowed from native success

Receipt `outputs/local-gates/fresh-884a11d2-d369-4bc1-90bd-174d3463f256.json`
was independently reread: completed:true, passed:false,
RECORDED_FRESH_INSTALL_INCOMPLETE; started 2026-10-15T11:23:29.173Z,
completed 11:31:43.705Z. Whole-gate timeout 360,025 ms, bufferLimit:false;
73 valid completed timing records, zero failed completed records, sum 352,972
ms. Infrastructure assertions 107,291 ms, operator typecheck 52,485 ms, service
tests 45,475 ms and local guards 32,267 ms were observed. No full frozen pass or
copied-source fingerprint is inferred from this failure packet. The current
root still matched the native fingerprint after this attempt, before handoff.

Only this command's process environment enforced TLS verification and removed
inherited Node injection/compile-cache/coverage settings before startup. System
configuration, certificates, dependencies, versions and the lock were unchanged.
Pinned public tooling/dependency downloads and isolated store were used with
lifecycle scripts disabled; no private registry credentials were passed. Cleanup
completed before the receipt returned. Independent normal-context inspection at
11:32:51Z found no owned process, listener, proof directory, Docker or AWS CLI
process. This is verified cleanup, not success of the failed build.

Do not repeat unchanged frozen attempts merely to chase a green result. The next
safe local task is a bounded cold-install timing investigation, retaining both
failure records, all tests and the current deadline. Maintenance, provider rights,
image/license, browser/hosting, CI and publication gates remain unchanged.

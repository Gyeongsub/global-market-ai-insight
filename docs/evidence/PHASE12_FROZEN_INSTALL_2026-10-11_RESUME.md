# Frozen install — 2026-10-11 resumed source

This is a separate source snapshot from the earlier October 11 install proof.
The operator uses declared pnpm 11.16.0, verified public package integrity, a
fresh isolated source/tool/store tree, a frozen 391-identity lockfile, no
dependency reuse or lifecycle execution, and no cloud/private registry
credentials. It performs no AWS calls or publication. The full-gate ceiling
remains 360,000 ms; a timeout is failure, not a shortened successful check.

## First resumed attempt — incomplete

The first resumed execution reached the full local gate after the frozen install
phase. The gate timed out at **360,019 ms**, while frontend lint was the final
announced step. It emitted 60 valid completed-step records, with no failed step
among those records and 330,235 ms summed measured work. The longest completed
step (ordinal 58) took 107,414 ms; the strict operator check (ordinal 6) took
47,581 ms. Missing final steps, test-group summaries and HTTP closure are not
filled in from an older proof.

The public failure was `FRESH_INSTALL_GATE_FRONTEND_LINT`, exit 1. No successful
whole-build/fresh-install/current-source release claim follows from reaching
that stage. The owned temporary tree and its explicit proof/child processes were
independently checked absent after failure. No cloud action followed the timeout.

## Narrow duplication reduction

The newly added basic-policy validation input assertions originally synthesized
the same Maintenance CDK template in another test process. They now share the
already-required real synthesis in the original policy-proof test. All original
six-statement/scope/condition assertions and both new full-policy/literal-stream
input assertions remain. The separate negative account tests still fail before
CDK loading. No tests, deadline, assertion, fixture ownership check or live gate
were skipped, relaxed or increased. Only test arrangement changed; cloud
operator execution and policy generation are unchanged.

After the rearrangement, the same 28 focused diagnostic/policy tests passed.
The original integration test now obtains the exact proposed policy through the
validator's real builder and performs both assertion sets on that one synthesis.
Invalid-account tests remain independent. This is not a successful new frozen
install proof; no repeated unchanged frozen-install loop was started.

## Separate current-installation verification

The first current-installation gate exited nonzero after 124,299 ms at the
service/contract group (43 timing records). A separate sanitized diagnosis of
that group reported 626 tests: 623 pass, two fail, one existing Windows privilege
skip. Both named failures exercised directory-junction refusal/cleanup using
owned temporary fixtures; access errors were present. The identical focused
files passed all 35 cases in the normal approved execution context, including
both exact failing tests. No Windows security setting, skip list, assertion,
permission comparator or test source was relaxed to turn them green.

The complete unchanged gate was separately started in that normal execution
context with credential-stripped children and the existing pinned installation.
Its final tool output was unavailable; a subsequent poll reported an unknown
process ID. No completed packet, exit status, exact test count or HTTP success
was recovered. Its result is **unverified**, not passed and not inferred to have
timed out. Independent closing process/port/temp inventory is separate evidence
of current local closure, not evidence of this gate's test outcome. No unchanged
whole-gate retry was started merely to consume a renewed allowance. Even a
successful current-installation result would not be a fresh install or clean
Git clone. These attempts do not authorize a deployment.

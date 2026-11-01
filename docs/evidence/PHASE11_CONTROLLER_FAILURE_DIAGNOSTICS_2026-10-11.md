# Controller failure diagnostics — 2026-10-11

Scope: local failure reporting and unchanged safety comparisons, not a new IAM
rollout, reconstructed historical failure or release approval.

## Why the change is needed

The specifically approved 2026-10-10 correction executed once. Its original
operator failed with `CONTROLLER_ROLLOUT_RECONCILIATION_UNVERIFIED`; subsequent
independent current-state proof is a different observation. The original full
before/after stack-settings comparison and precise primary failure remain
unknown. Do not retry that mutation or relabel the original run as successful.
See [the separate historical acceptance scopes](PHASE11_CONTROLLER_POLICY_ACCEPTANCE_2026-10-10_EVENING.md).

The operator's final cloud/local cleanup could previously replace an earlier
failure. It now preserves three separate, sanitized facts: primary failure,
cloud reconciliation/cleanup failure, and private local candidate cleanup
failure. The report also distinguishes attempted mutations, ambiguous execute
acknowledgement, independently reconciled terminal state, checked terminal
history and verified draft absence. An observed UPDATE_COMPLETE alone cannot
claim that all later comparisons passed.

## Boundaries unchanged

- Default execution still makes zero AWS calls. No live rollout ran today.
- One fresh exclusive policy delta, one create/execute attempt, rollback and
  independent reconciliation remain required. No ambiguous mutation retry.
- Existing main bounds of 145 calls/900,000 ms and reconciliation reservation
  of 50 calls/480,000 ms are unchanged.
- All six original comparisons remain: whole Compute template, actual attached
  policy, resource targets, Foundation template, controller role and captured
  read state. Only fixed scope labels can escape a trusted comparator failure;
  differing values, ARNs, account IDs, snapshots and raw exceptions cannot.
- Unknown/prefix-forged errors become a fixed incomplete code. Exceptions from
  message getters, Error.cause or AWS stderr are not serialized.
- A cleanup failure never converts an operation failure into success or grants
  live-job/publication readiness. Independent safe-stop verification remains
  required even when a structured failure packet is available.

## Tests and honest failure history

Current focused execution passes 47 tests across rollout, policy review and
historical completion-proof files. A fresh strict check of all 33 operator
entrypoints also passes. This tests future failure handling; it does not execute
the historical completion proof's time-bound AWS path again.

The first type-check invocation omitted the required workspace root and failed
before TypeScript; the corrected invocation used the unchanged strict plan.
Two initial scope-regression attempts failed because a fixture's Description
was assigned its existing sentinel value. Captures are now independent and
the test uses a genuinely changed value. Assertions/comparisons were not waived.

New tests cover primary versus final failure, cleanup-only failure, ambiguous
acknowledgement, local cleanup preserving cloud evidence, all six individual
comparison scopes and multiple simultaneous scopes, forged/private exceptions,
throwing message getters and wrong CLI flags. Success payloads containing
private sentinels are not printed when cleanup fails.

A full isolated install/build result must be recorded separately against its
own copied-source fingerprint. The focused tests alone are not that proof.
The [two actual isolated installs](PHASE12_FROZEN_INSTALL_2026-10-11.md) now
record separate intermediate and final code snapshots; final 895 tests are
894 pass/one Windows privilege skip. Later handoff edits remain outside that
hash rather than silently extending its claim.

## Security and next use

No policy, role/trust, runtime, image, circuit, admission flag, schedule or
public endpoint changed today. No source or raw failure packet was sent to a
third party. Maintenance Logs acceptance remains separately blocked.

On a future justified rollout, inspect the fixed stage/scope facts and perform
independent closing reads. Never use diagnostics as a reason to widen policy,
skip a comparison, rerun an ambiguous mutation or enable jobs.

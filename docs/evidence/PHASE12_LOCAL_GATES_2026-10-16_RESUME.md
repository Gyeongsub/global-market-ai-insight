# Resumed whole-scope observations — 2026-10-16

No deployment, cloud mutation, Docker action or Git publication occurred in
these isolated-install checks. The morning results retain their own date/time
and source; no historical source hash is reused for later implementation.

## Earlier resumed snapshot — passed, not the final scope

Receipt `outputs/local-gates/fresh-6c2176d4-d9cf-4a3e-adb1-257f42be670e.json`
ran from 12:47:45.748Z to 12:54:26.818Z. Four groups/81 steps completed with
1,111 tests, 1,110 pass and one existing Windows privilege skip. Install took
66,195 ms, gate 296,848 ms. The independently reread 504-file, 5,175,089-byte
scope had SHA-256
`0faa3e26ca2ce2c45d6217f4748fe298307ef03fcf25d09c1a3f8ec9cae4ed05`.

Review then found the ten retired-key JavaScript tests were not included in the
static helper list. That aggregate was a genuine pass of its recorded steps,
not complete coverage of every test file. It is not the final scope. Bounded
automatic discovery plus two coverage tests now prevent that omission; four
additional source-binding tests cover the later operator protection.
[Scope and standalone source guard](RELEASE_SOURCE_BINDING_2026-10-16_RESUME.md).

## Final implementation snapshot — passed and independently matched

Receipt `outputs/local-gates/fresh-64a9268e-d4c8-485c-843e-fb5614e9ec21.json`
ran from **13:04:05.452Z to 13:12:02.704Z**. It completed all **81 ordered
steps/four test groups**, **1,127 tests: 1,126 pass, one existing Windows
privilege skip**, with no failed step. Test concurrency remains two.

The strict receipt validator accepted the saved result, then an independent
current-source reread matched exactly, before any final handoff edits:

- Files: 507; bytes: 5,186,856.
- SHA-256: `3c975b675a1578206ca69275618e1277baa7002fea18e03972d4afb757ba51d1`.
- Fresh install: 78,113 ms; gate: **358,528 ms** against the unchanged 360,000 ms
  whole-gate limit. This leaves little timing margin; it is not a performance
  improvement or permission to raise deadlines, omit tests, add a cache or
  reuse dependencies. The slowest measured step was 92,647 ms.
- Pinned pnpm 11.16.0; 891 tool files; 391 locked identities; tool SHA-256
  `3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa`.
- Lock unchanged; no dependency reuse, lifecycle scripts, private registry
  credentials, existing-install mutation, AWS call or cloud mutation.
- All 33 loopback checks completed; both owned local servers closed; temporary
  source/install tree removed. Publication and clean-Git-clone claims false.

The first restricted-context runner test could not create Windows junctions;
it remained failed, not skipped or treated as a product regression fix. The
same eight tests passed under normal Windows permissions. Strict checking of
the 34 fixed operator entries and their imported source guard also passed.
No permission policy was weakened to obtain these results.

Final handoff Markdown and its later audits are separate from the exact frozen
implementation fingerprint above. They do not extend this pass to a deployed
image, live request, complete legal/security review or public release.
[Independent closure](LOCAL_SAFE_STOP_2026-10-16_RESUME.md).

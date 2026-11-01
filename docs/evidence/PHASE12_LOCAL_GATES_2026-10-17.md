# Separate local gate observations — 2026-10-17 Tokyo

No AWS write, provider/model request, Docker application run, release or upload.
Preserve failed and successful observations as separate immutable receipts.

## First restricted-network attempt — failed

`outputs/local-gates/fresh-6e9c7803-986f-4b4c-8eae-ebf9610ebdac.json`
completed failed at 2026-10-16 23:47:17.859 UTC. No successful install or whole
gate was claimed. Independent read-only probes to both exact official pinned
pnpm endpoints returned ENOTFOUND in that execution context. Independent temp
inventory found no retained owned tree. This was not a failed application test
or evidence that its time/conditions should be relaxed.

## Authorized network context — first successful snapshot

`outputs/local-gates/fresh-c4370fe8-b1de-4e2a-bccb-2fdbcd9ef474.json`
completed successfully at 2026-10-16 23:54:34.199 UTC. It used the unchanged
fixed pnpm 11.16.0 official archive, checked all 891 tooling files, and installed
the same 391 locked identities with scripts disabled in a separate store/source
tree. Existing installations and private registry credentials were not reused.

- Source: 518 files / 5,266,295 bytes, SHA-256
  `d474a043fe16fca333b91b1de21148b01067c50b3cb84da0ccdf756101362191`.
- 83 ordered steps, four groups, concurrency two. All steps passed.
- 1,157 tests: 1,156 pass / one existing Windows privilege skip.
- Install 65,468 ms; whole gate 305,235 ms under the unchanged 360,000 ms cap.
- 33 loopback requests; local HTTP servers closed and temporary source/store
  removed by the producer. Independent closure is still required.
- AWS/cloud mutations/publication zero; not a clean Git clone or release proof.

Independent strict receipt validation and current-source fingerprint reread
matched before later source/document changes. Those later cancellation and
handoff revisions are outside this fingerprint and require separate evidence;
do not relabel this snapshot as their full verification.

## Follow-up implementation

The [elapsed deadline propagation](WORKER_DEADLINE_BOUNDARY_2026-10-17.md)
passed 65 focused tests and service compilation. The full fixed gate will be
measured again against its own exact source. No earlier whole/image result
automatically covers this revision, and no failure or deadline is waived.

## Final elapsed-budget snapshot — separately passed

`outputs/local-gates/fresh-bb61e6df-e81e-47fb-bcc6-a4fba83b2d5b.json`
completed successfully at 2026-10-17 00:06:36.894 UTC (09:06 Tokyo).
This is a second genuine isolated installation, not reuse of the first tree.

- Source: 519 files / 5,281,086 bytes, SHA-256
  `eed873267bee037411ecd74ec1532cb6cab72e00a8cd694048764e12d165d857`.
- Same 391 locked identities / pinned pnpm archive / 891 tooling files;
  dependency reuse, lifecycle scripts and private registry credentials false.
- 83 ordered steps/four groups, concurrency two, all steps passed.
- 1,167 tests: 1,166 pass / one existing Windows privilege skip.
- Install 63,571 ms; whole gate 305,365 ms / unchanged 360,000 ms ceiling.
- 33 loopback requests; temporary tree removed and local HTTP servers closed.
- AWS/cloud mutations/image application runs/publication zero.

Independent strict disk-receipt validation and exact current-source fingerprint
matched at 00:07:02.723 UTC, before final handoff text. No test/condition/deadline
was waived. Final process/port/temp/auth observations are separate from the
producer's cleanup flags. Later handoff documents are separately scanned and
do not inherit this earlier whole-source fingerprint. See the
[independent safe stop](LOCAL_SAFE_STOP_2026-10-17.md).

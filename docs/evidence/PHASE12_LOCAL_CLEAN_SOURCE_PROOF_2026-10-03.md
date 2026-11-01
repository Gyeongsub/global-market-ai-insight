# Phase 12 isolated-source rebuild — 2026-10-03 later follow-up

## What this proves and does not prove

The revised proof copies the reviewed source/documentation set into a uniquely
named OS temporary directory without generated bundles/dist/CDK output, Git
state, local credentials, assistant state, scratch output or private-key/
certificate files. Registry configuration files and all state-backup suffixes
are excluded. Inherited cloud credentials/opt-ins and Node injection variables
are removed case-insensitively before the child gate starts.

Before dependency reuse/build, a deterministic framed name/length/byte SHA-256
fingerprint binds the copied input snapshot without printing any absolute path
or file content. Redirected, private, generated or unbounded inputs fail closed.
Numeric evidence must account for all four complete test groups; missing,
cancelled, failed or TODO groups cannot produce a success packet.

## Dependency isolation

The current installed dependency bytes are now **file copies**, not hardlinks
or read-only links back into the original installation. Directory links are
rebased only within the temporary copy. The exact byte-matched frontend
workspace alias may point to its corresponding copied source; arbitrary
outside targets are refused. There is a bounded entry/file/byte budget.

Seven already broken, unused index links are explicitly counted and omitted.
This neither repairs the installation nor conceals a required missing module:
the complete build/test gate must still succeed. No registry install/update
occurs. This is **not** a fresh frozen-lockfile install or a clean Git clone,
and does not approve development/OS licenses, exact future container bytes or
publication. See [the previous differently scoped proof](PHASE12_LOCAL_CLEAN_SOURCE_PROOF_2026-10-01.md).

## Current-run result

The first current isolated-source run completed for 300 source/documentation
files (3,211,713 bytes), fingerprint
`b8ad63081ebb051500418767f0455c3b11f8dbdd1ec95048ad21c936b3e80ba2`.
Its four test groups totalled 488 (487 passed/one file-symlink privilege skip).
It copied 43,840 dependency files, 740,079,823 bytes, and rebased 2,617 links;
seven already broken unused index links were reported, not repaired.
AWS calls/cloud mutations/external network calls/publication were zero; 33
loopback HTTP requests completed with owned servers closed. The temporary tree
was removed. This fingerprint binds that copied snapshot, not later updates to
this result document or the subsequently added module-metadata source.

The final repeat after the module-metadata follow-up completed successfully:
304 copied source/documentation files, 3,230,699 bytes, fingerprint
`26f2bb5c5759cde2f13acd2468ca7af3218e5f0941d0d07790c7afcba707db30`.
All four test groups completed: **495 total, 494 passed, one OS file-symlink
privilege skip**. The dependency copy again contained 43,840 files,
740,079,823 bytes and 2,617 internal links; seven already broken unused index
links were reported. No install, external network, AWS call, cloud mutation or
publication occurred. All 33 loopback HTTP checks completed, both owned servers
closed, and the temporary copy was removed before the success packet returned.
The fingerprint binds that copied input snapshot, not the later edits that
record these results. It is not a fresh-install or clean-clone claim.

An immediately preceding constrained-environment repeat exited at controller
bundle generation and returned no success packet. Only the later complete
495-test repeat is the final isolated-source success; the earlier failed run
is not counted as a pass. No source change was made between those two attempts.

The gate now includes a separate bounded HTTP acceptance against only owned
127.0.0.1 development/preview servers. These are local network requests, not
zero network activity. Reports distinguish loopback requests from external
network/AWS calls and require owned-server/fixture cleanup before success.
The OS temporary tree is physically revalidated before recursive removal in
the proof's finally block, including failure paths.

# Phase 12 — isolated-source rebuild, 2026-10-04

The established bounded helper copied source/documentation without generated
artifacts, private cloud/assistant/registry configuration, credentials, scratch
output, Git state or certificate/private-key files. Inputs were fingerprinted
before dependency reuse/build. Dependencies were physical copies with only
internal rebased directory links, not a fresh install or clean Git clone.
Inherited cloud opt-ins/credentials and Node injection settings were removed.

The first successful snapshot contained **315 files / 3,316,733 bytes**:
`5845a7b083065b454cda9155e7a76f8594248ec3eaf91db9bb87ab76cfd32ad6`.
All four groups completed: **522 total tests, 521 passed, one OS file-symlink
privilege skip**, no failed/cancelled/TODO tests. It copied 43,840 dependency
files / 740,079,823 bytes and rebased 2,617 links. Seven preexisting broken,
unused index links were reported and omitted, not repaired or silently counted
as valid installed dependencies.

All 33 loopback HTTP checks passed, owned servers closed, and the unique
temporary tree was physically revalidated and removed before the success packet.
AWS calls, cloud mutations, external network and publication were zero.
This binds that copied snapshot, not later result-document edits or the
subsequent explicit live-image prerequisite and container evidence updates.
The final repeat is recorded below only after its complete success packet.

An attempted later concurrent native/source repeat did not yield final success:
the native wrapper hit its 240-second deadline, and the isolated gate reported
incomplete at frontend lint. That label alone does not establish a lint rule
violation or a root cause; raw failure details were suppressed. The temporary
copy was removed by its finally block. These failed attempts are not counted
as passing evidence. The subsequent check is serialized without increasing the
gate deadline, changing ACLs or disabling a checker.

The corrected, exact frontend lint invocation separately passed. A diagnostic
first used the wrong root dependency path and is not counted as lint evidence.
The serialized **current native** repeat then passed all 522 tests (521 pass,
one privilege skip), type/build/lint/synth/release checks and 33 loopback HTTP
checks with both servers closed. This does not turn the failed later isolated
copy into a pass or establish the timeouts' root cause. No third expensive
copy was started during the safety reserve. The first successful snapshot and
current native result must remain separate; a final-source isolated repeat is
still required in a later scope.

The current Docker image proof is separate: the container's public base/DB
downloads are not part of this zero-external-network source gate, nor does
dependency reuse clear fresh declared-tool installation, live ECR scanning,
license/attribution or publication. See
[current container boundaries](PHASE12_CONTAINER_RECHECK_2026-10-04.md).

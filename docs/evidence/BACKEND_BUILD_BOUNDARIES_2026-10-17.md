# Backend build boundaries — 2026-10-17 Tokyo

Local build preparation only. No deployment, application job, ECR credential,
upload, IAM change, provider/model invocation or public release. Generated
outputs remain ignored; source changes are not a live-image acceptance.

## Reproduced output redirection

A synthetic owned temporary workspace pointed `services/worker/bundle` to a
sibling fixture directory. The old CLI returned success and wrote through the
junction. The regression expected refusal and failed before implementation.
No user file or genuine outside resource was used; the fixture was removed.

All four fixed builders now share a guard that validates physical source/output
parents, rejects output junctions/symlinks and shared hard-linked files, and
permits upstream notice reads only inside the owned pnpm store. Compilation is
in memory; three exact generated files are staged in an owner-marked directory
and renamed rather than truncating existing inodes. Output code/notices retain
0644 readability for Lambda and nonroot containers. Requested private staging
mode is not an independent Windows ACL attestation; only generated public-scope
code/notices, never secrets, are staged. Each file/parent is rechecked, and only the verified owned stage is
removed. This is not an atomic multi-file publication or a concurrent malicious
filesystem sandbox. No unknown user file, bundle or cache is recursively removed.

Nine focused tests passed normally, including four-target success, junctions,
hard links, redirected source/notice parents, compiler diagnostics, invalid
arguments, inert import, exact notice bytes and no retained stage. The current
four real bundles then built. Independent in-memory source proof matched:

- Controller: 1,576,690 bytes, SHA-256
  `d05f1c7c549b04d484c365fd77a941e2cb9e40c806bcad40591fefcf512757a4`.
- Worker: 1,484,293 bytes, SHA-256
  `034829d700363e0b7868568590e1b7e07f1ab934cd11fc1ea8b0b4dbf55febfc`.
- Lock: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.

These are local byte comparisons, not actual application execution or complete
publisher/build-source/license approval. Available notice bodies are preserved,
not replaced with a generic license or declared complete.

## Exact Dockerfile review and first refused attempt

The Dockerfile now copies the shared builder into its build stage. Removing
that one exact line reproduces the previous full-file hash
`e4992deab8325370de9a911d2e4e0f8f0d0b355c531ab1839c0c8eed11987546`.
The independently reviewed new full-file hash is
`c0796d5ab202b1db887b46cc3961523a20ad02df0c46ddcfcab5bdaf2c0ba23e`.
No FROM digest, runtime directive, nonroot user, archive/base-prefix requirement
or application-file allowlist changed. The full-file equality gate remains exact;
it is not replaced with prefix matching or an allow-any-source exception.

The first candidate receipt
`outputs/local-gates/worker-a28af2ae-8518-40e2-91ad-5bde8410d852.json`
failed at 23:24:52.581Z on October 16 UTC (October 17 Tokyo). The older reviewed
Dockerfile pin correctly refused this new file before any image build. The
generic failure did not itself establish a cause. Separate diagnostics verified
source-copy equality and cached scanner identity, then isolated the exact
Dockerfile hash difference above. Independent inventory confirmed candidate
image absent, running owned scanners zero and image-proof temp directories zero.
That first attempt remains failed; the reviewed pin correction, not a blind
unchanged retry or relaxed gate, is required for a later attempt.

The new Tokyo-day local scope preserves October 4/12/16 tags, UTC-day guards and
all private-promotion acceptance rules. It has its own absent tag and exact
Tokyo-day bound, zero AWS/push/credentials, plus whole-source and three-file
bundle rechecks after scanning. The default/whole checker only requests its
inert plan: 82 ordered steps, four test groups, concurrency two and the same
360,000 ms whole-gate ceiling. Successful image/whole/closure observations must
be recorded separately after actual execution.

## Remaining notice/source gaps

Three anonymous fixed official registry GETs found the same exact AWS SDK
versions, Apache-2.0 declarations and official repository, but no commit hash.
The three missing package documents remain missing; an unpinned repository
license is not silently substituted. The current emitted inventory still has
32 unique packages across the four bundles with three missing-document
identities in each. Complete OS/generated/native/development attribution,
trusted source/build provenance and publication remain separate unresolved gates.

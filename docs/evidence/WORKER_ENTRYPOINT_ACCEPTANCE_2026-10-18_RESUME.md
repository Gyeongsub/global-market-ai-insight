# Offline worker entrypoint and owned Docker preparation — 2026-10-18 resumed

This is local preparation, not a fresh AWS inventory or release approval. No
AWS login, IAM change, provider/model call, deployment, registry push or public
site is needed. Earlier same-day proofs cover their own source only.

## Reproduced boundary and local correction

Six added regression cases first failed against the preceding implementation.
An unsupported environment could appear verbatim in startup/failure logs;
local mode accepted an invalid job identifier; local analysis ignored the
selected language; and the completion log used the result kind rather than
the requested operation. The worker now projects the environment to a finite
value, validates the existing 16–64 character safe identifier before work,
uses the shared deterministic grounded renderer for English/Japanese/Korean,
and logs the actual PRICE/ANALYZE operation. Raw environment values, error
messages, inputs and generated narrative are not included in these logs.

This is not a claim of remote cancellation, a hard upstream spending cap, or
permission to display provider-derived data. The local fixture is synthetic,
explicitly identified as such, and performs no model or provider request.

## Actual-process acceptance contract

The isolated runtime operator still runs the preceding **41 lifecycle cases**
(30 normal, 11 negative). It additionally launches the image's real
`/nodejs/bin/node /app/main.mjs` entrypoint **18 times sequentially**: six normal
cases (PRICE/ANALYZE in three languages) and twelve invalid configurations.
Missing/unsafe job IDs, unsupported environment, missing/malformed fixture,
missing/wrong region, missing table, unsupported symbol and locale must fail
before an AWS client can be used. No successful AWS configuration is supplied.

Each child has a fixed OS-independent minimal environment, no inherited
credentials or runtime-preload options, a five-second timeout and bounded
output. A monotonic 25-second sequence budget shrinks subsequent timeouts;
the first failure ends the sequence without retry. Exactly two structured
logs, stable fields, canonical timestamps, expected exit code and safe job
correlation are checked. Only finite counts and boolean conclusions survive
in the receipt; captured child logs are not persisted.

The one outer container remains nonroot UID/GID 65532, network `none`, read-only
root, no host/credential/socket mounts or published ports, all capabilities
dropped, no-new-privileges, 256 MiB memory, 0.5 CPU, 64 PIDs and a bounded tmpfs.
The runtime result schema is version 2; an old 41-case-only receipt cannot
satisfy the new 18-process gate. Fixture logic is hash-bound to the receipt.

## Owned local Docker session contract

`scripts/local-worker-acceptance.mjs` is inert on import/default invocation.
Explicit execution requires Windows Docker to be completely stopped and its
normal installation paths and vendor signatures verified. It preserves only
the existing exact socket-only directories via the unchanged stopped-only
preflight; no images, volumes, VHDX, data root or settings are reset or deleted.

The bridge starts Desktop hidden and records its PID plus exact creation time
privately. Before work and stop it verifies signed executable paths, creation
time and the complete scoped Docker parent tree. A lost launch response can
only recover the exact child of that launching bridge within the bounded time
window. A merely plausible PID or a process found by name is not ownership.
Existing Docker instances and foreign active containers are not adopted or
stopped. New concurrent user activity or an unverifiable tree blocks cleanup
success and requires independent investigation, not a blind force stop.

One source-bound build/scan and one offline runtime proof must match the same
whole-source fingerprint, image ID and module hash. Cleanup runs independently
of work success. Normal stop is used after engine readiness; official force
stop is reserved for this positively owned startup that never became ready.
After zero-process confirmation, the stopped-only socket preservation runs
again. Runtime/scanner containers and owned temporary config/archive/cache
are separately removed. Historical images/caches/backups are retained.

Each phase has its existing timeout and a 15-minute monotonic phase-admission
ceiling. This is not an atomic host-wide process deadline. Receipts use an
exact finite schema, never raw exceptions, PIDs, private paths or child logs.
An incomplete work or cleanup result never becomes success. Independent final
process/listener/temp inventory remains mandatory even after a passed receipt.

The intentionally empty authentication config also removes user plugin
discovery paths. The first actual combined run passed image scan and both
runtime suites, but zero-process verification correctly rejected its stop:
Desktop was still active. The failed session receipt
`9c20c246-0d85-4b13-9155-9a8e65249f8c` is retained as failed, not rewritten.
The image/runtime child receipts are valid only for their preceding source.
Vendor-signed direct-plugin help confirmed the required `desktop stop` command;
empty-config Docker help had no registered Desktop command. After exact
original PID/creation-time/tree verification and zero running containers, that
official plugin stopped the instance normally and independent process count
was zero. Two socket-only directories were then preserved under recoverable
scope `33a18203b4314b4bb5f67619f2f3c149`. No force stop or data deletion was used.

The corrected workflow verifies the bundled `docker-desktop.exe` signature and
path with the other installation files, then invokes it directly with its own
empty config and fixed timeout. It never restores user credential settings to
make plugin discovery work. A dedicated regression checks the fixed command
and explicit force boolean. Corrected actual combined acceptance remains a
separate pending observation at this source snapshot.

## Verification boundary

Focused local regression/operator tests and TypeScript are separate from the
actual image execution and fresh installation. At document creation, the
actual combined Docker workflow and new whole gate are **not yet observed**.
Their later IDs, counts, exact source binding and independent shutdown must be
recorded separately; do not infer a pass from this contract or unit fixtures.

All publication/deployment gates remain closed, including retained MEDIUM/LOW
findings, complete source/native/OS/license coverage, IAM positive controls,
provider display/derived-result rights, end-user auth/hosting/CI and privacy.

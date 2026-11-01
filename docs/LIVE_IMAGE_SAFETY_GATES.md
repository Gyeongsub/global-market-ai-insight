# Exact live image safety gates

The current registry image is not cleared by a local candidate, an old scan,
an index wrapper's summary, or a fresh Basic OS scan alone. These commands do
not grant deployment, execution, public market display or GitHub approval.

## Separate image operator boundaries

| Operator | Default | Explicit bounded action | Never performs |
| --- | --- | --- | --- |
| `operations:live-image-readiness` | Zero AWS calls | `--execute-read-only`: ten reads for one manifest, twelve for an index/runtime child | Rescan, credential retrieval, pull, push, job enablement |
| `operations:refresh-live-basic-scan` | Zero AWS calls | `--execute-one-basic-scan`: at most 31 AWS calls, one exact existing-image scan start, five polls, six minutes | Registry mode change, Enhanced/Inspector activation, a retry after ambiguous start |
| `operations:scan-live-image-cache` | Zero Docker/AWS calls | `--execute-cached-archive-scan`: 24 reads, one cached-image archive and one isolated scanner, ten minutes total | Registry login/password, image download/push, cloud mutation, worker execution |

Adding `--scan-dated-patch` selects only the hard-bound already-pushed private
candidate, never an arbitrary tag/digest. It adds three candidate ECR reads at
each end: at most 30 reads while the old live reference is an index. Current
live ownership/disabled binding stays independently verified before and after.
This does not substitute for a **default live** archive scan after rollout.
See [exclusive rollout and controller-byte proof](COMPUTE_PATCH_RELEASE.md).

All actual AWS paths are fixed to profile `gmai-admin`, Tokyo and the project's
exact owned resources. Set `GMAI_AWS_CLI_PATH` to the independently trusted AWS
CLI executable when it is not on PATH. The cached scanner additionally requires
an independently trusted absolute `GMAI_DOCKER_CLI_PATH`; its current Windows
engine is explicitly the local `dockerDesktopLinuxEngine` pipe. A missing cache
is a stop, not authorization to add a credential/pull fallback.

The normal project check runs only zero-call plans and offline mock tests.
Imports have no side effects. Never paste credentials, registry tokens, signed
download URLs, raw manifests or scanner matches into correspondence/evidence.

## Registry identity and freshness

The read gate checks the IAM principal, Foundation/Compute ownership, disabled
controller flags, exact active task definition, Linux/X86_64, one non-root
read-only container, and the immutable encrypted ECR repository. It hashes the
exact registry manifest bytes. An OCI index must select exactly one Linux/amd64
runtime child; its hash and size must match the parent descriptor. Only that
child's complete `DescribeImageScanFindings` response can clear the Basic gate.
`DescribeImages`' historical scan summary does not substitute for it.

Both completion and vulnerability-feed times must be valid, no later than now,
and within 24 hours. Severity counts must match every finding on a complete
nonpaginated response; HIGH/CRITICAL/UNDEFINED block. A current scan cannot be
started twice in one day just because its feed is stale. The separate rescan
tool verifies BASIC mode without changing it, binds the target to successful
read-only evidence, consumes the sole start before any ambiguous response,
accepts PENDING/IN_PROGRESS only as waiting, and rechecks the same disabled
controller/image after completion. Unknown/failed/Enhanced ACTIVE states do
not count as Basic completion.

## Archive and local scanner

Docker's classic image ID can be a config digest; its containerd store can
instead expose the manifest/index descriptor digest. Both must be bound to the
already verified registry reference, not compared interchangeably. The cached
operator explicitly selects Linux/amd64 for inspect/save. It supports the
containerd OCI/Docker-compatible export layout and refuses unsupported layouts.

Before scanning, bounded tar inspection verifies checksums, rejects links,
unsafe/duplicate paths and unsupported entry types, and hashes every named OCI
blob without extracting files. The runtime manifest/config hashes, config
architecture/non-root user and Docker-compatible manifest's exact layer list
must agree. Compressed runtime blobs or the config's corresponding uncompressed
diff IDs are checked, not trusted solely from a plausible archive filename.

The existing immutable Trivy image is inspected independently. It receives
only the exported archive read-only and an owned cache; no Docker socket, home,
source tree, AWS state or registry config is mounted. Its root is read-only,
capabilities dropped, no-new-privileges enabled, with PID/memory/CPU/time bounds.
Public database downloads are allowed; dependency API lookups, telemetry and
update notices are off. There is no claim of zero scanner network traffic.

The report requires a fresh version-two DB, exact archive config identity and
nonempty OS package inventory. HIGH/CRITICAL/UNKNOWN or any detected secret
blocks. LOW/MEDIUM remain visible. An SDK bundle is not a complete application
dependency manifest; separate locked dependency/advisory and legal review are
still necessary. A zero secret count is not proof that arbitrary private data
could never be present.

## Cleanup is independent evidence

A client timeout does not prove its container stopped. The scanner has a
random exact name and ownership labels. Only that name, immutable scanner ID
and scope-verified container can be stopped/removed. The operator independently
confirms it absent before removing the physically verified temporary archive
and cache child. On ambiguous cleanup, stop new work and verify exact targets;
never prune images/volumes, reset Desktop, kill unrelated processes or remove a
broad directory. Existing application images and user Docker data are retained.

## Current decision

The [2026-10-04 afternoon exact-image record](evidence/PHASE12_LIVE_IMAGE_VERIFICATION_2026-10-04_AFTERNOON.md)
reports Basic zero findings but archive HIGH three. Keep jobs/display false and
the circuit OPEN until a patched exact deployed image and current-source
compatibility/diff/restoration gates are independently cleared. The local
patched candidate's morning report is not proof of a patched ECR deployment.

Primary references: [ECR Basic scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-basic.html),
[manifest retrieval](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_BatchGetImage.html),
[scan findings](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_DescribeImageScanFindings.html),
[start limits](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_StartImageScan.html),
[scan states](https://docs.aws.amazon.com/AmazonECR/latest/APIReference/API_ImageScanStatus.html),
[Docker platform export](https://docs.docker.com/reference/cli/docker/image/save/),
[containerd inspect implementation](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go).

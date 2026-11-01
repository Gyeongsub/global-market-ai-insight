# Phase 12 — private patch preparation, 2026-10-04 afternoon

This follows the [exact live-image finding](PHASE12_LIVE_IMAGE_VERIFICATION_2026-10-04_AFTERNOON.md).
The currently deployed, **disabled** worker image had HIGH three. Today's new
image is a separate candidate: no Compute deployment, task launch, job request,
provider/model call, external display, public repository or CI action is claimed.

## Local build and fresh archive proof

One Linux/amd64 image was built from a physically copied, filtered source tree,
not from the user's credential/configuration directories. Source snapshot:
335 files / 3,545,123 bytes, SHA-256
`e88bbe0fb86707c039137e43a043184e1663fa05c6f11f9b1827535a816558d4`.
That snapshot predates the later promotion operator and test additions; no
claim is made that future source edits are included in this candidate.

- Local tag: `gmai-worker:local-20261004-release`.
- Runtime manifest/image ID:
  `sha256:f3d8d7ba40da459636954521e539d286eb73c8994a7fd76ebcfe534e3dd69e9a`.
- Config digest:
  `sha256:875c9a8082c09164f3ec7e7d3296d676730fbf86bf2e613c38d2997e43b2cc5c`.
- Exported archive: 54,919,168 bytes; 26 independently hashed blobs.
- Actual config bound Linux/amd64, uid/gid 65532 and the declared Node entrypoint.
- Fresh Trivy DB, 14 OS packages: LOW eight / MEDIUM 23 / HIGH zero /
  CRITICAL zero / UNKNOWN zero; detected secrets zero.
- No scanner Docker socket, source/home/cloud mount, credential injection,
  privilege expansion, severity suppression, provenance or SBOM attestation.
- The exact owned scanner was absent; copied source/archive/cache were removed.

The first isolated build attempt stopped before building because the empty
Docker config could not discover this per-user installation's Buildx plugin.
The existing signed plugin path was verified and supplied only in the new
temporary config. No user auth/config was copied or changed. The successful
build kept pinned bases, frozen lockfile and disabled lifecycle scripts;
public build-package/database downloads were allowed, not AWS/provider calls.

## Exactly one private ECR push

The dated candidate was re-exported and cryptographically rebound before
promotion. Fresh core/ownership gates confirmed the expected principal/Region,
budget below USD five, jobs/display false, verified OPEN and zero work/slots.
The new immutable destination tag was confirmed absent before any credential
retrieval. No mutable tag, all-tags push or repository-setting change occurred.

The first promotion attempt stopped at private-directory ACL verification,
**before** password retrieval, local registry login or push. A separate empty
folder probe passed after excluding inherited foreign PowerShell module paths
from the Windows PowerShell child. That same narrow correction was tested;
ACL protection was never removed or weakened to make promotion work.

The completed promotion:

- Retrieved one ECR authentication password into private process memory only.
- Protected its temporary Docker config with current-user/System-only ACLs.
- Passed the password through stdin, not argv, public output or source files.
- Pushed **one single-platform manifest**, no index or attestations, to the
  existing owned **private**, encrypted, immutable repository.
- Independent DescribeImages + raw BatchGetImage SHA-256 checks matched the
  exact runtime/config above; compressed bytes were **54,886,218**.
- Existing images were not deleted. A local private alias was retained only
  for scoped follow-up verification; it contains no password.
- Isolated logout and physical directory removal deleted the credential files
  and archive; the original Docker configuration was not used or modified.
- Final core recheck returned jobs/display false, verified circuit OPEN and
  running/pending/tasks/services/occupied slots zero.

ECR's server-side token is valid for up to 12 hours. Local logout/removal is
**not token revocation**; no token value is retained in this record or public
evidence. Normal CLI/console sign-out is separately required at session close.
[Official registry authentication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html).
[Platform-only push](https://docs.docker.com/reference/cli/docker/image/push/).

## Independent candidate scan and read-only Compute review

After the push, a complete 39-read comparison verified the candidate's full
fresh COMPLETE Basic findings/feed: all six severity counts zero. The exact
candidate runtime/config matched the private ECR manifest again. This is
candidate evidence, not a scan of a new live task reference or permission to
ignore the actual old-image Trivy findings.

The local assembly used the two already-deployed subnet AZs and synthesized
the existing API only to preserve its Compute export dependency. Six required
Foundation imports were present. Twenty-six proposed Compute resources had no
additions; only CDKMetadata was absent. Property differences were only the
controller Code and task ContainerDefinitions. Other differences were CDK
path Metadata; IAM/network properties and template outputs were unchanged.
No change set, asset upload or deployment occurred. An indirect task-definition
replacement/permission/rollout review is still a separate execution gate.
The private cloud template/assembly was removed, and the final core stayed
disabled/OPEN with zero running/pending/tasks/services/occupied slots.

## Cost and remaining boundary

One approximately 55 MB private image adds bounded storage; deduplication,
existing storage, delayed metering and transfer pricing are not inferred from
the archive size. No Enhanced/Inspector subscription, paid worker/model call,
always-on service, NAT, ALB, schedule or public deployment was enabled.
[ECR pricing](https://aws.amazon.com/ecr/pricing/).

This preparation does **not replace the image in the live task definition**.
Keep the existing worker disabled and circuit OPEN. A future Compute-only
update needs the new registry's complete fresh Basic findings, this exact
archive/content identity, current-source/account-specific diff, preserved
subnet context/API exports, independently verified rollout and safe stop.
Complete backend/OS/generated-module licensing, Git-clone/CI and final public
privacy approval are separate remaining gates. No GitHub upload is authorized.

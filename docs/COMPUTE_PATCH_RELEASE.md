# Compute patch release boundaries

This is an operator preparation guide, not authorization to activate work or
publish data/source. The existing API is IAM-only; provider jobs and browser
live-result display must remain false throughout this image/code update.

## Read-only comparison

`operations:compute-template-review` defaults to zero AWS calls. With the
verified temporary `gmai-admin` profile and `--execute-read-only`, it compares
current source using the **current live digest**. Add `--review-dated-patch`
only for the exact already-verified dated candidate.

The latter independently checks the private candidate's immutable digest,
config and complete fresh Basic findings before selecting it for local
synthesis. Neither mode uploads assets, creates a change set or deploys.
Private cloud templates/assembly are removed; public output contains only
resource/property/action names, bounded counts and gate decisions.

Preserve both of these context boundaries:

1. Derive the two worker subnet AZs from the existing owned Compute template;
   do not replace them with dummy/default discovery context or a different
   order. Unknown expressions, extra/foreign subnets or Regions fail closed.
2. Locally synthesize the **existing API dependency** to retain the Compute
   exports it consumes. This is not permission to deploy API. Compute-only
   execution must be exclusive; never implicitly deploy Foundation/API.

An action-set summary is **not a complete IAM/replacement review**. Review
changed resource/condition scopes and indirect task-definition references.
Metadata-only differences must not hide deletion policy, dependency, network,
security-group, retention, output/import or permission changes. No new ECS
service, ALB or NAT is accepted. Never use CDK diff's default change-set method
as a supposedly read-only diagnostic; use template comparison explicitly.

## Dated patch preparation and transfer

`operations:prepare-worker-patch` and `operations:promote-worker-patch` also
default to zero AWS/push plans. Their execution paths are separate:

- `--execute-local-build-scan`: one copied-source Linux/amd64 build and one
  isolated archive vulnerability/secret scan; no registry credential/push.
- `--execute-one-private-push`: only the hard-bound, freshly accepted dated
  runtime/config and a new absent immutable tag; no generic destination,
  all-tags option, deployment or execution enablement.

Promotion expires one hour after its dated acceptance. Do not change a clock,
skip a scan, substitute another tag/digest or weaken ACLs to bypass this gate.
A later release needs new evidence and reviewed bindings. If a transfer is
ambiguous, inspect the exact remote tag/digest before retrying; do not push
again or delete existing user images blindly. An ACL failure before credential
retrieval is distinct from an unknown remote push outcome.

Registry auth files must be private, temporary and independently removed.
The ECR token is still server-valid for up to 12 hours; client logout does not
revoke it. Never mount registry/cloud config or a Docker socket into the
scanner, echo tokens, change global user config or disable TLS.

## Exclusive disabled rollout and independent source proof

`operations:compute-patch-rollout` defaults to zero AWS calls. Its sole
execution argument is `--execute-one-disabled-rollout`. The separate
`--prepare-only-disabled-patch` creates/reviews/removes the same bounded sets
without execution, not a rollout. Neither can select
another image/stack, enable jobs/display, close the circuit or publish source.
The existing dated image is rechecked against a freshly exported cached
archive, full fresh Basic findings and the immutable runtime/config identity.
The earlier promotion's one-hour limit is **not extended** by this separate
check of an image already present in private ECR.

The proposal must retain all network/IAM documents, task hardening, existing
subnet AZs, Foundation imports and API exports. Only the controller's standard
S3 code key and the worker's exact image digest may change; CDK path metadata
may disappear. The task-definition replacement's controller environment,
RunTask policy reference/cluster condition and existing output are explicitly
reviewed. No ECS service, NAT, ALB or new resource is admitted.

The pinned CDK preparation implementation supplies nested-stack inclusion and
does not carry the live stack's tags through this path. Its draft is therefore
**never executed**. It is used only for bounded asset publication, then its
exact owned draft is removed and confirmed absent. One explicit CloudFormation
UPDATE is created from the unchanged reviewed template, original tag map and
execution role, the previous BootstrapVersion parameter, no nested/import
mode, and IAM/named-IAM capabilities only. There are at most two change sets
per successful operator invocation, **one execute attempt**, and no execute
retry after an ambiguous acknowledgement. An unsupported change set is
removed without execution, not accepted by weakening the gate.

Before execution, the actual prepared template and bounded asset-byte
fingerprint must still match; fresh ownership, budget, disabled flags, OPEN
circuit, empty task/service/slot inventory and stable Foundation/API checks
must pass. Change-set details allow only the task replacement, its exact
known dependents and separately reviewed metadata-only resources. Rollback
remains enabled; API/Foundation are never deployment targets. The standard
`${AWS::Partition}` asset-role placeholder resolves only to `aws` for this
owned Tokyo destination; it cannot redirect the bucket, account or role.

AWS's ResourceTargetDefinition specifies RequiresRecreation for Properties,
not Metadata. An omitted/null recreation field is accepted only on direct
Metadata details whose resource-level replacement and unchanged property
values have separately passed review. Always/Conditionally still fail there;
property details still require their exact recreation and dependency values.
Enum-only diagnostics suppress arbitrary identifiers and before/after values.

Direct/dynamic property details require an independently reviewed, internally
branded proof tied to full change-set bytes: current owned GetRolePolicy,
exact before task/cluster scope, unchanged policy/environment/role and proposed
template. Only the task reference varies; the observed unresolved token is
not a generic placeholder exemption. Copied booleans, altered contexts and
wider permissions cannot authorize direct policy/environment entries. Proof
is refreshed just before execution; resolved IAM scope is reread afterward.
[Real acceptance](evidence/PHASE12_COMPUTE_PATCH_ACCEPTANCE_2026-10-05.md).

After UPDATE_COMPLETE, independent reads bind the new live task reference,
registry runtime/config and disabled guards. Then run the **default live**
archive operator again, not only candidate mode. Bootstrap code assets backing
the deployed function are intentionally retained; do not delete them as temp
cleanup. Private local assembly/archive data and exact owned change sets are
removed and verified separately.

`operations:verify-controller-release --execute-read-only` is a separate
24-read proof, default zero. It downloads at most eight MB from the exact
owned bootstrap asset, without a signed URL in logs, credentials in files or
code execution. ZIP SHA-256 must match the live Lambda CodeSha256; bounded
in-memory entry reads must match the current `main.mjs` and both included
notice/license files. No archive extraction occurs. Core readiness and source
bytes are rechecked afterward; the private ZIP is removed. Matching these
three files is **not** a claim of complete license provenance.

`operations:verify-worker-release --execute-read-only` separately binds the
default actual-live cached archive to its last mkdir/COPY layers and current
worker module/notices. It checks compressed blob and uncompressed diff hashes,
fixed working directory/entrypoint/user, exact regular files and closing
target/source/core state. No pull, container, image execution or extraction;
private archive/config removed. Unsupported links/whiteouts/overlays fail.
It proves three application files, not full OS/dependency/legal provenance.
[Dated source and IAM proof](evidence/PHASE12_SOURCE_AND_IAM_PROOFS_2026-10-05.md).

Docker startup uses the separate [stopped-only recovery boundary](DOCKER_LOCAL_RECOVERY.md).
No deployment/fresh scan proof is inferred from merely starting Docker.

Primary references: [CDK deployment methods and exclusivity](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-deploy.html),
[standard publishing-role configuration](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizerProps.html),
[change-set creation controls](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html),
[change-set detail review](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeChangeSet.html),
[property versus metadata recreation fields](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceTargetDefinition.html),
[at-most-once execution token and rollback](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html).

See [private patch evidence](evidence/PHASE12_PRIVATE_PATCH_PREPARATION_2026-10-04_AFTERNOON.md),
[image safety gates](LIVE_IMAGE_SAFETY_GATES.md) and
[real frozen install](evidence/PHASE12_FRESH_INSTALL_PROOF_2026-10-04_AFTERNOON.md).

# Disabled Compute patch acceptance — 2026-10-05

## Outcome and scope

One exclusive Compute UPDATE completed successfully. Foundation/API stayed
unchanged and were not deployment targets. Jobs/display remained false during
rollout; persisted OPEN/version 11 and empty tasks/pending/services/slots were
independently checked before/after. No task, provider/model invocation, new
ECR image push, public site/source/data or GitHub action was performed.

Two prepare-only invocations each made 79 explicit AWS calls and removed both
owned sets without execution. The successful invocation made 112 explicit
calls, created/removed two sets and acknowledged one ExecuteChangeSet attempt
with rollback enabled. Six owned change sets total were removed. CDK asset
subprocess requests are not included in these explicit counts. Private
temporary assemblies were removed. Up to three bootstrap file assets, six
source files and 1,625,689 source bytes were published/reused; exact incremental
storage/request billing was not measured.

Original execution role, tags, previous BootstrapVersion, subnet AZs,
Foundation imports and API exports were preserved. Only exact worker image,
controller code and their reviewed task-reference dependents changed. No
network/security-group/retention/output scope, ECS service, ALB or NAT was
added. Private code assets supporting the deployed function were retained.

## Exact dependency and IAM review

Real property contexts used a static direct PolicyDocument change and dynamic
direct Environment change alongside the known task reference. Source labels
alone did not clear these entries. Independent checks bound the owned current
role/inline policy and GetRolePolicy document to the original template and
BeforeContext; RunTask before scope was exactly the old task revision and
unchanged exact cluster condition. Every policy field and attachment except
the reviewed task reference remained equal. Controller role, all other
environment values and both false flags stayed unchanged. Code key/template/
asset fingerprints were also bound. An internal WeakMap brand tied the genuine
proof to the complete change-set bytes; copied/forged booleans fail.

The observed unresolved token was exactly `{{changeSet:KNOWN_AFTER_APPLY}}`.
This dated response shape is not a generic placeholder exemption or guaranteed
future API contract. Unknown tokens, foreign revisions/clusters and broader
resources fail closed. The proof was recreated just before execution; after
UPDATE_COMPLETE, a separate IAM read verified the resolved new task ARN and
unchanged remainder. AWS describes
[property contexts](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceChange.html)
and [dynamic dependencies](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-samples.html).

## Independent actual-live image and controller proofs

The candidate's one Basic refresh used 33 explicit calls, one start and one
poll. BASIC configuration, immutable runtime/config and complete fresh
zero-finding result were verified; no Enhanced setting was enabled.

After deployment the **default actual-live** archive operator made 20 AWS
reads. Runtime/config, the 54,918,656-byte archive and all 26 hashed content
blobs matched. Fresh archive results: 14 OS packages; LOW eight, MEDIUM 23,
HIGH/CRITICAL/UNKNOWN zero and secrets zero. No cloud/registry credentials,
Docker socket or source/home was mounted. Owned scanner/archive/cache removed.

Runtime: `sha256:f3d8d7ba40da459636954521e539d286eb73c8994a7fd76ebcfe534e3dd69e9a`.
Config: `sha256:875c9a8082c09164f3ec7e7d3296d676730fbf86bf2e613c38d2997e43b2cc5c`.
These content identities contain no account/registry identifier.

The separate 24-read controller proof checked a private 280,318-byte ZIP's
SHA-256 against live Lambda CodeSha256 and matched current main module plus
the two included notice/license files in memory. No extraction/code execution;
private ZIP removed. Complete worker current-source provenance, application
dependency coverage, OS/generated licensing and zero vulnerability risk are
not claimed. LOW/MEDIUM findings and old private image storage remain separate
review/lifecycle items, even though the HIGH-three image is no longer live.

## Source and release boundaries

An earlier genuine pnpm 11.16.0 frozen install of a copied 352-file/
3,709,966-byte snapshot passed 651 tests: 650 passed/one Windows file-link
privilege skip. No existing dependency reuse, lifecycle hooks, private
credentials or original lockfile/host-tool mutation. Temporary tree/loopback
servers removed. Snapshot SHA-256:
`28fca3524b55acef0e5c18af48f9447dad7301da9de2629f6ac406ef47524894`.
Later changes are not included in that earlier snapshot. A later native gate
after the reference proof passed 653 total/652 passed/one OS skip. Final
source coverage/session shutdown have separate closing evidence.

See [release boundaries](../COMPUTE_PATCH_RELEASE.md),
[real denial](PHASE11_CIRCUIT_DENIAL_ACCEPTANCE_2026-10-05.md) and
[release decision](../RELEASE_READINESS.md). Existing bootstrap/ECR/DynamoDB/
logs and delayed request metering can incur cost. The USD five Budget is an
alert, not a cap. GitHub/public hosting remain deferred.

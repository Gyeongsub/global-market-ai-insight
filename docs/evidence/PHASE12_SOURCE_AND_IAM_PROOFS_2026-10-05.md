# Current-source and IAM boundary proofs — 2026-10-05

## Read-only deployed worker source

The new default-zero worker proof passed: 42 AWS reads and three Docker image
inspect/save/inspect calls. No container start, image pull/push, cloud mutation,
credential retrieval, archive extraction or image execution. The private
54,918,656-byte cached archive and empty Docker configuration were removed.

The actual disabled task's registry runtime/config and all 26 content blobs
were independently rebound before/after. WorkingDir=/app, fixed Node/main
entrypoint, non-root user and no command override passed. The last two hashed
filesystem layers were exactly the app-directory creation and application
COPY. Their uncompressed diff IDs matched the config; links, whiteouts,
PAX/path redirection, duplicate/unrelated files and extra overlays were not
accepted. Three regular files owned by UID/GID 65532 matched current bundle
bytes: main module, third-party notice and included Apache license.

Worker module: 1,480,483 bytes,
`544b5026c8a70333b4ef05331b3b1ca44132ba1f3493d63beda5f615ddd84936`.
Fresh disabled flags, OPEN/version 11 and empty tasks/services/slots held.
This closes the **three-file worker application source** gap for this exact
image. It is not full root-filesystem provenance, complete dependency CVE or
legal/OS/generated-helper proof. No token, ARN or private code was printed.

## Attached-role simulation matrix

The complete read-only IAM operator passed 15 fixed cases with 65 explicit
reads/simulations. Five allows and ten denies matched both aggregate and
exact individual-resource decisions. All known condition keys were supplied,
including neutral keys from other attached statements, so negative outcomes
were not simply missing-input denials. No missing contexts were reported.

Roles were owned by the existing original Compute template/resource records
and current Lambda/task references. Service-only trust, exact inline names/
documents, empty managed attachments, no unexpected permission boundary,
controller/task/code and circuit fingerprint were identical before/after.
No IAM write, role assumption, secret-content read, ECS/DynamoDB workload
operation or Bedrock invocation occurred. Prior preparation attempts stopped
without writes on the opaque CloudFormation policy-ID/optional-context
response formats; they are not counted as passing proofs.

The opaque policy resource ID is not PolicyName. Binding uses exact logical
ownership, original template name, live role and GetRolePolicy response.
Optional MissingContextValues omission is supported only with complete exact
action/resource decisions; null, malformed or reported missing keys still
fail. The simulator is not a complete real service authorization test:
organization, resource, trust, endpoint and real request contexts can differ.
See [operator and limitations](../IAM_BOUNDARY_VERIFICATION.md).

## In-memory emitted-module and notice review

Four fixed local bundle rebuilds matched existing module bytes. No source,
bundle, code asset, image or cloud state was written. A second in-memory
rebuild was bracketed by source hashes, and input set/metafile, output bytes,
lock identities and final artifact hashes remained equal. Only known own/
shared/circuit/control-contract source, locked production packages and native
Node externals were accepted. Absolute module IDs, code and source maps were
not emitted.

| Module | Bytes | Emitted inputs | Runtime packages | Root license available |
| --- | ---: | ---: | ---: | ---: |
| Controller | 1,574,514 | 517 | 27 | 24 |
| Worker | 1,480,483 | 527 | 31 | 28 |
| Sweeper | 1,541,770 | 505 | 27 | 24 |
| Alarm circuit | 1,279,867 | 501 | 26 | 23 |

Across the four artifacts 32 unique package identities were actually emitted,
not merely the declared 34-package conservative graph. Three emitted package
versions lack root LICENSE/COPYING documents in **all four** artifacts:
credential-provider-http 3.972.72, credential-provider-login 3.972.77 and
nested-clients 3.997.44 (all under @aws-sdk). Their exact-version published
archive follow-up remains separate
[upstream evidence](PHASE12_PUBLISHED_LICENSE_PROOF_2026-10-04.md); a missing
root file is not itself a proven legal violation or permission to invent text.

The inventory retains known root document byte counts/hashes and explicit
gaps, not copyright text, personal paths or a claim of complete distributed
notices. Existing source/license files were not modified, including copyright
attribution emails. Generated helpers/banner, OS/development licensing and
complete future notice packaging still require review before public release.

`audit:backend-modules`, `audit:backend-notice-gaps` and their ten focused
tests are integrated into the whole local gate. Worker proof has eight focused
tests and IAM proof nine. Final whole-gate/frozen-install results are separate
snapshot evidence, not inferred from these counts.

No GitHub upload/remote/workflow or public hosting/data exposure occurred.
All proofs are default-zero for cloud actions; local metadata proof reads only
fixed project inputs. Session safety/cost and logouts require fresh closing
verification, not only these historical packets.

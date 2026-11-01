# Publication security review

This is a local triage record, not approval to publish. The repository has no
Git remote and the user has chosen to publish only after the product is
complete and a final security, privacy, licensing and cost review is approved.

**Current source-only review, 2026-11-01:** the approved fresh 392-identity npm
lookup retains one moderate advisory matching minimatch 3.1.5 and 10.2.6 in
development tooling, with zero declared-runtime matches. The 10.2.6 compatible
backport is implemented and locally tested; the registry finding is not hidden.
Final exact-copy frozen verification and the owner's residual-risk/upload
decision remain separate. [Patch, refresh and limits](evidence/MINIMATCH_BACKPORT_2026-11-01.md).

The first source-only projection contains 841 files and 46 retained review
findings: 33 cloud-identifier shapes, eight email shapes and five personal-path
shapes. Manual inspection found synthetic ARN/account/API test values,
example-domain email/URL-userinfo negative tests, invented computer paths and an
official documentation URL containing a users path. No detector exception was added.
The only cloud-shaped document is an explicitly synthetic, unsent support draft.
Later document edits require a new manifest; these counts describe that first
projection, not every future revision.

The public cover copy preserves pixel-bearing chunks and removes provenance
metadata; the owner-attested original remains unchanged locally. Its clean-copy
SHA-256 is `651228842cf5785777ebf5f25e07a49fabc2a0571a93638f65e3f04e1c2746b1`.
The historical container SBOM is omitted, not cleared for distribution. Generated
builds, containers, private records and automatic workflows are outside the
[approved source scope](SOURCE_RELEASE_SCOPE.md). GitHub publication does not
authorize AWS deployment or public website hosting.

Historical follow-up: 2026-10-31. A local pre-handoff scan covered 827 candidates,
47 findings across 44 files: 33 cloud-identifier, nine email-shaped, four
personal-path-shaped and one original-image-metadata finding. All matched literal
ARN account fields in original/quoted inspection forms were documented synthetic
zero/example/repeating-digit shapes. This does not prove that every encoded
identifier, email, image or Git-history object is safe. No detector exception was
added. The new diagnostic test uses an invented private-path sentinel and stays
flagged. Historical SBOM and original PNG rights/metadata review remain open.
No remote, workflow, staging, commit or upload followed the review; future counts
must be recomputed for the exact final candidate.

The ignored local evidence directory was separately checked with bounded,
read-only UTF-8 scanning: 212 text files / 515,955 bytes, no unreadable, linked,
oversized or binary-text candidates and no high-confidence credential matches.
This excludes screenshots, other binary files, Git objects and unrelated user
directories; it is not a complete privacy or credential-revocation guarantee.
No output contents or matched values were copied into this report.

Read-only Git inspection on October 31 found zero refs, zero reachable commits
and zero remotes. A later local object review additionally found zero loose/packed
objects, packs and garbage; `git fsck --full --no-reflogs --unreachable` succeeded
with no object findings. No remote contact, index/config write or deletion was
performed. There is no current object history to clear, but untracked sources,
a future initial commit and any later objects still require their own review.
The source PNG was visually rechecked:
it contains a project title and illustrative market graphics, not a photographed
account console. Its SHA-256 remains
`f5509cbe6526b4cca90e78a7f24faab4db17cf86bd00fedc6363fdd6d7ba1fc2`.
Visible appearance and a provenance chunk do not establish redistribution rights.
On 2026-10-31 the owner confirmed that this image was AI-generated directly for
this project, rather than obtained as an external image. This resolves the
source-origin question as an owner attestation, not independent verification of
generation records, an unrestricted rights guarantee or permission to publish.
The original PNG hash was rechecked unchanged after that confirmation. Embedded
metadata/privacy and exact publication-copy review remain separate; no detector
exception, metadata stripping or image replacement was performed. The historical
SBOM is also unchanged. GitHub upload still requires its separate final approval.

Historical follow-up: 2026-10-22. Public CA certificate fingerprints/fixture are not
private keys, installed anchors or approval to publish the repository. No raw
certificate/registry token/private process/log data is retained by the public
projection. Task-owned portable Node and logout screenshots stay ignored.
Original PNG/SBOM and all existing manual findings remain for final review;
no detector exception, remote/workflow/push or public hosting.
[Current security scope](evidence/WORKER_CA_REMEDIATION_2026-10-22.md).

Historical follow-up: 2026-10-21. The bounded OS advisory fields/failure diagnostics
introduce no raw scanner text, personal path or account value. The existing
synthetic/artifact review remains unresolved; no detector exception, original
PNG/SBOM replacement, remote/workflow or publication. Current counts belong to
the final safe-stop record. [Current security scope](evidence/WORKER_CA_ADVISORY_2026-10-21.md).

Historical follow-up: 2026-10-20. Before final handoff, the scanner retains 31
findings across 28 files; current candidate counts belong to the final safe-stop
record. The added controller AWS-call deadline fixture uses all-zero synthetic
account/task references and stays flagged. No detector exception, public-safe
replacement of the original PNG/SBOM, remote/workflow/upload or publication
approval. [Current local implementation](evidence/WORKER_UNCOOPERATIVE_DEADLINES_2026-10-20.md).

Historical follow-up: 2026-10-18 Maintenance/client scope. Pre-handoff scan retains
30 findings across 27 files/553 candidates. The two new flags are the all-zero
synthetic ECS identity in maintenance deadline tests and the invented OS paths
in ending-inventory environment tests. Keep both flagged for final human diff;
no real identity/path was substituted, no detector is waived, and no original
PNG/SBOM is overwritten. Secret scan zero does not clear these or legal/history
review. [Separate implementation/ending scope](evidence/LOCAL_SAFE_STOP_2026-10-18_MAINTENANCE.md).

Historical follow-up: 2026-10-16. The initial local scan finds 27 manual findings
across 24 files/488 candidates. All flagged text occurrences were triaged as
synthetic negative fixtures/documentation examples or upstream maintainer
metadata, not cleared for a future changed revision. The source PNG was visually
inspected: no account/browser/user details are visible; its caBX provenance chunk
(24,910 bytes) and image-rights review remain unresolved. Its unchanged source
SHA-256 is `f5509cbe6526b4cca90e78a7f24faab4db17cf86bd00fedc6363fdd6d7ba1fc2`.
No provenance chunk or historical SBOM was removed/rewritten. No detector waiver,
remote, workflow or upload follows this triage. Fatal text decoding now refuses
ambiguous encodings instead of silently clearing them; final counts belong to
the dated safe-stop record. [Local regressions](evidence/LOCAL_BOUNDARIES_2026-10-16.md).

Historical follow-up: 2026-10-11. The pre-handoff local scan finds 24 manual findings
across 21 files/437 candidates. Secret scan reports zero high-confidence
matches; 138 Markdown files/334 local links have no broken target. These are
bounded local observations, not publication approval. Structured controller
and log-simulation failures now suppress private response contents without
allowlisting any detector fixture. Artifact/rights/history/manual review stays
pending, and no remote, staging, commit, workflow or push occurred.
[Current diagnostic boundaries](evidence/PHASE11_CONTROLLER_FAILURE_DIAGNOSTICS_2026-10-11.md).

Historical follow-up: 2026-10-10 evening. The new local timing-observer email-shaped
sentinel is a synthetic rejected-input fixture and stays flagged. Pre-handoff
scan: 433 candidates, 24 manual findings across 21 files; no detector waiver or
publication. New specific approval allowed one official npm advisory query and
the exact controller condition removal; the original IAM reconciliation still
failed and independent proof scopes are recorded separately. See
[evening safe stop](evidence/LOCAL_SAFE_STOP_2026-10-10_EVENING.md).

Historical morning follow-up: 2026-10-10. Public-base redirect/userinfo negative fixtures
and the existing synthetic ownership/recovery/archive fixtures remain flagged
for final manual review. The pre-handoff scan has 425 candidates and 23 findings
across 20 files; later closing counts are recorded in dated safe-stop evidence.
No detector allowlist, remote, staging, commit, workflow or push was introduced.

Historical follow-up: 2026-10-04. New circuit-denial fixtures remained flagged for
final manual review; no detector allowlist, remote, staging, commit, workflow
or push was introduced. The final candidate/findings counts are recorded in
the dated safe-stop evidence. The 2026-10-03 checkpoint had 304 candidates and
18 findings across 15 files; preserve that as a historical observation.

## Current preflight findings

November 1 follow-up: 836 candidate files initially had 47 findings across 44
files. Adding the official typescript-eslint documentation link produced one
additional personal-path heuristic finding: its public URL uses a `users` path
segment. The final observed count is 48 findings across 45 files. This is a
public documentation URL, not a local user directory; the detector remains
unchanged and the finding is preserved for final review.
The following additional rows close documentation coverage gaps in this
triage table, not scanner findings. Reviewed source occurrences remain fixed
synthetic test data; none is a current AWS identity or user contact. No detector
exception, source substitution, upload or blanket approval is introduced.
The exact final candidate and any future edits still need their own review.

| Additional reviewed file | Observed purpose of flagged shape | Disposition |
| --- | --- | --- |
| `docs/evidence/LINT_EXECUTION_BOUNDARY_2026-11-01.md` | Official public documentation URL resembles the detector's personal-path pattern. | Keep the citation and finding; not a leaked local path or scanner exception. |
| `infrastructure/tests/infrastructure.test.ts` | Reserved example email rejects sensitive owner labels. | Keep negative test; review final diff. |
| `scripts/tests/candidate-vulnerability-triage.test.ts` | Reserved example contact-shaped string and private sentinel test sanitized vulnerability output. | Keep negative test; no raw report disclosure. |
| `scripts/tests/circuit-denial-live.test.ts` | Invented account/foreign-scope references test stable controller and owner boundaries. | Keep fixtures; not a live denial or execution permit. |
| `scripts/tests/local-test-failure-summary.test.mjs` | Invented personal-path sentinel proves failure diagnostics expose only ordinals/hashes. | Keep fixture; never copy real failure paths into public evidence. |
| `scripts/tests/synthetic-alternate-principal-cli.test.ts` | Fixed example account/role and injected CLI denial results. | Keep fixture; not a real identity or actual STS attempt. |
| `services/controller/tests/owner-admission-window.test.ts` | All-zero owner/task references and injected clock/executor test window enforcement. | Keep fixture; enabled values here do not enable deployment. |
| `services/local-owner/tests/job-session-controller.test.ts` | All-zero owner with in-memory launcher tests acknowledgement and admission. | Keep fixture; no actual task start. |
| `services/local-owner/tests/synthetic-alternate-principal-lease.test.ts` | Example account/role and injected credentials test restricted lease lifetime. | Keep fixture; recheck fake key values before publication. |
| `services/local-owner/tests/synthetic-alternate-principal-review.test.ts` | Example-account snapshots and private-response sentinel test policy rejection. | Keep fixture; no real policy snapshot reproduced. |
| `services/local-owner/tests/synthetic-denial-evidence.test.ts` | Invented denial message proves raw identity/message fields are suppressed. | Keep fixture; parsed examples are not cloud denial proof. |
| `services/operations/api-smoke/tests/signed-api-cancellation.test.ts` | Synthetic API endpoint and injected cancellation/transport. | Keep fixture; final review must verify destination remains invented. |
| `services/operations/api-smoke/tests/signed-api-response.test.ts` | Synthetic endpoint and response-reader failure sentinels. | Keep fixture; no raw response included in public diagnostics. |
| `services/private-access/tests/owner-session.test.ts` | All-zero owner, example origins and rejected URL userinfo. | Keep fixture; no real browser session or contact. |
| `services/private-access/tests/read-authorizer.test.ts` | All-zero owner/API context plus foreign-scope negative examples. | Keep fixture; not deployed authorizer acceptance. |
| `services/private-access/tests/session-http.test.ts` | All-zero account and invented session/cookie/header values. | Keep fixture; no real token was substituted. |
| `services/private-access/tests/session-store-plan.test.ts` | All-zero owner and repeated-character hashes in persistence plans. | Keep fixture; not real stored credentials. |
| `services/private-access/tests/session-store.test.ts` | Same invented persistence records with injected DynamoDB senders. | Keep fixture; no real database contents. |

On 2026-10-13, a separate ignored local runtime SBOM preview was generated from
37 current pinned components with no author/contact/path fields. The original
historical SBOM was not read or replaced, and its redistribution review stays
open. Official schema structure was checked, not formats, image/OS completeness
or license obligations. This does not move any original artifact outside the
publication candidate set or permit upload.
[Preview evidence](evidence/PHASE12_RUNTIME_SBOM_PREVIEW_2026-10-13.md).

The local publication preflight reports finding categories and file paths but
never prints matched values. The original artifact actions and stricter
synthetic cloud-identity fixtures remain unresolved. The new denial fixture
uses an example Tokyo API hostname to prove signed destination boundaries,
not a live endpoint. It performed no network call or push. The detector
remains intentionally strict; final current counts belong in closing evidence.

| Candidate | Category | Local classification | Required final action |
| --- | --- | --- | --- |
| `services/controller/tests/aws-call-deadline.test.ts` | cloud identifier shape | All-zero synthetic account/task/cluster in late-acknowledgement guards; no live AWS request or private task identity. | Keep flagged for final human diff; no fixture allowlist or authorization claim. |
| `services/operations/sweeper/tests/maintenance-deadline.test.ts` | cloud identifier shape | Invented all-zero account/cluster/task/owner for cancellation and late-acknowledgement regressions, never an AWS request. | Keep flagged for final human diff; synthetic effects are not live authorization or recovery. |
| `scripts/tests/local-safe-stop-inventory.test.mjs` | personal path shape | Invented OS bootstrap paths and private sentinel values prove child-env filtering, not a user's machine location. | Keep flagged; never allowlist a test file that might later contain a real path or credential. |
| `docs/evidence/PHASE11_SUPPORT_REVIEW_DRAFT_2026-10-15.md` | cloud identifier shape | Explicitly invented request examples; no actual signed request/account/private reference is reproduced. The draft remains unsent. | Keep flagged for final human diff and separate exact-destination/disclosure review before any submission. |
| `scripts/local-iam-wire-proof.mjs` | cloud identifier shape | Fixed synthetic CLI wire fixture sent only unsigned to its owned loopback server, never to AWS. | Keep flagged; fixture serialization is not actual authorization or captured real AWS traffic. |
| `scripts/tests/maintenance-log-diagnostics.test.ts` | cloud identifier shape | Fixed example-account and foreign-scope negative fixtures exercise complete/sanitized diagnostic results. | Keep flagged for final human diff; do not allowlist a file that could later gain a real identifier. |
| `docs/evidence/worker-image-20260810.cdx.json` | email-shaped strings | Third-party package-maintainer metadata in a historical SBOM; not a project credential, but not cleared for redistribution. | Keep the historical evidence private. Generate a current public SBOM with only necessary component, version, license and provenance fields, then review its rights and contents. |
| `frontend/public/og.png` | embedded PNG metadata | The source image contains a non-rendering provenance chunk. The build process removes it only from the distribution copy. | Confirm image rights, preserve the original outside the publication candidate set, and replace the source candidate with a pixel-equivalent metadata-clean copy. Re-run image validation. |
| `frontend/tests/api-client.test.ts` | cloud identifier and email shapes | Deliberate invalid-URL and private-field fixtures using reserved/synthetic identities. | Retain only after a final human diff confirms no real account, endpoint, credential or personal address was substituted. |
| `infrastructure/tests/infrastructure.test.ts` | email shape | Deliberate non-sensitive owner-validation fixture. | Retain after the same final human review. |
| `scripts/tests/publication-audit.test.mjs` | cloud identifier, personal path and email shapes | Detector sentinel values created to prove the scanner reports categories without echoing values. | Retain; verify that no assertion or failure output can reveal a matched value. |
| `scripts/tests/check-document-links.test.mjs` | personal path shape | A synthetic absolute-path negative fixture; not a user's machine location. | Keep flagged for final human review rather than allowlisting the detector. |
| `scripts/tests/local-check-step.test.mjs` | email shape | A private sentinel at a reserved example destination tests rejection before child execution and suppressed diagnostics. | Keep flagged for final human diff; no network or detector waiver. |
| `scripts/tests/phase11-live-readiness.test.ts` | cloud identifier shape | Reserved numeric account placeholders, synthetic IAM/ECS/ECR references and negative foreign-scope cases; no real account or credential. | Keep flagged for the final human diff; report assertions must never reveal raw identifiers. |
| `scripts/smoke-controller-bundle.mjs` | cloud identifier shape | All-zero account/revision-pinned ECS values for zero-AWS health validation. | Keep flagged and verify the final diff; synthetic format proof is not live ownership. |
| `services/controller/tests/ecs-task-launcher.test.ts` | cloud identifier shape | Zero-account task/cluster/task-definition, ownership and negative foreign-scope fixtures. | Keep flagged for final human review; no raw launch response in public diagnostics. |
| `services/controller/tests/runtime-config.test.ts` | cloud identifier shape | Synthetic full-ARN configuration and wrong-scope negative fixtures. | Keep flagged for final human review rather than weakening the detector. |
| `services/operations/api-smoke/tests/job-inspection.test.ts` | cloud identifier shape | Synthetic Tokyo ECS ARN fixture with a zero account placeholder. | Retain after final human review. |
| `services/operations/api-smoke/tests/circuit-denial.test.ts` | cloud endpoint shape | Example Tokyo execute-api host plus negative foreign/noncanonical destinations for zero-AWS signed mock responses. | Retain only after final human diff; HTTP denial and local spy counts must not be claimed as live cloud cleanup. |
| `services/operations/api-smoke/tests/signed-api-client.test.ts` | cloud endpoint shape | Synthetic API Gateway hostname used to test SigV4 and HTTPS boundaries. | Retain after final human review. |
| `services/operations/sweeper/tests/handler.test.ts` | cloud identifier shape | Synthetic ECS cluster ARN fixtures with zero account placeholders. | Retain after final human review. |
| `services/operations/sweeper/tests/slot-reconciler.test.ts` | cloud identifier shape | Synthetic ECS cluster ARN fixture with a zero account placeholder. | Retain after final human review. |
| `services/operations/sweeper/tests/stale-job-sweeper.test.ts` | cloud identifier shape | Synthetic ECS cluster ARN fixture with a zero account placeholder. | Retain after final human review. |
| `scripts/maintenance-recovery-rehearsal.ts` | cloud identifier shape | Fixed synthetic identities and in-memory senders exercise the real recovery functions without an AWS client, credential or network. | Keep flagged; synthetic stop/release counts are not real AWS cleanup evidence. |
| `scripts/tests/maintenance-reference-readiness.test.ts` | cloud identifier shape | Constructed numeric-account ownership fixtures and a private sentinel test exact references and sanitized reports. | Keep flagged for a final human diff; a permitted next diff is not permission to deploy. |
| `scripts/tests/verify-worker-release.test.ts` | cloud identifier shape | Synthetic OCI application layers and an unconnected account-shaped ECR target test metadata/body/source comparisons only. | Keep flagged; the positive fixture does not prove the deployed archive, complete notices or a current scan. |
| `scripts/tests/public-base-notice-proof.test.mjs` | email shape | A synthetic rejected redirect userinfo field proves credentials cannot accompany a public-base redirect. The injected fetcher makes no real network request. | Keep flagged; confirm the value remains synthetic and the rejection assertions still suppress it. No detector waiver. |

“Synthetic” is a triage result, not a scanner allowlist and not permission to
push. The generic detector must continue flagging these patterns so a future
accidental replacement with a real value cannot silently pass.

The updated guards also recognize private assistant-state folders, cloud-state
backups and internal ECR addresses. Bounded Git enumeration and CLI failures
must not expose raw filesystem/Git output. Upload/push-like arguments are
rejected; no scanner command performs publication. Source pattern scanning
excludes generated dependencies and never represents their contents as
inspected. Root-level license text hashes and the incomplete development graph
are recorded separately in [the license evidence](evidence/PHASE12_LICENSE_METADATA_2026-10-03.md).
Module/declaration TypeScript extensions receive normal privacy/credential
inspection. The five-file frontend distribution now preserves pinned upstream
runtime notice bytes, but three backend packages lack verified license documents;
full development/OS/emitted-module coverage and legal interpretation remain open.
See [the attribution boundary](evidence/PHASE12_RUNTIME_ATTRIBUTION_2026-10-03.md).
The [2026-10-04 published-package proof](evidence/PHASE12_PUBLISHED_LICENSE_PROOF_2026-10-04.md)
also found no root documents in the integrity-matched published versions of
those three packages. It narrows the evidence but does not supply exact source
commits, interpret rights or clear backend attribution. Today's registry
advisory result is separately dated and does not stand in for an image/OS scan.
Compiler metadata identifies two virtual-generated module entries whose rights
cannot be inferred from the three runtime-package notices. Their review also
remains open; no private module IDs are emitted or stored in the public build.

## Final publication gate

### Local inventory preparation (no upload)

The [October 31 artifact review](evidence/PUBLICATION_ARTIFACT_REVIEW_2026-10-31.md)
records the owner's AI-generation confirmation, bounded original metadata/SBOM
inspection and the limits of those checks. It does not waive existing findings.

From the project root, using the supported Node runtime:

```powershell
node scripts/publication-review-snapshot.mjs
node scripts/publication-review-snapshot.mjs --execute-local-snapshot
```

The first command is an inert plan. The second reads candidates and writes only
a unique ignored metadata receipt, not a source archive or public repository.
Any later source edit requires a new snapshot. The receipt always retains
`readyForPublication:false`; successful collection does not clear its findings,
review Git history, select image/SBOM replacements or authorize a push.

### Separate release decision

Do all of the following only after product completion:

1. Freeze the intended publication candidate list and review every added,
   modified, deleted, binary and generated file.
2. Decide explicitly which image/SBOM artifacts belong in that publication scope,
   without overwriting private originals. If a clean PNG copy is selected, verify
   its rendered pixels and metadata; if a replacement SBOM is selected, verify
   its component/license coverage against the artifact it actually describes.
   Omitting a historical binary/SBOM from a source-only candidate must be recorded
   transparently, not presented as clearance of that artifact or silently replaced
   with a narrower runtime inventory. No scope choice is made by this checklist.
3. Inspect any Git history, screenshots, logs, evidence, image metadata,
   absolute paths, comments and configuration examples for credentials,
   personal data, real AWS identifiers and provider/model content.
4. Re-run the high-confidence secret scan, publication preflight, dependency
   advisory lookup, license inventory, documentation-link check and complete
   local checker from a clean clone.
5. Review any future GitHub workflow separately for token permissions, secret
   scope, fork behavior, third-party actions and potentially chargeable usage.
6. Show the final unresolved findings and exact publication scope to the user.
   Create a remote or push only after explicit approval.

No item in this document authorizes AWS deployment, public hosting, a GitHub
workflow, remote creation or publication.

The 2026-10-10 morning public advisory-inventory egress was rejected before execution by
automatic security review and was not retried through a different endpoint or
tool. Current advisory status is unknown. A specifically approved current
registry query is a separate gate from genuine dependency downloads for an
isolated build. The persistent controller IAM correction remains independently
blocked at that historical checkpoint; neither local source tests nor a publication scan overrides it.
Evening specific human approvals and their actual separate outcomes are in
[the current safe stop](evidence/LOCAL_SAFE_STOP_2026-10-10_EVENING.md); they do
not approve GitHub publication, a future disclosure or role/service enablement.

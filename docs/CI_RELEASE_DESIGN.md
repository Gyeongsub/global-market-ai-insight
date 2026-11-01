# Phase 12 CI and release design — proposal only

Status: local design checkpoint, 2026-09-24. **No GitHub workflow, repository remote, AWS OIDC provider/role, GitHub secret, deployment, or public release exists from this work.** The user requires project completion and a complete security/privacy review before any GitHub upload.

## Why automatic CI is deferred

### Local tracked-snapshot clone preparation — 2026-10-24

`pnpm check:local-git-plan` is zero-action. The explicitly executed
`pnpm check:local-git-frozen` makes a private source-only snapshot in a new
owned OS temporary directory, commits only that copy, clones over the local
file protocol without hardlinks/submodules, removes its temporary origin and
checks tracked regular files, Git objects and exact source bytes. It does not
run Git against the original repository or change global trust/configuration.
User/system Git configuration, hooks, attributes, credentials and network
protocols are excluded. Repository filter/submodule files are rejected before
Git reads source. Public npm downloads use the existing pinned, lifecycle-off
frozen proof with a fresh store, using the clone's tracked bytes as input.
The operator installation's pinned YAML reader is a disclosed bootstrap tool
for lock validation; it is not a copied/reused application dependency. The
clone and original source/lock fingerprints must agree before that stage.

Its durable public projection must bind the exact source fingerprint and
strict nested proof after both temporary-tree cleanups. This is a local
snapshot-clone/input-closure proof, not a clone of an approved published
repository, a CI run, deployment, license/privacy clearance or publication
approval. The original fresh-install producer still truthfully reports
`cleanGitCloneClaimed=false`. The separate actual Git probe is opt-in:
`node --test scripts/probes/local-git-clone.probe.mjs`; routine unit guards
do not start Git or recursively launch an install. Actual final results are
recorded separately after execution. The initial 617-file source passed the
actual local snapshot/clone/frozen gate: 90 steps, 1,392 tests (1,391 pass/one
existing privilege skip), 317,188 ms. The final 632-file HTTP/lifecycle source
separately passed 90 steps/1,414 tests (1,413 pass/one existing privilege skip),
356,394 ms, with strict saved/current matching before handoff-only text.
[Measured scopes and remaining gates](evidence/LOCAL_HTTP_AND_GIT_PROOF_2026-10-24.md),
[final proof and safe stop](evidence/LOCAL_SAFE_STOP_2026-10-24_HTTP_SESSION.md).

The October 16 source hardens encoding/provider/analysis boundaries and test
collection without enabling any workflow. The initial native timeout stays
failed; later whole/frozen evidence cannot borrow earlier passes. All 79 steps,
four groups, two-file test bounds and the six-minute ceiling remain. Direct
Node/tsx removes only a launcher, not a check; module-cache experiments did not
justify adopting a cache. Failed frozen receipts retain bounded public hash/
ordinal diagnostics and never imply success. [Current investigation](evidence/PHASE12_LOCAL_GATES_2026-10-16.md).

The final post-candidate source separately passed genuine frozen install and all
79 steps/four groups: 1,078 tests, 1,077 pass/one existing privilege skip,
295,801 ms, independently matching the then-current source hash. Subsequent
handoff text receives separate scans. This is not a clean Git clone, workflow,
deployment, complete image/legal/security review or permission to publish.

The October 15 checker runs zero-action registry signature/runtime archive plans
and synthetic tests only. Actual fixed public reads are separately opted in;
37 exact installed package matches do not clear three unknown signing keys or
license/source/image/publication gates. API request guard fixes remain local,
not deployed. No workflow, upload, credentials or CI cost is enabled by these
tests. [Supply-chain scope](evidence/PHASE12_RUNTIME_PACKAGE_BYTES_2026-10-15.md),
[request scope](evidence/APPLICATION_REQUEST_BOUNDARIES_2026-10-15.md).

The final native 79-step snapshot passed 1,053 tests (one existing OS-privilege
skip), but both genuine frozen whole attempts timed out and remain failed. No
CI/reproducibility success is inferred from native success, a lock-aligned
install stage or earlier source snapshots. Investigate the cold-install budget
locally before proposing any workflow; do not silently retry/drop tests or
extend the deadline to claim green. [Exact gate observations](evidence/PHASE12_LOCAL_GATES_2026-10-15.md).

The October 14 current-installation receipt requires matching candidate-source
fingerprints before/after the unchanged whole gate. Whole-manifest and reviewed
schema pins protect runtime previews; restricted format assertions reject fields
outside the generated subset. Neither receipt nor preview authorizes CI/upload.
The first actual timeout stays failed. Early flag/config validation now happens
before CDK loading, with original tests, deadlines and gates retained.
[Dated scope](evidence/PHASE12_SOURCE_AND_SCHEMA_BOUNDARY_2026-10-14.md).

The October 13 local checker additionally validates an in-memory privacy-minimized
runtime dependency SBOM and zero-action plans for fixed public-schema and IAM
input comparisons. It does not execute their external opt-ins. The ignored local
preview is not a distributed artifact, complete legal/image graph, workflow or
publication approval. [Scoped evidence](evidence/PHASE12_RUNTIME_SBOM_PREVIEW_2026-10-13.md).

Adding `.github/workflows/*` now would create a future execution path when the repository is eventually published. Even if a source file contains no literal secret, a workflow may consume GitHub Actions minutes, fetch dependencies, access a token, produce public logs/artifacts, or later acquire AWS permissions. The local publication preflight therefore flags every workflow file for manual cost/automation review. No workflow should be added merely to make a CI checkbox green.

GitHub currently documents standard hosted runners as free for public repositories; private repositories have plan-specific included minutes/storage and can incur charges above allowances. Larger runners can be charged even on public repositories. These are **service rules**, not proof of this account's current billing settings, future price, or safety of an arbitrary workflow. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Proposed first CI stage, after publication approval

Start with a manually triggered, non-deploying workflow only. No `push`, `pull_request_target`, schedule, repository write, artifact upload, cache upload, Docker registry login, AWS credentials, model/provider call, or cloud deployment in v1. Use a standard hosted runner with a bounded job timeout, an explicit `contents: read` token permission, and concurrency limiting redundant runs. GitHub documents these workflow controls in its [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

The checked-out revision would use the pinned Node/pnpm versions and frozen lockfile, then run the same local `scripts/check-all.mjs` gate. It already covers type checks, lint, contracts, infrastructure synth/assertions, build, high-confidence secret patterns and license checks. Add a current advisory lookup as a separate reporting gate; network or advisory-service failure must be **unknown**, not a clean bill of health. The local checks synthesize templates only and must remain unable to call AWS or Twelve Data/Bedrock.

The 2026-10-09 local checker includes pinned helper documents and zero-network
plans for public helper archive proof, advisory lookup and missing-platform
declarations. It never runs their network opt-ins implicitly. The actual dated
[advisory query/correction](evidence/PHASE12_DEPENDENCY_ADVISORY_RECHECK_2026-10-09.md)
and [49 publisher declarations](evidence/PHASE12_PUBLISHED_LICENSE_METADATA_2026-10-09.md)
are separate operator evidence, not CI execution or full source/legal coverage.
Queries disclose only the already reviewed public package coordinates, reject
changed lock fingerprints and cannot fall back to private project metadata.
The current frontend artifact audit uses full pinned producer documents plus
declared runtime notices; exact generated/native origin review remains open.
See [helper attribution](evidence/PHASE12_FRONTEND_HELPER_ATTRIBUTION_2026-10-09.md).

The existing license gate deliberately covers the 34 production packages used
by deployable code. On 2026-10-01, `pnpm licenses list --json` could not produce
a complete development graph because the reused installation lacked one pnpm
package-index record; this is **unknown**, not a pass. A metadata-only
diagnostic also found development-tool entries under BlueOak-1.0.0,
CC-BY-4.0, MPL-2.0, Python-2.0 and an MIT/GPL dual expression. A clean-clone
candidate must generate a complete lock-aligned list, select the permissive
branch of any dual license where applicable, inspect attribution or source-
disclosure obligations and fail on missing metadata before publication. Do
not broaden the production allowlist merely to silence development-tool
findings.

The [2026-10-03 local inventory](evidence/PHASE12_LICENSE_METADATA_2026-10-03.md)
matches 342 of 391 exact lock identities without the missing pnpm index,
includes the two frontend React runtime packages and explicitly retains 49
unavailable other-platform manifests. This improves traceability, not legal/
publication approval, a fresh install or current advisory/image checks.
`pnpm audit:license-metadata` is reporting-only and always leaves publication
false; its negative tests are included in local checks.

Its root-only document follow-up hashes verified license/notice files without
retaining copyright text or private paths: 330 identities have a license file,
six have NOTICE, and 61 lack a verified root license file. This does not validate
terms or assemble distributed notices. A confined, identity-checked backend
gate still covers only 34 packages. Source-copy preparation now strips inherited
cloud credentials/authorization and script-injection variables case-insensitively,
excludes private scratch/cloud state, and refuses redirected temporary cleanup.
Helper tests do not claim that today's complete source rebuild or fresh install
was performed. See [today's boundary](evidence/LOCAL_SAFE_STOP_2026-10-03.md).

The 2026-10-01 `pnpm check:clean-source` checkpoint copies the current 259-file
source/documentation set without existing bundles, `dist` or `cdk.out` and
successfully rebuilds the full local gate in a temporary directory. It
deliberately reuses the current pinned dependency installation, so it is
evidence against hidden generated-artifact dependencies but **not** a clean
clone or fresh frozen-lockfile install.
See [the bounded local evidence](evidence/PHASE12_LOCAL_CLEAN_SOURCE_PROOF_2026-10-01.md).

The [later 2026-10-03 revision](evidence/PHASE12_LOCAL_CLEAN_SOURCE_PROOF_2026-10-03.md)
uses isolated dependency **file copies** with temporary-tree-only links, framed
source fingerprints and complete numeric test evidence. Its gate now includes
33 owned-loopback HTTP requests and confirmed server cleanup; no external
network/AWS access occurs. This distinction replaces a zero-network claim for
that newer gate, not the older dated results. Runtime attribution is separately
byte-preserved and pinned; missing backend documents and full development/
OS/emitted-module licenses remain unresolved. No workflow is created here.
The build-only module metadata hook reports only package counts and fixed public
chunk hashes, verifies actual written bytes and keeps generated-helper/legal
approval false. It does not emit source maps or private module IDs into a public
artifact or CI report. Two virtual-generated entries need provenance review;
do not infer complete attribution from a passed declared-package notice check.

Pin external actions to reviewed full commit SHAs and grant only permissions each needs; do not rely on mutable tags for a privileged workflow. [GitHub's security guidance](https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats). Avoid echoing environment variables, full Git history, raw provider/model payloads, screenshots, or sensitive test failures in logs. No production image or workflow artifact should be uploaded by default.

The local `check:docs` gate validates repository-relative Markdown links without
network access. It rejects missing targets, links escaping the project and
absolute personal-computer paths while reporting only the source file and
finding category. External URLs still require a separate dated source review.

## Explicit later gate for deployment automation

Deploying from CI is a different capability, not an extension of the manual local-check job. It requires the final repository owner/name, selected branch/environment, exact stack scope, cost ceiling and teardown plan, IAM-negative tests, environment protections, and separate user approval. If approved, use temporary AWS credentials from OIDC rather than a long-lived IAM access key. The IAM trust condition must restrict `token.actions.githubusercontent.com:sub` to the exact authorized repository and branch/environment; never use a broad wildcard. [AWS IAM GitHub OIDC guidance](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html). Give the role only the bounded resources/actions required by the specific deployment and avoid automatic deploy on every push. No such role or provider is created by this proposal.

## Acceptance before creating any workflow

1. Finish product and source publication review, including image provenance,
   production and development dependency licenses, third-party notices, files
   and Git history; receive separate GitHub publication approval.
2. Confirm public/private repository choice, GitHub plan/payment and any budget or spending limit, standard-runner availability, expected run count and log/artifact policy.
3. Review the exact workflow diff, action SHAs, token permissions, triggers, timeout, concurrency and networked steps. Confirm no AWS credentials or deployment permissions in the first CI stage.
4. Execute one user-approved manual run, check result and GitHub usage, and disable/revise if the job exceeds its budget or reveals sensitive output.
5. Decide any later deployment workflow and OIDC trust in a separate security/cost approval; never infer it from a successful local-check run.

This design does not count as CI execution, a clean-clone proof, a current image scan, or Phase 12 completion.

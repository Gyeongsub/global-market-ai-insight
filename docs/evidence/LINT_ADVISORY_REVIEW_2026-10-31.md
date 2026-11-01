# Development dependency advisory review — 2026-10-31

## Approved disclosure and actual result

The owner specifically approved one submission of 392 public package identities
(names and exact versions) to the npm official bulk advisory endpoint. The earlier
attempt was rejected before execution; it was not rerouted to bypass review.
After approval, exactly one bulk request succeeded at 04:15:43.295 UTC.
No source, private project name, AWS identifier, authentication value or private
dependency tree was included. No package installation or payment occurred.
This one-request permission is consumed; it is not approval for recurring queries.

- Lock SHA-256: `f4eda72802c41606a4b8a6ca5d59770ad3ed8e8c13351c7d9e7740878a1d11d6`.
- Coordinate-body SHA-256: `1d5de80d698720f09c579580599632e7f5a9d3df41d0b52dc740291e277510e8`.
- Response-byte SHA-256: `631b4761167f67b5227043a138987e5a9784dc107c982e5269cef56c88369a14`.
- One moderate advisory, two matching locked versions: minimatch 3.1.5 and 10.2.6.
- Zero matching identities in the separately declared 37-component runtime graph.
- High/critical matches: zero. This is not a full image/OS or future safety claim.

The scan intentionally returned its nonzero finding status. It is not an unknown
network failure and must not be reported as a zero-vulnerability result.

## Scope, compatibility and residual risk

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
lists versions below 11.0.1 as affected. Its described mechanism is advanced glob
preprocessing in 10.2.6 at `optimizationLevel >= 2`. The locked packages enter
through development lint tools, not the declared application runtime graph.

Local source inspection found the TypeScript-estree caller using only `{ dot:
true }`; its consumer file SHA-256 is
`c4e1897950f02316540978b62449f19b78c8cde820358eadec438d45ce5495c8`.
The current frontend configuration does not enable projectService. A small trusted
lint fixture and ordinary match checks did not execute firstPhasePreProcess;
a tiny level-two positive control did, so the observation is not an inactive spy.
The legacy 3.1.5 implementation has no such method. These are narrow current-path
observations, **not** a waiver of the registry range or proof of every code path.

A separate anonymous GET of public minimatch metadata found 3.1.5 and 10.2.6
still the newest stable versions in their respective major lines at review time.
It was not a second bulk inventory submission. No package was downloaded for
installation, executed from the network or changed in the lockfile/store.

The official [11.0 changelog](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.1/changelog.md)
removes APIs including makeRe and changes matching internals. The
[11.0.1 manifest](https://raw.githubusercontent.com/isaacs/minimatch/v11.0.1/package.json)
also introduces a matcher dependency. Legacy 3.x callers expect a callable CommonJS
export; forcing every version to 11 is not a compatible security-only edit. The
legacy license differs from 11's BlueOak declaration; 10.2.6 already declares
BlueOak. No blanket major override, suppression or dependency-removal shortcut
was applied.

Until an appropriate compatible update is reviewed, run lint only on trusted
local source/configuration; do not expose pattern input as a service, enable
advanced user-supplied glob options, or execute unreviewed external workspaces.
The regression tests preserve both advisory matches and check the current local
usage boundary using tiny ordinary patterns, never an amplification payload.
The dependency remains **unpatched and unresolved for final publication review**.

Focused validation after adding those checks: 20 tests passed, zero failed/skipped
across lint-dependency-boundary and registry-advisory-proof. The latter uses
injected fixture responses; these tests did not make another registry query.
Documentation links (279 files, 936 links) and high-confidence secret checks also
passed at that checkpoint, before later README consistency edits.

## Cost and release boundaries

This review made zero AWS/model/provider/compute calls and created no cloud
resources, subscriptions, workflow, public endpoint or GitHub upload. Existing
cloud storage and earlier usage can still incur delayed charges; those are not
reassessed by a local dependency review. The owner's current browser login is
separate from project CLI credentials and has not been consumed by this work.

Passing local tests or a fresh installation does not clear this advisory. The
preceding 830-file source revision independently passed matching current and
frozen-clone checks (90 steps, 1,888 pass, one skip; source SHA-256
`7ead4f01fea3dc7daf176809ae50a6f8ffc7ad33f234853fb9da90271c62c134`).
That reproduction result predates this document and the new boundary tests.
No post-remediation or fresh-registry clean result is claimed.

## Follow-up verification and safe closure

Current-installation gate `f573729d-d038-49e6-9dbe-89ff6719bdc6` completed at
04:34:06.192 UTC: 90 steps, 1,891 passed, one existing skip; 33 loopback requests
and confirmed fixture/server closure. Exact source: 831 files / 7,454,615 bytes /
SHA-256 `bf4409a2fe7a14d15990dabcd8633f8dbfb582687b71f93af9636af64fc1ddc4`.
This includes the new boundary tests and documentation consistency corrections,
but not this final evidence addendum. It is not a new frozen-clone receipt or
permission to run AWS against later edited source.

The preceding sandbox gate `a0b1691b-c0f3-49de-8770-b33bf35142ee` remains failed
at helper-test step 67, not timed out. Stored hashed titles identified the first
16 failure hints. One focused reproduction failed during fixture junction
creation with EPERM in the restricted Windows sandbox, then passed unchanged in
the permitted local environment. The full permitted run above passed without
removing/weakening assertions. This identifies that reproduced environment
failure, not every truncated failure marker and not the older unexplained
service-test failure recorded in browser acceptance evidence.

README, architecture, API scope, threat model, cost model, learning guide and demo
now distinguish the accepted model-role browser path from historical API/Fargate
and administrator-backed candidates. The SPCX demo correctly stays unavailable,
including in its normal scenario. These edits introduce no infrastructure change.
The final link/secret checks and inventory receipts are local review records;
they do not make all publication/privacy/license findings disappear.

At approximately 13:32 JST, read-only Chrome console inspection showed the Tokyo
project cluster with zero active/draining services and zero running/pending
tasks. Console Home showed USD 0.01 current-month and USD 0.01 forecast. This is
delayed/rounded billing, not a final invoice or an all-region resource audit.
No CLI authentication, model/provider/task request, new role or deployment was
performed. The console's own reads are distinct from the zero-AWS local test
counts. The earlier full disabled/OPEN posture was not freshly re-read here.

The console Sign out action returned to the public AWS page with a sign-in
control. At 04:36:28 UTC the separate local inventory verified zero Docker/AWS
CLI/project/unattributed helper processes, scoped listeners, owned temporary
directories, backend staging/frontend work, login-cache JSON files and active
Docker socket directories. Two empty work directories were retained. No original
source/image/SBOM, retained cloud storage, account or unrelated browser tab was
deleted. This is scoped safe closure, not universal credential revocation.

The upstream [ESLint compatibility issue](https://github.com/eslint/eslint/issues/21463)
was open at review time. It is a report/request, not a promised maintainer fix or
evidence that a newer ESLint version alone clears the issue. Next dependency work
is a reviewed compatible update/backport decision with exact source/API/tests;
do not run force-upgrade, suppress the advisory or reuse today's one-shot egress
approval. Public artifact selection and final GitHub approval remain separate.

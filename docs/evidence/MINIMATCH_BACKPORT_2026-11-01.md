# Minimatch preprocessing backport — 2026-11-01

## Change and independent boundaries

The local development dependency remains minimatch 10.2.6. Its CJS and ESM
preprocessing implementations receive the bounded split and dedupe guards from
[upstream commit 77a0f5c](https://github.com/isaacs/minimatch/commit/77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8).
No major-version override or advisory suppression is used. The
[patch provenance note](../../scripts/patches/README.md) describes the changes,
declared license, source-map limitation and remaining legacy-version review.

- Patch SHA-256: `03943003a1fbd63dfe4ba2a7792ffef572e69f668fb213e8805f77b36d24a6f7`.
- New lock SHA-256: `9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2`.
- Public coordinate-body SHA-256 remains
  `1d5de80d698720f09c579580599632e7f5a9d3df41d0b52dc740291e277510e8` (392 identities).
- Declared 37-component/169-edge runtime SBOM SHA-256 remains
  `b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.

These unchanged projections do not prove every lock byte or installed file is
unchanged. In particular, the two patched JavaScript files intentionally differ
from their published archive bytes. Read-only proof collectors were rebound to
the reviewed lock without claiming a new authorization for inventory disclosure.
The patch/install stage did not perform a bulk advisory request. A separately
approved refresh subsequently ran once, as recorded below; that consent is consumed.

## Installation and tests

The bundled pnpm had changed to 11.25.0 and correctly refused this project's
11.16.0 requirement. No version-check bypass was enabled. The existing reviewed
11.16.0 metadata/archive validation was reused to obtain the pinned tool;
lockfile generation and frozen installation completed with lifecycle scripts off.
Anonymous downloads were from official npm, not AWS, and no project source or
AWS authentication was sent. Task-owned tool directories were removed afterward.

Focused patch tests exercise a four-pattern limit, ordinary paths and the
1,001-element dedupe bypass in both module formats. No large amplification/OOM
payload was run. Patch bytes are lock-bound; `.patch` files now receive normal
credential/privacy scans. The legacy callable matcher API is preserved.

The first full local gate, `bace4e78-cd0f-4d8f-aea8-46de726869f9`, failed at
helper-test step 67 with unchanged source; it is retained as a failure. The lock
change exposed old fixed-lock bindings. After rebinding, focused collector tests
passed except for a reproduced Windows EPERM at directory-junction creation.
The unchanged junction test then passed in the permitted local environment,
together with release-image tests (24 passed, no skip). This does not explain
every truncated failure marker or the separate historical service-test failure.

The publication-copy preparation and patch focus then passed ten tests. Those
results precede the final lint configuration/documentation edits. Full current
and frozen-clone acceptance are still required for the final revision.

The subsequent current-installation gate
`a13f534f-10a9-42b7-a755-0843493e1af3` passed all 90 steps at 23:46:13 UTC
(November 1 JST): 1,905 passed, one existing skip, 33 loopback checks and all
HTTP fixtures closed. Source: 842 files / 7,533,076 bytes /
`1bd0d17b15be753149ad4ebd80a9ae82c376bf23aab6146a2f6040c395b70434`.
This includes patch, lint configuration, public-copy preparation and tests;
later evidence/notices addenda and the transformed public copy are distinct
source revisions. A public-candidate frozen-install proof remains separate.

## Release and cost

### Separately approved advisory refresh

At 2026-11-01 08:48:41 JST (2026-10-31T23:48:41.743Z), the owner-approved
collector sent only the same 392 public package names/versions to npm's official
bulk advisory endpoint, once. No source, private project metadata, AWS identity
or credentials were sent. The lock and coordinate hashes above matched.
Response SHA-256 was
`631b4761167f67b5227043a138987e5a9784dc107c982e5269cef56c88369a14`.
The completed response contained one moderate advisory, GHSA-g3hv-75wg-m249
(1244012), matching development versions 10.2.6 and 3.1.5. No high/critical or
declared-runtime match was found among the 37 runtime identities. The collector's
nonzero exit reported findings; it was not a clean scan or a network failure.

This version-range query does not evaluate local patch contents, container OS
packages, all transitive reachability or future advisories. For this source-only
release, the proposed disposition is to retain the finding, include the 10.2.6
backport and provenance, preserve the legacy API, and restrict tooling to trusted
project inputs. Final upload approval must acknowledge the residual development
tool finding; no scanner exception is added.

This is local preparation, not GitHub publication or an AWS/model operation.
The October 31 version-range advisory remains recorded; a local backport does
not cause the public registry range to change. Legacy 3.1.5 lacks the described
advanced preprocessing methods, but that narrow observation is not universal
clearance of all patterns or all vulnerabilities. Final release disposition must
state those limits and retain trusted-input-only development tooling.

The owner approved source/tests/Korean-portfolio preparation, excluding built
artifacts, containers and private records. Original image/SBOM remain preserved.
No CI workflow, subscription, public hosting or paid inference was started.

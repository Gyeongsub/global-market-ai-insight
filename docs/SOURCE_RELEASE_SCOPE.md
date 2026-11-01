# Source-only publication scope

On 2026-11-01 the owner approved preparing source, tests and the Korean portfolio
for GitHub. This selects a candidate, not permission to upload an unchecked tree.
Personal practice follows the reviewed release and portfolio, not precedes it.

## Included and excluded material

Include application and infrastructure source, fixed synthetic fixtures, tests,
dependency manifests/lockfile/patch, operating and learning documents, project
license, third-party notices and the Korean case study. Infrastructure code is
published for explanation; publication does not deploy or enable it.

Exclude local configuration, credentials, actual account identifiers, browser
captures, private receipts, caches, dependencies, generated builds, containers,
Git internal objects and automatic workflows. No Pages hosting, Actions job,
package publication or container registry release is part of this scope.

Preserve these originals in the private working tree:

- `frontend/public/og.png`: the owner-attested AI-generated cover. Use a separate
  reviewed copy containing the same pixel-bearing chunks without provenance
  metadata. Describe removal honestly; do not claim to preserve C2PA validation.
- `docs/evidence/worker-image-20260810.cdx.json`: the historical container SBOM.
  Omit it from the source-only candidate rather than label a narrower runtime
  SBOM as its replacement. Historical references remain dated descriptions of
  locally retained evidence, not downloadable public artifacts.

Tests must not depend on private image metadata or a locally retained container
SBOM. Image rejection tests use a synthetic metadata chunk and still require
byte-for-byte preservation of the clean image's pixel-bearing contents.

## Review boundaries

Source privacy and the rights to included code, documents, patches and cover
copies remain release gates. Existing dependency declarations/notices accompany
the source; review any copied third-party code under its applicable terms.
The project MIT license does not replace upstream license terms.

Complete notices for future container/build distribution are separate gates
because those artifacts are not published here. Do not mark their historical
missing-license or OS-source findings resolved. A reader building an artifact
for redistribution must complete its own applicable artifact review.

The final candidate needs an exact manifest, all finding dispositions, an
isolated frozen-install check, a history check and explicit upload approval.
Automated scans never establish universal privacy, legal clearance or zero
vulnerabilities. The final repository name, owner, public visibility and commit
attribution must be confirmed before remote creation or push.

## Local candidate preparation

`node scripts/public-source-candidate.mjs` is inert. After reviewing the current
source, `node scripts/public-source-candidate.mjs --prepare-local-candidate`
creates a unique ignored copy and a separate manifest/transformations receipt.
It omits the fixed historical SBOM, cleans only the copied cover and preserves
the originals. Secret-shaped files and workflows block preparation; remaining
manual findings are retained. No Git index, remote or network is used.

The copy is not frozen-install proof or upload approval. Final checking must use
the exact candidate bytes, including its clean cover; a private-tree receipt is
not a substitute. Later edits require a new candidate and manifest.

# Development matcher backport

`minimatch-10.2.6-preprocess.patch` preserves minimatch 10.2.6's public API and
adds the three preprocessing bounds from the upstream
[security fix](https://github.com/isaacs/minimatch/commit/77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8).
The package's declared license is
[Blue Oak Model License 1.0.0](https://blueoakcouncil.org/license/1.0.0).
Retain this license link with copies of the patch. This patch does not relicense
minimatch under this repository's MIT license or redistribute its full package.

The same guards apply to both published JavaScript module formats. A pattern
split stops at the existing brace expansion limit; pairwise deduplication is
skipped for more than 1,000 patterns. No dependency version, export, package
manifest, type declaration or registry integrity is rewritten. The published
source maps remain upstream maps, not exact mappings for the patched lines.

The exact-version `patchedDependencies` entry and patch SHA-256 in the lockfile
make installation apply the patch. A patch failure must fail installation; do
not enable unused-patch/failure suppression. Package archive integrity still
describes the upstream archive, not the subsequently modified installed files.

Regression tests exercise both module formats with a small split limit, ordinary
matching, an instrumented 1,001-element dedupe input and the trusted ESLint
configuration. They deliberately avoid a large amplification or out-of-memory
probe. A clean frozen-install check is required before accepting the backport.

The registry advisory GHSA-g3hv-75wg-m249 is version-range based and may still
match patched 10.2.6 as well as legacy 3.1.5. Do not rename the version, remove
the advisory, claim a fresh security lookup or treat this patch as blanket
publication approval. Legacy 3.1.5 has a different implementation and requires
its own documented disposition. Remove this local patch only when compatible
upstream versions and the complete lint/build checks have been reviewed.

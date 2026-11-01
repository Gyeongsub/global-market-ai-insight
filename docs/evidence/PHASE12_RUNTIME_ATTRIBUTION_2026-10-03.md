# Phase 12 — local runtime attribution follow-up, 2026-10-03

This is a later same-day checkpoint, separate from the earlier
[metadata inventory](PHASE12_LICENSE_METADATA_2026-10-03.md). No cloud upload,
GitHub publication, dependency installation or legal approval occurred.

## Frontend artifact

The build now collects the conservative declared frontend runtime graph from
the current physical installation and checks exact package identities, direct
specifiers and transitive versions against the v9 lockfile. It copies whole
root-level LICENSE/COPYING, COPYRIGHT and NOTICE documents without deleting
upstream copyright or attribution. Directory/file redirects, missing mandatory
documents, invalid UTF-8, credential patterns and unreviewed licenses fail
closed; no generic replacement text is supplied.

The current graph contains React and React DOM 19.2.8 and Scheduler 0.27.0,
all declaring MIT. Each installed LICENSE is 1,088 bytes with SHA-256
`da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93`.
The combined `THIRD_PARTY_NOTICES.txt` artifact is 3,653 bytes with SHA-256
`d7074a9f65d21d7ea7f36fd9f96170715b87681f224d3e9d2e2622fba7cba67f`.
Its lockfile fingerprint is
`d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.

The English, Japanese and Korean fixture UI footer links to this local artifact.
For the development server the same pinned documents are precomputed once and
served only from that exact read-only route; request paths cannot select files.
GET/HEAD return plain UTF-8 with nosniff/no-store/CSP headers, while write-like
methods receive 405 and no body. Development and preview binding stay on
127.0.0.1 with strict ports. The TypeScript module/declaration extensions added
for this helper receive the same source secret/privacy scans as ordinary TS.
Development file access is limited to frontend source and the pinned pnpm store,
not the whole project. Default credential/certificate denies are preserved and
extended to private assistant/cloud state and scratch/output directories.
An early no-body rejection also covers public paths and missing-file SPA
fallbacks; malformed or multiply encoded paths fail closed. Public assets must
match the reviewed single regular `og.png` file, because Vite's `fs.deny` does
not apply to its public directory. Browser-console forwarding is explicitly off.
These are local-development controls, not a guarantee against arbitrary future
plugins that themselves read files. See [Vite's official file-serving limits](https://vite.dev/config/server-options.html#server-fs-deny).
The release CLI recomputes expected notices from the pinned package documents
and requires an exact byte/hash match; a plausible header alone cannot prove
that current build's notices are intact. Structural archive checking remains
distinct from current-package-byte checking.

The no-upload plan stages immutable assets, the sanitized stable image, stable
plain-text notices, and finally HTML. Future upload metadata must serve notices
as `text/plain; charset=utf-8`, with revalidation rather than an immutable cache.
Old four-file manifests lacking notices are intentionally rejected; they are
not silently upgraded into reviewed rollback artifacts. Local archive matching
still does not authorize remote rollback or prove remote bytes.

## Backend limitation retained

The existing backend metadata gate covers 34 declared runtime packages, but
actual root license documents are missing from these installed packages:

- `@aws-sdk/credential-provider-http` 3.972.72
- `@aws-sdk/credential-provider-login` 3.972.77
- `@aws-sdk/nested-clients` 3.997.44

Their manifests declare Apache-2.0. That declaration and the AWS SDK repository's
general license do not establish exact-version document provenance. The new
backend attribution collector therefore fails rather than borrowing an
unverified common document. Existing backend bundle notices have not been
described as a complete distribution-license package or changed to bypass this
gap. Exact-source/packaged-document review is a remaining release task.

## Evidence and limits

Focused tests cover byte-preserved license/NOTICE/COPYRIGHT texts, pinned graph
agreement, missing/unreviewed/binary documents, physical-store escapes, fixed
fresh output writes, changed current notice bytes, mandatory file and release
order. The Windows file-symlink negative case is skipped when the operating
system lacks that privilege; separate directory-junction escape tests do run.

This declared graph is a conservative superset, not an emitted-module bill of
materials or proof of all generated helpers' rights. A later
[safe module-metadata checkpoint](FRONTEND_EMITTED_MODULE_METADATA_2026-10-03.md)
matches the three runtime packages to current JS and identifies two virtual
entries still requiring provenance/license review. Development tooling,
container OS licenses, a fresh frozen-lockfile
installation, complete notice interpretation and original image/SBOM privacy
review remain separate gates. All reports keep publication/legal approval false.
See [release boundaries](../FRONTEND_RELEASE_GATES.md) and
[third-party notices](../../THIRD_PARTY_NOTICES.md).

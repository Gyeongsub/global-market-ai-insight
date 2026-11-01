# Phase 12 — real isolated frozen install, 2026-10-04 afternoon

## Scope and result

The project-declared **pnpm 11.16.0** was fetched from the two fixed public npm
registry endpoints, verified against its metadata and pinned SHA-512 integrity,
and executed only in an owned temporary directory. The existing host tool
11.19.0 and original installation/store/configuration were not changed.

The successful copied-source snapshot contained 327 files / 3,478,964 bytes,
SHA-256 `5074907d546668ac10e77ccde6e78053a94a61782e2ecc63045618ce9d4721c4`.
It predates the later afternoon image runbook/template-review additions.
The verified pnpm archive SHA-256 was
`3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa`;
891 regular tool files were checked before extraction/execution.

Results:

- 391 locked package identities; only integrity-backed public-registry resolutions.
- Fresh frozen install succeeded without reusing installed dependencies.
- Original and copied lockfile stayed unchanged; no dependency/tool upgrade.
- Complete local gate passed: **592 total tests, 591 passed, one OS privilege skip**.
- Four test groups, build/type/lint/secret/license-metadata/release checks passed.
- 33 loopback HTTP checks; owned servers closed; zero AWS calls/cloud mutations.
- Temporary source, tool, store and caches removed after the result.

## Final source recheck

The later final isolated frozen install also passed, covering 339 copied files /
3,580,102 bytes, SHA-256
`6b3760611b4fa47165747cda1805e594721a5705eb81002472a23bb2ac2fc31d`.
The same verified pnpm 11.16.0 archive and 391 locked identities were used.
The full gate passed **621 tests: 620 passed, one OS privilege skip**, in four
groups, plus 33 loopback HTTP checks. Original lockfile/install stayed unchanged;
no AWS calls, cloud mutations or private registry credentials were involved.
Owned HTTP servers closed and the temporary tree/store/tool were removed.
Later closing-document edits are not part of this named snapshot or the earlier
worker-image snapshot. No clean Git clone, approved CI or publication is claimed.

## Isolation boundaries

Dependency lifecycle scripts, pnpmfile hooks, automatic runtime/tool downloads
and global-store sharing were disabled. Child processes received no AWS/AI/
private-registry credentials or injected Node/proxy configuration. Temporary
empty npm configurations and fresh copy/import stores were used; public
registry network downloads were intentionally allowed for this isolated proof.

Tool archive inspection rejected traversal, Windows device paths, duplicates,
links, unsupported entries and oversized payloads before extracting. Standard
GNU long-name metadata was accepted only after bounded validation and only for
the following regular file, never for a symlink/hardlink.

Earlier attempts failed safely at archive format or unsupported install options
and removed their owned temporary directories. The final invocation used the
supported install flags and version-specific environment configuration; the
failed attempts are not counted as install/build passes.

This closes the **declared-tool fresh-install** gap for the named snapshot. It
is not a final Git commit, actual Git clone, approved CI, complete backend/OS/
generated-code licensing determination, current-source AWS deployment, public
hosting, external market-data permission, or publication approval. Missing
published root documents for three backend packages remain a separate gate.

Implementation: [fresh-install proof](../../scripts/fresh-install-proof.mjs).
Primary installation behavior: [pnpm installation](https://pnpm.io/installation)
and [pnpm install](https://pnpm.io/cli/install).

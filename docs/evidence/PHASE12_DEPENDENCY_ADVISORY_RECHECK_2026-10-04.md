# Phase 12 — current registry advisory recheck

Date: 2026-10-04, Asia/Tokyo. Read-only official npm registry audit. No package
install/update, lifecycle script, lockfile write, AWS call or external upload.

The installed bundled pnpm runtime is 11.19.0; the project still declares
11.16.0. Automatic package-manager version download was disabled for these
reads. This version mismatch remains explicit; this is not a fresh install
with the declared tool or clean-clone reproducibility proof.

Both public advisory reads succeeded with exit zero:

| Scope | Locked dependencies | Info / low / moderate / high / critical |
| --- | ---: | --- |
| Production | 37 | 0 / 0 / 0 / 0 / 0 |
| Full graph | 391 (37 production + 354 development) | 0 / 0 / 0 / 0 / 0 |

The lookup transmitted public package identity/version information to the
official npm registry only. AWS/project/assistant credentials and inherited
registry credentials/configuration were removed from the audit child
environment; nonexistent explicitly checked local config paths replaced
personal user/global npm configuration. No `--fix`, ignore-registry-error or
vulnerability suppression option was used. Raw error/report details were
captured privately; only fixed status/counts were emitted. The restricted
connection timed out; the exact bounded read was then repeated successfully
with normal network access, not altered TLS or endpoint protections.

The lockfile SHA-256 remained
`d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.
Previously reviewed exact `brace-expansion` selector fixes remain unchanged.
No new dependency advisory remediation was necessary today.

Zero known registry records is a point-in-time result, not proof of no unknown
vulnerability, an OS/container scan, complete attribution, correct deployment
or public release safety. Recheck the final exact future image and dependency
graph before publication. The independent
[integrity-matched document proof](PHASE12_PUBLISHED_LICENSE_PROOF_2026-10-04.md)
still leaves three backend runtime root-license-document gaps unresolved.

Source/method: [official pnpm audit documentation](https://pnpm.io/cli/audit),
[npm registry bulk-advisory endpoint](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk).
pnpm v11 uses the bulk-advisory endpoint; no CVE-only or severity filtering
was introduced in this review.

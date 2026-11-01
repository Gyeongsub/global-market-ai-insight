# Dependency advisory recheck — 2026-10-09

This is a dated direct public-registry advisory snapshot of the reviewed local
lock graph, not a current container-image scan, npm CLI metavulnerability report,
cloud deployment acceptance or publication approval.

## Finding and exact correction

At 11:14:44 UTC, one fixed npm bulk query evaluated all 391 locked identities
and 37 distinct declared runtime identities. It found one HIGH development-only
finding for source-map-js 1.2.1; declared runtime matches were zero.
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
describes excessive indexed source-map offset processing (CVE-2026-93749).
The advisory was published September 18 and updated October 5; its patched
version 1.2.2 was cross-checked against the
[upstream release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).

An exact workspace override maps source-map-js@1.2.1 to 1.2.2. Existing other
overrides were preserved. The pinned pnpm 11.16.0 tool archive was independently
integrity-verified; installation disabled lifecycle scripts and inherited cloud,
registry-authorization and script-injection settings. No AWS call, image build,
registry push, cloud configuration change or deployment was part of this fix.

- Before lock SHA-256:
  `d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.
- After lock SHA-256:
  `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- Exactly one package coordinate replaced; 391 identities before and after.
  Importers/settings and other package records stayed unchanged. The common
  PostCSS snapshot reference and exact override changed with that coordinate.
- Independent byte reconstruction removed the one override, reversed the two
  version keys, one dependency reference and one integrity change and reproduced
  the entire earlier YAML hash. This read-only proof wrote no files.
- Active PostCSS resolution now reports source-map-js 1.2.2, BSD-3-Clause.
  Unused shared package-cache data was not broadly deleted.

## Repeat result and bounded negative tests

At 11:24:15 UTC the same one-request query found zero matching direct advisories
across all 391 locked identities, including both prereleases, and zero for the
37 declared runtime identities. All severity counts were zero.
Coordinate payload SHA-256:
`a0e47d1dbf929ad39008801fbec48f94be8742e73e546edea6eef90cbc95be3c`.
Raw empty-object response SHA-256:
`44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.

The new operator is zero-network by default. Explicit execution uses only the
fixed public npm bulk endpoint and reviewed public names/exact versions. A
changed lock aborts before sending coordinates; a change during the request
also invalidates the result. No source, project name, dependency tree, cloud
credential or private-registry fallback is sent. Unknown, redirected, oversized,
malformed or failed responses cannot return clean. Rejected unread/oversized
streams are canceled. Raw server titles/private diagnostic details are omitted.

Range evaluation includes prereleases conservatively. It does not compute
metavulnerability propagation or npm CLI totals; npm documents those separately
in its [audit behavior](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
The corrected module's regression child has a three-second/64-MB bound,
credential-free environment, preserved normal/large-offset output and rejection
of a trillion-line offset. No vulnerable-version exploit process was run.

The first 14 advisory tests and nine declaration tests passed before final
stream-cancellation additions. Later full totals/source fingerprint are recorded
separately at safe stop. A zero snapshot is not a future safety guarantee or
evidence that pending image/OS/license/permission/privacy gates are complete.

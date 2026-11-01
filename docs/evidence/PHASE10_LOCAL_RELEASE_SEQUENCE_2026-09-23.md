# Phase 10 local release sequence — 2026-09-23

## Scope and outcome

This checkpoint is **local preparation only**. No AWS login, SDK call, S3 upload, CloudFront change, provider/model call, GitHub push or public deployment occurred. The separate frontend distribution draft remains disabled. The live AWS inventory and billing state were not checked today.

The production build now removes the existing `caBX` content-credential chunk from **only** `frontend/dist/og.png`; the source image is unchanged. Local inspection found an email-shaped value in that third-party provenance metadata, not the user's email address. The build copy has only IHDR, IDAT and IEND chunks. All remaining chunks retain their original bytes and checksums, so the pixel-bearing data is untouched. Visual inspection found no change. Removal also means the public build copy no longer carries that embedded provenance; image rights and source-file metadata still need manual review before publication, especially if the full repository is later published.

`frontend/scripts/release-audit.mjs` now rejects malformed PNGs, corrupt chunk checksums and any social-image metadata that escaped the build. It continues to check only selected secret patterns; a passing audit is not a comprehensive privacy or licensing clearance.

`frontend/scripts/release-plan.mjs` reads the audited local bundle and optionally a prior local-audit JSON. It proposes immutable assets first, stable social image next and HTML last, with hashes and cache metadata for verification. It refuses a same-name immutable asset with different bytes, plans no deletion or invalidation, and retains old hashed assets in a proposed update. This is **not an uploader**. Its rollback entry explicitly remains unavailable until the previous complete bundle is archived and the exact remote objects are verified. A manifest alone cannot restore old bytes. The tool has no AWS client, credentials or destination.

## Verification

- Targeted release tests: 10 passed, including raw/invalid PNG rejection, same-key overwrite rejection, manifest-path rejection and HTML-last order.
- Full local checker: **211 service/contract + 13 infrastructure + 19 frontend = 243 tests passed**; type checks, lint, bundles, local worker/controller smokes, Foundation synth, release inventory/sequence, license scan and high-confidence secret scan passed.
- Source `og.png`: 1,531,511 bytes. Built copy: 1,506,589 bytes. Removed metadata chunk including its framing: 24,922 bytes. The source remains unchanged.
- The first sandboxed full run reached the controller bundle and failed because the sandbox could not read a parent directory. The same local checker was rerun in the permitted build context and passed without weakening an assertion.

## Still blocked before publication

1. Decide the default-certificate TLS minimum trade-off or approve a separate certificate/domain design. Do not call the current disabled template a modern TLS-only site.
2. Review fresh AWS identity, region, current pricing, exact infrastructure diff and ongoing storage/request/transfer risk; obtain bounded deployment and upload approval.
3. Archive a complete previous build before an update, then verify remote assets and metadata before publishing HTML. Rollback requires those archived bytes and a separately reviewed execution procedure. No upload/rollback executor exists yet.
4. Review the original image's embedded provenance and rights before publishing source code on GitHub. The built image intentionally lacks the content-credential record; describe it honestly if used.
5. Provider external-display rights, end-user authorization, live API connection, accessibility assistive-technology verification and CloudFront/S3 HTTPS/denial tests remain separate acceptance gates.

## Safety at stop

No cloud mutation or open local preview service was created in this checkpoint. Generated `dist/` and CDK output are local/ignored artifacts. No new recurring charge or public entry point was introduced by this work. Existing AWS resource state was not audited, so this note makes no account-wide zero-cost claim.

Technical references: [PNG chunk/ancillary rules](https://www.w3.org/TR/png-3/), [C2PA PNG `caBX` embedding](https://spec.c2pa.org/specifications/specifications/2.2/specs/ContentCredentials.html).

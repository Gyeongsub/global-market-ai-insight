# Phase 10 local archive validation — 2026-09-24

This is a local-only safety increment, not an S3 upload or a usable rollback
mechanism. No AWS session, provider/model call or GitHub publication was made.

`frontend/scripts/release-plan.mjs` can now optionally take both a prior
reviewed manifest and the directory containing that exact prior static bundle.
The bundle is independently audited for the same allowed files, sanitized PNG,
local references and selected credential patterns. The planner compares every
file key, byte count, SHA-256 digest and cache policy against the prior manifest;
a missing or changed file fails closed. A manifest without the bundle still
cannot prove that the bytes needed for recovery exist.

Even when `localArchiveVerified=true`, the output keeps
`rollback.available=false`: the existing remote object bytes/cache metadata,
approved execution steps, AWS identity/cost review and post-rollback check have
not been verified. The script has no S3/CloudFront client, upload, deletion or
invalidation operation.

For a **future** approved update, first preserve the entire preceding `dist/`
as a local archive and its matching `auditRelease` JSON. A zero-AWS planning
example is:

```text
node frontend/scripts/release-plan.mjs --previous-manifest <prior-audit.json> --previous-bundle <prior-dist-directory>
```

This only reads files. Do not paste credentials into paths or pass an unreviewed
archive. A passing local result is not authorization to deploy or revert.

Local tests cover matching bytes, a tampered archive and a bundle supplied
without its manifest. The complete project checker remains the final local
verification gate for this checkpoint.

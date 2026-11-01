# Runtime SBOM privacy preview — 2026-10-13

The historical image SBOM is neither read, rewritten, deleted nor replaced by
this tool. Its original maintainer attribution/content-rights review remains
open. This is an independent **ignored local review preview**, never a published
SBOM, container attestation, legal clearance or GitHub approval.

Default execution performs zero reads/writes/network/AWS actions. Explicit local
check inspects existing exact-pinned production dependency declarations for the
backend and frontend; explicit preview execution writes one new local file only
under physical ignored `outputs/sbom-previews`. An immutable privately branded
producer result is required; cloned/forged results and redirected/unignored
output directories are refused. Existing files cannot be overwritten.

The CycloneDX 1.6-shaped preview contains only fixed application metadata and
allowlisted component type/reference/name/version/license declaration fields,
plus exact dependency references. No contacts, authors, email, descriptions,
local paths, repository URLs, environment, source notices or original artifact
fields are copied. It does not strip required license text from any distributed
notice file: this separate preview includes no notice/license body at all.

Both current importers match the frozen lock. Every component must have a
registry integrity, an exact installed identity and a reviewed SPDX declaration.
Duplicate/conflicting components, unknown or absent edges, unreachable entries,
unpinned specs and non-registry resolutions fail closed. Declared peer edges are
included only if the exact locked peer is already present; conflicting peer
snapshots remain blocked. Before/after lock and normalized graph reads agree.

The actual in-memory check found 34 backend plus three frontend components,
37 unique components and 169 dependency edges. Artifact 20,638 bytes, SHA-256
`b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`;
lock SHA-256 `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
No AWS/network requests, dependency installation or uploaded files.

The first local read rejected an extra React peer instead of silently omitting
it. The fix now verifies its explicit declaration, exact already-present identity
and locked edge; no dependency or allowlist changed. All ten focused cases passed
in the normal user context. Restricted-context junction creation failed EPERM;
that failure was retained and the identical cases passed normally without
weakening assertions or changing OS protection settings.

The declared runtime superset does **not** verify exact emitted modules, complete
optional/uninstalled dependencies, development graph, OS/image coverage, full
CycloneDX schema, source provenance or license obligations. Three previously
documented backend license-file gaps remain. Output readiness stays false.
The separate public-schema route reads exactly three fixed official GitHub raw
schema URLs, at most 700,000 bytes / sixty seconds. It rejects redirects, foreign
references and incomplete data; rejected bodies are cancelled, and parsed assets
are frozen. No credentials, request body or private project contents are sent.
The already installed, lock-declared MIT Ajv 6.15.0 performs synchronous
structural checks with preloaded references and no automatic network resolver.
Draft-07 format assertions are explicitly disabled: this is not complete CDX
validation, license interpretation or publisher-signature verification.

Actual execution downloaded three schemas, wrote one exclusive 20,638-byte
preview and reread its exact contents. Preview ID
`d9dd963b-a9ca-4ce3-bb14-793819fb8b3a`, ignored path
`outputs/sbom-previews/d9dd963b-a9ca-4ce3-bb14-793819fb8b3a.cdx.json`.
Its structural check passed for the exact artifact hash above. Schemas were
kept in memory, no schema files/package installation/AWS call/upload occurred.

Schema byte hashes:

- bom-1.6.schema.json: 262,666 bytes, `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d`.
- spdx.schema.json: 63,418 bytes, `4b345e2329f209f34e960ae2a8e7cb46a166907e6a45e94978565925dc47b359`.
- jsf-0.82.schema.json: 8,058 bytes, `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae`.

These are dated byte observations, not immutable commit/signature assurances.
One earlier bounded root-schema read preceded the three-schema validation;
four complete raw schema downloads are known, not three for the entire session.
Final-source whole gate and independent safe stop remain separate observations.

[Official CycloneDX schema](https://github.com/CycloneDX/specification/blob/master/schema/bom-1.6.schema.json)
is the format reference; the large rendered guide could not be fetched, and
format assertions remain unverified. No new schema library or workflow is added.

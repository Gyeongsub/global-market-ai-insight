# Phase 12 source and schema boundaries — 2026-10-14

Local release evidence only; no AWS write, workload, image push, hosting,
workflow, support submission or GitHub upload. Maintenance IAM remains blocked.

## Runtime inventory and public schema

The producer now fingerprints complete backend/frontend manifest bytes and the
exact lock hash, compares both installed graphs twice and rereads both manifests
after traversal. Even whitespace-only changes with an unchanged graph fail.
Source-bound previews reject a changed manifest/lock or a different output root.
Pure synthetic previews do not claim current-manifest stability.

Actual producer-branded downloaded schema bytes must match three reviewed pins.
Supplied/cloned hashes cannot establish provenance. Changed mutable-URL contents
fail until another review. This is content pinning, not immutable commit binding
or publisher-signature verification.

A second validator enables format assertions and rejects every encountered URI,
IRI, IDN-email or date-time value; the generated privacy subset contains none.
It deliberately does not implement generic Unicode/RFC format semantics or claim
full CycloneDX conformance. Unknown names/invalid keyword types fail as well.
The existing Ajv 6.15.0 source/meta-schema behavior was inspected locally; latest
API behavior is not silently applied to that version. Schema references are
preloaded and validation remains synchronous, without automatic network resolution.

One actual attempt failed when a property *named* `format` was mistaken for a
format keyword; no new preview was written. The distinction was fixed and given
a regression test. Final fixed-schema validation passed: structure valid,
reject-only format assertions enabled, zero encountered format values, all three
byte pins matched. Twenty-seven normal-context focused tests passed with no skips.

Final preview: `outputs/sbom-previews/f0041fd6-11cb-4690-a990-5c2c2c5685a4.cdx.json`.
Independent physical-file read: 20,638 bytes, 37 components, 169 edges, no forbidden
contact/path/URL/raw-notice fields; SHA-256
`b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
Historical SBOM/previous ignored previews were not overwritten. Complete
development/image/OS/module licensing and publication remain unapproved.

Lock SHA-256 unchanged:
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
Manifest/lock-only fingerprint:
`a83c43d35deec9ac6013a637344a5c4d2df8853cb5c8f28a01ac587d0c7197db`;
not a whole-project or installed-file fingerprint.

Only fixed public GETs: no private inventory/content/credential/account/artifact
transmission or package install. Schema files remain in memory. Five direct
three-file sets were read: initial byte inventory, first pinned preview, failed
restricted validation, redacted diagnosis and corrected preview. Web-tool source
reads are separate. Restricted DNS and a quoting failure were not passes.

| Schema | Bytes | SHA-256 |
| --- | ---: | --- |
| bom-1.6.schema.json | 262666 | `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d` |
| spdx.schema.json | 63418 | `4b345e2329f209f34e960ae2a8e7cb46a166907e6a45e94978565925dc47b359` |
| jsf-0.82.schema.json | 8058 | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` |

Primary sources:
[CycloneDX](https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.6.schema.json),
[SPDX IDs](https://raw.githubusercontent.com/CycloneDX/specification/master/schema/spdx.schema.json),
[JSF](https://raw.githubusercontent.com/CycloneDX/specification/master/schema/jsf-0.82.schema.json).

## Source-bound current-installation receipt

A final review found that the decoder's default BOM handling could hide changed
prefix bytes from the manifest fingerprint. It now retains that prefix so strict
JSON parsing rejects it. A before-collection/after-collection regression for both
manifests passes. The final focused SBOM suite has 28 passing tests. The preceding
996-test frozen snapshot predates this small change and is not reused as its pass.

Schema-version 2 receipts require matching before/after candidate-source
fingerprints with the copied-source scope and framing. Required files must exist;
generated/private/dependency trees are excluded; links/private keys/oversized
inputs are rejected. Recursive directory/sibling ordering matches copied trees.
Missing, changed, malformed or privately extended boundary evidence cannot make
successful-looking child output pass. This is matching boundaries, not immutable
source, continuous absence of changes, installed-byte proof or release approval.

## First actual whole gate — retained failure

`outputs/local-gates/854b51f3-7a79-4910-8bf2-9fb6c60b7814.json` independently reads
completed **with passed:false**. Its unchanged 462-file/4,814,566-byte source hash
is `45e365cc10efa71af493ded2dfe486383d2fe05e83c8c2e74d9e6d6120182369`.
The unchanged 360,000 ms bound timed out at 360,041 ms with only 69/75 timings;
infrastructure assertions took 123,540 ms. No full-suite/HTTP/install pass follows.
The later [early-loading correction](PHASE12_EARLY_INFRA_GATE_2026-10-14.md)
is a distinct revision, not an unchanged retry hiding this failure. Whole checks
and independent safe-stop evidence are recorded separately.

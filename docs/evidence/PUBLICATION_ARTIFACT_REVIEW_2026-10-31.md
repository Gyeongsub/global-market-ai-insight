# Local publication artifact review — 2026-10-31

This is local inspection and inventory preparation, not permission to publish.
No AWS authentication, model/provider request, image edit, package installation,
Git remote/index change or upload was performed for this checkpoint.

## Original image: provenance and privacy observations

The owner confirmed that `frontend/public/og.png` was AI-generated for this project.
The unchanged source is 1,531,511 bytes, SHA-256
`f5509cbe6526b4cca90e78a7f24faab4db17cf86bd00fedc6363fdd6d7ba1fc2`.
PNG chunks are IHDR, caBX, IDAT and IEND. The caBX payload is 24,910 bytes.
No chunk was removed, and the source was not replaced or re-encoded.

Bounded, read-only structural inspection decoded five definite-length CBOR
payloads, observing 25 string values and markers for OpenAI, a created action
and trained algorithmic media. The report did not print claim identifiers,
timestamps, text values, email addresses or private paths. No email, personal
path or credential pattern was detected in those inspected string values.
Twelve opaque byte strings and embedded binary content are not covered by that
string-only observation. This is not a conformant C2PA validation implementation.

A separate bounded DER inspection found six distinct parseable X.509 certificate
objects. All five email-shaped byte matches in caBX fell inside those certificate
objects; none was outside them. This narrows the previous generic email warning
to certificate content. Parsing does **not** verify signatures, trust chains,
revocation, asset binding, every encoded personal field or redistribution rights.
No certificate was installed or sent to a verification service.

The official C2PA specification describes manifest claims/assertions in JUMBF
and CBOR structures; it does not make this local pattern review an authenticity
or rights determination. [C2PA specification](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html).

Keep the original private source and its provenance intact. Any eventual public
copy needs a separately recorded artifact decision and exact-byte verification;
the existing build-copy treatment must not silently be applied to the original.

## Historical SBOM versus current runtime preview

The historical `worker-image-20260810.cdx.json` is unchanged: 67,202 bytes,
SHA-256 `ff8441fdaf59eeb33d0584eeb72facb92cb9bfe35b4378a31064b05a6ab66c75`.
It declares CycloneDX 1.7 and contains 14 components. Of 856 string values, 23
matched an email-shaped heuristic across name, URL, package-reference and other
fields. This does not mean 23 personal email addresses: package references can
match the heuristic. No personal-path pattern or high-confidence credential
pattern was found. Raw matching values were not reproduced in this report.

The current offline runtime preview separately contains 37 declared components
(34 backend, three frontend) and 169 dependency edges, with no contact or private
path fields. Artifact SHA-256:
`b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2`.
It is **not** a replacement for the historical image/OS inventory and does not
establish full development, emitted-module or license-obligation coverage.
No historical artifact was overwritten with a narrower report.

Later field-level review located the 23 email-shaped matches: 13 supplier-name
fields on OS components, five occurrences of the same package reference, and
five advisory URLs. Those locations narrow the earlier generic warning; they
are not 23 user contacts or evidence that every supplier value has been verified
against its exact public package source. Raw values remain unpublished. The
historical SBOM hash above was rechecked unchanged.

## Exact candidate inventory

`scripts/publication-review-snapshot.mjs` is inert without its explicit local flag.
It captures sorted per-file paths, byte counts, SHA-256 digests and unchanged
review categories. Two reads must match; it rechecks again immediately before
writing one unique receipt under ignored `outputs/local-gates`. It does not copy
source contents, create an export repository or remove any review finding.

Tracked private state, sensitive filenames, generated/private paths and detected
credentials block receipt creation. Missing, oversized, linked/out-of-scope or
changing candidates cannot produce a partial success manifest. The writer rejects
forged or modified in-memory records. Git enumeration uses a filtered environment,
disables filesystem-monitor commands and inherited repository redirection, and
uses only an exact process-local safe-directory setting, never a global change.

Twenty-eight focused audit/snapshot tests passed with no skip, including a real
directory-junction rejection fixture. A first sandbox run had skipped that one
OS-permission-dependent case; the separate permitted run actually exercised it.

The first real snapshot covered 829 candidates / 7,432,590 bytes and preserved
47 findings. Manifest digest:
`1eae0883e077a35d16a7c7ebe159c345dbf9dbd2ab97fce41c92c408f4dcf3e3`.
That snapshot **predates this evidence document and later edits**; rerun for the
eventual exact candidate. It is a local metadata receipt, not an atomic filesystem
snapshot, signature, Git-history review, scanner exception or publication approval.

Remaining: final artifact-copy choice, current dependency/license/privacy/history
review, exact final reproduction evidence and separate approval for any upload.

Subsequent read-only Git object checks found zero refs/remotes, loose/packed
objects, packs and garbage. Full fsck without reflogs/unreachable-object output
succeeded with no object findings. No remote/index/config mutation occurred.
Untracked candidate contents and any future commit still need final review.
The [new development advisory](LINT_ADVISORY_REVIEW_2026-10-31.md) remains unresolved;
reproduction or an inventory receipt does not clear it.

# Phase 12 — fixed public base-image document provenance, 2026-10-10

## Exact scope and outcome

This is anonymous public-image source evidence, not a live AWS-image inspection,
vulnerability scan, signature verification or legal/publication clearance.
No Docker process, image code, AWS call, package installation, layer extraction,
image push or runtime change was used to produce this result.

The exact current worker Dockerfile SHA-256 is
`e4992deab8325370de9a911d2e4e0f8f0d0b355c531ab1839c0c8eed11987546`.
Its fixed Distroless runtime manifest is
`sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c`;
the config digest is
`sha256:d094b1aa3d90097a21276aa79ae72f3ddd0a946ee116f80debe5cd6c82450320`.
The exact manifest/config bytes verified linux/amd64, nonroot user 65532 and the
Node entrypoint. These public hashes do not expose an AWS account or ECR address.

At 2026-10-10T02:07:06.729Z, the final collector completed **38 anonymous public
requests**, reading 54,618,478 bytes including the 4,639-byte manifest and
4,833-byte config. All 22 compressed layer hashes and expanded diff-ID hashes
matched. The layer totals are 54,609,006 compressed and 154,107,392 expanded
bytes, with 1,894 restricted ordinary GNU entries, zero USTAR entries and zero
actual whiteouts. Their path and document results are unchanged from the earlier
proof; the final report additionally records format-specific entry counts.

The [sanitized machine record](phase12-public-base-provenance-2026-10-10.json)
preserves each public digest, size, package declaration and document hash;
it does not preserve raw copyright text, binary code, archive payloads,
publisher personal fields, registry redirects or authentication data.

Fourteen Debian package declarations were read from regular bounded
`var/lib/dpkg/status.d/<package>` files. `.md5sums` sidecars are not packages.
Eleven have a regular exact `usr/share/doc/<package>/copyright` document.
The Node `nodejs/LICENSE` is 145,485 bytes, SHA-256
`c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4`.
The Node executable hash was inspected in memory, but it was not run and its
version was not inferred from a filename or the separate build-stage image.

Three package document parent paths are links rather than regular directories:

| Package | Declared version | Conservative result |
| --- | --- | --- |
| libgcc-s1 | 14.2.0-19 | Fixed one-hop archive mapping to version-matched gcc-14-base document |
| libgomp1 | 14.2.0-19 | Fixed one-hop archive mapping to version-matched gcc-14-base document |
| libstdc++6 | 14.2.0-19 | Fixed one-hop archive mapping to version-matched gcc-14-base document |

The exact three parent symlink declarations and matching source package
version/architecture establish this limited metadata relationship. The 69,004-byte
regular shared document is SHA-256
`20390f8a6f3b1e4d7cb45dd8652dabb259bbef688cbad839bcdb0b9ba7252f79`.
No generic GCC/repository license was substituted. The original alias paths
remain non-regular; the report preserves eleven exact regular paths and three
separate shared-source mappings, not fourteen materialized path documents.
`etc/os-release` and common-license links remain unresolved selected links.
This is not a claim that upstream lacks required
licenses or that these links are malicious. Complete component coverage,
reference/common-license obligations and distributed notices remain unverified.
The non-Debian Node component is explicitly separate from the dpkg inventory.

Thirty-five bounded regular documents were hash-bound: eleven package copyright
documents, Node LICENSE and 23 common-license documents. Eighteen literal
common-license reference candidates were recorded; fifteen match regular
documents. The three remaining GCC candidates are `GPL` (a link), `GPL.` and
`LGPL.` (literal punctuation-bearing candidates, not an asserted missing upstream
license). The parser does not interpret prose or recursively resolve common-
license aliases. Complete reference inventory and applicable obligations remain
false even when a candidate has a matching document hash.

## Read-only collector and regression boundaries

`scripts/public-base-notice-proof.mjs` defaults to a zero-request plan. Its only
execution flag is `--execute-public-base`; image, destination and upload inputs
are refused. It verifies the complete Dockerfile hash before querying and again
after proof; any source change is unknown and cannot become publication approval.

Execution is restricted to the fixed public GCR manifest/config/layers, at most
50 requests and eight minutes. Requests omit credentials/cookies, have a
20-second per-request limit and do not accept externally supplied descriptor
URLs/data. One blob redirect may remain only within the observed HTTPS GCR
Distroless download namespace; queries, userinfo, ports, fragments, foreign hosts,
manifest redirects and a second redirect are refused. Rejected/oversized streams
are canceled. Declared and streamed sizes, hashes, gzip expansion, totals,
entry counts and retained-document bytes are independently bounded.

The in-memory format-specific namespace applies lower-layer whiteouts before same-layer
replacement files. Parent directories may appear after children without erasing
them; replacing a parent by a file/link invalidates children. Paths, checksums,
duplicate entries, unsupported PAX/devices, link parents and padding are checked.
No filesystem link is followed and no arbitrary/recursive archive link resolver
is used. Only the three fixed GCC parent metadata relationships above may map
to an independently regular retained document. No archive path is written to disk. Failures show
only a fixed stage and, where applicable, one fixed format/number reason code,
never raw URLs, credentials or archive text.

Exact USTAR headers use the USTAR prefix field. The observed ordinary GNU
headers instead allow only valid optional atime/ctime and zero extension fields;
they never reinterpret those time fields as a filename prefix. Sparse/offset/
continuation/long-name/PAX state, V7 and unknown header formats remain rejected.
An initial USTAR-only tightening failed on the actual fixed public GNU image;
the failure was recorded as unknown, not a successful proof or hidden retry.
Explicit restricted-GNU semantics, positive and negative fixtures and the
new actual hash-bound read above resolve that compatibility issue without
accepting arbitrary format normalization.

Twenty-three focused tests passed: digest/platform/user/entrypoint binding, real
digest-bound public JSON fixtures without executable content, decompression and
diff-ID tampering, ordinary/opaque whiteouts, parent-order/replacement handling,
selected links, malformed package metadata, tar traversal/header/padding rejects,
Dockerfile drift before any request, fixed credential-free requests, streamed
limits, redirect restrictions/chains, unknown layers and zero-network CLI plans.
These include four tests for exact one-hop GCC mapping, rejected foreign/recursive/
traversing/hardlink targets, mismatched source version/architecture or removed/
linked source documents, and literal common-license reference/hash/unknown scope.
Three further tests cover format-specific GNU/USTAR semantics, unsupported
extensions and high-bit/junk numeric fields. The routine full check runs only
the zero-request plan and synthetic tests.

The small public manifest/config fixtures are fixed byte inputs for offline
network-boundary tests. They are not installed packages, layer bodies or a
complete positive image proof. Live reads above are separate from fixture tests.
Earlier same-day positive checkpoints preceded parent-kind/shared-source mapping
and literal-boundary changes. The recorded 02:07 result is the final
format-specific collector invocation, not the earlier 01:37/01:44 results.
The later USTAR-only failure and its fixed-code GNU-format diagnostic are also
separate, unsuccessful reads, not silently relabeled as this successful result.
Other initial metadata/redirect diagnostics were separate from its 38 requests.

## Next gates and primary references

### Local derived-image identity bridge

`scripts/worker-base-identity.ts` now binds private derived manifest/config bytes
to their separately expected hashes before comparing all 22 reviewed base-layer
descriptors and all 22 config diff-IDs. The fixed public metadata bytes are in
`scripts/data/public-base-metadata.json`; their actual manifest/config digests
are independently verified, not trusted merely because a JSON label says so.
Exactly two later layers are permitted; their contents still require the
existing separate strict `/app` mkdir/COPY three-file archive proof. The current
Dockerfile hash is independently checked before and after an actual worker proof.

The live-worker proof wrapper includes these checks without adding any AWS
query, registry password, image pull, image execution or upload path. Metadata
alone still reports layer bodies/later overlays/live AWS binding unverified.
The full wrapper must also pass existing owned-target, archive-body, current
bundle/notice, disabled execution, empty inventory and closing-state gates.
**That live wrapper was not executed today; this is local implementation and
fixture evidence, not proof of the current private AWS image.**

Eight bridge tests and thirteen application proof tests passed.
They cover separately wrong private hashes, validly rehashed but substituted or
reordered base layers/diff-IDs, descriptor sizes/media, extra/missing overlays,
unknown platforms/schema, remote/inlined bodies, duplicate/oversized layers,
metadata limits and missing/changed Dockerfile. All positive bridge fixtures
use the real public base metadata plus synthetic application descriptors;
they contain no executable application/archive bytes or AWS credentials.

Five application-parser regressions preserve an exact USTAR prefix positive
control and reject unsupported V7/GNU headers that would otherwise borrow
USTAR prefix semantics, regular-file trailing slashes, hidden NUL/header values,
junk numeric termination and nonzero payload padding. Four negative groups
were first observed failing on the older parser, then passed after the fix;
no assertion or runtime permission was relaxed. The synthetic mkdir/COPY
fixture now explicitly uses USTAR rather than an unmarked V7 header. This
stricter application-parser compatibility has not been proved against an actual
private archive today; the full Docker/archive wrapper remains unexecuted.

### Narrow actual owned ECR manifest proof

At 2026-10-10T01:45:58.555Z,
`scripts/live-base-manifest-proof.ts --execute-read-only` completed **42 AWS
reads**, zero mutations, Docker calls, image pulls/pushes or registry-password
retrievals. Two full safe-state passes bracketed two exact owned-image metadata
passes. Both core/image task references and the private immutable manifest/config
descriptor identities agreed; the current Dockerfile was checked before/after.
The controller stayed disabled, tasks/services/slots empty and OPEN circuit
version unchanged. The private runtime manifest's SHA-256 and ordered 22 public
base-layer descriptors matched; exactly two later descriptors remained.
The [sanitized actual manifest record](phase12-owned-base-manifest-2026-10-10.json)
prints no AWS account, ARN, endpoint, private digest or source code.

This closes only the ordered **manifest-descriptor** relationship between the
public base and the currently owned runtime image. No private config bytes,
private config diff-IDs, layer bodies, later application overlay contents or
current application bytes were verified. The existing stored-scan metadata was
read only by the ownership gate; no new scan or current vulnerability assertion
was made. The stronger Docker/archive worker proof above remains unexecuted.
Complete license/source/distributed-notice review remains false.

Seven new offline end-to-end metadata-collector tests passed, including wrong
principal/source, enabled or incomplete initial state, rehashed substitutions,
closing core/image reference mismatch, image or circuit-version drift, source
drift, reversed/expired/invalid clocks, raw error suppression and zero-AWS default/
import/extra-argument rejection. The full local gate includes only that default
plan and fixtures; it cannot perform this AWS read just by running `check`.

### Advisory and permission limits

Today's proposed reviewed-lock public npm advisory query was rejected by the
app's automatic security review **before execution** because package-name/version
inventory egress requires specific destination/payload approval. It was not
retried, routed through another tool, transformed into a GET-based workaround or
sent elsewhere. Today's advisory status is **unknown**. The unchanged lock SHA
and yesterday's dated zero-direct-match record do not make a current registry
check. Further such transmission needs specific user approval; local testing,
dependency downloads for a genuine build and public base-image GETs have
different purposes and are not advisory-query substitutes.

The separately blocked persistent controller IAM correction also was not retried.
No permission acceptance, job enablement, deployment or publication approval is
inferred from safe-state reads or local tests.

Bind this public source evidence to the exact future/private deployed artifact
before making a live-image claim. Resolve linked/shared document mapping and
applicable notices without generic re-licensing; inspect required full texts and
source obligations as a separate review. Shared-source mapping is not a claim
that any particular license applies to every GCC binary. Three AWS SDK backend document gaps,
generated native-source attribution and other-platform installed-source gaps
also remain. Do not copy a generic upstream LICENSE into missing package paths.
The existing controller/Maintenance permissions, display rights, CI, hosting and
explicit final GitHub approval are not cleared by this proof.

- [Distroless package metadata documentation](https://github.com/GoogleContainerTools/distroless/blob/main/PACKAGE_METADATA.md): status.d records and sidecars are distinct; non-Debian coverage is incomplete.
- [Distroless upstream project](https://github.com/GoogleContainerTools/distroless): the repository license does not replace bundled-package documents.
- [OCI layer specification](https://github.com/opencontainers/image-spec/blob/main/layer.md): changeset/whiteout ordering informed the in-memory overlay tests.
- [GNU tar format reference](https://www.gnu.org/software/tar/manual/html_node/Standard.html): recognized USTAR and GNU headers have different field semantics; the reader deliberately supports only a bounded nonextended subset.
- [Remaining controller correction boundary](../CONTROLLER_POLICY_CORRECTION.md).

No final distributed-notice, license-obligation, signature, vulnerability or
publication flag is true. No persistent permission change was attempted today.

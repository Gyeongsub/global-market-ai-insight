# Current local worker candidate — 2026-10-12

Scope: one new local-only dated tag, one source build and one archive-only
scanner. No AWS calls, registry password, image push, deployment or application
container execution. The existing historical local tag and cloud image were
not overwritten. This does not resolve the current live notice mismatch.

## Actual candidate result

- Linux/amd64 candidate `gmai-worker:local-20261012-release`.
- Runtime/image digest `sha256:82fa92460e13b7806e9a92a4893c3cc23ae26737234ff88dd935584a23b27005`.
- Config digest `sha256:f65224c09559f63b215b66e14447a75c155d77dd4f971753cee68948068f7828`.
- Copied pre-build source: 448 files, 4,679,754 bytes, SHA-256
  `d009ff474c072ef05658136d9d362a1c4b449ecfef50ead6aa7e44bb8947d7a7`.
- Archive: 54,919,680 bytes; 26 hash-bound blobs; exact config/platform verified.
- Reviewed 22-layer public base descriptor/diff-ID prefix plus two later layers
  matched. Final application layers reject links, whiteouts, ambiguous archive
  headers, redirects and wrong owners.
- Current rebuilt module, notice and copied Apache body all matched the three
  final regular files. Module: 1,480,483 bytes, SHA-256
  `544b5026c8a70333b4ef05331b3b1ca44132ba1f3493d63beda5f615ddd84936`.
- Current scanner database passed freshness checks; 14 OS packages inspected.
  UNKNOWN/HIGH/CRITICAL/secrets zero; MEDIUM 23 and LOW 8 retained for review.
- Owned scanner absence and temporary archive/cache cleanup passed.

This is not complete application-dependency scanning, complete OS/application/
generated licensing, publisher-signature validation or live ECR source matching.
Those booleans, deployment/execution/publication readiness and registry promotion
authorization remain false. The old October 4 promotion expiry/identity guards
were not generalized to promote this tag. A later promotion needs a newly
reviewed, source-bound scope; do not retag an old acceptance to bypass it.

The first current preparation stopped with an unsettled top-level await while
dynamically loading a CLI/promotion cycle. It did not produce a candidate proof.
Pure application archive/source helpers were mechanically extracted into
`worker-application-proof.ts`; legacy exports remain compatible. File labels
are runtime-frozen. A regression checks import completion with no CLI operation.
Earlier archive assertions were preserved and 32 focused application/base/
preparation cases passed after extraction; subsequent complete-gate evidence is
separate.

That failed pre-build tree was independently identified by its exact creation
time, physical direct-child path, three-directory layout, empty cache/auths,
source hashes, absent archive and absent preparer/scanner processes. Only that
recreatable owned source copy was removed; original files/images/volumes stayed.
The corrected preparation then completed successfully.

Docker startup first preserved two verified stopped-only transient socket
directories, scope `75962e8104624c5eb0e124ec64faf172`. No reset, data-root removal,
security/global setting or execution-policy change occurred. After success,
actual running containers were zero and normal Desktop stop completed. Final
independent process/temp closure is in [safe stop](LOCAL_SAFE_STOP_2026-10-12.md).
The two recoverable backups and the stopped local candidate image are retained;
they are not leaked running workloads or owned proof-temp residue.

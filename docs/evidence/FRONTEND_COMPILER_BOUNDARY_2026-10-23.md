# Frontend compiler boundary — 2026-10-23 Tokyo

Local verification only. No dependency/version change, install, AWS mutation,
image push, public hosting, subscription or repository publication.

## Closed initial whole-gate gap

Genuine frozen receipt `436c49d1-dc7d-493d-99e4-70cba4180264` completed
**09:56:09.989 UTC**: pnpm 11.16.0, 392 identities, fresh install 80,291 ms,
all 88 steps/four groups in 322,606 ms under the unchanged 360,000 ms ceiling.
1,326 tests: 1,325 pass/one existing OS privilege skip. All 33 loopback HTTP
checks passed and servers/fixtures closed. No reused dependencies, lifecycle
scripts, private registry credentials or current-install modification.

Strict saved-schema/current-source comparison independently matched 589 files/
5,785,610 bytes, SHA-256
`7f928c39e8fe88eeae5b46dde61a5e4163549ee57616895286d31f9ecae7fdf1`.
The final October 22 failure remains failed; this is a new successful run, not
reclassification. Today's later compiler-boundary changes require their own
final whole proof. No clean Git clone, CI or release acceptance is inferred.

## Fixed public-package byte review

`scripts/frontend-compiler-byte-proof.mjs` defaults to zero actions. Explicit
`--execute-public-byte-proof` permits six exact official npm requests, in memory,
without extraction, installation, downloaded-code execution or private data.
Current lock SHA-256:
`375f6bd61b89fedaf8f305daa42d29899c648e4c13c09ef885c2867aa91e9d2c`.

At **10:20:50.462 UTC**, six reads/9,142,731 bytes matched **11 selected files**:

| Producer | Version | Selected files | Selected bytes |
| --- | --- | ---: | ---: |
| Vite | 8.2.4 | 4 | 122,762 |
| Rolldown | 1.2.14 | 5 | 46,306 |
| Windows x64 MSVC binding | 1.2.14 | 2 | 21,664,090 |

Selections include manifests, actual Vite CLI/Node entry, Rolldown entry/native
loader, whole existing producer documents, and the 21,663,232-byte native file.
Installed bytes and metadata were reread afterward. Package identity/version/
MIT/repository/canonical tarball/SHA-512 and native OS/CPU/main were checked.
The earlier nine-file prototype passed separately at 10:11:31 UTC; the later
run added the actual CLI and native loader and supersedes that narrower scope.

Archive SHA-256:

- Vite: `1d132a84f4980b2cbb15e1c1c78728aed90f5eb81c70791ed0cf133a1211139a`.
- Rolldown: `9c142fca1d5bfb9c9a6b58a3da16db75d9d30f3e6f8778d94a75b976c806e53d`.
- Native package: `ce04d0bd29158d9ab865eae14133882fc9adb97f4e823035f573f7a0541500f3`.
- Native binary: `ec81aebc71d9e87ee649ce2ff1db258e09029e472d8187f233d6dd4974fc5009`.

Only the exact native package/version/MIT tuple gets a separate 16 MB compressed,
32 MB expanded, 24 MB per-file, 16-entry profile. Existing profiles/caps are
unchanged. Unsafe paths, links, checksums, truncation and padding still reject.
Local regular-file/ancestor checks and descriptor identities bracket reads.
An initial boundary test incorrectly expected 16 entries to exceed a 16-entry
limit; it was corrected to explicitly accept 16 and reject 17, not relaxed.

This does not cover every package file/transitive build dependency, authenticate
publisher signatures, reproduce source-to-binary builds, attest which compiler
actually performed a build, or clear generated-helper rights. The native tarball
has no root LICENSE document; parent producer notices do not erase that fact.
Three AWS SDK root documents and 62 whole-lock root license files remain open.

Sources: [Vite metadata](https://registry.npmjs.org/vite/8.2.4),
[Rolldown metadata](https://registry.npmjs.org/rolldown/1.2.14),
[native metadata](https://registry.npmjs.org/%40rolldown%2Fbinding-win32-x64-msvc/1.2.14).

## Supported frontend command environment

The build previously forwarded `process.env` unchanged. The installed Rolldown
loader supports `NAPI_RS_NATIVE_LIBRARY_PATH`, WASI selection and test switches.
This is an inherited-environment trust gap, not an observed compromise.

`compiler-environment.mjs` rejects nonempty NAPI_RS/ROLLDOWN/ESBUILD override
families before spawning Vite or replacing build outputs. A fixed child
environment excludes inherited AWS/provider credentials, VITE variables,
NODE_OPTIONS/NODE_PATH and proxies. It retains OS bootstrap paths, keeps TLS
verification enabled and sets native version enforcement internally to `1`.
An externally supplied version-check setting is rejected too; clear it rather
than weakening the guard. `frontend/package.json` dev/preview now use the fixed
`vite-command.mjs` wrapper; no extra host/path/arguments. Default wrapper plan
starts no server. Both build/wrapper imports are inert.

This is not an OS sandbox, package authentication, a PATH audit or protection
against a parent Node preload that already ran. Direct manual Vite/API use is
outside these wrapper guarantees. No Windows/global/Codex setting changed.
The managed Node was already 24.22.1 at session start; its Authenticode status
was Valid/OpenAI. Its SHA-256 is
`6416a2fc6ccaf41d71fc50e3c0ff9074c633249e3c74564d55cd0a5c25b61ecb`.
It is an OpenAI-distributed build, not the distinct OpenJS download from yesterday.
No portable runtime was installed or left behind today.

Thirty-one focused tests passed, covering prior producer/native checks, new
byte boundaries and override/credential/preload rejection, fixed child args,
inert imports, old-runtime rejection and failed-build artifact preservation.
Targeted lint and actual guarded build passed. The emitted web chunk is unchanged:
223,076 bytes, SHA-256
`c83e68f1495dda861b537837d701652ab700d40bbffb666b1770457505ece1c3`.
Normal dev/preview command wiring was mock-verified; live HTTP coverage is
separate, not a claim that those wrapper processes were live-tested.

## Current registry snapshot and release boundaries

At **10:20:51.545 UTC**, the actual 392-coordinate npm query returned zero
advisories/matches (37 declared-runtime identities). Only reviewed public names/
versions were sent. Response SHA-256
`44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`;
coordinate SHA-256 `76d182638141129bbf821492558bfaba64d1b63ce18768e9a27c0acbc4a9abdc`.
This is not future safety, a new OS image scan or full source/native/license
clearance. October 22 worker MEDIUM 23/LOW 8 remain historical observations;
the unchanged worker was not rebuilt/rescanned today. Keep cloud jobs disabled,
circuit OPEN and every remaining release gate.

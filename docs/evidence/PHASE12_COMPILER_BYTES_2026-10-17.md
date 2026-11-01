# Selected compiler bytes and environment boundary — 2026-10-17 Tokyo

Local implementation and bounded anonymous public-package reads only. No AWS
write, secret retrieval, provider/model call, package installation, downloaded
code execution, GitHub upload or release approval.

## Inherited executable override

Synthetic red tests showed that the old builder accepted an inherited compiler
override and the isolated child environment retained it. The sentinel did not
execute foreign code, and the actual operator environment contained no such
override. This is a reproduced boundary weakness, not evidence of compromise.

The four fixed backend builders now reject nonempty case-insensitive `ESBUILD_*`
and `npm_config_esbuild_*` variables before output creation or loading esbuild.
The in-memory backend source proof does the same. Isolated source/scan child
environments remove these variables. Host/global configuration is unchanged.
The ten shared-builder tests and related environment regression tests passed.

## Actual official byte observation

At 2026-10-16 23:36:17.143 UTC, the recorded observation completed successfully:
`outputs/local-gates/compiler-74a1b55f-5ce3-48be-8d3b-c49512e5c3ad.json`.
Four fixed official npm GETs downloaded 4,858,777 bytes with bounded status,
origin, content, archive integrity, time and aggregate size checks. The before/
after lockfile and selected installed files matched. Lock SHA-256:
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
An independent disk reread subsequently confirmed completed/passed receipt
flags, fixed request/size counts, current lock and current installed native/API
wrapper hashes without another fetch or execution.

- esbuild 0.28.1: package manifest, JavaScript API wrapper and root license;
  three selected files, 102,263 bytes. Published archive SHA-256:
  `eb8ef756f8299d16d5c8b35678606d715ba29923f500db7b37c181310eed40a5`.
- @esbuild/win32-x64 0.28.1: manifest and native executable; two selected files,
  11,670,902 bytes. Published archive SHA-256:
  `5c5d62da7572b57ddc1fa3caedc36c1218b5d8d02ce9c7ee70e3339fce4453c4`.
  This archive declared MIT but had no root license document; that absence is
  retained, not replaced with an assertion of complete attribution.

The exact reviewed native-compiler parser profile alone permits its larger
binary. Existing runtime/frontend archive limits are not generally relaxed.
Seven synthetic tests cover fixed identities, selected-file mismatches,
malformed metadata/streams/archives, request bounds and inert default/import.
The whole checker requests only the zero-download plan.

This is not a whole-package inventory, publisher-signature verification,
source-to-binary reproducible build, attestation of which native executable a
past build actually ran, generated-helper rights clearance or legal opinion.
The proof neither extracts the archive nor runs/installs downloaded bytes.
See the [official esbuild installation description](https://esbuild.github.io/getting-started/#download-a-build)
and [versioned upstream license](https://github.com/evanw/esbuild/blob/v0.28.1/LICENSE.md).
Full source/native/OS/license/image/publication gates stay open.

The earlier image candidate is a separate source snapshot. These later build
changes and the worker deadline correction cannot borrow its scan or image ID.

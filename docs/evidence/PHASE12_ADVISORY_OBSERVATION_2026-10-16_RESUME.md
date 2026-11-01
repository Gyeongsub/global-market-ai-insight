# Official dependency advisory observation — 2026-10-16 resume

At **2026-10-16T12:52:11.222Z**, the existing bounded advisory tool sent one
request to the [official npm advisory endpoint](https://registry.npmjs.org/-/npm/v1/security/advisories/bulk).
The user previously explicitly approved these same **391 public package
names/versions**. The reviewed lock and coordinate hashes were unchanged;
there was no private metadata fallback, source/account/key upload, package
install, remediation, lifecycle script, AWS call or fee-enabled service.

- Lock SHA-256: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- Coordinate SHA-256: `a0e47d1dbf929ad39008801fbec48f94be8742e73e546edea6eef90cbc95be3c`.
- Registry response SHA-256: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
- Returned/matching advisories, affected packages and all severity counts: zero.
- Declared backend runtime packages: 37. The locked request included development
  dependencies too; this is not a current container or OS-package scan.

This is a point-in-time known-advisory observation, not proof of no defects,
publisher/source/build provenance, exploitability, full licensing, future
advisory status or release approval. The retained image's MEDIUM 23/LOW 8 and
the [separate signing-key trust gaps](PHASE12_RETIRED_KEY_OBSERVATION_2026-10-16_RESUME.md)
remain. No unchanged second POST was made just to refresh the date.

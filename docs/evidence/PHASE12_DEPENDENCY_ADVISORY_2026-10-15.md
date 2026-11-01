# Official registry advisory observation — 2026-10-15

At 2026-10-15T11:00:05.821Z one explicit fixed-endpoint POST sent only the same
previously reviewed public names/versions for 391 locked package identities to
the official npm security service. No source, account ID, API key, private
package tree, credentials or personal data was sent. No package was installed,
upgraded, executed, remediated or uploaded. Ordinary checks run zero-action only.

- Endpoint: `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`.
- Lock SHA-256: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- Coordinates SHA-256: `a0e47d1dbf929ad39008801fbec48f94be8742e73e546edea6eef90cbc95be3c`.
- Response SHA-256: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
- One successful response, zero returned/matching advisories and zero affected
  locked or declared-runtime identities. Every severity count was zero.
- Before/after lock matched; 37 runtime identities were classified separately.

This is a dated registry snapshot, not npm audit CLI totals, calculated
metavulnerability propagation, source/build provenance, complete license/legal
approval, development execution, image/OS scan or future safety guarantee. An
unknown/network/malformed response would not become clean; no fallback sends
private project metadata. Missing or unreviewed signatures remain separate
unknowns. Release/publication stays false.

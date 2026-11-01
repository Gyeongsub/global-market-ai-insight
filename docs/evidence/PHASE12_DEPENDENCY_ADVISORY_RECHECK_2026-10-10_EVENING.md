# Authorized registry advisory snapshot — 2026-10-10 evening

The user explicitly approved transmission of this private project's 391 fixed
public package names/versions to the npm official security server in this turn.
The earlier security-review rejection was not bypassed; this is a new execution
after specific approval. Approval does not authorize source/credentials,
additional coordinates, different endpoints, GitHub publication or IAM widening.

## Actual observation

- UTC: `2026-10-10T11:22:39.658Z` (20:22 JST).
- One POST to `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`;
  no redirect, authentication headers, private-registry fallback or retry.
- Reviewed lock SHA-256: `02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
- Coordinate-body SHA-256: `a0e47d1dbf929ad39008801fbec48f94be8742e73e546edea6eef90cbc95be3c`.
- Response-byte SHA-256: `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`.
- 391 locked identities, including prereleases; 37 declared runtime identities.
- Returned/matching advisories: zero, across all severity groups.
- No packages installed, lifecycle script, source/credential payload, cloud call,
  code/lock change, repository upload or automatic remediation.
- Fifteen focused advisory-reader tests passed before the request.

The dependency composition **was disclosed** to npm as specifically authorized.
The tool's `privateProjectMetadataSent: false` means no workspace name, source,
paths or private registry details; it does not erase the private composition
inference from a package/version inventory. Likewise `uploaded: false` means
no repository/file publication, not no outbound POST body.

This is a dated direct range-match snapshot, not npm audit CLI totals, a complete
metavulnerability graph, container/OS scan, current private artifact attribution,
future safety guarantee, legal clearance or release/publication approval.
The previous morning's advisory-unknown observation remains historical evidence.


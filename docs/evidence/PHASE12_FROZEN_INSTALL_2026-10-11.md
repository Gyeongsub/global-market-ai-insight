# Independent frozen installs — 2026-10-11

Two separate real isolated builds were executed. The second includes the later
redacted log-decision diagnostics and is the final code snapshot below. Neither
uses copied dependencies, a previous pass or a Git clean-clone claim.

| Observation | Intermediate controller diagnostics | Final code including log diagnostics |
| --- | ---: | ---: |
| Copied source files | 435 | 437 |
| Copied source bytes | 4,548,105 | 4,564,891 |
| Tests | 892 | 895 |
| Passed | 891 | 894 |
| Windows file-link privilege skip | 1 | 1 |
| Frozen install time (ms) | 65,317 | 75,048 |
| Full gate time (ms) | 300,651 | 315,215 |
| Unchanged full gate bound (ms) | 360,000 | 360,000 |
| Complete timing records | 66 | 66 |
| Loopback HTTP requests | 33 | 33 |

Intermediate source SHA-256:
`4e3557a18000e99ec48a3696dafdbd51932c38314f118021bc47d5571aead0b5`.
Final copied-source SHA-256:
`1278ac77ca245784ce58793207aa2e1ac49f2c4380a003c6fd7e65a3d8558fe1`.

The final gate completes all four test groups and 66 steps without failure.
Its numeric timing observer is not independently a gate authorizer; the
successful child exit, full test summary and HTTP proof are required too.
The separately skipped Windows file-symlink case remains a skip, not a pass;
existing directory-junction boundary tests run. No timeout was increased.

## Tool, dependency and network boundaries

Declared pnpm 11.16.0 was fetched from its fixed official npm metadata/tarball
URLs and matched the pinned SHA-512 integrity before extraction/execution.
Tool archive SHA-256:
`3f2a848545f82fce6966f3ecaa8b7d87b5563f901a170e2bd573b02296b382fa`;
891 bounded ordinary tool files. Unknown archive paths/links are refused.

Both copies start without node_modules and use separate fresh stores. All 391
locked package identities require registry SHA-512 resolutions. Frozen install,
ignored lifecycle scripts, no retries and no reuse preserve the actual lock:
`02493a22ca0ab337455d210a5f2ce421768cfa9bcb71e4e420e9e46593ddc2b6`.
The workspace installation and lockfile remain unchanged. These public package
downloads are not another advisory-inventory POST; no such POST ran today.

AWS/provider/cloud credentials, private npm configuration and proxy settings
are absent from child environments. The full gate uses offline/dry-run operator
plans and loopback HTTP, with zero AWS calls or cloud mutations. Development and
preview proof servers close, private sentinels are not served and the temporary
source/tool/store trees are removed after each run.

## Evidence limits

Later dated handoff/documentation edits are outside the passed copied-source
fingerprint and receive separate secret/privacy/link scans. This is not the
final publication source freeze, committed clean clone, approved CI execution,
actual live image/code inspection, current container scan, complete notice/legal
review or GitHub approval. No Docker execution, cloud deploy, job enablement,
workflow, remote, push or subscription resulted from this proof.

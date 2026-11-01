# Dated local worker candidate — 2026-10-17 Tokyo

This is a retained local image observation, not a live image acceptance,
application execution, ECR upload or permission/publication approval.

## Exact successful snapshot

After the separately retained [first refused attempt and exact Dockerfile
review](BACKEND_BUILD_BOUNDARIES_2026-10-17.md), the second bounded execution
completed at 2026-10-16 23:30:10.892 UTC, October 17 Tokyo.
Receipt: `outputs/local-gates/worker-3865f602-c2b5-44ef-9787-a2da0cf25700.json`.

- Distinct retained tag: `gmai-worker:local-20261017-release`.
- Source: 513 files / 5,222,126 bytes, SHA-256
  `d87c57f34f9fe1bbdcc361728d4b33c79a06884dade5e257ee350676321cbfcc`.
- Runtime image ID:
  `sha256:6dc576781744198306352c6ece99f4f603be3ff0c4d9509877d773390cc0979b`.
- Config:
  `sha256:df05d12aa85d84fad8fa6f6f0e196606470da33dc9e652b14ddba9133b5858ad`.
- Archive: 54,921,216 bytes / 26 hashed blobs. All three exact application
  files and two final application diff-ID layers matched current bundles;
  the ordered 22-layer reviewed public-base prefix matched.
- Worker at this snapshot: 1,484,293 bytes, SHA-256
  `034829d700363e0b7868568590e1b7e07f1ab934cd11fc1ea8b0b4dbf55febfc`.
- Fresh scanner database: 14 OS packages; UNKNOWN/HIGH/CRITICAL/secrets zero.
  MEDIUM 23 and LOW 8 remain, not waived or relabeled safe for release.

Whole source and the three application files were rechecked after the scan.
Independent receipt/image/nonroot/architecture/current-source readback matched
at that time. No ECR credential retrieval, push, cloud write, application-image
execution, public hosting or GitHub upload. The owned scanner, archive/cache and
temporary copy were removed. Global running containers were independently zero
at 23:30:40.002 UTC, and normal Docker Desktop stop returned success.

## Later source is not covered

The later compiler-environment guard, compiler-byte proof and worker deadline
correction changed the repository after this scan. In particular the runtime
deadline fix is not contained in this image. Its historical tag/scan must not
clear current-source promotion, deployment, vulnerabilities, complete notices,
provider rights, IAM acceptance or publication. No tag overwrite or automatic
promotion is performed. New current-source verification is required later.

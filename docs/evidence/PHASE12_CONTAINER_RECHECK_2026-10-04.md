# Phase 12 — current local container rebuild and archive scan

Date: 2026-10-04, Asia/Tokyo. Local-only; no AWS/ECR/GitHub push, deployment,
paid scanner account, provider/model call or public data display.
Docker's scoped startup recovery is [separately recorded](DOCKER_RUNTIME_RECOVERY_2026-10-04.md).

## Fresh findings invalidate an old scan

The declared Dockerfile was built for Linux/amd64 with a frozen lockfile and
lifecycle scripts disabled. BuildKit may reuse a matching installation layer:
this is not a fresh whole-workspace dependency install or Git clone.
Lock SHA-256 remained
`d7ecc71e7f10d2667dacd3cc2095b534e15e205cf617afc06d301b98775185bf`.
The first candidate was
`sha256:4f560d092e7277f7845e72489a982bc53a304406c16b05cd1657f379362c241b`
(54,836,678 bytes). Its old runtime index was
`sha256:939d6f1671529d230f50b563578e9b5d206af58f038b10ebd7e1233023d4e167`.
The fresh Trivy database reported **LOW 16 / MEDIUM 37 / HIGH 3 / CRITICAL 0**
and zero detected secrets. The HIGH findings were:

- [CVE-2026-14456](https://security-tracker.debian.org/tracker/CVE-2026-14456).
- [CVE-2026-75804](https://security-tracker.debian.org/tracker/CVE-2026-75804).
- [CVE-2026-84782](https://security-tracker.debian.org/tracker/CVE-2026-84782).

All named `libssl3t64` at `3.5.6-1~deb13u2`; the two latter tracker entries
require `3.5.7-1~deb13u3`, not merely the preceding update. Reachability was
not established and no exception was granted. The image was not deployed.
After exact-ID ownership verification, only this new local candidate tag/image
was removed without force; prior Docker/ECR images were preserved. Rebuildable
BuildKit layers may remain in local cache; no blanket prune was performed.

## Immutable runtime refresh and second acceptance

The [official Distroless Node 22 image](https://github.com/GoogleContainerTools/distroless/blob/main/nodejs/README.md)
and its `nonroot` OCI index were inspected. The exact Linux/amd64 manifest
was selected and pinned in the Dockerfile, not a floating runtime tag:
`sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c`.
This is registry/content identity verification, not an independently verified
publisher signature or a new trust/permission setting. Architecture is
explicitly Linux/amd64; this record does not prove an ARM64 image.

The second current-source local build succeeded:

- Tag: `gmai-worker:local-20261004-patched` (local, not a registry address).
- Image ID: `sha256:ba729490aa9aae96d0174ee043a59ef14428e6a9c4b2f2ea52add56fa641aca3`.
- Size: 54,891,919 bytes; user/group `65532:65532`.
- Entrypoint: `/nodejs/bin/node main.mjs`; no shell/package-manager runtime.
- Independent bounded runtime read: Node `v22.23.3`, Node OpenSSL `3.5.8`, UID/GID
  65532. This Node library version is separate from Debian package inventory.
- PRICE and ANALYZE **synthetic** fixture smokes exited successfully.
- Missing JOB_ID/configuration negative smoke exited one with a fixed safe code.

All worker invocations used no network, read-only root, all capabilities
dropped, no-new-privileges, PID 64, 128 MiB memory and CPU 0.5, with auto-removal.
They made no AWS/provider/model request and disclosed no live quote/result.

The second archive scan reported **LOW 8 / MEDIUM 23 / HIGH 0 / CRITICAL 0**
and zero detected secrets. No unfixed-vulnerability suppression or severity
exception was used. LOW/MEDIUM findings remain; this is not vulnerability-free,
complete license/attribution, exploitability, image-history/privacy or zero-day
clearance. The separate current npm advisory result covers locked package
identities; an esbuild SDK bundle is not a full dependency manifest for Trivy.
Build-stage OS/tooling and other local/registry images were not scanned here.

## Scanner isolation, freshness and cleanup

The preexisting official scanner identity was independently inspected and used
by immutable image ID, not a mutable tag:
`aquasec/trivy@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f`,
Trivy 0.72.0. Version-two DB metadata:

- Updated: `2026-10-03T19:02:38.737369755Z`.
- Second private-cache download: `2026-10-03T23:48:44.54159118Z`.
- Next update: `2026-10-04T19:02:38.737369504Z`.

Each exact candidate was privately exported with `docker image save` and scanned
through [the documented archive input](https://trivy.dev/docs/latest/references/configuration/cli/trivy_image/).
The scanner had **no Docker socket, source, AWS state, Docker credential config
or home mount**. It received only the archive read-only plus a new isolated
cache. Root was read-only, capabilities dropped, privileges bounded and a
512 MiB temporary filesystem provided. Public DB downloads were allowed;
dependency-identification API requests, telemetry and version notices were
disabled. This is not a claim of zero scanner network traffic.

Both operators completed. Finally cleanup revalidated the unique physical OS
temporary child, removed its exported archive/cache and independently confirmed
all four owned smoke/scanner containers absent. The patched image remains only
in local storage. No user data, prior cache/image/volume or Docker VHDX was reset.
Desktop shutdown is separately confirmed in the closing record.

## Next execution gate remains unresolved

A local patch does not update the image already referenced by the live ECS
task definition. Keep internal jobs/display false and the circuit OPEN. Before
any new enablement, including Stage C, scan the **exact referenced registry
digest**, review current worker/controller compatibility and the exact account-
specific deployment diff. Do not claim this report scanned the live ECR image.
No fresh registry image or task definition was published/updated here.

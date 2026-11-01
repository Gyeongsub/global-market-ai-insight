# Docker worker validation

This document preserves the **historical 2026-08-10** result. It is not a
current-source or current vulnerability-database clearance. The 2026-10-04
rebuild detected three HIGH OS findings in that superseded runtime base; the
local candidate was removed without touching prior images or AWS. The runtime
Dockerfile was refreshed to the official Linux/amd64 manifest
`sha256:7b0a2b9262b3d1d57e139e08fe11bccb0a7d426ca515eab0cd6abcaf2016ae5c`.
The second rebuild/smoke/scan had zero HIGH/CRITICAL and detected secrets,
with eight LOW and 23 MEDIUM findings retained. These are local-only results;
they do not clear the live ECR image or publication/attribution gates.
[Current container evidence](evidence/PHASE12_CONTAINER_RECHECK_2026-10-04.md).

검증일: 2026-08-10 (Asia/Tokyo)

## 결론

Phase 3의 로컬 Docker worker 게이트를 통과했다. 로그인, image push, AWS resource 생성 없이 로컬에서만 검증했다.

- Docker Engine: 29.6.2, Linux/amd64
- 최종 local tag: `gmai-worker:local-20260810-hardened`
- local image ID: `sha256:c9dbd971377c80ea7ad57ec86306b94f0d4840bc1481566aab8a68c6f900f362`
- image size: 54,570,563 bytes
- runtime user: `65532:65532`
- entrypoint: `/nodejs/bin/node dist/services/worker/src/main.js`
- `PRICE` smoke: 성공
- mocked `ANALYZE` smoke: 성공
- `JOB_ID` 누락 negative test: 예상대로 exit code 1
- Trivy 0.72.0 `HIGH`/`CRITICAL`: 0건(패치 제공 여부와 무관한 전체 범위)
- Trivy secret finding: 0건
- `pnpm check`: service/contract 21개와 frontend contract 4개를 포함해 전체 통과

## 고정된 supply-chain 입력

- Build: Node.js v22.23.2
- Build base: `node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`
- Runtime base: `gcr.io/distroless/nodejs22-debian13:nonroot@sha256:939d6f1671529d230f50b563578e9b5d206af58f038b10ebd7e1233023d4e167`
- Package manager: pnpm 11.16.0
- Install policy: frozen lockfile, lifecycle scripts disabled

최종 runtime에는 shell, npm, yarn, corepack, build dependency, source-control metadata와 `.env`를 포함하지 않는다. `.dockerignore`가 `.git`, `.env*`, dependency cache, build output, log와 local work directory를 build context에서 제외한다.

2026-09-29 local hardening: the build context also excludes service bundles,
CDK/Terraform output, editor files, private-key file types and other generated
paths before bytes are sent to the Docker builder. A source-level regression
test requires both image stages to use immutable digests, permits only the
fresh worker bundle in the runtime-stage `COPY`, and preserves the non-root
Distroless entrypoint. This is not a current image build or vulnerability scan.

## 보안 강화 결과

초기 `node:22.19.0-bookworm-slim` runtime은 78,971,569 bytes였고, 2026-08-10 Trivy database 기준 `HIGH` 40건과 `CRITICAL` 5건이 탐지됐다. 다수는 runtime에 불필요한 package manager와 오래된 Debian package에서 발생했다.

Distroless runtime으로 교체한 뒤 image는 약 31% 작아졌고, 동일 기준의 `HIGH`/`CRITICAL`은 0건이 됐다. 다음 제한도 동시에 검증했다.

- read-only root filesystem
- outbound/inbound network 비활성화(`--network none`)
- Linux capability 전체 제거
- `no-new-privileges`
- PID 64, memory 128 MiB, CPU 0.5 제한
- 비관리자 uid/gid `65532:65532`

## 재현 명령

```powershell
docker build --file services/worker/Dockerfile --tag gmai-worker:local-20260810-hardened .
```

Smoke 실행 시 `APP_ENV=local`, `JOB_ID`, `LOCAL_JOB_FIXTURE_JSON`을 전달하고 다음 제한을 적용한다.

```powershell
docker run --rm --read-only --network none --cap-drop ALL `
  --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 0.5 `
  --env APP_ENV=local --env JOB_ID=<bounded-test-id> --env LOCAL_JOB_FIXTURE_JSON `
  gmai-worker:local-20260810-hardened
```

Historical method only: the August scan used Trivy with a read-only Docker
socket mount. A `:ro` socket bind does **not** make Docker's API read-only and
can expose engine-management authority. **Do not reuse this method.** Today's
bounded scanner receives an exported candidate archive mounted read-only plus
an owned isolated cache, no Docker socket, credentials or repository mount.
It disables scanner telemetry and version notices; public database downloads
are separate from dependency-resolution API lookups. The fixture smoke itself
has `--network none`.
[Official archive input](https://trivy.dev/docs/latest/references/configuration/cli/trivy_image/).

The superseded socket command is deliberately not retained as an executable
recommendation. Export only the exact owned candidate with `docker image save`,
scan it with `trivy image --input`, and independently verify owned-container
and temporary archive/cache cleanup. Do not mount the user's Docker config,
cloud state, home directory or source tree in the scanner.

## 남은 cloud gate

이 검증은 로컬 image에 한정된다. Phase 4에서 사용자 승인 후 다음을 별도로 수행한다.

- ECR repository 생성과 scan-on-push/lifecycle 설정
- commit SHA tag 및 ECR digest 배포
- Fargate one-shot task의 시작, 로그, 종료 확인
- 실제 task CPU/memory와 비용 측정
- ECS Service, ALB, NAT Gateway가 생성되지 않았는지 확인

ECR push 뒤에는 registry에 저장된 최종 digest를 다시 스캔한다. 현재 결과를 미래 image 또는 ECR 결과로 간주하지 않는다.

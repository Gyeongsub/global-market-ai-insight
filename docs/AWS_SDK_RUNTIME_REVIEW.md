# AWS SDK runtime review

확인일: 2026-08-22

2026-10-01 후속 메모: 아래 수치와 로컬 이미지 정보는 초기 worker 검토의
역사적 스냅샷이다. 이후 controller가 ECS client를 사용하게 되어 현재 root
production graph는 34 packages(`30 Apache-2.0`, `3 MIT`, `1 0BSD`)다. 최신
허용 라이선스 검사는 이 수치로 통과했으며, 정확한 현재 소스 이미지는 아직
다시 빌드·스캔하지 않았다.

## 채택 항목

| 항목 | 결정 |
|---|---|
| Package | `@aws-sdk/client-bedrock-runtime` |
| Versions | Bedrock Runtime와 DynamoDB 모두 `3.1116.0` 고정 |
| License | Apache-2.0 |
| Node engine | `>=20.0.0` |
| Worker runtime | Node.js 22 고정 이미지와 호환 |
| Imported API | bare-bones `BedrockRuntimeClient`, `ConverseCommand`, `DynamoDBClient`, `GetItemCommand`, `UpdateItemCommand` |
| SDK attempts | `maxAttempts: 1` |
| Credentials | 코드·환경 파일에 저장하지 않고 ECS worker task role 사용 |
| Bundle tool | `esbuild` `0.28.1` 고정 |
| Local bundle | 1,471,249 bytes (약 1.47 MB, 2026-08-23 측정) |
| Local image | 54,833,510 bytes (약 54.8 MB, 2026-08-23 측정) |
| Local image digest | `sha256:d445401eff3ee22c91d896ca6393c4d3d39c43b6673c4000688f0428175ea879` |

## 공급망과 라이선스 결과

- root production graph는 33 packages다.
- license 분포는 Apache-2.0 29개, MIT 3개, 0BSD 1개다.
- `scripts/check-production-licenses.mjs`가 허용 목록 밖의 production license 또는 불완전한 metadata를 실패 처리한다.
- 정확한 버전과 integrity는 `pnpm-lock.yaml`에 고정한다.
- container bundle에 `THIRD_PARTY_NOTICES.md`와 AWS SDK의 Apache-2.0 license 원문을 포함한다.
- 2026-08-23 `pnpm audit --prod` 결과 info/low/moderate/high/critical 모두 0이었다. 이 결과는 조회 시점의 npm advisory 데이터에 한정된다.

## 보안·비용 경계

- transport는 SDK response에서 tool-use, text, stop reason과 token usage만 좁게 변환한다. metadata, trace 및 내부 응답은 브라우저 결과에 전달하지 않는다.
- adapter가 AbortSignal timeout, input/output token cap, forced tool call, allowlisted ID, usage 합계를 재검증한다.
- SDK가 자체적으로 같은 inference를 반복하지 않게 `maxAttempts: 1`로 설정한다.
- DynamoDB conditional write도 `maxAttempts: 1`로 설정하고, 응답이 불명확하면 status/version을 다시 읽어 판단한다.
- 이 검토와 테스트에서는 AWS credential을 읽거나 Bedrock을 호출하지 않았으므로 추가 AWS 비용은 USD `0.00`이다.

## 당시 잔여 게이트와 현재 상태

- 이 문서 작성 당시에는 실제 AWS table 상태 전이 증거가 없었다. 이후
  제한된 Phase 7 수동 상태 전이와 실행 증거가 추가되었지만, 2026-10-01
  Phase 11 자동 경보 전이는 여전히 로컬 초안이며 실드릴 전 별도 승인이
  필요하다.
- 배포 직전에 lockfile vulnerability scan과 실제 container image scan을 다시 수행한다.
- live smoke test는 account, Tokyo Region, 모델 ID, 예상 1회 호출과 예상 비용을 다시 제시하고 사용자 승인을 받은 뒤에만 실행한다.

## Container 확인 결과

- local tag: `gmai-worker:dynamodb-local` (registry push 없음)
- runtime user: `65532:65532`
- `--network none --read-only` 조건에서 합성 QLD ANALYZE fixture one-shot 실행 성공
- `/app/THIRD_PARTY_NOTICES.md`와 `/app/licenses/AWS-SDK-JS-V3-APACHE-2.0.txt` 존재 확인
- distroless runtime에는 pnpm, TypeScript compiler와 repository source를 복사하지 않는다.

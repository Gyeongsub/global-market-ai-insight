# Amazon Bedrock 접근 및 비용 게이트

기준일: 2026-08-10

## 확정 구성

- AWS Region: Tokyo `ap-northeast-1`
- Model: Amazon Nova Lite
- Model ID: `amazon.nova-lite-v1:0`
- Endpoint 방식: in-region `bedrock-runtime`
- 과금 방식: 표준 on-demand만 허용
- 금지: provisioned throughput, reserved/priority capacity, 무제한 출력, 자동 반복 평가

## 읽기 전용 확인 결과

AWS Bedrock control-plane API에서 다음 상태를 확인했다.

- agreement: `AVAILABLE`
- authorization: `AUTHORIZED`
- entitlement: `AVAILABLE`
- region: `AVAILABLE`

이 확인은 모델 추론을 실행하지 않았으므로 Bedrock token 요금이 발생하지 않았다.

## AWS Price List 확인 결과

Tokyo의 Nova Lite 표준 온디맨드 가격은 다음과 같다.

| 항목 | 단위 | USD |
| --- | ---: | ---: |
| Input tokens | 1,000 tokens | 0.000072 |
| Output tokens | 1,000 tokens | 0.000288 |
| Prompt cache read input | 1,000 tokens | 0.000018 |

가격은 변경될 수 있으므로 배포와 주요 평가 전에 AWS Price List API 및 공식 Bedrock 가격 페이지에서 다시 확인한다.

2026-08-22 AWS Price List API 재확인 결과도 입력 USD `0.000072` / 1K tokens, 출력 USD `0.000288` / 1K tokens로 동일하다. 가격표 publication date는 2026-08-20, effective date는 2026-08-01이다.

## 승인 대상 1: 최초 smoke test

- 호출 횟수: 1회
- 입력 상한: 1,000 tokens
- 출력 상한: 256 tokens
- 자동 retry/repair: 없음
- 테스트 데이터: 로컬 fixture에서 만든 비민감 시장 사실만 사용
- 최대 계산 비용: `(1.0 × 0.000072) + (0.256 × 0.000288) = USD 0.000145728`
- 반올림 상한: USD 0.000146 미만

실제 token 수는 상한보다 작을 수 있다. 세금, 환율 및 AWS 청구 반영 지연은 이 계산에 포함하지 않는다. 이 호출은 금액이 매우 작더라도 과금 가능 작업이므로 사용자 승인 전에는 실행하지 않는다.

## 승인 대상 2: 세 언어 구조화 출력 평가

- 언어: English, Japanese, Korean 각 1회
- 호출 횟수: 3회
- 호출별 입력 상한: 1,500 tokens
- 호출별 출력 상한: 512 tokens
- retry/repair 없는 최대 계산 비용: USD 0.000766368
- 각 호출에 최대 1회 retry/repair를 허용할 때의 최대 계산 비용: USD 0.001532736

평가에서는 제공된 사실만 사용하는지, JSON schema를 지키는지, 불확실성과 데이터 한계를 표현하는지, 금융 자문 문구를 생성하지 않는지, `QLD` 위험 문구가 보존되는지를 검증한다.

2026-08-22 로컬 준비 결과:

- prompt contract를 `v2`로 갱신하고 정확히 6개 필드만 허용했다.
- Markdown code fence, 추가/누락 필드, 빈 문자열, 배열 2개 초과, 항목별 길이 초과를 strict parser에서 거부한다.
- 모델 raw response 최대 길이는 2,400 characters로 제한한다.
- `scripts/bedrock-i18n-evaluation.ps1`은 기본적으로 dry-run이며 `-Execute` 없이는 inference를 호출하지 않는다.
- dry-run에서 3회, 자동 retry 0, 호출별 입력 1,500/output 512 tokens, 총 계산 상한 USD `0.000766368`을 확인했다.
- 서비스·계약 23개, 인프라 4개, 프런트엔드 4개를 포함한 전체 로컬 검사를 통과했다.
- 저장소 secret 검사에서 AWS access key, secret key 할당, session token, private key가 모두 0건이었다. 발견된 이메일 문자열은 테스트용 example domain 또는 공개 패키지 메타데이터이며, 12자리 숫자는 SBOM digest 내부의 우연한 숫자열이었다.
- 이 준비 단계에서 AWS 로그인, Bedrock inference, 라이브 provider 호출, 배포는 수행하지 않아 추가 AWS 비용은 USD `0.00`이다.

## 다음 게이트

1. [x] 사용자가 최초 smoke test의 최대 예상 비용을 승인했다.
2. [x] `maxTokens=256`, AWS 최대 시도 횟수 1로 요청했다.
3. [x] 계정의 Nova Lite 온디맨드 할당량이 0보다 큰지 확인한다.
4. [x] 할당량이 제공된 뒤 smoke test를 다시 승인받아 1회 호출한다.
5. [x] 실제 input/output token 수와 계산 비용을 기록한다.
6. [x] 세 언어 평가의 strict output contract, dry-run 도구와 비용 상한을 로컬에서 검증한다.
7. [ ] 사용자에게 retry 없는 최대 비용 USD `0.000766368`을 다시 제시하고 별도 승인을 받는다.
8. [ ] 승인 후 영어·일본어·한국어 각 1회만 호출하고 실제 usage와 검증 결과를 기록한다.
9. [ ] 검증 후 AWS CLI temporary session을 로그아웃한다.

## 2026-08-10 smoke test 결과

- Windows 명령줄 JSON 인용 오류 1회: AWS 요청 전 client-side validation에서 종료되어 과금 없음
- 수정한 요청의 Bedrock 응답: `ThrottlingException` / `Too many tokens per day`
- 성공한 inference: 0회
- 반환된 token usage: 없음
- 자동 retry: 없음 (`AWS_MAX_ATTEMPTS=1`)
- Nova Lite 계정 할당량: on-demand requests/minute `0`, tokens/minute `0`, tokens/day `0`
- Nova 2 Lite 확인 결과: model은 `ACTIVE`이나 tokens/day 및 cross/global cross-region quota가 `0`
- 판단: IAM, model availability 또는 요청 schema 문제가 아니라 계정별 Bedrock 온디맨드 할당량이 현재 0인 것이 직접 원인
- 비용 판단: 실제 처리된 input/output token이 없으므로 예상 Bedrock token 비용은 USD 0.00이다. Billing 반영 지연을 고려해 추후 Cost Explorer에서 재확인한다.

상세 실행 기록은 `docs/BEDROCK_SMOKE_TEST_2026-08-10.md`에 보관한다.

## 2026-08-19 quota 재확인

AWS Support 회신 후 Tokyo `ap-northeast-1`에서 Service Quotas를 다시 읽기 전용으로 조회했다.

| Quota | Account value | Adjustable in Service Quotas |
| --- | ---: | --- |
| Nova Lite in-region on-demand requests per minute | 20 | No |
| Nova Lite in-region on-demand tokens per minute | 200,000 | No |
| Nova Lite model invocation tokens per day | 564,480,001 | No |
| Nova Lite cross-region requests per minute | 40 | No |
| Nova Lite cross-region tokens per minute | 400,000 | Yes |

- Model lifecycle: `ACTIVE`
- Supported inference: `ON_DEMAND`, `INFERENCE_PROFILE`
- 프로젝트 선택: cross-region을 사용하지 않고 Tokyo 인리전 `ON_DEMAND`만 사용
- 판단: 기존 `Too many tokens per day`의 직접 원인이었던 0 quota 상태는 해소됨
- 실제 inference: 실행하지 않음
- token 비용: USD 0.00
- 확인 후 `gmai-admin` 임시 CLI 세션 로그아웃 완료

Support 회신의 RPM `40`, TPM `400,000`은 API에서 확인한 cross-region 값과 일치한다. 인리전 값도 요청했던 RPM `5`, TPM `10,000`보다 충분히 크므로 최초 성공 smoke test를 진행할 수 있는 선행 조건은 충족되었다. 실제 호출 성공 여부는 별도 비용 재승인 후 1회 inference로만 확정한다.

## 2026-08-22 성공 smoke test

- 승인된 호출: 1회
- 실제 성공 inference: 1회
- Input tokens: `167`
- Output tokens: `256`
- Total tokens: `423`
- Stop reason: `max_tokens`
- 자동 retry/repair: 없음
- 실제 계산 token 비용: USD `0.000085752`
- 승인 상한 USD `0.000145728` 미만 준수

서비스 접근과 실제 inference 경로는 통과했다. 출력이 256 tokens 상한에서 종료되어 JSON이 완성되지 않았고 Windows CLI의 한국어 출력도 올바르게 보존되지 않았으므로 schema/locale/금융 안전 품질은 통과로 처리하지 않는다. 상세 기록은 `docs/BEDROCK_SMOKE_TEST_2026-08-22.md`에 보관한다.

## 2026-08-22 세 언어 평가 1차 실행

- 사용자 승인: 영어·일본어·한국어 각 1회, retry/repair 0, 총 계산 상한 USD `0.000766368`
- 실제 inference: 3회
- 자동 retry/repair: 0회
- 세 응답의 기본 strict JSON contract: 통과
- 실행 후 로컬 결과 합산 오류로 실제 usage와 응답 원문 최종 수집: 실패
- 실제 언어·금융 안전·QLD 내용 검증: 증거 미확보로 미통과 처리
- 후속 자동 재호출: 없음
- `gmai-admin` 임시 CLI 세션: 로그아웃 완료

합산 오류를 수정하고 dry-run을 다시 통과했지만, 수정된 도구로 실제 호출을 반복하지 않았다. 재평가는 새로운 유료 작업이므로 동일한 3회 계산 상한을 다시 제시하고 별도 승인받는다. 상세 기록은 `docs/BEDROCK_I18N_EVALUATION_2026-08-22.md`에 보관한다.

## 2026-08-22 세 언어 평가 재실행

- 별도 재승인 상한: USD `0.000766368`
- 실제 inference: 3회, 영어·일본어·한국어 각 1회
- 자동 retry/repair: 0회
- 실제 usage: input `975`, output `827`, total `1,802` tokens
- 실제 계산 token 비용: USD `0.000308376`
- 승인 상한 준수: 통과
- JSON/locale 문자/QLD 2x/기본 금지 표현 검증: 3/3 통과
- 수동 grounding 및 비홍보성 검토: 3/3 미통과
- `gmai-admin` 임시 CLI 세션: 로그아웃 완료

영어는 공급하지 않은 benchmark와 기간 적합성 판단, 일본어는 낙관적 장기수익 및 최신 데이터 주장, 한국어는 고수익·투자기회 표현 때문에 최종 acceptance에서 제외했다. 이를 차단하는 `v3` prompt와 validator를 비용 없이 로컬에서 구현하고 전체 검사를 통과했다. `v3` 실제 평가는 새로운 유료 게이트로 유지한다.

## 2026-08-22 `v3` 최종 평가와 `v4` 전환

- 별도 승인 상한: USD `0.000766368`
- 실제 inference: 3회, 자동 retry/repair 0회
- 실제 usage: input `1,269`, output `729`, total `1,998` tokens
- 실제 계산 token 비용: USD `0.000301320`
- 승인 상한 준수: 통과
- 자동 validation: 일본어만 통과, 영어·한국어는 잘못된 JSON 종료 문자로 실패
- 수동 strict grounding: 3개 모두 최종 acceptance에서 제외
- `gmai-admin` 임시 CLI 세션: 로그아웃 완료

일반 text JSON 생성이 세 평가에 걸쳐 안정적이지 않았으므로 추가 prompt 조정 대신 AWS가 문서화한 Converse tool use 방식으로 `v4`를 구현했다. 특정 tool을 강제하고 tool input schema로 자료형을 제한한 뒤 application validator를 다시 적용한다. `v4`는 로컬 전체 검사를 통과했으며 실제 호출은 새로운 유료 게이트로 남긴다.

## 2026-08-22 `v4` tool-use acceptance

- 별도 승인 상한: USD `0.000766368`
- 실제 inference: 3회, 자동 retry/repair 0회
- 실제 usage: input `2,889`, output `815`, total `3,704` tokens
- 실제 계산 token 비용: USD `0.000442728`
- 승인 상한 준수: 통과
- forced tool call 및 schema 검증: 3/3 통과
- 수동 strict grounding 및 비홍보성 검토: 3/3 미통과
- `gmai-admin` 임시 CLI 세션: 로그아웃 완료

Tool use는 JSON 안정성을 해결했지만 모델이 facts 사이의 관계를 추측하거나 홍보성 문장을 만드는 문제까지 해결하지는 못했다. 따라서 추가 prompt 반복 대신 allowlisted insight ID를 모델이 선택하고 애플리케이션이 검증된 다국어 템플릿을 렌더링하는 구조로 전환한다. 추가 AWS 호출은 이 로컬 전환이 완료될 때까지 금지한다.

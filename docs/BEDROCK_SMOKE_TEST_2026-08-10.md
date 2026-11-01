# Bedrock Nova Lite smoke test 기록

실행일: 2026-08-10  
Region: Tokyo `ap-northeast-1`  
Model: `amazon.nova-lite-v1:0`

## 승인된 실행 경계

- 1회의 성공 가능한 inference 요청
- 비민감 로컬 QLD fixture만 사용
- 입력 1,000 tokens 이하
- `maxTokens=256`
- 최대 시도 횟수 1, 자동 retry 없음
- 예상 비용 상한 USD 0.000146 미만

## 요청 내용

로컬 fixture의 QLD 가격, 시각, 시장 상태와 다음 제약만 전달했다.

- QLD의 2x 목표는 일일 기준임을 설명
- 복리와 경로 의존성 설명
- 확대된 하락 위험 설명
- 단일 fixture 가격으로 원인이나 미래 방향을 주장하지 않음
- 개인화된 buy/sell/hold 지시와 보장 표현 금지
- 한국어 JSON만 반환

credential, account ID, 개인 정보, 실제 provider key, 자유 형식 사용자 입력은 전송하지 않았다.

## 결과

첫 명령은 Windows의 JSON 인용 처리 때문에 AWS 요청 전에 client-side validation에서 종료됐다. 이는 inference가 아니며 token 과금 대상이 아니다.

수정한 요청은 Bedrock endpoint까지 도달했지만 다음 오류로 거부됐다.

```text
ThrottlingException: Too many tokens per day
```

- 성공한 inference: 0
- model output: 없음
- usage metrics: 없음
- 재시도: 없음
- 예상 token 비용: USD 0.00

## 원인 확인

AWS Service Quotas 읽기 전용 조회 결과:

| Quota | Account value | Adjustable in Service Quotas |
| --- | ---: | --- |
| Nova Lite on-demand requests per minute | 0 | No |
| Nova Lite on-demand tokens per minute | 0 | No |
| Nova Lite model invocation tokens per day | 0 | No |
| Nova Lite cross-region requests per minute | 0 | No |
| Nova Lite cross-region tokens per minute | 0 | Yes, but current value is 0 |

Nova 2 Lite도 model status는 `ACTIVE`였지만 확인 가능한 daily/cross-region/global cross-region token quota가 모두 0이었다. 따라서 모델 ID 교체는 현재 우회책이 아니다.

## 결론과 다음 조치

model catalog, access authorization, entitlement와 Tokyo region availability는 정상이다. 현재 차단 원인은 계정별 Bedrock on-demand quota가 0인 것이다.

1. AWS Support 또는 계정 한도 요청 경로에서 Bedrock Nova Lite on-demand quota 0 상태의 검토를 요청한다.
2. 계정/결제 확인 또는 AWS 측 할당량 변경이 완료되면 Service Quotas를 다시 읽기 전용으로 확인한다.
3. requests/minute, tokens/minute, tokens/day가 모두 0보다 큰 경우에만 smoke test 비용을 다시 승인받는다.
4. 성공 후 실제 input/output token과 계산 비용을 이 문서에 추가한다.
5. Billing 데이터가 반영된 뒤 이번 거부 요청에 청구가 없었는지 재확인한다.

확인 종료 후 `gmai-admin`의 cached CLI login credential을 제거했다. 이미 token을 메모리에 적재한 로컬 도구가 있다면 최대 약 15분 동안 기존 token을 사용할 수 있다.

AWS 공식 문서상 service limit increase 요청은 Basic Support를 포함한 모든 AWS 고객에게 제공된다. 유료 Technical Support 구독을 추가하지 않고 `Support Center > Create case > Service quotas` 경로를 우선 사용한다.

## Service quota 검토 요청

- 접수일: 2026-08-10
- Case type: Service limit increase
- Category: General
- 요청 범위: Nova Lite 5 requests/minute, 10,000 tokens/minute, 50,000 tokens/day
- 초기 상태: `Unassigned`
- Case ID, account email 및 기타 식별정보는 프로젝트 문서에 저장하지 않음
- 후속 조치: AWS 회신 또는 quota 변경 알림을 받은 뒤 읽기 전용 Service Quotas 조회로 실제 적용값을 검증

## 2026-08-19 후속 확인

AWS Support 회신 후 Service Quotas를 읽기 전용으로 재확인했다.

| Quota | Rechecked value |
| --- | ---: |
| Nova Lite in-region on-demand requests per minute | 20 |
| Nova Lite in-region on-demand tokens per minute | 200,000 |
| Nova Lite model invocation tokens per day | 564,480,001 |
| Nova Lite cross-region requests per minute | 40 |
| Nova Lite cross-region tokens per minute | 400,000 |

Model `amazon.nova-lite-v1:0`은 Tokyo에서 `ACTIVE`이고 `ON_DEMAND`를 지원한다. 기존 0 quota 차단 조건은 해소되었지만 이 확인에서는 실제 inference를 호출하지 않았으므로 성공과 사용 token은 아직 기록하지 않는다. 확인 후 `gmai-admin` 임시 CLI 세션을 로그아웃했다.

다음 단계는 현재 단가를 재확인하고, 입력 1,000 tokens 이하·출력 최대 256 tokens·자동 retry 없음의 기존 경계를 유지한 채 사용자에게 비용 상한을 다시 제시하여 승인받은 후 1회만 호출하는 것이다.

이 후속 호출은 2026-08-22 성공했다. 실제 usage와 판정은 `docs/BEDROCK_SMOKE_TEST_2026-08-22.md`에 별도로 기록한다.

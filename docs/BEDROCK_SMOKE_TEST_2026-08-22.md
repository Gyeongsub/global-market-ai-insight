# Bedrock Nova Lite 성공 smoke test 기록

실행일: 2026-08-22  
Region: Tokyo `ap-northeast-1`  
Model: `amazon.nova-lite-v1:0`  
Endpoint: in-region `bedrock-runtime converse`

## 사용자 승인 경계

- 성공 가능한 inference 호출 1회
- 비민감 로컬 QLD contract fixture만 사용
- 입력 safety limit 1,000 tokens
- 출력 `maxTokens=256`
- AWS 최대 시도 횟수 1, 자동 retry/repair 없음
- 승인된 계산 비용 상한: USD `0.000145728` 미만

## 실행 전 확인

- IAM identity: 승인된 `aws-admin-user`; account ID는 기록하지 않음
- Region: `ap-northeast-1`
- Model lifecycle: `ACTIVE`
- Inference support: `ON_DEMAND`
- 인리전 RPM: `20`
- 인리전 TPM: `200,000`
- 일일 합산 token quota: `564,480,001`
- Tokyo 단가: input USD `0.000072` / 1K tokens, output USD `0.000288` / 1K tokens

## 실제 결과

| 항목 | 결과 |
| --- | ---: |
| 요청 횟수 | 1 |
| 성공한 inference | 1 |
| 자동 재시도 | 0 |
| Input tokens | 167 |
| Output tokens | 256 |
| Total tokens | 423 |
| Stop reason | `max_tokens` |

실제 token 비용 계산:

```text
(167 / 1000 × 0.000072) + (256 / 1000 × 0.000288)
= 0.000012024 + 0.000073728
= USD 0.000085752
```

실제 계산 비용은 승인 상한보다 낮다. 세금, 환율과 Billing 반영 지연은 포함하지 않는다.

## 판정

- **통과:** IAM, model access, 인리전 on-demand quota, Converse 요청 형식과 실제 inference 경로
- **미통과/미평가:** 완전한 JSON schema, 한국어 문자 보존, 금융 안전 내용, 영어·일본어·한국어 품질

모델은 한국어 JSON 출력을 시작했지만 출력 256 tokens에 도달해 `max_tokens`로 종료되었다. 따라서 응답은 완전한 JSON이 아니며 구조화 출력 acceptance evidence로 사용하지 않는다. Windows CLI 출력에서도 한국어가 올바르게 보존되지 않아 원문을 증거 문서에 복사하지 않았다.

이 호출의 목적은 서비스 사용 가능 여부 확인이며, 품질 평가나 repair를 자동으로 이어서 실행하지 않았다.

## 보안과 정리

- credential, account ID, 실제 provider key, 개인정보, 자유 형식 사용자 prompt를 전송하지 않음
- 임시 request JSON은 실행 종료 시 삭제
- raw model response는 저장소에 보관하지 않음
- 호출 후 `gmai-admin` cached CLI login credential 로그아웃 완료
- 이미 token을 메모리에 적재한 로컬 도구가 있다면 최대 약 15분 뒤 만료

## 다음 게이트

1. [x] Windows CLI UTF-8 출력 경계를 보완한다.
2. [x] 출력 최대 512 tokens와 간결한 `v2` JSON contract, strict parser를 로컬에서 준비한다.
3. [x] 기본 dry-run인 3개 언어 평가 도구를 만들고 전체 로컬 검사와 secret 검사를 통과한다.
4. [ ] English, Japanese, Korean 각 1회 평가의 비용 상한을 다시 제시하고 별도 승인을 받는다.
5. retry/repair 없이 3회 실행 시 최대 계산 비용은 USD `0.000766368`이다.
6. 각 호출에 최대 1회 repair를 허용하려면 별도 승인 상한은 USD `0.001532736`이다.
7. 실제 응답은 schema, locale, 불확실성, 금지 표현, QLD 위험 문구를 검증한 뒤에만 acceptance evidence로 기록한다.

# Bedrock Nova Lite 세 언어 평가 실행 기록

실행일: 2026-08-22  
Region: Tokyo `ap-northeast-1`  
Model: `amazon.nova-lite-v1:0`  
Endpoint: in-region `bedrock-runtime converse`

## 사용자 승인 경계

- English, Japanese, Korean 각 1회, 총 3회
- 비민감·비실시간 로컬 QLD contract fixture만 사용
- 호출별 입력 계산 safety limit 1,500 tokens
- 호출별 `maxTokens=512`
- AWS 최대 시도 횟수 1, 자동 retry/repair 없음
- 승인된 총 계산 비용 상한: USD `0.000766368`

## 실행 결과

- 실행한 inference: 정확히 3회
- 자동 retry/repair: 0회
- 세 응답 모두 JSON object, 정확한 6개 key, 필드 자료형, 필수 risk, 배열 및 문자열 길이 검증을 통과
- 세 번째 검증이 끝난 뒤 로컬 PowerShell 결과 합산 단계에서 `Measure-Object`가 ordered dictionary의 비용 필드를 처리하지 못해 종료
- 오류는 세 번의 Bedrock 응답을 받은 이후에 발생했으며 추가 model invocation은 실행되지 않음
- 로컬 오류 때문에 응답 원문과 응답별 input/output token usage가 최종 출력으로 전달되지 않아 실제 token 수와 실제 계산 비용은 복구할 수 없음

## 판정

- **통과:** 총 호출 수 제한, 자동 재시도 금지, in-region Nova Lite 실행, 세 응답의 기본 strict JSON contract
- **미통과/미평가:** 실제 언어 적합성, 금융 안전 내용, QLD 2x·복리·경로 의존성 내용, 실제 token usage 증거
- **최종 상태:** 부분 통과. 포트폴리오 acceptance evidence로 사용하지 않음

실제 token 사용량을 확보하지 못했으므로 승인 상한보다 낮은 정확한 비용을 주장하지 않는다. 실행 요청은 승인된 동일한 bounded fixture와 `maxTokens=512`를 사용했으며, 비용 판단은 승인된 계산 상한 USD `0.000766368`까지만 보수적으로 기록한다. AWS Billing의 세금, 환율, 반영 지연은 별도이다.

## 수정 및 재발 방지

- 결과 합계를 파이프라인 `Measure-Object` 대신 호출 성공 직후 숫자 변수에 누적하도록 수정
- 모델 출력 검증기에 언어 문자 확인, 금지된 매매 지시·수익 보장 표현, QLD 2x 문맥 확인 추가
- 수정 후 dry-run과 로컬 aggregation guard 통과
- 오류가 발생한 실행을 자동 재호출하지 않음
- 재평가가 필요하면 3회 호출 비용 상한을 새로 제시하고 사용자에게 다시 승인받음

## 별도 승인 후 재평가

사용자가 동일한 별도 상한 USD `0.000766368`을 승인한 뒤 수정한 수집기로 English, Japanese, Korean을 각 1회 다시 평가했다. 자동 retry/repair는 사용하지 않았다.

| Locale | Input tokens | Output tokens | Stop reason | 계산 비용 USD | 구조·문자·기본 안전 검증 |
| --- | ---: | ---: | --- | ---: | --- |
| English | 325 | 166 | `end_turn` | 0.000071208 | 통과 |
| Japanese | 325 | 243 | `end_turn` | 0.000093384 | 통과 |
| Korean | 325 | 418 | `end_turn` | 0.000143784 | 통과 |
| **합계** | **975** | **827** |  | **0.000308376** | **3/3 통과** |

- 추가 실행의 실제 계산 비용은 승인 상한의 약 40.2%이다.
- 첫 실행은 실제 usage를 유실했으므로 첫 실행 승인 상한과 재평가 실제값을 더한 보수적 누적 계산 상한은 USD `0.001074744`이다.
- 이 계산에는 AWS Billing 반영 지연, 세금과 환율이 포함되지 않는다.

### 수동 내용 검토

- **English 실패:** 공급하지 않은 benchmark 이름을 생성했고 장기 보유 적합성 판단을 포함했다.
- **Japanese 실패:** 장기 복리의 결과를 낙관적으로 묘사하고 특정 조건에서 높은 수익을 기대할 수 있다는 근거 없는 홍보성 표현을 포함했으며, 날짜가 있는 비실시간 fixture를 최신 정보처럼 표현했다.
- **Korean 실패:** 명시적 매수 지시는 없었지만 `고수익`과 `투자 기회`에 해당하는 홍보성 표현을 포함했다.
- **공통 통과:** 완전한 JSON, 지정 언어 문자, 불확실성, QLD 일일 2배·복리/경로 의존성·하락 위험, 명시적 buy/sell/hold 지시와 보장 표현 없음.

따라서 재평가 결과도 구조와 기본 안전성은 통과했지만 사실 grounding 및 비홍보성 품질 기준은 미통과이다. 포트폴리오 acceptance evidence로 사용하지 않는다.

### `v3` 로컬 보완

- 단일 quote에는 기회 근거가 없으므로 `opportunities`를 빈 배열로 강제
- 공급하지 않은 benchmark/index/issuer/sector/objective 생성 금지
- 기간 적합성 판단과 high return/investment opportunity/expected gain 표현 금지
- 비실시간 fixture를 current/latest/real-time으로 표현하는 행위 금지
- 영어·일본어·한국어 금지 표현과 미제공 지수명을 output validator에서 차단
- PowerShell 자체검사와 전체 서비스·계약 23개, 인프라 4개, 프런트엔드 4개 검사 통과

`v3`는 로컬에서만 준비했으며 추가 Bedrock 호출은 수행하지 않았다. 실제 acceptance를 위해서는 새로운 비용 승인 후 별도 평가가 필요하다.

## `v3` 최종 평가

사용자가 추가 상한 USD `0.000766368`을 승인한 뒤 `v3`로 English, Japanese, Korean을 각 1회 실행했다. 자동 retry/repair는 사용하지 않았다.

| Locale | Input tokens | Output tokens | Stop reason | 계산 비용 USD | 자동 검증 |
| --- | ---: | ---: | --- | ---: | --- |
| English | 423 | 141 | `end_turn` | 0.000071064 | 실패: JSON 종료 문자 오류 |
| Japanese | 423 | 248 | `end_turn` | 0.000101880 | 통과 |
| Korean | 423 | 340 | `end_turn` | 0.000128376 | 실패: JSON 종료 문자 오류 |
| **합계** | **1,269** | **729** |  | **0.000301320** | **1/3 통과** |

- 실제 계산 비용은 승인 상한 이내다.
- 영어는 JSON이 불완전했고 공급하지 않은 benchmark도 다시 생성했다.
- 한국어는 JSON 종료 문자를 잘못 생성했고 날짜가 있는 fixture를 최신 가용 데이터로 표현했다.
- 일본어는 JSON·언어·기본 금지 표현 검증을 통과했지만, 당시 facts에 없던 상품 유형을 사용해 strict grounding acceptance에서는 제외했다.
- 최종 판정: `v3`도 포트폴리오 acceptance evidence로 사용하지 않음.

첫 실행의 보수적 상한, 재평가 실제값과 `v3` 최종 평가 실제값을 합한 누적 계산 상한은 USD `0.001376064`이다. 최초 서비스 smoke test의 실제 계산 비용 USD `0.000085752`까지 포함한 이 프로젝트의 기록상 누적 Bedrock 계산 상한은 USD `0.001461816`이다. 이는 AWS Billing의 확정 청구액이 아니며 세금, 환율과 반영 지연은 별도이다.

## `v4` 구조화 출력 설계

프롬프트만으로 JSON text를 생성하는 접근을 중단하고 Amazon Bedrock Converse의 `toolConfig`와 지정 `toolChoice`를 사용하도록 로컬 설계를 변경했다.

- tool name: `submit_market_analysis`
- model은 free-form text가 아니라 지정 tool을 정확히 1회 호출
- tool input schema가 6개 필드와 자료형을 정의
- Nova Lite v1 tool schema 호환을 위해 top-level은 `type`, `properties`, `required`만 사용
- 모델 출력 후 기존 strict parser가 추가 필드, 길이, 빈 문자열, 언어, 금융 안전, fixture freshness와 grounding을 다시 검증
- QLD asset catalog에서 검증된 display name과 `LEVERAGED_ETF` 유형을 facts에 명시해 허용 가능한 상품 유형과 모델의 외부지식 추측을 구분
- PowerShell 자체검사와 전체 서비스·계약 24개, 인프라 4개, 프런트엔드 4개 검사 통과
- `v4` 실제 Bedrock 호출은 실행하지 않음

설계 근거:

- Amazon Nova structured output: https://docs.aws.amazon.com/nova/latest/userguide/concept-chapter-servicename.html
- Amazon Nova tool schema 및 forced tool choice: https://docs.aws.amazon.com/nova/latest/userguide/tool-use-definition.html
- Amazon Bedrock structured output 개요: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html

## `v4` tool-use acceptance 실행

사용자가 추가 상한 USD `0.000766368`을 승인한 뒤 `v4`로 English, Japanese, Korean을 각 1회 실행했다. 자동 retry/repair는 사용하지 않았다.

| Locale | Input tokens | Output tokens | Stop reason | 계산 비용 USD | tool schema 검증 |
| --- | ---: | ---: | --- | ---: | --- |
| English | 963 | 148 | `tool_use` | 0.000111960 | 통과 |
| Japanese | 963 | 227 | `tool_use` | 0.000134712 | 통과 |
| Korean | 963 | 440 | `tool_use` | 0.000196056 | 통과 |
| **합계** | **2,889** | **815** |  | **0.000442728** | **3/3 통과** |

- 세 응답 모두 정확히 하나의 지정 tool을 사용했고 JSON 문법·필수 필드·자료형·빈 opportunities를 준수했다.
- 실제 계산 비용은 승인 상한 이내다.
- free-form JSON에서 반복됐던 잘못된 종료 문자 문제는 해결됐다.

### 수동 grounding 및 금융 안전 판정

- **English 실패:** 검증 facts의 display name에 `QQQ`가 포함됐다는 이유로 `2x QQQ performance`라는 정확하지 않은 목표 관계를 추론했다.
- **Japanese 실패:** 같은 QQQ 관계를 추론했고 날짜가 있는 fixture를 최신 이용 가능 데이터로 표현했다.
- **Korean 실패:** 단기 상승 추세에 효과적일 수 있다는 홍보성 문구와 장기 투자에 적합하지 않을 수 있다는 기간 적합성 판단을 포함했다.
- **최종 상태:** schema 안정성은 통과했지만 grounding 및 비홍보성 acceptance는 미통과이다.

한국어 위험 문구를 자동 검증기가 놓친 원인은 배열 필드를 하나의 문자열로 합치는 PowerShell 구현에서 nested array가 실제 문장 대신 배열 객체로 처리됐기 때문이다. 각 배열 항목을 명시적으로 순회해 결합하도록 수정하고 실제 실패 문장을 회귀 테스트로 추가했다.

`v4` 실제 비용까지 포함한 이 프로젝트의 기록상 보수적 누적 Bedrock 계산 상한은 USD `0.001904544`이다. 이는 USD 5 Budget의 약 0.0381%이며 AWS Billing 확정액, 세금, 환율과 반영 지연은 별도이다.

## 다음 안전 설계

tool schema는 형식 오류를 해결하지만 모델의 외부지식 추론까지 방지하지는 않는다. 다음 단계에서는 모델이 자유 문장을 작성하지 않고 애플리케이션이 허용한 insight/evidence ID만 선택하게 하며, 실제 영어·일본어·한국어 문장은 검증된 로컬 템플릿으로 렌더링한다. 이 방식은 다음 속성을 목표로 한다.

- 모델 출력: allowlist ID와 정렬 순서만 허용
- 애플리케이션: symbol·quote 상태에 따라 허용 ID를 교차 검증
- 사용자 문장: 고정된 다국어 템플릿과 실제 quote 값으로 생성
- 잘못된 ID, 중복, 근거 없는 선택: `DATA_UNAVAILABLE` 또는 안전한 fallback
- 모델 자유 문장·홍보성 표현·미제공 benchmark 생성 경로 제거

이 설계와 로컬 테스트를 끝내기 전에는 추가 Bedrock 품질 평가를 실행하지 않는다.

## 보안과 정리

- credential, account ID, provider key, 개인정보, 자유 형식 사용자 prompt를 모델에 전송하지 않음
- 임시 request JSON은 각 호출 종료 시 삭제
- raw model response는 저장소에 보관하지 않음
- 실행 종료 후 `gmai-admin` cached CLI login credential 로그아웃 완료
- 이미 token을 메모리에 적재한 로컬 도구가 있다면 최대 약 15분 뒤 만료

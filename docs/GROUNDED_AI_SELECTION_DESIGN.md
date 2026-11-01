# Grounded AI selection 및 deterministic 다국어 renderer

기준일: 2026-08-22  
상태: 로컬 adapter core, AWS SDK transport 및 mocked integration 완료

## 문제

Nova Lite의 forced tool use는 JSON schema 안정성을 해결했지만 모델이 자유 문장을 작성하는 동안 다음 문제를 완전히 제거하지 못했다.

- 제공하지 않은 benchmark와 objective 관계 추론
- 비실시간 자료의 freshness 과장
- 고수익·투자 기회·기간 적합성 표현
- validator가 놓칠 수 있는 새로운 동의어와 언어별 변형

금융 포트폴리오에서는 금지 단어 목록을 계속 늘리는 것보다 모델이 자유 문장을 생성하지 못하게 하는 편이 안전하다.

## 선택한 경계

```text
Normalized quote + symbol
        ↓
Bedrock: allowlisted insight ID와 순서만 선택
        ↓
Application: symbol·quote 상태와 required ID 검증
        ↓
Deterministic renderer: 검증된 en/ja/ko 문장 + 실제 quote 값
        ↓
기존 AnalysisResult validator + disclaimer
```

모델은 다음과 같은 identifier만 선택할 수 있다.

- observations: `QUOTE_SNAPSHOT`, `QUOTE_CHANGE`
- risks: `MARKET_PRICE_RISK`, `QLD_LEVERAGED_DOWNSIDE`, `QLD_PATH_DEPENDENCY`
- special considerations: `DATA_PROVENANCE`, `QLD_DAILY_RESET`
- uncertainty: `SINGLE_QUOTE_NO_FORECAST`

## 검증 규칙

- 정확한 4개 selection field 외 추가 field 금지
- unknown ID와 duplicate ID 거부
- `QUOTE_CHANGE`는 normalized change와 changePercent가 모두 있을 때만 허용
- 모든 symbol에 `QUOTE_SNAPSHOT`, `MARKET_PRICE_RISK`, `DATA_PROVENANCE` 요구
- QLD에는 leverage downside, path dependency와 daily reset ID를 추가로 요구
- 모델이 반환한 자연어는 사용자 결과에 사용하지 않음
- `opportunities`는 근거가 추가되기 전까지 항상 빈 배열
- provider freshness가 `REAL_TIME`일 때만 실시간 표시를 허용

## 구현

- `services/worker/src/grounded-analysis.ts`
- `services/worker/tests/grounded-analysis.test.ts`
- `services/worker/src/providers/bedrock-analysis-adapter.ts`
- `services/worker/tests/bedrock-analysis-adapter.test.ts`
- `services/worker/src/worker-operation.ts`
- `services/worker/tests/worker-operation.test.ts`

현재 구현은 5개 symbol에 공통 quote/provenance/market-risk 문장을 제공하고 QLD에 강화된 leverage 문장을 추가한다. 향후 다른 symbol의 고유 설명은 검증된 asset metadata와 별도 evidence ID가 준비된 뒤에만 추가한다.

## 로컬 검증

- allowlisted tool schema 테스트
- unknown/duplicate/insufficient selection 거부 테스트
- 영어·일본어·한국어 deterministic rendering 테스트
- 미제공 지수명과 투자기회 표현 부재 테스트
- mocked Converse transport의 정상 tool response 연결
- free text, unknown ID, token boundary, usage 불일치, timeout, throttling negative test
- mocked provider → quote normalization → Bedrock selection → renderer → metadata/disclaimer 통합 테스트
- `PRICE` operation이 Bedrock을 호출하지 않는 negative test
- 전체 서비스·계약 33개, 인프라 4개, 프런트엔드 4개 검사 통과

이 단계에서는 AWS 로그인, Bedrock inference, provider API, CDK deploy를 실행하지 않아 추가 비용은 USD `0.00`이다.

## 다음 게이트

1. [x] adapter core가 selection tool response를 `parseGroundedAnalysisSelection`으로 전달한다.
2. [x] renderer 결과에 기존 application metadata와 disclaimer를 부착한다.
3. [x] mocked provider/Bedrock response로 worker operation을 통합 테스트한다.
4. [x] AWS SDK transport의 version, license, container bundling과 image-size 영향을 검토한다.
5. [x] SDK transport를 adapter core에 연결하고 AWS 호출 없는 contract test를 추가한다.
6. [x] ECS job repository와 conditional 상태 전이를 worker one-shot lifecycle에 연결한다.
7. [ ] Parameter Store SecureString과 ECS secret injection을 구성하고 worker/controller negative IAM 경계를 검증한다.
6. [ ] 위 로컬 단계가 모두 통과한 뒤 QLD 한 언어 1회 smoke test 비용을 별도 승인받는다.
7. [ ] 1회가 통과하기 전에는 세 언어 평가를 반복하지 않는다.

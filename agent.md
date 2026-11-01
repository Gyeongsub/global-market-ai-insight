# Global Market AI Insight — Agent Working Agreement

이 문서는 이 저장소에서 사람과 AI 에이전트가 일할 때 따라야 하는 실행 규칙이다. `plan.md`의 제품·아키텍처 요구사항을 실제 구현, 검토, 배포, 검증 작업에 일관되게 적용하는 것이 목적이다.

## 1. 문서의 적용 범위와 우선순위

- 모든 작업은 시작 전에 `plan.md`와 이 문서를 읽고 현재 단계, 허용 범위, 완료 조건을 확인한다.
- 현재 사용자의 명시적 지시가 가장 우선한다. 단, 보안·비용·개인정보·금융 콘텐츠 안전 규칙을 약화시키는 것으로 해석하지 않는다.
- `plan.md`는 제품 범위와 목표 아키텍처의 원본이며, 이 문서는 작업 절차와 품질 게이트를 정의한다.
- 두 문서가 충돌하거나 요구사항이 모호하면 임의로 결정하지 않는다. 충돌을 기록하고 사용자에게 선택지를 제시한다.
- 중요한 아키텍처 변경은 `docs/adr/`에 ADR로 남긴다. ADR은 승인된 변경을 설명할 수 있지만 `plan.md`를 조용히 덮어쓰지 않는다.
- README는 사용법과 결과를 설명하는 문서이지 요구사항의 원본이 아니다.
- 실제로 실행하거나 확인하지 않은 테스트, 비용, 지연 시간, 보안 통제, AWS 리소스 상태를 완료된 것처럼 기록하지 않는다.

## 2. 프로젝트의 고정 목표

**진행 순서 변경(2026-11-01 사용자 지시):** 사용자 직접 실습은 프로젝트 완성,
최종 보안 검토, 승인된 GitHub 공개 및 포트폴리오 작성 이후에 진행한다.
직접 실습이나 설명 재현을 구현·문서·공개 준비의 선행 조건으로 요구하지 않는다.
현재 범위의 완료 작업을 자율적으로 계속하며 사용자 중단, 주간 잔량 20% 이하,
실습을 제외한 프로젝트 완료를 종료 조건으로 삼는다. 인증/MFA와 도구의 보안
승인을 대신할 수 없으며, GitHub에는 정확한 최종 후보를 검토·승인한 뒤 올린다.
다음 날짜순 승인과 이전 22절은 현재 `plan.md`의 범위 안에서 해석한다.

**최신 추가 승인(2026-10-25, ADR 0020):** ChatGPT 검색은 유지하면서 합성 데이터로
실제 Bedrock 추론 후 브라우저 결과를 확인하는 별도 학습 기능을 구현한다.
첫 단계는 보호된 loopback 중계 → 도쿄 Nova Lite의 직접 호출이다. 고정 QLD
합성 입력, 세션당 1회(실패 포함), SDK 재시도 없음, 출력 512토큰, 20초 요청,
5분 프로세스 수명 제한을 유지한다. 실제 시세·예측·Fargate 통합으로 표시하지 않는다.
기존 공급자 작업/표시 차단 및 circuit을 변경하지 않는다. 실제 실행 전 현재 소스의
전체 로컬 게이트와 기존 소유자 임시 인증을 확인하고, 종료 시 결과·capability·
메모리 인증정보를 해제한다. [ADR 0020](docs/adr/0020-synthetic-bedrock-local-lab.md) 참조.

**최신 승인(2026-10-25, ADR 0019):** 기본 제품은 로컬 질문 생성·복사 →
사용자가 ChatGPT에 직접 붙여넣기·전송 → ChatGPT 화면에서 결과 확인이다.
추가 가입·유료 API·자동 전송·세션 재사용·답변 수집을 하지 않는다. 아래의
이전 실시간 시세/Bedrock 제품 완료 조건(22절 포함)은 별도 AWS 학습 트랙으로
보존하며, 기본 검색 기능의 필수 출시 조건으로 적용하지 않는다. 새로운 제품
완료 조건은 `plan.md` 1/21/25절과 [ADR 0019](docs/adr/0019-chatgpt-search-companion.md)를 따른다.
AWS 구조/안전 통제와 과거 검증은 유지하고, 전환만으로 리소스 삭제·작업 활성화·
공급자 호출을 수행하지 않는다. API 연동 학습자료는 후속 작업으로 남긴다.
이하 내용은 해당 분리 범위 안에서 적용한다.

2026-10-25 사용자 결정: AWS를 실제 사용하는 **본인 전용 비공개 실습**이
첫 릴리스 목표다. 이전 로컬 전용 작업 제한은 해제되지만 익명 공개 서비스,
공급자 데이터 재배포, 완성 전 GitHub 업로드는 허용하지 않는다. 아래 AWS
AWS 작업 구조와 검증 조건은 유지한다. 같은 날 추가 승인에 따라 첫 릴리스는
**도메인 구매 없는 신뢰된 본인 PC의 loopback UI와 단기 로컬 중계**를 사용한다.
AWS IAM/SigV4 인증은 중계 프로세스에서만 수행한다. CloudFront/S3 호스팅과
호스팅용 인증 후보는 선택적 후속 실습으로 보류한다. 변경 근거와 미완료
경계는 [ADR 0017](docs/adr/0017-local-owner-aws-bridge.md)에 있다.

첫 번째 완성 릴리스는 다음 흐름을 구현한다.

```text
Owner browser → 127.0.0.1 short-lived local UI/broker
  └─ HTTPS + server-side IAM SigV4 → API Gateway HTTP API → controller Lambda
                                ├─ DynamoDB job
                                └─ ECS RunTask → short-lived Fargate worker
                                                     ├─ Market Data API
                                                     ├─ Amazon Bedrock
                                                     └─ Parameter Store / Secrets Manager

Operations: CloudWatch + EventBridge + SNS + stale-job sweeper + circuit state
Cost: AWS Budget / billing alarm + quotas + timeouts + teardown
```

반드시 유지할 핵심 특성은 다음과 같다.

- 기본 구조는 이벤트 기반 비동기 작업이다. 요청마다 필요할 때만 Fargate 작업을 실행한다.
- 기본 릴리스에 상시 실행 ECS Service, ALB, NAT Gateway를 추가하지 않는다.
- `PRICE`와 `ANALYZE`는 동일한 worker image의 분리된 실행 모드다.
- 브라우저는 공급자 API 키, AWS 자격 증명, 내부 task ARN, 비공개 프롬프트를 받지 않는다.
- 영어(`en`)가 기본이며 일본어(`ja`)와 한국어(`ko`)를 명확히 선택할 수 있어야 한다.
- AI 결과는 교육 목적의 시장 인사이트이며 금융 자문이 아니다.
- 데이터 시점, 출처, 통화, 시장 상태와 freshness를 정직하게 표시한다.

## 3. 범위 규칙

### 첫 릴리스에 포함

- 고정 자산 `VOO`, `QLD`, `TSLA`, `SPCX`, `GOOG`
- Check Price와 Analyze의 분리된 사용자 동작
- API Gateway, Lambda, DynamoDB, ECR, on-demand ECS/Fargate
- 허가된 외부 시장 데이터 API와 서버 측 비밀 관리
- Amazon Bedrock 기반의 구조화된 다국어 분석
- 본인 PC의 loopback UI/단기 중계와 IAM 보호 AWS API 연결
- CloudWatch 로그·지표·대시보드·경보
- EventBridge, SNS, stale-job sweeper, 비용/운영 circuit breaker
- 하나의 선택된 IaC 도구, 자동화 테스트, 운영 및 teardown 문서

### 첫 릴리스에 포함하지 않음

- 거래 실행, 증권사 연동, 개인화 투자·세금·포트폴리오 조언
- 사용자 계정, 결제, 저장 포트폴리오, 소셜 기능
- 실시간 스트리밍, WebSocket, 고빈도 또는 초저지연 거래 기능
- 임의 금융 사이트 스크래핑
- 자체 모델 학습 또는 fine-tuning
- main stack의 ECS Service, ALB, autoscaling, blue/green 배포
- 근거 없는 실시간 시세 보장 또는 수익률 보장

SQS, Step Functions, Cognito, WAF, custom domain, historical charts 등은 core acceptance criteria가 완료된 뒤 별도 제안과 승인을 거쳐 확장한다.

CloudFront/private S3 호스팅은 현재 첫 릴리스 필수가 아닌 보류된 확장이다.
로컬 중계는 127.0.0.1에만 바인딩하고 5분 이내 종료한다. LAN 공개, 터널,
자동 시작, 브라우저 AWS 자격 증명, 임의 upstream, 무제한 polling은 금지한다.
HTTP 예외는 같은 신뢰된 PC의 정확한 loopback에만 적용하며 AWS 통신은 HTTPS다.
이 구조는 PC 자체의 침해나 다른 신뢰할 수 없는 로컬 사용자를 격리하지 않는다.
첫 연결 검증은 catalog/health 읽기만 허용한다. 작업 생성은 별도 구현·검증과
호출/비용 상한 및 종료 확인 전까지 차단한다. fixture와 실제 조회 결과를 혼합하지 않는다.

후속 작업 허용에는 AWS controller 자체의 5분 이하 유효기간 검증이 추가로 필요하다.
PC나 브라우저 종료에만 의존하지 않으며, 누락·만료된 허용 시간은 신규 작업을
거부해야 한다. 이는 기존 circuit/동시 실행 제한/worker deadline/종료 확인을
대체하지 않는다. 현재 단계에서는 로컬 구현만 검증하고 활성화·배포하지 않는다.

## 4. 결정이 필요한 항목

다음 항목은 Phase 0 또는 해당 단계 시작 전에 명시적으로 선택하고 ADR이나 구성 문서에 기록한다.

- 애플리케이션 언어와 런타임
- IaC 도구: CDK, Terraform, CloudFormation 중 하나
- AWS account, region, environment 이름
- market-data provider와 요금제/라이선스
- Bedrock model 또는 inference profile과 사용 가능 region
- Parameter Store SecureString과 Secrets Manager 중 비밀 저장 방식
- DynamoDB TTL, worker timeout, task CPU/memory, API throttle의 실제 값

결정되지 않은 값을 코드에 추측하여 고정하지 않는다. provider, model, ARN, account ID, region, URL, 리소스 이름은 구성으로 주입한다. 하나의 책임에 여러 프레임워크나 IaC 도구를 섞지 않는다.

## 5. 자산과 시장 데이터 규칙

- 서버가 자산 allowlist의 최종 권한을 가진다. 클라이언트 입력을 신뢰하지 않는다.
- `SPCX`는 프로젝트 명세상의 필수 symbol이지만 공급자가 의도한 종목을 지원하는지 Phase 1에서 검증해야 한다.
- 공급자가 `SPCX`를 지원하지 않거나 의미가 모호하면 `DATA_UNAVAILABLE`을 반환한다. 다른 종목으로 대체하거나 가격을 만들지 않는다.
- 허가된 API만 사용하며 attribution, caching, redistribution, freshness 조건을 문서화한다. 공개 웹사이트를 조용히 스크래핑하지 않는다.
- provider 응답은 정상화 전에 신뢰하지 않는다. symbol, price, currency, exchange timestamp, retrieval timestamp, market state, freshness를 검증한다.
- `Real-time`은 계약이나 provider metadata가 명시적으로 보장할 때만 사용한다. 그 외에는 `Delayed`, `Latest available`, `Previous close` 등 사실에 맞는 라벨을 사용한다.
- 예시·fixture·mock 값은 실제 시세처럼 표현하지 않는다.
- 일반 CI에서는 기록되거나 합성된 fixture를 사용한다. 라이브 API 테스트는 명시적 smoke/E2E 단계에서 호출 횟수를 제한해 수행한다.

## 6. 금융 및 AI 안전 규칙

- 모든 분석 화면과 결과에 지역화된 `교육 목적의 시장 인사이트이며 금융 자문이 아님` 고지를 표시한다.
- 개인화된 buy/sell/hold 명령, 확정적 예측, 보장 수익, 신탁 의무를 암시하는 표현을 생성하거나 제품 기능으로 제공하지 않는다.
- Bedrock 입력에는 worker가 검증한 사실과 타임스탬프만 포함한다. 사용자의 자유 형식 프롬프트는 v1에서 받지 않는다.
- 프롬프트와 출력 JSON schema를 버전 관리한다.
- 결과에는 불확실성, 데이터 한계, `dataAsOf`, 논리적 model alias/ID, `promptVersion`을 포함한다.
- 근거가 없는 driver나 사건은 생략한다. 뉴스·공시 등의 외부 사실을 사용하려면 승인된 출처, 시점, 라이선스와 provenance 설계를 먼저 추가한다.
- `QLD` 분석은 일일 2배 레버리지, 복리와 path dependency, 확대된 하락 위험을 설명하되 근거 없는 성과 수치를 만들지 않는다.
- 모델 출력은 신뢰할 수 없는 데이터로 취급한다. schema, 필수 키, 길이, locale, 금지 표현을 검증하고 frontend에서 escape한다.
- 잘못된 JSON은 제한된 repair를 최대 한 번만 시도하며, 실패하면 안전한 `MODEL_ERROR`로 종료한다.
- 정식 disclaimer는 모델에만 맡기지 않고 애플리케이션 코드가 부착한다.

## 7. API 계약

기본 경로는 `/v1`이며 최소 endpoint는 다음과 같다.

- `GET /assets`
- `POST /jobs`
- `GET /jobs/{jobId}`
- `GET /health`

API 구현 규칙:

- `POST /jobs`는 `operation`, `symbol`, `locale`과 `Idempotency-Key`를 검증한 뒤 빠르게 `202 Accepted`와 `jobId`, `statusUrl`, `expiresAt`을 반환한다.
- 동일 key와 동일 request hash는 기존 job을 반환하고 새 task를 시작하지 않는다. 동일 key의 다른 payload는 `409 Conflict`다.
- unsupported symbol/locale, 잘못된 schema, 열린 circuit은 DynamoDB job 생성이나 `RunTask`보다 먼저 거부한다.
- request/response는 `shared/schemas/`의 versioned JSON Schema 또는 OpenAPI 계약으로 관리한다.
- breaking change는 버전 변경과 migration/compatibility 설명 없이 배포하지 않는다.
- payload 크기, CORS, route throttle, polling 횟수와 timeout을 제한한다.
- public error는 안정적인 code, 안전한 message, request/correlation ID만 제공한다.
- provider raw response, stack trace, task ARN, secret identifier, Bedrock 원문 prompt를 브라우저에 노출하지 않는다.
- `GET /health`는 controller와 circuit 상태만 확인하며 worker, provider, Bedrock을 호출하거나 task를 시작하지 않는다.

안정적인 public error code 집합은 최소한 다음을 포함한다.

```text
VALIDATION_ERROR, UNSUPPORTED_SYMBOL, UNSUPPORTED_LOCALE, RATE_LIMITED,
CIRCUIT_OPEN, JOB_NOT_FOUND, DATA_UNAVAILABLE, PROVIDER_ERROR,
MODEL_ERROR, TASK_LAUNCH_FAILED, INTERNAL_ERROR
```

성능 목표는 검증 환경과 측정 조건을 함께 기록한다.

- job 생성 API: 외부 provider/Bedrock 작업을 기다리지 않고 p95 2초 미만
- job 상태 조회 API: p95 500ms 미만
- PRICE job: warm AWS control-plane 조건에서 통상 60초 이내를 목표로 하되 SLA로 표현하지 않음
- ANALYZE job: task 시작과 model latency에 따라 통상 90초 이내를 목표로 하되 SLA로 표현하지 않음
- 목표를 넘기면 비동기 UX를 숨기거나 timeout을 무작정 늘리지 말고 API, task launch, provider, model 구간별 시간을 측정한다.

## 8. 비동기 job과 DynamoDB 규칙

- 상태 집합은 `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`이다.
- 허용 전이는 다음과 같다.

```text
QUEUED  -> RUNNING -> SUCCEEDED
   |          |
   |          +----> FAILED
   +---------------> FAILED
   +---------------> TIMED_OUT
RUNNING ------------> TIMED_OUT
```

- 모든 상태 변경은 conditional expression과 version/optimistic concurrency를 사용한다.
- terminal state는 명시적으로 버전 관리되는 운영 복구 외에는 불변이다.
- 중복 worker 실행은 terminal 결과를 덮어쓰거나 두 번째 외부 호출을 발생시키지 않도록 방어한다.
- job에는 `jobId`, `operation`, `symbol`, `locale`, `status`, `idempotencyKeyHash`, `requestHash`, audit timestamps, `deadlineAt`, `expiresAt`, `attemptCount`, `version`, `schemaVersion`을 둔다.
- raw idempotency key를 authorization 수단으로 사용하지 않는다.
- `taskArn` 등 운영 필드는 내부에만 보관한다.
- provider 원문 전체는 기본적으로 저장하지 않는다. 정상화된 결과와 짧은 보존 기간을 사용한다.
- TTL 삭제는 즉시성을 보장하지 않으므로 correctness나 timeout 처리에 의존하지 않는다.
- `RunTask` 실패 시 controller가 job을 조건부로 `FAILED/TASK_LAUNCH_FAILED`로 보상 처리한다.
- sweeper는 deadline을 넘긴 job을 찾고 필요한 경우 관련 task를 중지한 뒤 조건부로 `TIMED_OUT` 처리한다.

## 9. Worker와 container 규칙

- worker는 `JOB_ID`로 정확히 하나의 job을 읽고 처리한 뒤 종료하는 one-shot process다.
- `PRICE`와 `ANALYZE`의 domain 로직을 분리해 테스트하되 하나의 image를 사용한다.
- controller는 task override에 `JOB_ID`만 전달하는 것을 기본으로 한다. secret value를 command, override, image layer에 넣지 않는다.
- task configuration은 시작 즉시 검증한다. 실패 시 가능한 범위에서 terminal 상태를 저장하고 non-zero로 종료한다.
- provider와 Bedrock 호출에는 연결/읽기/전체 timeout, 제한된 재시도, exponential backoff와 jitter를 둔다. `Retry-After`가 있으면 제한 범위 안에서 따른다.
- 무한 재시도, 무한 polling, 무제한 token, 무기한 실행을 금지한다.
- 최소·고정 base image를 digest 또는 고정 버전으로 사용하고 dependency를 pin한다.
- container는 non-root user로 실행하며 가능한 경우 read-only root filesystem을 사용한다.
- image에 credential, `.env`, build cache, source-control metadata를 포함하지 않는다.
- ECR image는 commit SHA로 tag하고 배포는 mutable `latest` 대신 digest를 사용한다.
- 측정 전에는 가장 작은 합리적 Fargate CPU/memory에서 시작하고, 변경은 측정 근거와 함께 기록한다.

권장 worker 경계는 다음과 같다.

- `domain/`: 상태 규칙, quote/analysis 모델, 순수 business logic
- `providers/`: market provider와 Bedrock adapter
- `repositories/`: DynamoDB 접근과 conditional update
- `prompts/`: versioned template와 output schema
- `telemetry/`: 구조화 로그와 지표
- `config`: 검증된 환경 구성과 secret 참조

domain은 AWS SDK, HTTP client, UI framework에 직접 의존하지 않도록 한다.

## 10. IAM과 비밀 관리

- Lambda controller role, ECS task execution role, ECS worker task role, sweeper role, alarm-circuit role, 수동 operator/deployment role을 분리한다.
- 권한은 특정 table, index, cluster, task definition, role, secret/parameter, model/inference profile, log group, SNS topic으로 제한한다.
- controller의 `ecs:RunTask`와 `iam:PassRole`은 승인된 리소스에만 허용하고 `iam:PassedToService = ecs-tasks.amazonaws.com` 조건을 사용한다.
- controller가 provider secret이나 Bedrock을 직접 사용하지 않는다면 해당 권한을 부여하지 않는다.
- worker에는 `ecs:RunTask`, `iam:PassRole`, 광범위한 S3, 인프라 관리 권한을 부여하지 않는다.
- execution role은 image pull과 log delivery 등 ECS agent 기능에만 사용한다.
- CI/CD deployment에는 장기 access key 대신 short-lived OIDC federation을 우선한다.
- 필요한 작업의 성공 테스트뿐 아니라 금지 작업이 실제로 거부되는 negative IAM test도 수행한다.
- secret은 Parameter Store SecureString 또는 Secrets Manager에 저장한다. 로컬 secret 파일은 ignore하고 `.env.example`에는 이름과 형식만 둔다.
- secret, authorization header, 민감 query parameter, 전체 provider error body, 무제한 prompt/response를 로그에 남기지 않는다.
- 유출 가능성이 있으면 즉시 credential을 rotate하고 기록을 정리한 뒤 영향 범위를 확인한다.

## 11. 네트워크와 frontend 보안

- 첫 릴리스 frontend는 정확한 loopback에서만 제공하고, 중계는 CORS를 열지 않는다. 교차 출처 최초 이동에는 데이터·토큰 없는 진입 화면만 허용한다.
- API Gateway 원격 통신은 HTTPS와 IAM을 유지한다. HTTP 예외는 본인 PC의 loopback에만 적용한다.
- 보류된 호스팅 확장을 진행한다면 S3 Block Public Access/OAC, CloudFront HTTPS/TLS/security header와 정확한 CORS site origin을 별도로 검증한다. wildcard는 금지한다.
- 사용자/모델/provider 유래 텍스트를 raw HTML로 렌더링하지 않는다.
- Fargate low-cost 기본안은 전용 public subnet, `assignPublicIp=ENABLED`, inbound rule 없음, 필요한 outbound HTTPS만 허용하는 구조다.
- worker는 listener나 공개 endpoint를 열지 않는다.
- NAT Gateway, VPC endpoint, WAF, custom KMS key는 보안·비용 근거와 사용자 승인 없이 기본 구성에 추가하지 않는다.
- ECR scanning을 활성화하고 critical vulnerability 처리 기준을 문서화한다.

## 12. 비용 및 AWS 변경 안전 규칙

비용 통제는 기능보다 먼저 검증한다.

- AWS 배포 전 대상 account ID, IAM identity, region, environment를 확인한다.
- 최초 과금 가능 리소스 생성 전에 USD 5 monthly Budget, forecast threshold, 가능한 경우 CloudWatch billing alarm, SNS/email 수신 확인을 완료한다.
- billing alert는 비용의 즉시 차단 장치가 아니라고 명시한다. 자동 중단을 실제로 구현·시험하지 않았다면 그렇게 주장하지 않는다.
- main stack에는 always-on ECS Service, ALB, NAT Gateway를 만들지 않는다.
- API throttle, 원자적 job rate limit, Fargate concurrency cap, provider request/spend cap, Bedrock output-token cap, worker/job timeout을 둔다.
- DynamoDB는 기본적으로 on-demand와 TTL을 사용하고, CloudWatch log retention은 개발 환경에서 약 7–14일로 제한한다.
- ECR lifecycle로 보관 image 수를 작게 유지하며 개발 environment는 하나를 기본으로 한다.
- 모든 지원 리소스에 `Project`, `Environment`, `Owner`, `ManagedBy`, `Purpose` 또는 `CostCenter` tag를 적용한다.
- 각 주요 phase 후 Cost Explorer와 resource inventory를 확인하고 관측 비용과 확인 날짜를 문서화한다.
- 테스트 stack은 검증 후 제거한다. Phase 13의 ECS Service/ALB 실습 stack은 증거 확보 직후 반드시 teardown한다.
- pricing, free tier, model availability처럼 변할 수 있는 정보는 배포 시점의 AWS/provider 공식 문서에서 다시 확인한다.
- account-wide subscription, IAM identity 삭제, production-like data 삭제 등 영향이 큰 작업은 정확한 대상과 복구 가능성을 확인하고 사용자 승인 없이 실행하지 않는다.

비상 정리 시에는 portfolio에 필요한 비민감 증거를 먼저 보존한 뒤 IaC teardown을 사용한다. 이후 CloudFront, S3, API Gateway, Lambda, ECS task/service, ECR, DynamoDB, log group, parameter/secret, EventBridge, alarm, SNS, NAT Gateway, load balancer, Elastic IP, VPC endpoint의 잔존 여부를 별도로 확인한다. 일반 프로젝트 관리자 IAM identity는 관련 과금 서비스와 구독이 종료되고 Billing/Budgets를 확인한 뒤 마지막에 처리한다.

## 13. Circuit breaker 규칙

- 이 프로젝트의 application/cost circuit breaker와 Phase 13의 ECS deployment circuit breaker를 혼동하지 않는다.
- 기본 상태는 `CLOSED`와 `OPEN`이다. `HALF_OPEN`은 단순 설계가 안정된 후에만 추가한다.
- `OPEN`이면 새 `PRICE`/`ANALYZE` 요청을 `503/CIRCUIT_OPEN`으로 거부하되 기존 job 조회와 health 확인은 유지한다.
- circuit record에는 state, reason, actor, update time, expiry/cooldown을 남긴다.
- provider 인증/요청 한도 오류, Bedrock 오류/제한, task launch 오류, active/stale job 과다, 수동 스위치, 비용/요청량 신호가 입력이 될 수 있다.
- 초기에는 수동 reset을 우선하며 자동 종료는 보수적으로 설계한다. 모든 변경은 감사 가능해야 한다.
- 경보 자동화는 exact project alarm의 `ALARM` 이벤트만 허용하고 account, region, ARN, allowlist를 다시 검증한다. 자동화에는 `OPEN` 권한만 주며 `OK` 이벤트나 cooldown으로 자동 close/reset하지 않는다. 버전 충돌은 새 `OPEN`을 확인한 경우에만 성공으로 처리한다.
- circuit은 defense in depth이지 AWS 비용 상한 보장이 아니다.

## 14. 국제화와 접근성

- locale은 `en`, `ja`, `ko`의 엄격한 enum이며 기본값은 `en`이다.
- UI 문자열은 `frontend/src/locales/{en,ja,ko}.json` 같은 독립 resource로 관리하고 component에 문장을 직접 흩어 쓰지 않는다.
- 선택 locale은 브라우저에 보존하고 job, prompt, result 전체 흐름에 전달한다.
- ticker, 숫자, 통화, 날짜는 오해가 없게 표현하고 exchange timezone과 retrieval time을 구분한다.
- loading, error, freshness, timeout, circuit-open, disclaimer까지 세 언어로 제공한다.
- 번역은 단순 key 존재 여부뿐 아니라 금융 용어, 줄바꿈, 장문 레이아웃과 문자 렌더링을 검토한다.
- 키보드 탐색, visible focus, semantic headings, 색상 대비, job 상태 live region을 구현한다.
- loading 상태는 실제 비동기 처리를 반영해 `Starting secure worker…`와 같은 정직한 표현을 사용한다.

## 15. 관측성과 운영 규칙

- 로그는 JSON 구조로 작성하고 최소한 timestamp, level, service, environment, requestId, `jobId`, operation, symbol, locale, status, durationMs, errorCode를 포함한다.
- `jobId`는 API, controller, DynamoDB, Fargate, provider, Bedrock, sweeper를 잇는 주 correlation key다.
- metric dimension에 `jobId`, request ID, 임의 오류 문자열을 사용하지 않는다. `Environment`, `Operation` 등 낮은 cardinality만 사용한다.
- 성공률, 실패율, timeout, end-to-end p50/p95, task launch failure, provider/Bedrock 오류와 제한, token 수, circuit 상태를 관측한다.
- 경보에는 최소 sample count와 지속 시간을 적용해 예상 가능한 단일 오류마다 알림을 보내지 않는다.
- 경보 수신, circuit open/reset, stale-job 처리, teardown은 통제된 drill로 시험하고 `docs/runbook.md`에 기록한다.
- 로그 보존은 문제 해결과 portfolio 증거에 필요한 최소 기간으로 제한한다.

## 16. 저장소 구조

구현은 아래 경계를 기본으로 한다. 아직 만들 필요가 없는 빈 폴더를 한꺼번에 생성하지 말고 해당 phase에서 코드나 문서가 생길 때 추가한다.

```text
global-market-ai-insight/
├── agent.md
├── plan.md
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── Makefile                         # 또는 동일 목적의 task runner
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── locales/{en,ja,ko}.json
│   │   ├── types/
│   │   └── tests/
│   ├── public/
│   └── package manifest
├── services/
│   ├── controller/{src,tests}/
│   ├── worker/
│   │   ├── src/{domain,providers,repositories,prompts,telemetry}/
│   │   ├── tests/
│   │   └── Dockerfile
│   └── operations/{sweeper,circuit_control,alarm_circuit}/
├── infrastructure/
│   ├── app-or-modules/
│   ├── tests/
│   ├── environments/
│   └── README.md
├── shared/{schemas,asset_catalog,test_fixtures}/
├── docs/
│   ├── architecture.md
│   ├── adr/
│   ├── threat-model.md
│   ├── cost-model.md
│   ├── api.md
│   ├── runbook.md
│   └── demo-script.md
├── scripts/{local-dev,smoke-test,teardown}/
└── .github/workflows/{ci.yml,deploy.yml}
```

구조 원칙:

- shared schema와 asset catalog를 중복 구현하지 않는다.
- domain, AWS adapter, provider adapter, presentation을 분리한다.
- environment별 값은 구성에 두고 source에 account/region/ARN을 hard-code하지 않는다.
- 테스트는 대상 코드 가까이에 두되 공용 fixture는 `shared/test_fixtures/`에서 관리한다.
- 생성 artifact, `.env`, credential, provider key, 민감한 state file, raw production response를 commit하지 않는다.
- secret이 없는 example configuration과 재현 가능한 setup command는 commit한다.
- 사용자 결정에 따라 프로젝트 완성 전에는 GitHub remote를 추가하거나 파일·Git 이력을 push 또는 공개하지 않는다. 완성 후 전체 파일과 이력에 대해 credential, 개인정보, AWS 식별정보, 비용 유발 workflow, 대용량 artifact를 재검사하고 사용자의 별도 승인을 받은 뒤에만 GitHub 업로드를 수행한다.

## 17. 작업 방식과 단계 게이트

- 한 번에 모든 AWS 서비스를 배포하지 않는다. `plan.md` Phase 0부터 순서대로 진행하되, 선행 exit criteria가 충족된 뒤 다음 단계로 넘어간다.
- 각 phase는 `작은 동작 가능한 결과 → 자동/수동 검증 → README/문서 갱신 → 비용 및 리소스 확인`으로 끝낸다.
- 작업 시작 시 현재 phase, 변경 범위, acceptance criteria, 영향받는 계약을 짧게 정의한다.
- 구현 전 기존 코드, 테스트, 문서, 미완료 변경을 확인한다. 사용자 변경을 임의로 되돌리거나 관련 없는 파일을 정리하지 않는다.
- 가능한 최소 변경으로 요구사항을 충족한다. 범위 밖 리팩터링과 새 의존성은 이유와 영향이 명확할 때만 추가한다.
- 새 dependency는 유지보수 상태, license, 보안, image size, 비용 영향을 검토하고 고정 버전을 사용한다.
- 자동 생성 파일은 생성 경로와 재생성 명령을 문서화하고 생성물과 원본을 수동으로 동시에 편집하지 않는다.
- 공개 계약, 상태 전이, IAM, 비용 구조, 데이터 의미가 바뀌면 코드와 함께 관련 schema, ADR, runbook, cost model, README를 갱신한다.
- 오류를 숨기기 위해 test를 삭제하거나 assertion을 약화하거나 broad IAM 권한을 부여하지 않는다.
- 막힌 경우 실패 명령, 핵심 오류, 확인한 원인, 안전한 다음 선택지를 남긴다.

단계별 최소 게이트:

1. Phase 0: 로컬 build, secret scan, 비용 경보 수신, 초기 ADR과 disclaimer.
2. Phase 1–2: provider 계약 fixture, 모든 symbol 처리 결과, mock 기반 UI/API와 접근성 기본 검토.
3. Phase 3–4: one-shot non-root image, idempotency, scan, Fargate 실행·종료와 no-service/no-ALB 확인.
4. Phase 5–7: least-privilege와 negative test, conditional state, API `202`, launch 보상, 중복 task 방지.
5. Phase 8–10: grounded Bedrock output, 3개 언어, private S3/OAC, HTTPS와 browser secret 검사.
6. Phase 11–12: dashboard/alarms/circuit drill, CI, E2E, resilience/security/cost 검증, 문서와 teardown 증거.
7. Phase 13: 별도 임시 stack, 명시적 승인, 비교 측정, 즉시 teardown과 잔존 리소스 확인.

## 18. 테스트 및 검증 기준

변경 위험에 비례해 다음을 수행한다.

### 필수 자동 테스트

- Unit: allowlist, locale, schema, quote normalization, freshness, state transition, idempotency, retry mapping, prompt/output validation, disclaimer, circuit logic
- Contract: provider fixture, API shared schema, 영어·일본어·한국어 Bedrock fixture, malformed output
- Integration: DynamoDB conditional update, mocked ECS controller, mocked provider/Bedrock worker
- IaC: synth/validate/plan, policy assertions, public exposure와 always-on resource 방지

### 배포 후 제한된 검증

- Smoke: 하나의 bounded job이 terminal state에 도달하고 task가 종료되는지 확인
- E2E: 지원 symbol, `QLD`, `SPCX` available/unavailable, 3개 locale, duplicate click, timeout, provider/model failure, circuit open
- Security: secret leakage, image history, dependency/container/IaC scan, IAM negative test, CORS/header, output escaping, throttle
- Resilience: provider 429/500/invalid JSON/stale timestamp, Bedrock timeout/throttle/invalid schema, RunTask failure, worker 중단, stale-job recovery, conditional conflict
- Cost: 사용자 동작당 task 수, idempotent replay, token cap, retention/TTL/lifecycle, always-on resource 부재

테스트 규칙:

- 수정한 동작의 정상 경로와 최소 하나의 실패 경로를 검증한다.
- 외부 서비스에 의존하는 unit test를 만들지 않는다.
- 시간, UUID, provider와 model 응답은 주입 가능하게 만들어 결정적 테스트를 작성한다.
- flaky test를 단순 재실행으로 덮지 않고 원인을 수정하거나 제한 사항을 기록한다.
- live test는 account, region, 예상 호출 수와 비용을 확인한 뒤 수행한다.
- test 결과는 실행한 command와 범위를 요약하며, 실행하지 못한 검증은 이유와 잔여 위험을 명시한다.

## 19. 코드 품질 기준

- 함수와 module은 하나의 책임을 갖고 public interface는 작게 유지한다.
- boundary에서 입력을 schema로 검증하고 내부에서는 typed/validated model을 사용한다.
- money에는 floating-point 오차와 currency 의미를 고려하고, timestamp는 ISO 8601 UTC로 저장하되 화면에는 locale과 exchange timezone을 명확히 표시한다.
- timeout, retry, limit, TTL은 이름 있는 구성값으로 두고 magic number를 흩어 놓지 않는다.
- 오류는 안정적인 domain/public code와 내부 원인을 분리한다. 사용자에게는 sanitized message를 제공한다.
- 로그만 남기고 성공으로 처리하지 않는다. 실패는 job terminal state와 process exit code에 반영한다.
- 주석은 코드가 무엇을 하는지 반복하기보다 비동기성, 비용, 보안, provider 제약 같은 이유를 설명한다.
- lint, formatter, type/static check, tests가 로컬과 CI에서 동일한 task runner 명령으로 실행되게 한다.

## 20. 문서화 및 증거 규칙

- `README.md`: 문제, 실행 흐름, 지원 자산, 로컬 설정, 배포/teardown, 보안, 비용, 제한, 관측 결과
- `docs/architecture.md`: main stack과 Phase 13 lab을 분리한 다이어그램과 data/control/cost 흐름
- `docs/api.md`: endpoint, schema, idempotency, error, polling 계약
- `docs/threat-model.md`: asset, trust boundary, threat, mitigation, residual risk
- `docs/cost-model.md`: 확인 날짜, region, 가격 가정, 예상/관측 비용, 알림의 한계
- `docs/runbook.md`: 장애 진단, circuit open/reset, stale job, credential rotation, teardown과 잔존 확인
- `docs/adr/`: event-driven Fargate, provider, runtime, IaC, region/model, secret store 등 중요 결정
- `docs/demo-script.md`: 세 언어 UI, price, `QLD` 분석, `SPCX` 경로, task 종료, observability, 비용 통제, circuit drill

스크린샷과 로그에는 account ID, 이메일, secret, 전체 ARN, 민감한 job/provider payload를 가린다. 비용과 성능 수치는 날짜, region, workload와 측정 조건을 함께 기록하며 미래에도 동일하다고 보장하지 않는다.

## 21. 변경 완료 보고 형식

각 작업 완료 보고에는 다음을 간결하게 포함한다.

- 변경한 결과와 사용자에게 보이는 영향
- 변경된 주요 파일
- 실행한 검증과 결과
- 실행하지 못한 검증 및 잔여 위험
- AWS 리소스를 변경했다면 account/region/environment, 생성·변경·삭제된 리소스와 비용 상태
- 다음 phase로 진행 가능한지와 남은 exit criteria

## 22. 프로젝트 완료 정의

기능이 한 번 동작하는 것만으로 완료가 아니다. 첫 portfolio release는 다음이 모두 증명되어야 완료다.

- 본인 PC의 제한된 loopback UI에서 영어 기본 및 일본어·한국어 선택이 정상 동작하고, AWS 인증은 서버 측에만 존재한다. 보류된 CloudFront 호스팅은 필수 완료 조건이 아니다.
- 다섯 자산의 Check Price가 정직하게 표시된 최신 가용 데이터 또는 명확한 unavailable 상태를 반환한다.
- Analyze가 요청 언어의 구조화된 grounded insight, 불확실성, timestamp, disclaimer를 반환한다.
- API가 비동기 `202`와 polling 계약을 지키고 idempotency가 중복 task를 막는다.
- on-demand Fargate task가 처리 후 종료하며 main stack에 ECS Service나 ALB가 없다.
- DynamoDB conditional transition, terminal immutability, TTL, timeout/sweeper가 검증된다.
- frontend bucket은 private이고 role이 분리되며 secret이 source, image, bundle, log에 없다.
- dashboard, actionable alarm, circuit breaker, USD 5 alert가 통제된 시험으로 검증된다.
- unit, contract, integration, bounded E2E, security, resilience, cost test가 통과한다.
- clean clone에서 setup/deploy가 재현되고 문서, ADR, threat model, cost model, runbook, demo와 teardown 증거가 완성된다.
- 알려진 제한, 실제 관측 latency/cost, provider licensing/freshness 조건을 숨기지 않고 설명한다.

최종 결과는 **재현 가능하고, 관측 가능하고, 최소 권한이며, 비용이 제한되고, 데이터 freshness에 정직하며, 금융 자문으로 오해되지 않아야 한다.**

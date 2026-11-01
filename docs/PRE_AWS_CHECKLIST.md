# AWS 로그인 전 완료 체크리스트

## 2026-09-13 오전 일본어 분석 완료

- [x] QLD/ja 1건 성공, 일본어 결과·정확한 task 종료 검사
- [x] 내부 실행·표시 false, OPEN/version 9, task/pending/service/slot 0
- [x] 최종 조회 완료 후 CLI 및 사용자 콘솔 로그아웃 확인
- [x] 당시 로컬 검사 179개 통과
- [ ] 다국어 화면 최종 검증, 공개 웹/API 연결, 운영·출시 acceptance

[상세 기록](evidence/PHASE8_QLD_JA_ACCEPTANCE_2026-09-13.md). 아래 미완료 표시는 과거 시점 기록이다.

## 2026-09-12 TSLA 영어 분석 및 종료

- [x] 임시 계정·리전·모델·단가·Budget 사전 확인, 기존 내부 flag만 일시 변경
- [x] 단일 TSLA/en ANALYZE 성공, 정확한 task STOPPED/exit 0, 원문 없는 결과 검사 통과
- [x] 내부 실행 false 복구 배포, 최종 circuit OPEN/version 7·slot 0·실행 task 0
- [x] CLI 로그아웃 및 사용자 콘솔 로그아웃 확인, 전체 로컬 테스트 174개 통과
- [ ] 일본어 실제 분석 및 나머지 제품/운영 acceptance

종합 종료 시점 Budget/config 재조회는 로그아웃과 겹쳐 실패했다. 성공한 복구 배포와 별도 최종 task/slot/circuit 조회를 구분한다. [상세 기록](evidence/PHASE8_TSLA_EN_ACCEPTANCE_2026-09-12.md).

## 2026-09-10 Phase 8 단일 실검증

- [x] 임시 로그인·Tokyo 모델 ACTIVE·공식 가격·USD 5 Budget 확인
- [x] 기존 Compute 내부 실행 flag만 일시 활성화, 단일 `ANALYZE/QLD/ko` 작업 성공
- [x] 저장 결과 규격·한국어 고지·QLD 위험 설명 확인; promptVersion 규격 불일치 수정
- [x] 정확한 task STOPPED/exit 0, slot 0, task/service 0 확인
- [x] 내부 실행 false, 공개 결과 false, circuit OPEN/version 5 복구

이 체크포인트는 아래 9월 9일 기록의 단일 cloud ANALYZE 미완료 항목을 갱신한다. 모든 언어/종목과 공개 웹 연결 검증을 완료한 것은 아니다. [실행 증거](evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md).

## 2026-09-09 Phase 8 로컬 준비

- [x] PRICE 기본값을 유지하면서 단일 `ANALYZE/QLD/ko` signed acceptance 경로 추가
- [x] ANALYZE dry-run 호출 0회, live 작업 1개/Bedrock 1회/출력 512토큰 계획 및 명시적 실행 flag
- [x] 잘못된 옵션, 결과 노출, 다른 job 응답, 무한 polling, 불확실한 POST 재시도 방지 테스트
- [x] 세 언어의 timestamp/provenance/disclaimer/QLD 위험 고지와 모델 거부·출력 잘림 실패 테스트
- [ ] 새 세션의 실제 모델 가격/접근성 및 배포 설정 확인
- [ ] 단일 cloud ANALYZE의 저장 결과 검증, 정확한 task STOPPED, slot 회수 및 circuit/내부 실행 복구

오늘은 로컬 준비만 수행했다. 실제 ANALYZE 성공이나 현재 AWS 자원 상태를 확인한 것으로 해석하지 않는다. 상세 증거는 [Phase 8 준비 기록](evidence/PHASE8_ANALYZE_PREPARATION_2026-09-09.md)을 따른다.

## 2026-09-06 재개 시점의 추가 로컬 준비

- [x] 영속 circuit, 고정 slot 동시성 제한, 종료 증거 기반 slot 회수 라이브러리와 장애 테스트
- [x] controller transaction IAM action 수정 및 worker control-key 접근 차단의 로컬 검증
- [x] 브라우저 요청 자체를 중단하는 polling deadline
- [x] 위 변경의 승인된 ComputeStack 업데이트, Access Analyzer 및 11개 IAM 허용/거부 검증
- [x] `ConditionCheckItem`의 실제 transaction 권한 검증(2026-09-07 단일 signed admission 성공)
- [x] 사용자가 dry-run 확인 후 persistent circuit을 조건부로 `OPEN/version 1` 초기화하고 consistent status read에서 `verifiedRecord=true` 확인
- [x] 내부 provider 실행과 공개 결과 표시를 분리한 opt-in을 로컬 구현: IAM API 필수, display 강제 false, 기본값 false
- [x] internal-job opt-in의 별도 배포 승인, circuit CLOSE 훈련 및 bounded signed E2E
- [x] 실제 API Gateway signed HTTP E2E와 승인된 job admission/recovery
- [ ] 사용자 circuit 조작 학습 및 관측성/sweeper 운영 배포

이 목록은 아래의 과거 체크리스트를 갱신하는 추가 기록이며 Phase 7/11 전체 완료를 의미하지 않습니다.

기준일: 2026-08-10

## 완료

- [x] `plan.md`와 `agent.md` 확정
- [x] Git 저장소 초기화 및 secret/build 산출물 ignore 규칙 추가
- [x] TypeScript/Node.js, pnpm, static React frontend 기술 경계 확정
- [x] 영어·일본어·한국어 UI와 locale 저장 구현
- [x] 세 언어 key parity 테스트와 금융·상태 용어 glossary 작성
- [x] 반응형 asset selection, Check Price, Analyze, loading/error/unavailable UX 구현
- [x] mock임을 명확히 표시하고 실제 가격으로 오인될 표현 제거
- [x] `SPCX` 공식 상장 확인을 반영한 날짜 표시 데모 가격·분석과 live-provider 불일치 시 `DATA_UNAVAILABLE` 처리
- [x] `QLD` 레버리지·복리·path dependency·하락 위험 문구 구현
- [x] 접근성 기본: keyboard, focus, semantic heading, live region, reduced motion
- [x] API, job, price, analysis, public error JSON Schema와 OpenAPI 초안
- [x] 요청 allowlist, idempotency hash, conditional state-machine domain logic
- [x] quote normalization과 grounded prompt/output validation
- [x] Twelve Data adapter의 timeout, 최대 3회 재시도, bounded backoff, credential-safe error, SPCX issuer/exchange guard
- [x] local PRICE/ANALYZE fixture worker와 non-root one-shot Dockerfile
- [x] stale-job sweeper와 circuit-control 순수 domain logic
- [x] ADR, threat model, cost model, API 문서, runbook, demo script
- [x] AWS 최초 로그인 순서와 비용 우선 게이트 문서화
- [x] 소셜 미리보기 이미지와 frontend metadata

## 외부 계정·credential 또는 별도 로컬 도구가 있어야 완료 가능한 항목

- [x] root MFA 활성, root access key 없음, account contacts와 billing preferences 확인
- [x] USD 5 월간 Budget과 actual 50%·80%·100%, forecast 100% 알림 4개 생성
- [ ] Budget의 직접 이메일 수신자 주소 확인 및 최초 임계값 알림 수신 검증
- [x] 일상용 `aws-admin-user` 콘솔 접근과 MFA 구성
- [x] AWS 공식 현재 사용자용 CLI v2.36.19 설치 및 실행 확인
- [x] `gmai-admin` CLI browser-login temporary credential 구성; 장기 access key 없음
- [x] `aws sts get-caller-identity`로 masked account와 `aws-admin-user` identity 확인
- [ ] Twelve Data key로 5개 symbol 실제 응답·freshness·라이선스 검증
- [x] Tokyo Region에서 Bedrock model access와 현재 가격 확인 (`amazon.nova-lite-v1:0`, access/authorization/entitlement/region 모두 사용 가능)
- [x] Nova Lite 인리전 온디맨드 quota 확인(RPM `20`, TPM `200,000`, 일일 tokens `564,480,001`)
- [ ] 실제 model의 영어·일본어·한국어 구조화 출력 평가
- [x] Docker image build/scan 및 local container 실행 완료(비관리자 Distroless, read-only/network-none smoke, HIGH·CRITICAL 0, secret 0)
- [x] AWS CDK local typecheck, 비용·보안 assertion, Foundation/Compute synth
- [x] AWS CDK bootstrap/deploy와 cloud acceptance test (bootstrap, Foundation, Compute, immutable worker ECR push, 만료 job의 real Fargate lifecycle 검증 완료)

2026-08-10 AWS Price List API 확인 기준 Tokyo 표준 온디맨드 Nova Lite 단가는 입력 1K tokens당 USD 0.000072, 출력 1K tokens당 USD 0.000288이다. 최초 1회 smoke test는 입력 최대 1,000 tokens와 출력 최대 256 tokens로 제한하며 예상 상한은 USD 0.000146 미만이다. 후속 재시도도 사용자 비용 재승인 후에만 수행한다. 상세 기록은 `docs/BEDROCK_ACCESS_AND_COST.md`를 따른다.

2026-08-22 AWS Price List API 재확인에서도 같은 Tokyo 표준 온디맨드 단가가 유지되었다. 가격표 publication date는 2026-08-20이며 effective date는 2026-08-01이다.

2026-08-10 승인된 smoke test는 계정의 Nova Lite on-demand requests/minute, tokens/minute, tokens/day 할당량이 모두 0이어서 `ThrottlingException`으로 거부되었다. 성공한 inference와 반환 token usage는 없으며, 할당량이 제공되기 전까지 세 언어 평가는 의도적으로 미완료 상태를 유지한다.

2026-08-10 Bedrock Nova Lite의 최소 개발용 quota를 요청하는 Service limit increase Case를 접수했다. Case ID와 이메일은 문서화하지 않았으며, AWS 회신 후 실제 적용값을 API로 재확인한다.

2026-08-19 AWS Support 회신 후 Service Quotas를 읽기 전용으로 재확인했다. Tokyo 인리전 온디맨드는 RPM `20`, TPM `200,000`, 일일 합산 tokens `564,480,001`이며 모두 0보다 크다. Cross-region 값은 RPM `40`, TPM `400,000`이지만 이 프로젝트는 인리전 호출만 사용한다. 실제 inference는 수행하지 않았고 확인 후 `gmai-admin` 임시 세션을 로그아웃했다.

2026-08-22 사용자 승인 경계에서 Nova Lite 인리전 inference 1회를 실행해 성공했다. 실제 usage는 input `167`, output `256`, total `423` tokens이며 계산 token 비용은 USD `0.000085752`다. 응답은 `max_tokens`로 종료되어 JSON이 완성되지 않았으므로 서비스 접근만 통과로 판정하고 세 언어 구조화 출력 평가는 미완료 상태를 유지한다. 상세 기록은 `docs/BEDROCK_SMOKE_TEST_2026-08-22.md`를 따른다.

2026-08-22 세 언어 평가 전에 prompt contract를 `v2`로 갱신하고 strict JSON parser와 `scripts/bedrock-i18n-evaluation.ps1`을 준비했다. 스크립트는 기본 dry-run이며 승인 후에만 `-Execute`를 사용한다. 영어·일본어·한국어 각 1회, 입력 1,500/output 512 tokens, retry 0의 총 계산 상한은 USD `0.000766368`이다. 전체 로컬 검사와 credential 중심 secret 검사는 통과했으며 이 준비 단계에서는 AWS 호출이나 배포를 하지 않아 추가 AWS 비용은 USD `0.00`이다.

2026-08-22 승인 후 세 언어 inference를 정확히 3회 실행했고 자동 재시도는 없었다. 세 응답의 기본 strict JSON 구조 검증은 통과했으나, 마지막 로컬 비용 합산 오류로 실제 token usage와 응답 원문을 최종 수집하지 못했다. 따라서 언어·금융 안전·QLD 내용 평가는 미완료로 유지한다. 합산 코드는 수정하고 dry-run 검증했으며 추가 호출 없이 로그아웃했다. 상세 기록은 `docs/BEDROCK_I18N_EVALUATION_2026-08-22.md`를 따른다.

2026-08-22 별도 재승인 후 세 언어를 다시 각 1회 실행했다. 실제 usage는 input `975`, output `827`, total `1,802` tokens이고 계산 token 비용은 USD `0.000308376`으로 재승인 상한 USD `0.000766368` 이내다. 구조·언어 문자·QLD 문맥·기본 금지 표현은 모두 통과했으나, 미제공 benchmark, 낙관적 수익/기회 표현과 비실시간 자료 표시 문제가 발견되어 최종 acceptance는 미완료로 유지한다. 이를 차단하는 `v3` prompt와 validator는 로컬 구현 및 전체 검사를 통과했고, 추가 호출 없이 로그아웃했다.

2026-08-22 사용자 승인 후 `v3` 최종 세 언어 평가를 각 1회 실행했다. 실제 usage는 input `1,269`, output `729`, total `1,998` tokens이고 계산 token 비용은 USD `0.000301320`이다. 일본어만 자동 검증을 통과했고 영어·한국어는 JSON 종료 문자 오류, 수동 검토에서는 미제공 사실 사용 문제로 최종 acceptance에서 제외했다. 이에 따라 free-form JSON text 방식을 중단하고 Converse forced tool use와 input schema를 사용하는 `v4`를 로컬 구현했다. 전체 로컬 검사 통과 후 추가 호출 없이 로그아웃했다.

2026-08-22 별도 승인 후 `v4` tool-use 평가를 세 언어 각 1회 실행했다. 실제 usage는 input `2,889`, output `815`, total `3,704` tokens이고 계산 token 비용은 USD `0.000442728`이다. 지정 tool과 schema는 3/3 통과해 JSON 안정성은 확인했으나, QQQ 관계 추론, 비실시간 자료 표시와 기간 적합성·홍보성 문구 때문에 grounding acceptance는 미완료로 유지한다. 검증기의 nested-array 결합 오류는 실제 실패 문장을 이용한 회귀 테스트와 함께 수정했다. 추가 호출 없이 로그아웃했으며 다음 단계는 allowlisted insight ID와 deterministic localized renderer의 로컬 구현이다.

2026-08-22 allowlisted insight ID와 deterministic 영어·일본어·한국어 renderer의 로컬 후보 구현을 완료했다. 모델 자유 문장은 사용자에게 전달하지 않고 symbol·quote 상태에 허용된 ID만 선택하게 하며, unknown/duplicate/근거 부족 선택은 거부한다. 전체 서비스·계약 27개, 인프라 4개, 프런트엔드 4개 검사를 통과했다. 실제 Bedrock adapter 연결 전 단계이며 추가 AWS 비용은 USD `0.00`이다. 상세 설계는 `docs/GROUNDED_AI_SELECTION_DESIGN.md`를 따른다.

2026-08-22 Bedrock adapter core와 worker operation 경계를 연결했다. Converse-compatible transport를 주입해 정확히 한 번 호출하고 timeout, token cap, tool shape, allowlisted ID, usage 일관성을 검증한 뒤 deterministic renderer와 canonical metadata/disclaimer를 적용한다. Mocked provider와 Bedrock을 연결한 ANALYZE 통합 테스트 및 PRICE가 Bedrock을 호출하지 않는 negative test를 포함해 서비스·계약 33개, 인프라 4개, 프런트엔드 4개 전체 검사를 통과했다. 새 dependency, AWS 로그인, provider/Bedrock 호출과 배포는 없어 추가 비용은 USD `0.00`이다. AWS SDK transport 및 container bundling은 다음 로컬 게이트다.

2026-08-22 modular AWS SDK v3 Bedrock Runtime transport와 container bundle 게이트를 완료했다. `@aws-sdk/client-bedrock-runtime` `3.1109.0`과 `esbuild` `0.28.1`을 고정하고 SDK `maxAttempts: 1`, ECS task role 기본 credential chain, AbortSignal 전달, 좁은 response mapping을 mock contract test로 검증했다. production dependency 28개의 license는 Apache-2.0 26개, MIT 1개, 0BSD 1개였으며 자동 license gate와 container 내 notices/license 사본을 추가했다. bundle은 1,209,814 bytes, local image는 54,791,076 bytes로 측정했다. 네트워크 차단·read-only container에서 non-root UID 65532 one-shot 실행에 성공했고 `pnpm audit --prod`는 알려진 취약점 0건이었다. 서비스·계약 36개, 인프라 4개, 프런트엔드 4개 전체 검사를 통과했다. AWS 로그인·provider/Bedrock 호출·배포·registry push는 하지 않아 추가 AWS 비용은 USD `0.00`이며, 다음 로컬 게이트는 ECS job repository와 conditional 상태 전이 연결이다.

2026-08-23 conditional DynamoDB repository와 실제 one-shot worker entry 흐름을 로컬에서 완료했다. worker는 consistent `GetItem` 후 `status + version` 조건으로만 `QUEUED → RUNNING → SUCCEEDED/FAILED`를 갱신하고, 중복·만료 task는 provider/Bedrock 호출 전에 차단한다. DynamoDB SDK도 `maxAttempts: 1`과 3초 timeout을 사용하며 task role은 정확한 table의 `GetItem/UpdateItem`만 허용하도록 CDK assertion을 추가했다. jobs table은 on-demand, AWS-managed encryption, `expiresAt` TTL이다. AWS SDK 두 client를 `3.1116.0`으로 맞췄고 production graph 33개 license와 audit 0건을 확인했다. 전체 검사는 서비스·계약 46개, 인프라 4개, 프런트엔드 4개가 통과했다. local image `gmai-worker:dynamodb-local`은 54,833,510 bytes이며 network-none/read-only/non-root fixture 실행과 AWS 설정 누락의 sanitized fail-closed를 확인했다. AWS 로그인·DynamoDB/Bedrock/provider 호출·배포·registry push가 없어 추가 AWS 비용은 USD `0.00`이다. 다음 게이트는 Parameter Store SecureString/ECS secret injection과 worker/controller negative IAM 설계다.

2026-08-23 Phase 5의 Parameter Store/IAM 경계를 로컬 CDK에 추가했다. 표준 `SecureString`은 운영자가 별도 생성하며 IaC에는 `/global-market-ai-insight/dev/market-data/api-key`라는 비민감 이름만 둔다. ECS execution role만 exact `ssm:GetParameters`로 task-start injection을 수행하고, worker role은 exact DynamoDB `GetItem/UpdateItem`과 Nova Lite `InvokeModel`만, controller role은 exact task definition `RunTask`와 조건부 exact `PassRole`만 가진다. worker의 `ecs:RunTask`/`iam:PassRole`/SSM 접근 및 controller의 provider secret/Bedrock 접근 부재를 CDK negative assertion으로 검증했다. 합성 template에는 plaintext secret이 없었고 고신뢰 AWS/GitHub/provider credential pattern 자동 검사도 전체 local gate에 추가했다. 실제 SecureString/role/task definition은 만들지 않았고 AWS 호출·배포·provider 호출이 없어 추가 AWS 비용은 USD `0.00`이다. AWS에서의 required-workflow 및 explicit-deny 증거는 배포 승인 후의 제한된 smoke gate로 남아 있다.

2026-08-23 `gmai-admin` 단기 browser login을 재인증하고 read-only preflight를 수행했다. 예상 principal과 Tokyo region을 확인했고 USD 5 Budget은 active, month actual USD `0.00`, forecast USD `0.01`이었다. `Project=global-market-ai-insight` 태그 리소스, CDK bootstrap, provider SecureString은 모두 존재하지 않았다. 현재 Twelve Data Basic은 무료이지만 internal non-display이며 개인 plan은 외부 재배포/제3자 상업 표시를 허용하지 않는다는 최신 provider 문서를 확인했다. 따라서 `marketDataUsageMode=internal-development-only`, `enablePublicLiveQuotes=false`를 config validation과 test로 강제했다. 계정·subscription·payment method·API key를 만들지 않았고 AWS 리소스 변경 및 추가 비용은 USD `0.00`이다. 확인 후 `gmai-admin` cached login을 로그아웃했으며 이미 token을 적재한 도구가 있다면 최대 약 15분 뒤 만료된다.

2026-08-29 로컬 기준선을 재검증했다. 서비스·계약 46개, 인프라 5개, 프런트엔드 4개와 worker bundle/smoke, CDK synth, lint/build, production license, high-confidence secret scan이 모두 통과했다. 제한된 Windows 실행 환경에서도 bundle entry를 안정적으로 찾도록 절대 경로를 사용한다. Twelve Data 공식 문서도 다시 확인했으며 Basic은 계속 무료 8 credits/minute·800/day이지만 internal non-display다. 따라서 Basic을 사용하더라도 private coverage/metadata 검증으로만 제한하고, 로컬·공개 UI의 provider live quote는 표시 권한이 확인될 때까지 fixture/`DATA_UNAVAILABLE`로 유지한다. AWS 호출·provider 가입·key 생성·subscription·결제·resource 변경은 수행하지 않았다.

2026-08-29 사용자가 Twelve Data Basic 계정과 API key를 준비하고 Tokyo Parameter Store에 exact name `/global-market-ai-insight/dev/market-data/api-key`, `Standard`, `SecureString`으로 직접 등록했다. 브라우저와 CLI 검증은 이름·Type·Tier만 조회하고 값을 복호화하거나 출력하지 않았다. `aws-admin-user`의 `gmai-admin` temporary CLI login을 장기 access key 없이 재인증했고, USD 5 Budget actual `0.0`, forecast `0.004`, active CloudFormation stack 0개를 확인했다. Tokyo Fargate On-Demand quota는 30 vCPU이고 application cap은 2 tasks × 0.25 vCPU다. 다음 mutation gate는 termination protection을 켠 표준 `CDKToolkit` bootstrap이며, 실행 전 생성되는 S3/ECR/IAM/SSM 리소스와 deployment-role 권한을 사용자에게 설명하고 별도 승인을 받는다.

2026-08-29 사용자 승인 후 Tokyo에 표준 `CDKToolkit` bootstrap을 배포했다. stack은 `CREATE_COMPLETE`, termination protection `true`, template version `32`이며 external trusted account와 customer-managed KMS key는 없다. S3 public-access block 네 항목이 모두 활성화되고 bucket은 비어 있었으며, bootstrap ECR도 image 0개였다. 표준 template의 CloudFormation execution role은 `AdministratorAccess`를 사용하므로 runtime role과 분리된 강한 deployment boundary로 문서화했다. Budget은 actual `0.0`, forecast `0.004`를 유지했고 project workload나 provider/Bedrock 호출은 없었다. 비민감 검증 증거는 `docs/evidence/CDK_BOOTSTRAP_2026-08-29.md`에 기록했다.

2026-08-29 사용자에게 `cdk diff`, 비용, 삭제 범위를 설명하고 별도 승인을 받은 뒤 `global-market-ai-insight-dev-foundation`만 배포했다. ECR 1개는 immutable, scan-on-push, AES256, newest 3-image lifecycle이며 현재 image 0개다. log group 1개는 7일 보존·0 bytes이고, DynamoDB 1개는 `PAY_PER_REQUEST`, AWS-managed KMS encryption, `expiresAt` TTL, 0 items·0 bytes다. stack에는 VPC/NAT/ALB/ECS Service/task/Lambda/API Gateway/public endpoint가 없고 Budget actual `0.0`, forecast `0.004`를 유지했다. 비민감 검증 증거는 `docs/evidence/FOUNDATION_DEPLOY_2026-08-29.md`에 기록했다.

2026-08-29 Foundation 이후 현재 source로 `gmai-worker:pre-ecr-20260829` local image를 다시 빌드했다. image는 linux/amd64, 54,833,510 bytes, UID/GID `65532:65532`이며 network-none, read-only, tmpfs, capability-drop, no-new-privileges, 0.25 CPU/512 MiB/64 PID 조건에서 QLD fixture one-shot이 `SUCCEEDED`였다. AWS/provider/Bedrock 호출과 secret 주입은 없었다. ECR registry scanning은 `BASIC`이고 enhanced Inspector scanning은 활성화되지 않았다. ECR push는 별도 승인 gate로 남겼으며 비민감 증거는 `docs/evidence/LOCAL_WORKER_IMAGE_2026-08-29.md`에 기록했다.

2026-08-29 사용자의 별도 승인 후 worker image를 project ECR에 정확히 한 번 push했다. deployable tag는 `worker-20260829-030a1e015d46` 하나이며 Docker의 OCI index 때문에 ECR inventory에는 tagged index, linux/amd64 runtime manifest, attestation manifest의 3개 항목이 보인다. 실제 runtime manifest의 ECR Basic scan은 `COMPLETE`, finding severity count 없음으로 확인했고 enhanced Inspector scanning은 켜지 않았다. push 후 Docker ECR login token과 `gmai-admin` 임시 CLI login cache를 제거했으며 Budget은 limit USD `5.0`, actual `0.0`, forecast `0.004`였다. ECS/Fargate, Bedrock, Twelve Data 호출은 수행하지 않았다. 상세 기록은 `docs/evidence/ECR_PUSH_2026-08-29.md`를 따른다.

2026-08-29 사용자 승인 후 `global-market-ai-insight-dev-compute`를 배포했다. VPC는 2개 public subnet과 IGW만 사용하며 NAT Gateway, ALB, ECS Service, ingress rule이 없다. task는 immutable ECR digest, 0.25 vCPU/512 MiB, non-root `65532:65532`, read-only root filesystem을 사용한다. 배포 전 L2 secret helper가 execution role에 넓은 SSM 읽기를 부여하는 것을 발견해 L1 secret injection으로 바꾸고 exact `ssm:GetParameters`만 유지했다. 첫 두 제한 task는 ECR pull·SecureString injection·task-role assumption·container start에는 성공했으나 DynamoDB job claim 전에 sanitized repository error로 종료되어 provider와 Bedrock을 호출하지 않았다.

2026-08-29 별도 승인 후 근거가 없던 link-local TCP/80 egress를 제거하고 두 worker route table에 DynamoDB Gateway Endpoint를 배포했다. endpoint policy는 exact worker task role이 exact jobs table에 `GetItem`/`UpdateItem`만 수행하도록 제한했고 endpoint는 `available`이다. AWS 공식 문서상 gateway endpoint 자체의 추가 요금은 없다. 승인된 마지막 한 task도 같은 pre-claim 오류를 재현했으며 job `gmai-smoke3-20260829135226`은 조건부로 `FAILED/INFRASTRUCTURE_SMOKE_FAILED`, version `2`가 되었다. 실행 중 task는 `0`, Budget은 limit USD `5.0`, actual `0.0`, forecast `0.003`, 두 stack은 `UPDATE_COMPLETE`다. 따라서 Compute 배포는 완료됐지만 real cloud worker acceptance는 완료 처리하지 않는다. 다음 게이트는 raw SDK 오류나 credential/URI를 기록하지 않는 allowlisted 진단 분류를 로컬에서 구현·검증한 뒤, 새 ECR image push와 이미 만료된 job 1회 실행을 별도 승인받는 것이다. 상세 기록은 `docs/evidence/COMPUTE_DEPLOY_AND_SMOKE_2026-08-29.md`를 따른다.

2026-08-29 사용자가 별도 승인한 safe diagnostic image를 구현했다. 오류의 raw message/stack/credential/URI 대신 allowlisted repository category만 기록하며 credential-like 문자열 누출 회귀 테스트를 포함한 서비스·계약 `49/49`, 인프라 `5/5`, 프런트엔드 `4/4`와 전체 local gate가 통과했다. ECR tag `worker-20260829-db9a51e2e122`의 runtime Basic scan은 `COMPLETE`, finding 없음이며 task definition revision `2`로 배포했다. 이미 만료된 진단 job 1회는 provider/Bedrock 호출 전에 `REPOSITORY_ACCESS_DENIED`를 식별했다. IAM identity policy는 허용이었으므로 AWS 공식 gateway endpoint 규칙과 비교해 직접 role `Principal`이 원인임을 확인했다. 정책을 AWS 요구 형식인 `Principal: *`와 exact `aws:PrincipalArn` 조건으로 변경하되 exact table과 `GetItem/UpdateItem` 제한은 유지했고 policy-only diff 후 ComputeStack은 `UPDATE_COMPLETE`다. 진단 job은 조건부 `FAILED/version 2`, running task `0`, Budget actual `0.0`, forecast `0.003`이다. 수정 후 cloud acceptance는 endpoint propagation 이후 이미 만료된 job 1회와 Fargate task 정확히 1개의 별도 비용 승인을 기다린다.

2026-08-30 별도 승인 후 `TIMED_OUT` transition에서 사용하지 않는 DynamoDB expression name 때문에 발생한 `ValidationException`을 수정하고 모든 transition placeholder 사용 여부를 회귀 테스트로 고정했다. 전체 local gate와 제한된 non-root/read-only/network-none container smoke가 통과했고, local Trivy DB 기준 HIGH/CRITICAL finding은 `0`이었다. 새 immutable ECR tag `worker-20260830-ad501778e2e2`의 linux/amd64 runtime Basic scan은 `COMPLETE`, finding 없음이며 CDK diff는 task image digest 교체 1건뿐이었다. ComputeStack은 task definition revision `3`으로 `UPDATE_COMPLETE`가 되었다. 승인된 이미 만료된 job `gmai-accept-20260830051625`와 Fargate task 정확히 1개를 실행했고 authoritative DynamoDB 결과는 `TIMED_OUT`, `version 2`, `attemptCount 0`, `JOB_DEADLINE_EXCEEDED`였다. task는 의도한 오류 종료 code `1`을 반환했고 log에는 sanitized start/deadline 메시지만 남았다. Twelve Data와 Bedrock 이전에 차단됐으며 running task와 ECS Service는 각각 `0`, NAT Gateway와 ALB는 없다. 최종 Budget은 limit USD `5.0`, actual `0.0`, forecast `0.002`, health `HEALTHY`였으며 billing 반영 지연 가능성은 유지한다. 상세 기록은 `docs/evidence/CLOUD_WORKER_ACCEPTANCE_2026-08-30.md`를 따른다.

2026-08-30 배포된 execution/worker/controller role을 IAM Policy Simulator로 검증했다. worker의 exact table `GetItem/UpdateItem`과 Nova Lite 호출, controller의 exact table·task definition·cluster 조건과 ECS 전용 `PassRole`, execution role의 exact Standard SecureString `GetParameters`는 허용되었다. worker의 task 실행·role 전달·parameter 읽기, controller의 잘못된 cluster·조건 없는 role 전달·parameter/Bedrock 접근, execution role의 table/Bedrock 접근은 모두 `implicitDeny`였다. 총 `17/17`이 기대와 일치했고 정책이나 리소스를 변경하지 않았다. 실제 성공한 ECR pull·secret injection·DynamoDB timeout workflow와 결합해 Phase 5 required/negative 경계를 완료했다. 상세 기록은 `docs/evidence/IAM_LEAST_PRIVILEGE_VALIDATION_2026-08-30.md`를 따른다.

2026-08-30 사용자 비용 승인 범위를 QLD `PRICE`/`ko` job 1개, Fargate task 정확히 1개, Bedrock 호출 없음, 총 USD `0.001` 이하로 고정하고 정상 real-cloud lifecycle을 검증했다. 사전 상태는 두 project stack `UPDATE_COMPLETE`, running task와 ECS Service 각각 `0`, task definition revision 3의 non-root/read-only 설정, Standard SecureString 존재, Budget limit USD `5.0`·actual `0.0`·forecast `0.002`였다. job은 조건부 1회 생성되어 최종 `SUCCEEDED`, `version 3`, `attemptCount 1`이 되었고 이는 `QUEUED → RUNNING → SUCCEEDED` 전이를 입증한다. CloudWatch에는 sanitized `STARTING`/`SUCCEEDED`만 남았으며 worker duration은 893 ms, container exit code는 `0`이었다. 실제 가격 숫자는 internal non-display provider 조건 때문에 증거에서 제외했고 Bedrock은 호출하지 않았다. 상세 기록은 `docs/evidence/DYNAMODB_NORMAL_LIFECYCLE_2026-08-30.md`를 따른다.

2026-09-05 Phase 7 API/controller를 로컬 구현했다. 네 route, 엄격한 request/idempotency 검증, 원자적 DynamoDB job+분당 counter, deterministic ECS client token과 `JOB_ID`-only 단일 task launch, launch-failure 보상, public internal-field 제거, fail-closed provider/display gate를 추가했다. 별도 browser client는 HTTPS(로컬 제외), credential omit, 64 KiB response, 120초 polling 상한을 강제하지만 현재 fixture UI에는 연결하지 않았다. API stack은 명시적 `GMAI_ENABLE_API=true`가 없으면 CDK assembly에서 제외된다. 로컬 검사와 opt-in dummy-digest 합성만 수행했으며 AWS 로그인·deploy·provider/Bedrock/Fargate 호출은 없어 추가 AWS 비용은 USD `0.00`이다. 실제 `202 → terminal` API acceptance는 공개 endpoint/security와 비용 승인을 기다리는 의도적 gate다. 상세 기록은 `docs/evidence/PHASE7_LOCAL_CONTROLLER_2026-09-05.md`를 따른다.

2026-09-05 승인된 첫 Phase 7 Compute/API 배포에서 Lambda reserved concurrency `2`가 account concurrency quota `10`과 AWS의 minimum unreserved `10` 조건에 맞지 않아 Lambda 생성 전에 거부되었다. CloudFormation은 `UPDATE_ROLLBACK_COMPLETE`로 복구하고 시도된 Lambda/log group을 삭제했다. Fargate, provider, Bedrock 호출은 없었다. quota 상향 대신 reserved concurrency를 제거하되 AWS IAM route 인증, API throttle, 원자적 분당 admission, provider job OFF를 유지하는 로컬 수정을 적용했다.

2026-09-05 수정 후 재배포에서 Compute stack은 `UPDATE_COMPLETE`, API stack은 `CREATE_COMPLETE`, Foundation은 변경 없음으로 완료됐다. 네 route 모두 실제 control plane에서 `AWS_IAM`을 확인했다. 직접 Lambda acceptance 3회에서 health `200/CLOSED/jobCreationEnabled=false`, 5개 고정 asset `200/no-store`, 유효한 QLD PRICE 요청 `503 DATA_UNAVAILABLE`을 확인했다. 마지막 요청은 DynamoDB job 생성과 ECS 이전에 차단됐고 running Fargate task는 `0`, Twelve Data·Bedrock·Fargate 호출도 `0`이었다. API는 signed developer surface이며 browser와 연결하지 않았다. 실제 `202 → terminal` API gate는 provider 표시 권리와 active-work/circuit 통제가 준비될 때까지 미완료다. 상세 기록은 `docs/evidence/PHASE7_API_DEPLOY_2026-09-05.md`를 따른다.

2026-09-06 사용자가 circuit을 explicit `OPEN/version 1`로 초기화한 뒤, 내부 실행과 공개 result 표시를 분리하고 SigV4 signed API acceptance 및 STOPPED 증거 기반 slot 회수 도구를 로컬에서 준비했다. acceptance는 health 1회, PRICE job POST 1회, status GET 최대 16회, task 최대 1개, retryable provider 요청 최대 3회, Bedrock 0회로 고정되며 POST를 자동 재시도하지 않는다. live result와 내부 필드가 응답되면 즉시 실패한다. 두 도구의 dry run은 AWS 호출 0회였고, 배포·circuit close·실제 job·회수·circuit reopen·내부 실행 flag rollback은 아직 수행하지 않은 별도 Security/Cost 승인 게이트다.

2026-09-06 종료 시 read-only preflight에서 예상 IAM user/Tokyo, USD 5 Budget actual `0.0`·forecast `0.026`, running task `0`, ECS Service `0`, provider/display flag `false/false`를 확인했다. combined probe의 circuit/auth field parsing은 결론을 낼 수 없어 직전 수동 검증 `OPEN/version 1`을 유지하되, 다음 세션 첫 단계에서 다시 읽는다. AWS mutation, provider, Bedrock, Fargate 실행은 없었다.

2026-09-07 사용자 비용 승인 후 기존 immutable worker image를 재사용하고 ComputeStack Lambda 코드/내부 flag만 변경했다. circuit `OPEN/1 → CLOSED/2` 구간에서 signed API `QLD/PRICE/ko` job 1개를 제출해 API 6회 안에 `SUCCEEDED/version 3`, `attemptCount 1`, exact task `STOPPED`, container exit `0`을 확인했다. 공개 result는 계속 비활성화했고 Bedrock 호출은 0회였다. 실제 admission transaction이 성공해 이전 `ConditionCheckItem` runtime 권한 불확실성도 해소됐다. 이어 `OPEN/version 3`, STOPPED slot 1개 회수, 내부 flag false로 복구했다. 최종 running task/service/occupied slot은 모두 `0`, Budget actual `0.0`, forecast `0.024`다. 상세 기록은 `docs/evidence/PHASE7_SIGNED_API_ACCEPTANCE_2026-09-07.md`를 따른다.

2026-08-10 Docker 로그인 없이 로컬 worker image를 빌드하고 `PRICE`와 mocked `ANALYZE`를 실행했다. 최종 image는 digest로 고정한 Distroless Node 22 runtime과 uid/gid `65532:65532`를 사용하며, read-only root filesystem, network none, capability drop 조건에서 정상 종료했다. Trivy 0.72.0 기준 전체 `HIGH`/`CRITICAL` 취약점과 secret finding은 각각 0건이다. 상세 재현 기록은 `docs/DOCKER_WORKER_VALIDATION.md`를 따른다.

2026-08-10 AWS CDK 2.263.0으로 ECR/log Foundation과 one-shot ECS/Fargate Compute를 구현하고 로컬 합성했다. assertion은 NAT Gateway, ECS Service, ALB, inbound security-group rule이 모두 0개임을 검증한다. AWS bootstrap, deploy, ECR push와 Fargate `RunTask`는 실행하지 않았다. 상세 기록은 `docs/PHASE4_LOCAL_INFRA_VALIDATION.md`를 따른다.

위 미완료 항목은 준비 부족이 아니라 외부 계정 상태 또는 AWS 배포 승인을 기다리는 의도적인 게이트다. credential이나 AWS 결과를 추측하여 체크하지 않는다.

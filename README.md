# Global Market AI Insight

[한국어 포트폴리오](docs/PORTFOLIO_CASE_STUDY_KO.md) ·
[현재 계획](plan.md) · [소스 공개 범위](docs/SOURCE_RELEASE_SCOPE.md)

사용자 직접 실습은 프로젝트 완성·보안 검토·GitHub 공개 이후에 진행합니다.
저장소 공개는 웹 서비스 배포나 AWS 작업 활성화를 뜻하지 않습니다.

AWS 역할·API 연동·합성 데이터 전환·비용/종료 경계를 배우려면
[한국어 API/AWS 학습 안내서](docs/API_INTEGRATION_LEARNING_GUIDE_KO.md)를 참고하세요.

종목별 검색 질문을 준비해 **ChatGPT 화면에서 결과를 확인하는 로컬 도구**와,
이벤트 기반 **본인 전용 AWS 학습 구조**를 함께 보존하는 프로젝트입니다.

## 현재 사용 방식 — 2026-10-25 변경

**추가 AWS 학습 기능:** 별도 보호된 로컬 서버에서 고정 합성 QLD 데이터를
실제 Amazon Bedrock(Nova Lite, 도쿄)에 보내고 웹 화면에서 검증 결과를 확인합니다.
시세 API 가입은 필요 없습니다. 세션당 1회 유료 추론·재시도 없음·최대 5분이며,
기존 Fargate 작업은 활성화하지 않습니다. [실행/종료 방법](docs/runbooks/synthetic-bedrock-lab.md).
아래 ChatGPT 검색과 기존 오프라인 모의 화면은 별도 기능으로 유지합니다.

2026-10-31 최소권한 전환 검증 완료: 실행 코드에서 관리자 키를 모델에 전달하는
경로를 제거하고, 임시 모델 전용 역할 1개 → STS 1회 → 로컬 화면 → 역할·스택
자동 삭제로 연결했습니다. 동일 소스의 전체 검증과 실제 영어 합성 분석 1회,
새로고침/재로딩의 재호출 방지, 세션 종료 및 역할 삭제 확인을 통과했습니다.
별도의 제한 역할 분석·만료·다른 역할의 접근 거부·작업 실행 거부도 검증했습니다.
[실제 화면·정리 증거와 한계](docs/evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md),
[현재 완성 범위와 남은 작업](docs/PRIVATE_PORTFOLIO_STATUS.md)을 구분해 참고하세요.

기본 화면에서 종목·언어·가격/시장 개요를 선택 → 질문 복사 → ChatGPT 열기 →
직접 붙여넣고 전송합니다. 결과는 ChatGPT에서 확인하며 이 웹페이지로 가져오지
않습니다. 복사와 열기는 별도 동작이며 질문을 자동 전송하지 않습니다.
자동 복사가 실패하면 표시된 질문을 직접 선택해 복사할 수 있습니다.

AWS 로그인 없이 기본 화면을 열려면 [5분 제한 로컬 실행/종료 안내](docs/runbooks/local-search-preview.md)를
따르세요. 별도 실제 AWS 실습은 자동 시작되지 않습니다.

추가 계정·유료 API·자동 검색 연동 없이 진행합니다. 실시간 가격이나 Google만의
검색을 보장하지 않으며 ChatGPT의 기존 사용 한도는 적용됩니다. SPCX는 종목
식별부터 확인하도록 질문하고 임의 대체하지 않습니다. 기본 화면에는 시세를
표시하지 않습니다. 기존 화면은 별도 버튼의 **로컬 합성 AWS 흐름 모의 실습**입니다.

**변경 이유:** 데이터 표시·AI 이용 권한 검토, 추가 가입과 개인정보 제공,
과금 불확실성 때문에 개인 리서치 목적에 비해 API 연결이 복잡해졌습니다.
AWS 코드와 실습 이력은 유지하며 API 연동 과정은 [한국어 학습자료](docs/API_INTEGRATION_LEARNING_GUIDE_KO.md)에 정리했습니다.
[새 결정과 비용·보안 경계](docs/adr/0019-chatgpt-search-companion.md),
[갱신된 계획](plan.md). 아래 기존 출시/실데이터 연결 기록은 **AWS 학습 트랙의
과거 및 미완료 기록**이며, 현재 기본 제품의 필수 실시간 연동 목표가 아닙니다.

2026-10-25 첫 완성 목표를 **AWS를 실제 사용하는 본인 전용 비공개 실습**으로
결정했습니다. [소유자 접근 설계](docs/adr/0015-owner-only-aws-practice.md)의 controller
접근 제한과 본인 서명 GET·익명 거부는 과거 API 경로의 검증입니다. 현재의 실제
브라우저 분석은 위의 **임시 모델 전용 역할 → 직접 Bedrock 호출** 경로로 검증됐으며,
과거 controller/Fargate 세션 후보를 연결한 것이 아닙니다. 공개 웹 서비스는 목표가
아니며 GitHub 공개는 완성 후 보안·개인정보 검토와 별도 승인 뒤 진행합니다.

같은 날 후속 승인으로 첫 릴리스의 접속 경로를 **본인 PC의 로컬 화면 → 단기
중계 → 실제 AWS IAM API**로 변경했습니다. 도메인 구매나 CloudFront 배포는
필수 단계에서 제외하고 보류합니다. [결정과 신뢰 경계](docs/adr/0017-local-owner-aws-bridge.md).
첫 중계는 catalog/health 2건의 읽기 전용 스냅샷이며 가격·분석 화면의 실제
연결을 뜻하지 않습니다. [운영 절차](docs/LOCAL_OWNER_OBSERVATION.md).

기존 AWS-IAM 비동기 API, DynamoDB job, on-demand Fargate worker와 Twelve Data
경로는 별도의 중지된 학습 트랙입니다. 과거 도쿄 PRICE/ANALYZE 검증과 현재 실습을
혼동하지 않습니다. 기본 검색 화면에는 시세가 없고, 오프라인 모의 화면은 fixture,
별도 4175 실습 화면은 합성 입력을 실제 Bedrock으로 처리한 결과입니다. 현재
브라우저가 기존 시세 API/Fargate 전체 경로를 구동한다고 설명하지 않습니다.

현재 단계와 남은 승인·검증 항목은 [출시 준비 현황](docs/RELEASE_READINESS.md)에 구분해 두었습니다. 과거 클라우드 검증과 오늘의 로컬 검사 결과는 별개입니다.

## 현재 완성된 범위

2026-10-31 기준 **검색 도우미와 본인 전용 합성 AWS 분석의 핵심 경로는 검증됐습니다**.
최종 공개·개인정보·의존성 검토까지 모두 완료됐다는 뜻은 아닙니다. 실제 신규
제한 역할/브라우저 검증은 영어 QLD 1회이고, 과거 다른 언어 호출과 구분합니다.
도메인·공개 호스팅·전체 시세/Fargate 통합은 현재 완성 목표의 필수 조건이 아닙니다.

| 범위 | 구현·검증 상태 |
| --- | --- |
| 현재 기본 제품 | 영어·일본어·한국어, 다섯 종목, 가격/시장 개요 질문 생성·명시적 복사·ChatGPT 수동 전송. 가격과 답변은 이 화면에 가져오지 않습니다. |
| 분리된 로컬 모의 화면 | 비동기 진행·실패·회로 OPEN, 합성 fixture·교육 목적 고지. SPCX는 식별 미확인으로 데이터 없음이며 가격·분석을 만들지 않습니다. |
| 실제 AWS 합성 분석 | 모델 전용 임시 역할과 실제 브라우저로 영어 QLD 합성 분석·중복 호출 방지·종료/삭제를 검증했습니다. 한·일 호출은 이전 인증 경로의 별도 기록이며 신규 경로 전체 언어 검증으로 합산하지 않습니다. |
| AWS 핵심 경로 | IAM 보호 API, Lambda controller, DynamoDB job, on-demand Fargate worker와 Twelve Data/Bedrock 경로를 구현하고 과거 bounded PRICE/ANALYZE를 검증했습니다. |
| 안전 통제 | allowlist·idempotency·조건부 상태 전이·admission limit·launch 보상, 요청/작업/token 상한, 비공개 secret 주입과 역할 분리를 구현했습니다. |
| 운영·호스팅 | S3/CloudFront·관측·sweeper·circuit의 로컬 구성/검증이 있습니다. 실제 공개 호스팅과 남은 운영 실증은 완료되지 않았습니다. |

**현재 보안 검토 주의점:** 승인된 npm 조회에서 개발용 minimatch 두 버전에
중간등급 공지 1건이 확인됐습니다. 선언된 실행 의존성 37개에는 해당 공지의
일치 항목이 없지만, 현재 lint 설정의 경계 검증을 패치나 면제로 취급하지 않습니다.
11월 1일에는 10.2.6에 공식 수정 기반의 호환 패치를 적용하고 전체 로컬 검증을
통과했습니다. 버전 범위 공지와 레거시 3.1.5에 대한 검토는 그대로 보존하며,
이를 모든 의존성의 무결점 보증으로 표현하지 않습니다.
[패치·검증·남은 경계](docs/evidence/MINIMATCH_BACKPORT_2026-11-01.md).
[공개한 정보·검증 범위·미해결 항목](docs/evidence/LINT_ADVISORY_REVIEW_2026-10-31.md).

### 과거 단계별 검증 기록

아래 숫자와 미완료 항목은 각각의 날짜/소스에 대한 기록이며 최신 전체 상태가
아닙니다. 현재 범위는 위 표와 [완성 지도](docs/PRIVATE_PORTFOLIO_STATUS.md)를 따릅니다.

2026-10-24 앞선 코드 검증은 고정 pnpm의 격리된 새 설치에서 전체 **90단계,
1,358개 테스트 중 1,357개 통과·기존 OS 권한 관련 1개 건너뜀**, HTTP 검사
33개를 완료했습니다. 아래의 후속 계약 기반 화면 변경은 그 소스 범위와 별개입니다. 이 결과는
clean Git clone·CI·현재 클라우드 이미지 검증이나 배포·공개 승인이 아닙니다.
[정확한 소스 범위와 안전 종료](docs/evidence/LOCAL_SAFE_STOP_2026-10-24.md).

최근 보강:

- 2026-10-26: 실제 합성 Bedrock 영·일 호출 각각 1회와 종료를 확인했습니다.
  이후 로컬 화면/SPCX 안전 처리·5분 미리보기·미배포 최소 권한 후보까지의
  전체 검증은 90단계, 1,638개 중 1,637개 통과·기존 OS 관련 1개 건너뜀입니다.
  [AWS 실행 증거](docs/evidence/SYNTHETIC_BEDROCK_LAB_2026-10-26.md),
  [화면/종료 검증](docs/evidence/SEARCH_UI_REVIEW_2026-10-26.md).
  당시 관리자 임시 인증을 사용했던 실습과 [이후 제한 역할 전환 작업](docs/adr/0021-synthetic-lab-least-privilege-candidate.md)을 구분합니다.

- 2026-10-25 소유자 전용 전환: controller 코드/설정만 한 번 배포했으며
  작업 생성·표시는 끄고 circuit OPEN을 유지했습니다. 본인 catalog/health와
  익명 403을 확인했으나, 실제 다른 IAM 사용자로 서명한 거부 시험은 남아 있습니다.
  [배포·검증·비용 한계](docs/evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md).
  이후 로컬 세션 후보는 1회용 티켓·5분/64회 읽기 제한·로그아웃·HTTP 경계의
  36개 집중 테스트를 통과했습니다. 이 후보는 배포·브라우저 연결하지 않았습니다.
  도메인은 보유하지 않았고 구매도 보류하므로 TLS를 완화해서 배포하지 않습니다.
  [세션 설계와 남은 보안·비용 게이트](docs/adr/0016-private-browser-session-preparation.md).

- 2026-10-25 로컬 전용: 시세·시간대 검증, 3개 언어 오류 구분과 제출/접수 표시를
  보완했습니다. 오류 표시까지의 소스는 임시 tracked clone의 새 설치에서 90단계·
  1,436개 테스트 중 1,435개 통과·기존 권한 관련 1개 건너뜀입니다. 그 이후
  저장된 내부 오류 문구를 API에 내보내지 않도록 보완했고 별도 전체 검증
  90단계·1,439개 중 1,438개 통과·기존 권한 관련 1개 건너뜀을 확인했습니다.
  이후 분석 카드 본문이 30px로 좁아지는 레이아웃을 수정하고 세 언어의
  좁은 화면을 측정했습니다. 이 CSS 후속 변경은 앞선 전체 검증과 별개이며
  배포하지 않았습니다.
  [정확한 범위와 한계](docs/evidence/LOCAL_ERROR_PRESENTATION_2026-10-25.md).
  [분석 카드 검증](docs/evidence/ANALYSIS_CARD_LAYOUT_2026-10-25.md),
  [직접 따라가는 로컬 Architect 실습](docs/LOCAL_ARCHITECT_WALKTHROUGH.md).
  공백뿐인 필수 분석 문구·출처를 거부하는 후속 계약 수정까지는 현재 설치의
  전체 90단계·1,446개 중 1,445개 통과·기존 권한 관련 1개 건너뜀입니다.
  [마지막 소스 검증과 보안·비용 경계](docs/evidence/LOCAL_BOUNDARY_HANDOFF_2026-10-25.md).

- 2026-10-24 중단 후 종료: 로컬 대기 중지·안전한 데모 job ID 표시와
  시세/시각/freshness 표시 개선을 보존했습니다. 종료 시 타입·lint·빌드 및
  기존 집중 테스트 25개가 통과했습니다. 새 시세 표시의 브라우저 검증과
  전체 회귀 검증은 내일 이어갑니다. 아래 1,414개 전체 검증은 이 UI 변경 전
  소스에 대한 기록입니다. [보존 내용·종료 확인·다음 작업](docs/evidence/LOCAL_UI_INTERRUPTION_SAFE_STOP_2026-10-24.md).

- 2026-10-24 로컬 전용 후속: 선택형 `/http-demo`에서 실제 로컬 HTTP 요청으로
  기존 controller·검증 클라이언트·화면을 연결했습니다. 저장소와 worker는 메모리
  fixture이며 AWS·공급자·모델 호출은 없습니다. 두 서버는 5분 제한이고 배포용
  JavaScript에는 해당 전송 코드가 없습니다. 별도의 임시 Git 사본에서 tracked
  clone과 새 frozen 설치도 검증했습니다. 이는 GitHub 게시나 CI 실행이 아닙니다.
  [실행·종료 방법](docs/LOCAL_HTTP_DEMO.md),
  [정확한 검증 범위와 남은 제한](docs/evidence/LOCAL_HTTP_AND_GIT_PROOF_2026-10-24.md).
  최종 수정본은 새 tracked clone·frozen 설치의 90단계·1,414개 테스트 중
  1,413개 통과·기존 권한 관련 1개 건너뜀이며 로컬 잔여 항목은 0개입니다.
  [안전 종료와 확인 한계](docs/evidence/LOCAL_SAFE_STOP_2026-10-24_HTTP_SESSION.md).

- 2026-10-24 후속: 화면이 메모리 안의 API 형식 응답을 실제 검증 클라이언트로
  확인한 뒤 가격·분석·출처를 표시합니다. 실제 AWS 호출은 없으며, 요청당 한 번
  제출·종목/언어 일치·취소 후 늦은 결과 차단을 검증했습니다. 48개 집중 테스트와
  브라우저 정상 30개·실패 9개 조합이 통과했습니다. 최종 수정본의 새 설치 전체
  검증은 90단계·1,384개 중 1,383개 통과·기존 권한 관련 1개 건너뜀입니다.
  [정확한 구현 및 검증 범위](docs/evidence/CONTRACT_DASHBOARD_2026-10-24.md).
  [후속 최종 소스와 안전 종료](docs/evidence/LOCAL_SAFE_STOP_2026-10-24_SECOND_SESSION.md).

- 2026-10-24: 개발 lint 의존성 Zod의 HIGH 취약점을 검토된 4.6.6으로 수정했고
  npm 재조회는 일치 0건입니다. 운영 의존성은 그대로입니다. 서명 검증 클라이언트의
  JSON·응답 조각·정리 경계와 320 CSS 픽셀 화면의 가로 넘침도 수정했습니다.
  위의 10월 24일 전체 검증에 이 후속 변경도 포함됩니다.
  [정확한 범위와 현재 종료 증거](docs/evidence/LOCAL_SAFE_STOP_2026-10-24.md).

- 지원 frontend build/dev/preview의 네이티브 대체 경로 거부와 자식 환경 정리,
  Vite·Rolldown·Windows binding 선택 파일 11개의 공식 아카이브 바이트 대조.
  [검증 범위와 한계](docs/evidence/FRONTEND_COMPILER_BOUNDARY_2026-10-23.md).
- 취소 신호를 무시하는 전송/응답 읽기에도 API 클라이언트의 로컬 대기를 종료.
  늦은 응답·오류를 재사용하지 않으며 원격 작업·과금 중단은 보장하지 않습니다.
  [대기 종료 검증](docs/evidence/BROWSER_API_DEADLINES_2026-10-23.md).
- 회로·시간 초과·미제공 상태, 일본어 QLD 키보드 흐름과 언어 유지 관측.
  [실제 브라우저 검증 및 미완료 시각 검토](docs/evidence/UI_ACCEPTANCE_2026-10-23.md).

공개 전 남은 주요 조건:

1. 시장 데이터의 공개·파생 데이터 표시 권리와 사용자 API 인증·남용 방어 결정.
2. 호스팅 TLS/인증서/비용 선택, 비공개 origin과 실제 게시·복구 검증.
3. Maintenance IAM의 미해결 허용 대조군과 실제 stale-task 복구·알림 실증.
4. 정확한 배포 이미지의 취약점·출처·native/라이선스 검토와 실제 게시 후보의 clone/CI.
5. 전체 파일·Git 이력의 보안·개인정보·권리 검토 및 완성 후 별도 GitHub 게시 승인.

브라우저는 현재 developer API에 연결하지 않습니다. 2026-10-24 AWS 읽기 전용 확인은
작업/표시 비활성·OPEN/11·실행/대기 작업·서비스·점유 슬롯 0개였습니다.
날짜가 지난 관측을 현재 상태나 계정 전체의 비용 0원 보장으로 재사용하지 않습니다.
[출시 게이트](docs/RELEASE_READINESS.md), [날짜별 상세 증거](docs/evidence/).

## 기술 결정

- 언어: TypeScript 5.9 / Node.js 22
- Frontend: React 19, Vite, 정적 SPA build
- 패키지 관리: pnpm 11 workspace
- AWS Region: `ap-northeast-1` (Tokyo), 각 live 작업 전 account/model availability 재확인
- Bedrock: Tokyo 인리전 Amazon Nova Lite 접근·비용 경계를 제한된 호출로 확인; SDK transport, ECS job lifecycle과 최소 권한 task definition을 로컬 검증 완료
- IaC: AWS CDK(TypeScript), 단 account guardrail 확인 후 단계적으로 추가
- 시장 데이터 후보: Twelve Data는 private development 평가에만 provisional; 현재 개인 요금제로는 공개 live quote 표시를 활성화하지 않음
- Secret store: Standard Parameter Store `SecureString` + ECS execution-role injection; 실제 parameter와 task-start injection을 제한된 cloud acceptance에서 검증

자세한 근거는 [Architecture](docs/architecture.md), [ADR](docs/adr/), [Provider evaluation](docs/provider-evaluation.md)을 참고하세요.

## 로컬 실행

필수 환경:

- 지원 LTS의 보안 기준: Node.js 22.23.4 이상(22.x) 또는 24.22.1 이상(24.x).
  다른 major/prerelease는 별도 검토하며, 최신 보안 공지는 실행 전에 다시 확인합니다.
- pnpm 11.16.0

```text
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:frontend
pnpm demo:search:plan
pnpm demo:search
```

미리보기 준비 메시지 이후 `http://127.0.0.1:4173/`를 엽니다. AWS/provider 인증은
필요 없으며 Enter/stop 또는 5분 제한으로 종료합니다. [종료 확인](docs/runbooks/local-search-preview.md).
소스 수정 중 HMR이 필요할 때만 `pnpm dev`를 사용하고 별도로 종료하세요.

실제 HTTP 직렬화·CORS·polling까지 로컬에서 확인하려면 별도 선택형
[5분 제한 HTTP 데모](docs/LOCAL_HTTP_DEMO.md)를 사용합니다. 기본 화면과
배포용 정적 파일의 기본 기능은 질문 생성이며 AWS API에 연결되지 않습니다.
선택형 모의 화면만 메모리 fixture를 표시합니다.

전체 로컬 검증:

```text
pnpm check
```

개별 lint는 `pnpm lint`를 사용합니다. 고정된 로컬 frontend만 검사하며,
60초 실행 제한과 인증정보 환경변수 제거를 적용합니다. 임의 옵션·자동 수정은
받지 않습니다. 이 보호 조치는 미해결 minimatch 취약점의 수정이나 면제가
아닙니다. [검증 범위와 제한](docs/evidence/LINT_EXECUTION_BOUNDARY_2026-11-01.md)을 확인하세요.

이 명령에는 고신뢰 AWS/GitHub/provider credential 패턴 검사도 포함됩니다. 이는 공개 전 최종 수동 privacy·history 검토를 대체하지 않습니다.

worker의 local fixture 실행 예시는 [services/worker](services/worker/)와 [qld-quote.json](shared/test_fixtures/qld-quote.json)을 사용합니다. 비밀값을 command line이나 fixture에 넣지 마세요.

## 중요 안전 고지

- 모든 분석은 교육 목적이며 금융 자문이 아닙니다.
- 거래 실행, 개인화 추천, 보장 수익 표현을 제공하지 않습니다.
- 화면의 mock 가격은 현재 시세가 아닙니다.
- 실제 데이터에는 source, market timestamp, retrieval timestamp, market state, freshness label이 필수입니다.
- API key 보유 여부와 공개 표시 권리는 별개입니다. 현재 설정은 `internal-development-only`이며 공개 live quote는 강제로 꺼져 있습니다.
- 배포된 API 네 route는 모두 AWS IAM 서명이 필요하며, 브라우저에는 AWS credential이나 서명 코드를 넣지 않습니다.
- `SPCX`는 종목 식별과 공급자 지원이 미확인입니다. 검색 질문은 식별부터 확인하도록
  요청하고 로컬 모의 화면은 `DATA_UNAVAILABLE`로 처리합니다. 과거 catalog/provider
  코드의 발행사·거래소 가정은 현재 사실이나 활성화 근거가 아니며 재배포하지 않았습니다.

## AWS로 넘어가기 전후의 경계

현재 진행 상황과 의도적으로 남겨 둔 외부 gate는 [PRE_AWS_CHECKLIST.md](docs/PRE_AWS_CHECKLIST.md)에 기록되어 있습니다. 공개 API 배포 전에는 [AWS_FIRST_LOGIN_CHECKLIST.md](docs/AWS_FIRST_LOGIN_CHECKLIST.md)의 identity/region/Budget 상태와 provider 표시 권리를 다시 확인합니다.

AWS 리소스를 만들기 전 반드시:

1. account ID, identity, region을 확인합니다.
2. USD 5 Budget과 알림 수신을 확인합니다.
3. root access key가 없음을 확인하고 root를 일상 작업에 사용하지 않습니다.
4. Bedrock model과 market-data provider의 현재 가격·조건을 다시 확인합니다.

## 저장소 구조

```text
frontend/                 다국어 정적 웹 UI와 UI 테스트
services/controller/      API 요청, idempotency, 상태 전이 domain logic
services/worker/          quote/analysis 처리 및 one-shot container
services/operations/      sweeper와 circuit control
shared/                   asset catalog, API schemas, fixtures
infrastructure/           AWS CDK 도입 경계와 환경 구성
docs/                     아키텍처, ADR, 위협·비용 모델, runbook, demo
scripts/                  공용 로컬 검증 도구
```

## 라이선스

MIT License. 시장 데이터와 모델 출력에는 각 공급자의 별도 이용 조건이 적용됩니다.

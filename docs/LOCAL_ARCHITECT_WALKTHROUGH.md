# 로컬에서 따라가는 AWS Architect 실습

> 2026-10-31 경로 안내: 1~5절은 아래 `/http-demo`의 오프라인 비동기 모의 실습에
> 대한 자료입니다. 현재 기본 `/` 화면은 ChatGPT 검색 질문 준비이며, 실제 합성
> Bedrock 실습은 별도 4175 중계를 사용합니다. 마지막 절은 새 최소권한 경로를
> 비용 없이 코드와 기록으로 이해하는 실습입니다. 현재 전체 구분은
> [API/AWS 학습 안내서](API_INTEGRATION_LEARNING_GUIDE_KO.md)를 참고하세요.

2026-10-25 · 약 15~20분 · AWS 로그인, API 키, 배포 없이 진행합니다.
이 문서는 현재 소스의 책임 경계를 이해하기 위한 실습입니다. 실제 AWS 동작·과금·
공개 권리의 검증 결과가 아니며, 아직 배포하지 않은 보완도 포함합니다.

## 1. 무엇이 진짜로 연결되어 있는가? — 3분

[로컬 실행 안내](LOCAL_HTTP_DEMO.md)의 지원 Node와 고정 pnpm 환경에서
먼저 `pnpm demo:local-http:plan`을 실행합니다. 계획 출력만 있고 서버가
시작되지 않는지 확인한 뒤, `pnpm demo:local-http`를 실행합니다.
지원되지 않는 Node 경고가 나오면 기준을 낮추거나 새 도구를 임의 설치하지 말고
기존에 검증된 지원 실행 파일 경로를 사용합니다.

`http://127.0.0.1:5173/http-demo`를 열고 fixture 배너를 확인합니다.

| 화면/경로 | 실제 수행하는 것 | 수행하지 않는 것 |
| --- | --- | --- |
| 기본 `/` 검색 화면 | 선택한 종목/언어의 질문 준비, 사용자가 직접 복사/전송 | 자동 검색, 답변 수집, AWS, 시장 API 호출 |
| 개발 `/http-demo` | loopback HTTP → 실제 handler/controller → 메모리 job | DynamoDB, ECS, Twelve Data, Bedrock |
| 별도 실제 합성 AWS 경로 | 임시 최소권한 역할 → Bedrock 1회 → 정리 | 실제 시세, 이 문서의 오프라인 실습만으로 클라우드 실행 증명 |

개발자 도구 Network에서 로컬 요청을 봐도 좋습니다. 캡처에 계정·토큰·쿠키를
넣지 않습니다. CORS는 브라우저의 교차 출처 규칙이지 사용자 인증이 아닙니다.
loopback 서버를 LAN이나 인터넷에 공개하지 않습니다.

## 2. 접수와 완료는 왜 다른가? — 4분

VOO를 선택하고 Check Price를 한 번 누릅니다. 영어·일본어·한국어 중 하나로
다시 확인해도 됩니다. 합성 worker가 빨라 중간 화면이 눈에 보이지 않을 수 있습니다.

```text
버튼 클릭 → SENDING(응답 전)
         → POST 202 / jobId(접수)
         → GET job 상태 확인
         → 검증된 SUCCEEDED 결과 또는 FAILED/TIMED_OUT
```

202는 계산 성공이 아니라 접수입니다. 화면은 요청 당시 operation/symbol/locale을
기억하고, GET 결과가 그 요청과 일치해야 표시합니다. SUCCEEDED여도 display gate가
결과를 숨기면 가격을 만들어 넣지 않습니다. 오래된 화면의 가격은 새 실패 요청의
결과가 아니며 fixture 표시는 유지됩니다.

다음 두 코드를 비교해 말로 설명해 보세요.

- [요청 세션](../frontend/src/api/job-session.ts): 한 번의 POST, polling,
  취소/시간 제한과 늦은 응답 차단.
- [ControllerService](../services/controller/src/controller-service.ts): 입력·실행
  gate·circuit 확인, job 접수, 최초 생성에만 launch, 안전한 public projection.

## 3. 가격 확인과 AI 분석은 왜 분리하는가? — 3분

QLD Analyze를 실행해 출처·시각·불확실성·교육 목적 고지를 찾습니다.
이 값은 합성 데이터입니다. 실제 시장의 현재 가격이나 투자 추천으로 사용하지 않습니다.

[worker operation](../services/worker/src/worker-operation.ts)에서 PRICE는
검증된 시세 결과를 반환하고, ANALYZE만 시세 검증 뒤 analysis engine으로 진행하는
분기를 찾습니다. 실제 구성에서는 외부 시장 API와 모델 호출의 권한·비용 경계가
다르므로 UI 버튼도 분리합니다. 화면의 Analyze 성공은 오늘 Bedrock 호출 증거가 아닙니다.
SPCX의 실제 공급자 종목 식별이 불확실하면 다른 종목으로 바꾸지 않습니다.

## 4. 중지·중복·회로가 비용을 어떻게 제한하는가? — 5분

화면의 Demo scenarios에서 timeout 또는 circuit-open을 선택해 실행합니다.
정상 시나리오로 돌아가면 새 명시적 요청을 할 수 있지만 자동 재시도는 없습니다.
대기 중지 버튼을 누를 수 있으면 눌러 보세요. 빠른 fixture가 먼저 끝나도 오류가
아닙니다. 중지 테스트를 위해 서버 지연이나 상한을 늘릴 필요는 없습니다.

| 조치/증거 | 의미 | 의미하지 않는 것 |
| --- | --- | --- |
| 대기 중지/탭 닫기 | 로컬 대기·늦은 화면 갱신 중단 | 원격 worker 취소·과금 중단 |
| 같은 key + 같은 요청 재전송 | 기존 job 재사용 | 새 작업 무료 실행권 |
| 같은 key + 다른 요청 | 충돌 거부 | 임의로 다른 종목 결과 재사용 |
| circuit OPEN | 새 admission 차단 | 이미 접수한 작업 강제 종료 |
| job terminal + 정확한 task STOPPED + 소유권 일치 | 조건부 capacity slot 해제의 근거 | 모든 AWS 서비스 비용 0원 |
| TTL | 저장 데이터의 보존 기한 | 정확한 시각의 worker 종료 타이머 |
| Budget 알림 | 비용 인지·대응 보조 | 계정 전체 지출의 절대 상한 |

지원 Node를 사용하는 프로젝트 루트에서 아래 테스트를 실행할 수 있습니다.
주입된 메모리/가짜 sender만 사용하며 AWS 로그인은 필요하지 않습니다.

```powershell
node --import tsx --test services/controller/tests/admission-concurrency.test.ts services/operations/sweeper/tests/slot-reconciler.test.ts services/worker/tests/worker-operation.test.ts
```

입력 20개 중 최대 두 slot만 예약되는 시험, 같은 key의 job 하나 재사용 시험,
task가 RUNNING/UNKNOWN이거나 소유권이 바뀌면 slot을 유지하는 시험을 찾아보세요.
왜 응답이 유실되었다고 무조건 재실행하거나 slot을 비워서는 안 될까요?

## 5. 실습을 안전하게 종료하기 — 2분

시작한 터미널에 `stop`을 입력하거나 Ctrl+C를 누릅니다. owned 서버 두 개의
종료를 확인하고 실습 탭을 닫습니다. 서버는 5분 후 자동 종료되지만 수동 종료를
확인하는 습관이 좋습니다. 다른 앱이 port를 점유하면 그 앱을 임의 종료하지 않습니다.

독립적인 읽기 전용 로컬 점검 명령은 다음과 같습니다.

```powershell
node scripts/local-safe-stop-inventory.mjs --execute-local-read-only
```

`localClosureVerified`와 잔여 count를 확인합니다. 읽기 권한 때문에 실패하면
미확인으로 기록해야 하며 0개라고 추정하지 않습니다. 이 점검의
`cloudSafetyVerified: false`는 의도적입니다. 클라우드는 별도 증거가 필요합니다.

마지막으로 코드를 보지 않고 답해 보세요: “202를 받았는데 왜 다시 조회하지?”,
“브라우저를 닫아도 왜 과금이 남을 수 있지?”, “circuit와 TTL과 slot은 왜 모두
필요하지?” 답이 막히는 항목만 해당 소스·테스트로 돌아가면 됩니다.

이 실습은 사용자의 이해를 위한 선택 항목입니다. 실제 수행·이해 완료로 기록하지
않으며, 공개 데이터 권리·사용자 인증·TLS·운영 IAM·배포·GitHub 공개 게이트도
해제하지 않습니다. [현재 출시 경계](RELEASE_READINESS.md)를 함께 확인하세요.

## 추가: 도메인 없는 본인 전용 AWS 경계 — 선택 5분

현재 선택한 구조는 AWS를 없애는 것이 아닙니다. 화면과 단기 중계만 본인 PC에
두고, 중계가 HTTPS/SigV4로 실제 AWS API에 접근합니다. 다음 세 경계를 구분합니다.

| 경계 | 통제 | 대체하지 않는 것 |
| --- | --- | --- |
| 브라우저 → 같은 PC 중계 | 정확한 loopback, Origin, 단기 capability | 악성 로컬 OS/다른 로컬 사용자 격리 |
| 중계 → AWS API | 서버 측 임시 자격 증명, SigV4, IAM/소유자 제한 | 시세 공급자의 이용권한 |
| AWS controller → worker | 유효기간, circuit, 동시 실행 slot, worker deadline | AWS Budget의 절대 지출 상한 또는 자동 비용 0원 |

이 절의 과거 실제 검증은 catalog/health 조회까지만 포함했습니다. 이후 추가한 작업
미리보기는 합성 데이터만 사용합니다. controller 유효기간 및 환경 변경 계획은
로컬 테스트 후보이며 아직 AWS에 배포하지 않았습니다.

`scripts/local-owner-job-fixture.mjs --execute-local-fixture`를 지원 Node로
실행하면 AWS 로그인 없이 단 한 번 시작, 수동 상태 확인, 새로고침 시 재시작
차단을 관찰할 수 있습니다. 종료는 해당 터미널 Enter 또는 화면 닫기 버튼입니다.
다른 미리보기와 같은 포트 4175를 쓰므로 동시에 실행하지 않습니다.

스스로 설명해 보세요: “유효기간이 끝나도 이미 실행 중인 worker를 왜 별도로
확인하지?”, “응답 유실 후 재시도 대신 기록한 job ID를 먼저 조사하는 이유는?”,
“비공개 화면이면 무료 데이터의 표시·AI 사용 권리도 자동으로 생길까?”
이 선택 실습을 아직 사용자가 수행했다고 기록하지 않습니다.

## 추가: 현재 최소권한 Bedrock 경로를 설명하기 — 비용 없는 10분

2026-10-31에는 새 경로의 실제 영어 합성 분석과 삭제 확인까지 완료했습니다.
아래는 그 증거를 읽는 실습입니다. AWS 로그인·새 역할 생성·모델 요청이 필요하지
않습니다. 반복 시연을 위해 유료 실행을 재시작하지 마세요.

1. [진입 스크립트](../scripts/synthetic-analysis-lab.ts)에서 실제 실행 플래그와
   역할 수명주기 위임을 찾습니다. 실행 플래그 없이 읽거나 계획만 확인합니다.
2. [역할/브라우저 연결부](../scripts/synthetic-restricted-browser-exercise.ts)와
   [중계 구성](../services/local-owner/src/restricted-synthetic-lab.ts)에서 시작만으로
   모델을 호출하지 않는 이유, 종료 시 listener와 lease를 각각 닫는 이유를 설명합니다.
3. [한 번만 실행하는 세션](../services/local-owner/src/synthetic-analysis.ts)에서
   READY → RUNNING 전환, 실패해도 소모되는 allowance, 늦은 응답 차단을 찾습니다.
4. [실제 검증 기록](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md)에서
   화면 CLOSED와 독립적인 역할/스택 삭제 조회가 서로 다른 증거임을 확인합니다.

코드를 덮고 다음 질문에 먼저 답한 뒤, 답을 비교하세요.

| 질문 | 기대하는 핵심 설명 |
| --- | --- |
| 관리자 프로필을 없앤 것인가? | 아니다. 준비 상태 확인과 임시 역할 관리에만 사용한다. 모델 실행은 별도 최소권한 STS lease로 분리한다. |
| 15분·5분·1회가 모두 같은 제한인가? | 아니다. STS 자격정보 수명, 정책의 절대 허용 시간, 애플리케이션 요청 횟수 제한이다. 어느 하나도 계정 전체 금액 상한은 아니다. |
| 화면 새로고침은 왜 무료인가? | 이 실행에서 기존 세션 결과 조회만 했고 모델 요청 수가 늘지 않았다. 앱을 다시 실행하면 새 allowance가 생기므로 무조건 무료라고 일반화할 수 없다. |
| circuit OPEN이면 모든 Bedrock 호출이 막히나? | 아니다. 기존 API/Fargate admission 경로의 회로다. 별도 합성 실습은 자기 역할·정책·세션 통제로 제한된다. |
| 역할을 삭제하고 로그아웃하면 모든 자격정보가 즉시 무효인가? | 그렇게 보장하지 않는다. 정확한 세션 정책 만료, 정리 결과와 독립 조회를 구분하고 다른 세션까지 취소됐다고 주장하지 않는다. |
| 모델 오류 후 무엇부터 하나? | 자동 재시작 대신 안전한 오류 상태와 종료 기록을 확인한다. 이미 접수된 호출은 실패/취소 후에도 과금될 수 있다. |

선택 실습 결과는 본인이 작성한 설명으로 남기면 좋습니다. 이 문서가 존재한다는
이유만으로 사용자의 직접 조작·이해 완료나 공개 승인이 있었다고 기록하지 않습니다.

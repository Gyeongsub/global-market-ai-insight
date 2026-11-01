# API 연동과 AWS 구조 — 현재 프로젝트로 배우는 안내서

2026-10-31 갱신 · 대상: 이 프로젝트를 직접 설명하고 운영하려는 AWS 학습자.
읽기·로컬 테스트는 새 계정이나 API 키 없이 가능합니다. 아래 실습은 제안이며,
사용자가 이미 수행했다는 기록이 아닙니다. 과거 AWS 증거는 당시의 상태입니다.

## 1. API를 없앤 것이 아니라, 책임을 분리했습니다

| 기능 | 지금 사용하는 경로 | 데이터와 과금 경계 |
| --- | --- | --- |
| 현재 시장 정보 조사 | 로컬 질문 생성 → 직접 복사/전송 → ChatGPT | 답변은 ChatGPT에 남음. 이 앱은 검색 API·ChatGPT 세션을 사용하지 않음 |
| 실제 AWS 분석 학습 | 브라우저 → 보호된 로컬 중계 → 도쿄 Bedrock → 브라우저 결과 | 임의 QLD 입력, 세션당 모델 시도 1회. AWS 추론은 과금 대상 |
| 예전 전체 AWS 처리 구조 | API Gateway → Lambda → DynamoDB/ECS → Fargate worker | 코드·배포 기록을 유지하지만, 현재 시세 공급자 작업은 비활성. 새 합성 Fargate 연계로 오해하면 안 됨 |
| 오프라인 모의 화면 | 메모리 fixture와 가짜 작업 상태 | 실제 AWS 성공·가격·과금 증거가 아님 |

이 프로젝트가 방향을 바꾼 이유는 단순히 API 구현이 어렵기 때문만은 아닙니다.
시세를 **받는 권리**, 화면에 **표시하는 권리**, 모델에 **분석 입력으로 보내는 권리**가
같다고 보장할 수 없었습니다. 개인용 화면이라고 계약 조건이 자동 면제되지도 않습니다.
추가 가입·개인정보 제공·예측하기 어려운 비용을 피하면서 AWS 학습을 유지하려고
현재 정보 조사는 ChatGPT, 실제 클라우드 추론은 합성 데이터로 분리했습니다.
참조: [결정 0019](adr/0019-chatgpt-search-companion.md), [결정 0020](adr/0020-synthetic-bedrock-local-lab.md).

## 2. API와 SDK, 인증을 구분하기

- **API**는 프로그램끼리 요청과 응답을 교환하는 약속입니다. 화면의 버튼과 API는
  같지 않습니다. 버튼이 어떤 서버에 무엇을 보내는지 추적할 수 있어야 합니다.
- **SDK**는 API 호출과 서명·응답 처리를 돕는 라이브러리입니다. SDK 사용만으로
  권한, 입력 검증, 재시도 비용, 종료 처리가 자동으로 안전해지지는 않습니다.
- **인증**은 호출자의 신원 확인, **인가**는 그 신원이 특정 행위를 할 수 있는지
  판단하는 과정입니다. 로그인됐다고 모든 동작이 허용되는 것은 아닙니다.
- **CORS**는 브라우저의 교차 출처 응답 접근 규칙입니다. IAM 또는 사용자 인증을
  대체하지 않습니다. 이 중계는 CORS를 열지 않고 정확한 loopback만 받습니다.

현재 [CLI 진입점](../scripts/synthetic-analysis-lab.ts)은 검증 후 임시 분석 전용
IAM 역할을 만들고 STS로 1회 AssumeRole합니다. SDK에는 그 역할의 단기 자격증명만
전달하며, 운영자의 관리자 키를 추출해 전달하는 이전 경로는 제거했습니다.
브라우저에는 AWS 키가 없으며, 로컬 접근용의
무작위 capability만 있습니다. SDK의 대상은 고정된 도쿄 Bedrock HTTPS endpoint입니다.
사용자가 모델·URL·자유 입력을 바꿔 임의 호출을 만들 수 없습니다.

**본인 확인 질문:** Chrome에 로그인했는데 CLI가 실패하는 이유는? 브라우저 세션과
CLI 임시 자격증명은 별도이기 때문입니다. CLI 인증을 연결해도 장기 access key를
만들 필요는 없습니다. MFA 화면이 필요하면 본인이 완료하고 코드나 비밀번호를
대화·문서·소스에 붙여넣지 않습니다.

## 3. 지금 실제 Bedrock 호출을 코드에서 따라가기

```text
실행 전: 동일 소스의 현재/격리 설치 게이트 → 소유자·차단/유휴 상태 확인
  → 임시 역할 생성·정책 검토 → STS 1회 → 남은 5분 인가 구간의 중계
브라우저 명시적 Run 클릭
  → Host/Origin/Fetch Metadata/capability 검증
  → 세션 실행권 1회 소진 (실패도 소진)
  → 고정 합성 QLD + 언어 → Converse
  → 허용된 인사이트 ID와 사용 토큰 검증
  → 앱이 지역화된 교육용 문장 조합 → textContent로 표시
종료: 로컬 요청 취소 → 결과/capability 정리 → 리스너/SDK/역할 자격증명 해제
  → 임시 역할·스택 삭제 → 별도 AWS 조회와 로컬 종료 점검
```

| 읽을 코드 | 설명할 책임 |
| --- | --- |
| [임시 역할 실행 경로](../scripts/synthetic-role-rehearsal-live.ts) | 실행 전 게이트, 소유한 역할의 생성·삭제, 분석용 권한과 운영자 권한 분리 |
| [역할 자격증명 획득](../services/local-owner/src/synthetic-role-acquisition.ts) | 역할 정책 4회 조회, STS 1회, 메모리 lease와 절대 인가 만료 시각 |
| [synthetic-server](../services/local-owner/src/synthetic-server.ts) | 127.0.0.1 전용 HTTP, 동일 출처, 고정 경로, 접근 키, 수명과 요청 수 제한 |
| [synthetic-analysis](../services/local-owner/src/synthetic-analysis.ts) | 고정 입력, 중복 차단, 실패 시 실행권 소진, 결과 보관·해제 |
| [Bedrock adapter](../services/worker/src/providers/bedrock-analysis-adapter.ts) | 제한된 도구 스키마, 출력 검증, 시간 제한, 토큰 사용량 확인 |
| [AWS transport](../services/worker/src/providers/aws-bedrock-converse-transport.ts) | 실제 SDK Converse 호출, SDK 재시도 1 attempt 설정 |
| [browser client](../services/local-owner/src/synthetic-client.ts) | 명시적 실행, 읽기 전용 새로고침, 늦은 응답 무시, 종료 확인의 정직한 표시 |

여기서 모델은 긴 투자 보고서를 자유롭게 쓰지 않습니다. 허용된 ID를 선택하면
앱이 검토된 표현을 조합합니다. 그래서 AWS 추론을 실제 사용하면서도 임의 뉴스·
수익률 전망·매매 권고가 결과로 섞이는 범위를 줄였습니다. `SUCCEEDED`는 이
제한된 계약의 검증 성공이지, 투자 판단의 정확성을 인증하는 표시가 아닙니다.
Converse의 메시지·추론 설정·도구 호출 방식은 [AWS 공식 설명](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)을 참고하세요.

## 4. 왜 예전 구조에는 Lambda와 Fargate가 모두 있었을까?

현재 직접 Bedrock 실습은 비교적 단순한 경로입니다. 기존 이벤트 기반 구조에서는
Lambda가 **접수와 통제**, Fargate가 **한 건의 실제 처리**를 담당합니다.

```text
POST /jobs + Idempotency-Key
  → 요청/소유자/실행 허용 시간/circuit 검증
  → DynamoDB에서 중복·상태·동시 실행권 관리
  → 최초 접수만 ECS RunTask → Fargate worker → 결과 저장 후 종료
GET /jobs/{id} → 처리 상태와 허용된 결과 조회
```

`202 Accepted`는 접수이지 분석 성공이 아닙니다. 새로고침마다 새로운 POST를 보내면
새 컨테이너와 모델 호출이 생길 수 있습니다. 같은 요청의 재전송에는 같은 멱등 키를
사용하고, 동일 키에 다른 본문이 오면 충돌로 거부해야 합니다. GET으로 진행 상황을
확인하는 polling에도 횟수·간격·전체 시간을 제한합니다.

Fargate는 서버 관리 부담을 줄여 주지만, 작업이 멈췄다는 증거까지 대신 만들어 주지
않습니다. 실행 후 종료하는 배치에 standalone task를 사용할 수 있습니다.
[AWS standalone tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/standalone-tasks.html).
이 프로젝트는 상시 ECS Service/ALB를 기본으로 두지 않습니다. 기존 worker의
`APP_ENV=aws`는 여전히 시세 공급자 구성을 요구하므로, 합성 실습을 위해 이것을
무조건 켜면 안 됩니다. [worker 진입점](../services/worker/src/main.ts)을 확인하세요.

## 5. IAM 역할은 ‘누가 무엇을 하느냐’로 나누기

| 주체 | 이 프로젝트에서 맡는 일 | 주면 안 되는 편의 권한의 예 |
| --- | --- | --- |
| Controller Lambda | 제한된 job 저장·조회, 지정 task 실행, 지정 role 전달 | 모든 role에 대한 PassRole, 필요 없는 공급자 비밀 조회 |
| ECS task execution role | ECS/Fargate agent의 이미지 다운로드·로그 전달·구성에 따른 비밀 주입 | 앱의 모든 업무 API 권한을 편의상 모으기 |
| ECS worker task role | 컨테이너 앱의 지정 DynamoDB/Bedrock 작업 | 인프라 배포, 새로운 ECS 작업 실행, 광범위한 IAM 관리 |
| 합성 분석 임시 역할 | 정확한 도쿄 Nova Lite 호출만, 세션 정책의 5분 구간 안에서 허용 | 시세 API 키 조회, ECS 실행, IAM 관리, 다른 모델·리전 호출 |
| 로컬 운영자 | 검증·제한 실습·복구 | 운영자 권한을 브라우저나 공개 앱에 전달하기 |

Task role은 컨테이너 안의 **앱**이 쓰는 권한입니다.
[AWS task role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html).
Execution role은 컨테이너를 실행하는 **ECS/Fargate agent**의 권한이며 앱에 직접
제공되는 task role과 다릅니다.
[AWS execution role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html).

`iam:PassRole`은 지정한 역할을 AWS 서비스에 전달할 권한이지, 그 자체가 모든
역할 권한을 호출자에게 주는 것은 아닙니다. 로컬 코드가 호출 대상과 횟수를
제한해도 기존 관리자 자격증명이 최소 권한으로 변하는 것은 아닙니다. 현재는
운영자 인증을 역할 관리·검증에만 사용하고 분석 SDK에는 별도 역할 인증만 줍니다.
다만 본인 PC에서 운영자 CLI 로그인이 여전히 가능하다는 신뢰 경계까지 없애지는
못합니다. 임시 역할을 쓴다고 PC 자체가 침해돼도 안전하다는 뜻은 아닙니다.

### 15분 인증과 5분 허용 시간, 1회 호출은 서로 다릅니다

- STS가 발급한 자격증명 수명은 이 실습에서 **15분**입니다.
- 그 자격증명에 붙인 세션 정책은 절대 시각 기준 **5분 구간 밖의 작업을 거부**합니다.
  브라우저나 PC 시계만으로 막는 것이 아닙니다. 실제 정상 호출과 구간 후 명시적
  거부를 [별도 시험](evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md)으로 확인했습니다.
- **모델 시도 1회**는 애플리케이션의 제한입니다. IAM이 토큰 비용이나 호출 횟수를
  1회로 계산해 주는 기능이 아닙니다. 새 프로세스를 시작하면 새 허용량이 생깁니다.
- 역할 삭제·CLI 로그아웃·브라우저 로그아웃을 모두 같은 ‘취소’로 보지 마세요.
  받아들여진 모델 작업의 과금을 되돌리거나 모든 발급 인증을 즉시 무효화한다고
  보장하지 않습니다. 종료 후 정확한 리소스 상태도 별도로 확인합니다.

10월 31일에는 이 경로로 영어 합성 분석 1회, 새로고침/재로딩의 재호출 방지,
브라우저 종료와 임시 역할 삭제까지 확인했습니다.
[실제 결과와 한계](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md).

## 6. 나중에 시장 데이터 API를 연결한다면

지금 가입하거나 유료 전환하라는 지시가 아닙니다. 아래는 후속 학습 순서입니다.

1. 제공자가 정확한 종목을 지원하는지 먼저 확인합니다. 특히 SPCX는 이름을 추측해
   SpaceX나 다른 종목으로 바꾸지 않습니다.
2. 호출량·요금 외에 개인 화면 표시, 보관, 모델 입력, 재배포 가능 범위를 구분해
   확인합니다. 무료 계정이라는 이유로 이 권리가 전부 있다고 가정하지 않습니다.
3. 키는 브라우저·소스·Docker image·로그에 넣지 않습니다. 운영 방식에 맞는
   비밀 관리 서비스를 선택하고 값이 아니라 제한된 참조를 배포 구성에 둡니다.
4. 응답의 종목·가격·통화·시점·거래 세션·지연 여부를 정규화합니다. HTTP 200이어도
   잘못된 JSON, 다른 종목, 너무 오래된 데이터이면 성공으로 처리하지 않습니다.
5. 429/5xx/시간 초과를 무제한 재시도하지 않습니다. 이미 접수됐을 수 있는 유료
   요청은 ‘응답을 못 받음’과 ‘실행되지 않음’을 구분합니다.
6. 허용 범위가 확정된 후에만 화면 표시와 AI 입력을 활성화하고, 좁은 검증 후 다시
   차단 상태와 작업 종료를 확인합니다.

예전 실습은 Parameter Store의 SecureString을 이용했습니다. SecureString은 KMS
암호화를 사용하지만 그것만으로 자동 rotation까지 갖추는 것은 아닙니다. 현재
AWS 문서는 API 키 등 비밀에는 Secrets Manager를 권장합니다. 운영 요구와 비용을
검토해야 하며, 이 안내서가 서비스 추가·마이그레이션을 실행하지는 않습니다.
[Parameter Store 공식 문서](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html).

## 7. Architect가 구별해야 하는 네 가지 ‘끝’

| 표시/기능 | 보장 범위 | 보장하지 않는 것 |
| --- | --- | --- |
| 브라우저 대기 취소·화면 정리 | 로컬 표시·대기 중단 | AWS 요청 취소 또는 과금 0 |
| 세션 CLOSED 확인 | 해당 중계의 논리적 세션 종료 | 다른 프로세스·AWS 계정 전체 종료 |
| job terminal + 실제 task STOPPED 확인 | 해당 작업 완료와 컴퓨트 정리 근거 | 저장소·다른 서비스의 비용 0 |
| AWS 콘솔 로그아웃 | 브라우저 세션 종료 | 실행 중인 클라우드 자원의 삭제 |

Circuit OPEN도 **새 작업** 차단입니다. 이미 실행 중인 작업을 모두 죽이는 스위치가
아닙니다. DynamoDB TTL은 데이터 정리 기능이며 정확한 종료 시각을 보장하지 않습니다.
따라서 worker deadline과 정리 로직을 TTL로 대체하지 않습니다.
[DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html).

현재 OPEN인 circuit은 기존 API/Fargate 작업 경로에 적용됩니다. 별도 직접 Bedrock
합성 실습의 모든 호출을 그 circuit이 차단한다고 주장하면 안 됩니다. 직접 실습은
실행 전 차단/유휴 확인, 모델 전용 역할, 세션 정책의 시간 제한, 애플리케이션의
1회 실행권과 종료 절차를 따릅니다. 경로마다 어떤 통제가 적용되는지 구분하세요.

AWS Budgets 알림도 즉시 차단선이 아닙니다. 비용·알림 반영에는 지연이 있고,
알림 전후로도 비용이 누적될 수 있습니다. 이 프로젝트는 호출 수·토큰·실행 시간·
동시 실행 제한과 종료 점검을 함께 사용합니다.
[AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html).

## 8. 직접 해 볼 짧은 실습과 자기 점검

지금 중단하고 조작해야 하는 필수 단계가 아닙니다. 다음에 함께 확인해도 됩니다.

**AWS 로그인 없는 15분 실습**

1. [안전한 로컬 환경 안내](LOCAL_HTTP_DEMO.md)의 지원 Node를 사용합니다.
2. 프로젝트 루트에서 `node --import tsx --test services/local-owner/tests/synthetic-analysis.test.ts services/local-owner/tests/synthetic-page.test.ts`를 실행합니다.
   이 테스트의 transport는 가짜이며 실제 AWS 호출은 없습니다.
3. 테스트 이름에서 중복 실행·시간 초과·늦은 응답·종료 미확인 사례를 찾습니다.
4. `maxAttempts: 1`, `maxOutputTokens: 512`, `lifetimeMs: 300000`이 각각 무엇을
   제한하는지 말해 봅니다. ‘입력 토큰 검증은 호출 후’라는 한계도 설명합니다.

**실제 AWS 실습은 별도**: [runbook](runbooks/synthetic-bedrock-lab.md)에 따라 검증된
소스와 임시 인증으로 단기 중계를 열고 1회만 실행합니다. UI의 토큰 수를 읽은 뒤
종료 버튼, 터미널 종료 기록, 독립 점검을 확인합니다. 새 실습 비용이 생기므로
같은 결과를 보려고 반복해서 서버를 재시작하지 않습니다.

**설명할 수 있으면 좋은 질문**

- 왜 API key를 `.env`에만 넣었다고 충분하지 않을까? 이미지·로그·프런트 번들로의
  복사 경로, 저장소 이력, 실행 중 노출까지 검토해야 하기 때문입니다.
- 왜 임시 자격증명과 로컬 capability가 별개일까? 하나는 AWS 권한이고, 다른 하나는
  해당 로컬 중계 세션 접근용이기 때문입니다.
- 왜 timeout 후 바로 재시도하지 않을까? 첫 요청이 AWS에 수락되어 이미 처리·과금
  중일 수 있기 때문입니다.
- 왜 `SUCCEEDED`가 보여도 원격 종료를 따로 확인할까? 결과 저장과 컴퓨트 종료는
  다른 단계이기 때문입니다.
- 왜 현재 구조를 ‘실시간 주가 분석 웹 서비스’라고 소개하지 않을까? 현재 시세
  조사는 ChatGPT에서, 이 앱의 실제 Bedrock 실습은 합성 입력으로 수행하기 때문입니다.

## 9. 포트폴리오에서 정직하게 설명하기

설명 예: “처음에는 데이터 API와 이벤트 기반 AWS 처리 흐름을 구현·검증했습니다.
이후 개인 학습의 데이터 이용 조건과 비용을 고려해, 현재 정보 조사는 ChatGPT
handoff로 분리하고 실제 AWS 추론 학습에는 합성 데이터를 사용했습니다. 소유자
임시 인증, 출력 검증, 중복 과금 억제와 종료 증거를 우선했습니다.”

아직 끝내지 않은 전체 합성 Fargate 통합·모든 IAM 부정 테스트·모든 운영 경보를
완료했다고 적지 않습니다. [릴리스 상태](RELEASE_READINESS.md)와 날짜가 있는 증거를
대조하세요. GitHub 공개는 완성 후 별도 보안·개인정보 검토 및 사용자 승인 뒤입니다.

## 10. 10월 30일 실습: 성공한 요청보다 거부된 요청을 확인하는 이유

이날은 모델을 호출하지 않고, 임시 최소권한 역할로 가짜 이름의 SSM 파라미터와
ECS 클러스터를 각각 한 번 조회했습니다. 정확한 작업에 대한 명시적 권한 거부를
확인한 뒤 역할과 스택을 삭제하고, 별도의 조회로 잔존하지 않음을 확인했습니다.
[실제 검증 범위와 종료 근거](evidence/SYNTHETIC_READ_DENIAL_2026-10-30.md).

Architect는 다음 세 결과를 구별해야 합니다.

| 관찰 | 확인할 수 있는 것 | 확인할 수 없는 것 |
| --- | --- | --- |
| 요청한 리소스가 없다는 오류 | 그 요청이 찾던 리소스를 얻지 못함 | IAM이 해당 작업을 금지한다는 증거 |
| 정확한 작업의 명시적 AccessDenied | 그 주체·정책·요청·시점에서 권한이 거부됨 | 모든 다른 작업·미래 시점·다른 주체까지 안전함 |
| 단위 테스트에서 가짜 AccessDenied 처리 성공 | 코드가 해당 응답을 안전하게 처리함 | 실제 AWS 정책이 적용됐음 |

SSM 조회는 복호화를 요청하지 않았고 실제 비밀 이름을 사용하지 않았습니다.
ECS 클러스터 조회 거부는 컨테이너 실행인 `RunTask` 거부와는 별개입니다.
따라서 이번 결과만으로 전체 최소권한 전환이 완료됐다고 설명하지 않습니다.

또한 **STS 자격증명의 수명**, **IAM 허용 시간**, **로컬 프로세스 수명**은 다릅니다.
현재 후보는 STS 900초와 세션 정책의 5분 허용 창을 구분합니다. 세션 정책은 역할의
권한과 교집합을 이루며 더 넓은 권한을 추가할 수 없습니다.
[STS 공식 설명](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html).
`aws:CurrentTime` 조건은 AWS 요청 시각을 평가하는 정책 조건입니다.
[IAM 조건 키](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-currenttime).
로컬 타이머가 멈췄다는 테스트나 항상 금지된 SSM 요청의 실패만으로는
이 5분 조건이 실제 AWS에서 작동했음을 증명할 수 없습니다. 10월 30일 당시에는
별도 과제였고, 이후 [10월 31일의 제한된 성공·만료 시험](evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md)에서
같은 모델 작업의 허용 구간 종료 후 명시적 거부를 확인했습니다. 자격정보를 복사하거나
시간을 바꿔 임의로 다시 시험하지 않습니다.

**코드 읽기 자기 점검:** [고정 요청](../services/local-owner/src/synthetic-read-denial.ts),
[응답 판별](../services/local-owner/src/synthetic-denial-evidence.ts),
[자격정보 경계](../services/local-owner/src/synthetic-role-credentials.ts)에서
각각 리소스 이름 고정, 오류 구분, 만료 후 사용 차단을 찾아 설명해 보세요.
파일 읽기에는 AWS 로그인이나 실제 호출이 필요하지 않습니다.

## 11. 외부 API 응답과 앱 내부 계약은 다릅니다

10월 31일의 제한 실습은 HTTP 200을 받았지만, 앱이 예상하지 않은 사용량 필드를
거부해 분석 성공으로 처리되지 않았습니다. 추가 요청은 보내지 않았고 임시 역할을
정리했습니다. 필드의 실제 이름·값은 저장하지 않았으므로 추측해 기록하지 않습니다.
[진단과 로컬 수정 근거](evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

내부 계약은 세 토큰 카운터만 받지만, 외부 서비스는 부가 메타데이터를 반환할 수
있습니다. 공식 SDK와 같은 **명시적 필드 선택**으로 필요한 값만 내부 계약에
전달합니다. 이는 모든 값을 믿는다는 뜻이 아닙니다. 필수 카운터가 없거나 숫자가
잘못됐거나 합계·상한이 맞지 않으면 계속 실패합니다. 응답의 새로운 필드를 코드나
실행 지시로 해석하지 않고, 원문을 브라우저·로그로 그대로 보내지도 않습니다.

**자기 점검:** 같은 응답을 공식 SDK와 자체 HTTP 경로에 넣었을 때 어느 단계에서
달라지는지 비교해 보세요. 고정 fixture를 사용하는 아래 테스트는 실제 AWS를
호출하지 않습니다. 테스트 성공은 실제 IAM 만료 성공과는 별개입니다.

```powershell
node --import tsx --test services/local-owner/tests/synthetic-expiry-response.test.ts
```

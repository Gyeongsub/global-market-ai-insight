# AWS Root 최초 로그인 체크리스트

이 문서는 다음 작업 세션의 순서표다. 코드 배포보다 계정 보호와 비용 경보를 먼저 완료한다.

## 0. 로그인 전

- AWS root 비밀번호, MFA code, account ID, 전체 결제 정보를 화면 공유·채팅·스크린샷에 노출하지 않는다.
- 공식 AWS Console 주소인지 확인한다.
- 이 프로젝트의 기본 region 후보는 Tokyo `ap-northeast-1`이지만 서비스와 model availability를 다시 확인한다.

## 1. Root 계정 보호

- [ ] root에 강력하고 고유한 비밀번호 사용
- [x] root MFA 등록; 가능하면 복구용 두 번째 MFA도 고려
- [x] root access key가 없는지 확인하고 새로 만들지 않음
- [x] primary contact와 복구 이메일·전화 접근 가능 여부 확인
- [x] Billing, Operations, Security alternate contact 확인
- [ ] root는 이 단계 후 일상 작업에서 로그아웃

AWS는 root 사용을 필요한 작업으로 제한하고 MFA를 설정하며 root access key를 만들지 않을 것을 권고한다: [Root user best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html).

## 2. 비용 보호

- [x] Billing preferences와 결제 통화 확인
- [ ] project용 email 수신 주소 확인
- [x] 월 USD 5 cost budget 생성 (`gmai-monthly-cost-5usd`)
- [x] actual 50%, 80%, 100% threshold 구성
- [x] forecast 100% threshold 구성
- [ ] 각 alert의 직접 EMAIL subscriber 주소 확인; SNS를 추가한 경우에만 subscription 확인 링크 처리
- [ ] 가능한 계정이면 CloudWatch billing alarm도 구성
- [ ] Cost Explorer 활성화 여부와 데이터 지연 특성 기록

AWS Budget 생성 화면은 Cost Explorer를 자동 활성화할 수 있고 그래프 표시에는 시간이 걸릴 수 있다: [Creating a budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html).

## 3. 일상용 관리자 접근

- [x] account 형태가 standalone임을 읽기 전용 API로 확인
- [ ] 가능한 경우 temporary credential을 제공하는 federation/IAM Identity Center 사용
- [x] 기존 IAM User workflow의 관리자 콘솔 접근과 MFA 구성
- [x] AWS CLI v2.36.19 현재 사용자 설치 및 실행 확인
- [x] `Administrators` 그룹에 `SignInLocalDevelopmentAccess` 연결
- [x] 장기 access key 없이 `gmai-admin` CLI temporary credential 구성; 종료 시 `aws logout --profile gmai-admin`
- [x] root credential을 CLI에 저장하지 않음
- [x] CLI 인증 후 `aws sts get-caller-identity` 실행; account는 masked 상태로 확인
- [ ] 출력의 Account와 Arn을 화면에 공개하지 않고 project 기록에는 masked 값만 사용

AWS IAM은 사람 사용자에게 federation과 temporary credential을 우선 권고한다: [IAM security best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html). 현재 identity 확인 명령은 [AWS CLI STS example](https://docs.aws.amazon.com/cli/latest/userguide/cli_sts_code_examples.html)을 따른다.

## 4. 배포 전 account/region gate

- [x] account ID를 masked 상태로 확인하고 잘못된 계정이 아님을 확인
- [x] `gmai-admin` 기본 region을 `ap-northeast-1`로 설정
- [x] tag 기본값 결정: `Project=global-market-ai-insight`, `Environment=dev`, `Owner=portfolio-developer`, `ManagedBy=CDK`, `Purpose=portfolio-learning`
- [x] Bedrock model `amazon.nova-lite-v1:0`이 Tokyo에서 활성·접근 가능한지 읽기 전용 API로 확인
- [x] Bedrock 비용 방식을 표준 on-demand로 제한하고 provisioned/reserved capacity를 만들지 않도록 결정
- [x] Nova Lite 인리전 service quota 확인(RPM `20`, TPM `200,000`, 일일 tokens `564,480,001`)
- [x] Fargate On-Demand quota 확인: Tokyo 30 vCPU; application cap은 2 tasks × 0.25 vCPU로 제한
- [ ] circuit를 기본 `CLOSED`로 두되 manual open/reset 절차 확인

## 5. 첫 cloud 작업 순서

1. Budget/notification 증거 저장
2. CLI identity 확인
3. CDK environment configuration 작성(account ID는 commit하지 않음)
4. 최소 networking/ECR/log group stack synth와 정책 검토
5. 실제 생성 전 예상 비용과 삭제 대상을 다시 확인
6. 한 단계씩 deploy, smoke test, Cost Explorer/resource inventory 확인

root 세션에서는 애플리케이션 stack을 배포하지 않는다.

## 6. Bedrock 확인 기록

- 확인일: 2026-08-10
- Region: Tokyo `ap-northeast-1`
- Model ID: `amazon.nova-lite-v1:0`
- 계정 상태: agreement `AVAILABLE`, authorization `AUTHORIZED`, entitlement `AVAILABLE`, region `AVAILABLE`
- 표준 온디맨드 단가: input USD 0.000072 / 1K tokens, output USD 0.000288 / 1K tokens
- 성공한 inference: 2026-08-22 bounded smoke test 1회; input `167`, output `256`, total `423` tokens, 계산 비용 USD `0.000085752`
- 2026-08-19 quota 재확인: 인리전 RPM `20`, TPM `200,000`, 일일 합산 tokens `564,480,001`; model `ACTIVE`, `ON_DEMAND` 지원
- 상세 비용 상한과 테스트 조건: `docs/BEDROCK_ACCESS_AND_COST.md`

2026-08-10 사용자 승인 후 smoke test를 요청했으나 계정별 Nova Lite on-demand requests/minute, tokens/minute, tokens/day가 모두 0이어서 `ThrottlingException`으로 처리 전에 거부되었다. 성공한 inference와 token usage는 없다. 실제 세 언어 평가 항목은 할당량이 제공될 때까지 완료 처리하지 않는다.

확인 작업 종료 후 `gmai-admin`의 cached CLI login credential을 로그아웃했다.

2026-08-19 quota 재확인도 읽기 전용으로 종료했으며 inference를 실행하지 않았다. Support 회신의 RPM `40`, TPM `400,000`은 cross-region 값이고, 프로젝트가 사용할 Tokyo 인리전 값도 요청치를 충분히 초과한다. 다음 작업은 별도 비용 재승인 후 bounded smoke test 1회다.

2026-08-22 별도 비용 승인을 받은 bounded smoke test 1회가 성공했다. 다만 `max_tokens`에서 종료되어 JSON이 완성되지 않았으므로 실제 세 언어 구조화 출력 평가는 별도 게이트로 남긴다. 호출 직후 `gmai-admin` cached CLI login credential을 로그아웃했다.

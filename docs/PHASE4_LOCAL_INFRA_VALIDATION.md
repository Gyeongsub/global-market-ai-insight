# Phase 4 local infrastructure validation

검증일: 2026-08-10 (Asia/Tokyo)

## 완료 범위

AWS 호출이나 resource 생성 없이 TypeScript CDK 코드, CloudFormation 합성, 비용·보안 assertion을 로컬에서 검증했다.

- `aws-cdk-lib`: 2.263.0
- `aws-cdk` CLI: 2.1135.1
- `constructs`: 10.8.1
- Region allowlist: `ap-northeast-1`
- Environment allowlist: 단일 `dev`
- 전체 `pnpm check`: 통과
- Infrastructure assertions: 4/4 통과
- Foundation-only synth: 통과
- Foundation+Compute synth: 로컬 placeholder digest로 통과

placeholder digest는 템플릿 경로 검사에만 사용했으며 AWS에 배포하거나 ECR에 push하지 않았다. 실제 Compute 합성은 ECR에서 확인한 `sha256:<64 hex>`가 있어야 한다.

## FoundationStack

- ECR repository 1개
- scan-on-push 활성
- image tag immutable
- 최신 image 3개만 보관하는 lifecycle rule
- AES-256 service-managed encryption
- worker CloudWatch log group 1개
- log retention 7일
- 단일 disposable dev stack teardown 시 repository image와 log group 삭제

## ComputeStack

- public subnet 2개, 최대 2 AZ
- NAT Gateway 0개
- ECS cluster 1개, 초기 Container Insights 비활성
- Fargate task definition 1개: 0.25 vCPU, 512 MiB, Linux/amd64
- ECR image는 mutable tag가 아니라 digest로 참조
- container user `65532:65532`
- read-only root filesystem
- inbound rule과 port mapping 없음
- outbound는 HTTPS와 VPC DNS만 허용
- ECS Service 0개
- ALB/listener 0개

Phase 4 smoke task는 task definition에 포함된 비민감 QLD local fixture를 사용한다. 수동 `RunTask` override는 `JOB_ID`만 전달한다. 실제 provider key, Bedrock permission, DynamoDB permission은 이 단계에 넣지 않는다.

## 자동 차단 규칙

다음 설정은 config parser가 거부한다.

- Tokyo 이외 region
- `dev` 이외 environment
- 이메일 또는 placeholder owner tag
- `enableNatGateway=true`
- `enableAlb=true`
- `enableEcsService=true`
- mutable image tag 또는 잘못된 image digest
- 범위를 벗어난 timeout, TTL, active-job cap, token cap
- 알 수 없는 config key

## 아직 실행하지 않은 AWS 변경

다음은 별도 사용자 승인 전까지 금지된 cloud gate다.

1. CDK bootstrap resource 생성
2. FoundationStack deploy
3. ECR 인증과 image push
4. ECR scan 결과 확인 및 실제 digest 조회
5. ComputeStack deploy
6. 단 한 번의 bounded Fargate `RunTask`
7. CloudWatch log, stopped task, resource inventory와 비용 확인

Docker Hub 로그인은 필요하지 않다. ECR push 시에는 장기 Docker 계정이 아니라 AWS CLI가 발급하는 단기 ECR 인증 토큰을 사용한다. 이 인증과 push도 승인 이후에만 수행한다.

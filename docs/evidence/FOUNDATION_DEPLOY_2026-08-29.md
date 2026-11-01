# FoundationStack deployment evidence — 2026-08-29

## Scope and authorization

- Stack: `global-market-ai-insight-dev-foundation`
- Region: `ap-northeast-1`
- Identity: temporary `gmai-admin` CLI login for `aws-admin-user`
- Authorization: explicit user approval after a three-resource `cdk diff`
- Compute stack, image push, task launch, provider call, and Bedrock call: excluded

## CloudFormation result

- Status: `CREATE_COMPLETE`
- Stack termination protection: disabled for the disposable `dev` environment
- Resource types: one ECR repository, one CloudWatch Logs log group, one DynamoDB table, plus CDK metadata

## ECR verification

- Repository: `global-market-ai-insight-dev-worker`
- Tag mutability: `IMMUTABLE`
- Scan on push: enabled
- Encryption: `AES256`
- Lifecycle: retain only the three newest images
- Current image count: `0`

## CloudWatch Logs verification

- Log group: `/aws/ecs/global-market-ai-insight-dev/worker`
- Retention: `7` days
- Stored bytes: `0`

## DynamoDB verification

- Table: `global-market-ai-insight-dev-jobs`
- Status: `ACTIVE`
- Billing: `PAY_PER_REQUEST`
- Encryption: enabled with AWS-managed KMS encryption
- TTL: enabled on `expiresAt`
- Current items: `0`
- Current table bytes: `0`
- Deletion protection: disabled to match explicit disposable-dev teardown

## Cost and security boundary

- USD 5 Budget remained active.
- Immediate Budget reading: actual USD `0.0`, forecast USD `0.004`.
- The stack contains no VPC, NAT Gateway, ALB, ECS Service, running task, Lambda, API Gateway, or public endpoint.
- No secret value was read, logged, or written to the synthesized template.
- `RemovalPolicy.DESTROY` and ECR `emptyOnDelete` are intentional for the single dev environment; preserve non-sensitive evidence before final teardown.

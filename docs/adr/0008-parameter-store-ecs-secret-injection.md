# ADR 0008: Standard Parameter Store SecureString with ECS injection

- Status: Accepted and verified for the first private dev workflow
- Date: 2026-08-23
- Verification update: 2026-08-30

## Decision

Store the market-provider API key as one **Standard-tier AWS Systems Manager Parameter Store `SecureString`** under `/global-market-ai-insight/dev/market-data/api-key`. Use the AWS-managed `alias/aws/ssm` key for the first low-volume dev release and inject the value into the one-shot container as `TWELVE_DATA_API_KEY` through the ECS task definition.

The CDK application imports only the parameter name. It does not create the `SecureString`, accept its value as configuration, or place the value in source, CloudFormation, container layers, task overrides, logs, or outputs. Parameter creation or rotation is a separate operator action after AWS identity, Region, provider terms, and cost approval are confirmed.

## IAM boundary

- ECS execution role: exact ECR repository, worker log group, and exact parameter `ssm:GetParameters` access.
- ECS worker task role: exact jobs table `GetItem`/`UpdateItem` and exact Nova Lite foundation-model `InvokeModel`; no SSM, `ecs:RunTask`, or `iam:PassRole`.
- Controller role: exact jobs table operations, exact task definition `ecs:RunTask`, and exact execution/task roles `iam:PassRole` with `iam:PassedToService=ecs-tasks.amazonaws.com`; no provider-secret or Bedrock access.
- No `kms:Decrypt` permission is added because the first release uses the AWS-managed Parameter Store key. A customer-managed key would require a separate cost/security decision and a narrowly scoped permission update.

## Why

- One short text API key fits the Standard tier and does not need automatic rotation in the first portfolio release.
- ECS injection keeps secret retrieval in the ECS agent boundary and prevents the application role from enumerating or retrieving Parameter Store values.
- Every job is a new one-shot task, so a rotated parameter value is obtained by subsequent tasks without maintaining an always-on service.
- AWS CDK cannot create a `SecureString` value directly without introducing an external secret-input workflow; importing an operator-created parameter keeps plaintext out of IaC artifacts.

## Cost and limitations

At the 2026-08-23 review, Standard parameters and standard-throughput interactions have no additional Parameter Store charge. AWS KMS usage can still be relevant, and pricing must be rechecked before creation. Advanced tier, higher throughput, a customer-managed KMS key, or Secrets Manager are not enabled.

Environment variables are readable by code running in the container. The image, dependencies, logs, error handling, and task permissions therefore remain part of the secret boundary. The value must be rotated immediately if exposure is suspected.

## Verification status

Local CDK assertions prove policy separation, the exact parameter reference,
secret injection, and the absence of secret plaintext. The operator later
created the SecureString outside IaC, and the 2026-08-30 one-shot worker
acceptance successfully reached the provider through the deployed task
definition without printing the value. The evidence records behavior and
sanitized outcomes, not the secret or a fresh rotation check. Revalidate the
parameter and rotate it if exposure is suspected. See
[the bounded worker acceptance](../evidence/CLOUD_WORKER_ACCEPTANCE_2026-08-30.md).

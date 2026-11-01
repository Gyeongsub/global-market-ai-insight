# CDK bootstrap evidence — 2026-08-29

## Scope and authorization

- Target: the masked standalone project account in `ap-northeast-1`
- Identity: `aws-admin-user` through the temporary `gmai-admin` AWS CLI login
- Authorization: explicit user approval for `CDKToolkit` bootstrap only
- Long-lived access key: not created or used
- External trusted deployment/lookup accounts: none
- Customer-managed KMS key: not requested or created
- Termination protection: enabled

## Result

`CDKToolkit` reached `CREATE_COMPLETE` with bootstrap template version `32`.

| Resource type | Count | Verification |
|---|---:|---|
| `AWS::S3::Bucket` | 1 | all four public-access blocks enabled; KMS-backed server-side encryption; no objects observed |
| `AWS::S3::BucketPolicy` | 1 | `CREATE_COMPLETE` |
| `AWS::ECR::Repository` | 1 | zero images |
| `AWS::IAM::Role` | 5 | `CREATE_COMPLETE` |
| `AWS::IAM::Policy` | 2 | `CREATE_COMPLETE` |
| `AWS::SSM::Parameter` | 1 | bootstrap version only; not a secret |

The standard template reported its default `AdministratorAccess` CloudFormation execution policy. This broad permission belongs only to the deployment boundary; it is not an application runtime role. Future deployments must continue to use reviewed CDK templates, explicit user approval, and separate least-privilege controller, execution, and worker roles.

## Cost and workload boundary

- USD 5 monthly Budget remained active.
- Immediate Budget reading: actual USD `0.0`, forecast USD `0.004`.
- No project VPC, NAT Gateway, ALB, ECS service/task, DynamoDB table, Lambda, API Gateway, frontend bucket, or market/Bedrock call was created or run.
- The bootstrap S3 bucket was empty and the ECR repository contained zero images at verification time.

## Teardown note

The bootstrap stack is protected from accidental deletion. Final account cleanup must first confirm that no CDK-managed project depends on `CDKToolkit`, then explicitly disable termination protection before deleting it. Do not remove the stack during ordinary project-stack teardown.

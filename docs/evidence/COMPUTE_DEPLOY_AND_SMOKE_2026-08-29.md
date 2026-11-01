# Compute deploy and bounded Fargate smoke evidence — 2026-08-29

## Deployment

- `global-market-ai-insight-dev-compute`: initially `CREATE_COMPLETE`, then
  `UPDATE_COMPLETE` after the approved network-boundary refinements.
- Foundation was updated only to publish cross-stack exports.
- Compute resources include a two-AZ public-subnet VPC, internet gateway,
  ingress-free worker security group, ECS cluster, 0.25 vCPU / 512 MiB Fargate
  task definition, and separated execution/task/controller roles.
- There is no NAT Gateway, ALB, ECS Service, listener, or inbound rule.
- The task definition uses the immutable ECR digest, non-root user
  `65532:65532`, a read-only root filesystem, and the Parameter Store secret
  name rather than its value.
- A pre-deploy CDK diff revealed that the L2 Parameter Store secret helper
  automatically broadened SSM read permissions. The implementation was changed
  before deployment so the execution role has exactly `ssm:GetParameters` for
  the project parameter.

## Initial bounded smoke attempt

- Exactly one `QLD` / Korean `ANALYZE` task was launched.
- ECR pull, Parameter Store injection, container start, and CloudWatch logging
  succeeded.
- The worker failed before claiming the DynamoDB job, so Twelve Data and
  Bedrock were not called.
- The task stopped with exit code `1`; the sanitized worker error was
  `INTERNAL_ERROR / Worker repository operation failed`.
- The queued test record was conditionally moved to `FAILED` with version `2`.
- Running ECS task count after cleanup: `0`.

## Diagnosed network boundary

The same bundled repository code loaded the job successfully through the local
temporary AWS session, and IAM simulation allowed the task role's exact
`dynamodb:GetItem` and `dynamodb:UpdateItem` actions. The task ENI was also
reported as connected.

AWS documents that ECS injects `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` and AWS
SDKs retrieve task-role credentials from the link-local endpoint
`169.254.170.2`. The original egress-only security group allowed HTTPS and DNS
but not that internal HTTP credential endpoint. The stack was updated with one
additional rule only:

- destination `169.254.170.2/32`
- TCP port `80`
- description `ECS task-role credential endpoint only`

External HTTP remains blocked. The update diff contained only this security
group egress rule and the stack reached `UPDATE_COMPLETE`.

Reference: <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-iam-roles.html>

## Approved retest and refined diagnosis

After separate approval, exactly one second `QLD` / Korean `ANALYZE` task was
launched. It reproduced the same pre-provider repository failure and was moved
conditionally from `QUEUED` to `FAILED`. Twelve Data and Bedrock were again not
called, and the running ECS task count returned to `0`.

Additional read-only evidence narrowed the failure further:

- CloudTrail recorded successful `AssumeRole` events for the worker task role.
- CloudTrail recorded `assignPublicIp=ENABLED` and task count `1` for the retest.
- IAM simulation allowed the exact DynamoDB `GetItem` and `UpdateItem` actions.
- The stored job decoded successfully using the exact deployed worker bundle
  from the local temporary AWS session.
- The Fargate task failed within the initial DynamoDB access path, before any
  provider or model call.

The link-local credential endpoint rule did not change the outcome. AWS Fargate
manages that endpoint separately, so this rule should be removed rather than
retained without evidence.

## Approved DynamoDB gateway endpoint refinement

The user separately approved removal of the unsupported link-local security
group rule, addition of a DynamoDB **gateway** VPC endpoint, deployment, and one
last bounded task. The CDK diff contained only that removal and the new endpoint.

The deployed gateway endpoint:

- is `available` in `ap-northeast-1`;
- is attached to both worker public-subnet route tables;
- has an endpoint policy whose principal is the exact worker task role;
- permits only `dynamodb:GetItem` and `dynamodb:UpdateItem` on the exact jobs
  table; and
- has no additional endpoint charge according to the AWS gateway endpoint
  documentation.

Reference: <https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html>

The link-local TCP/80 security-group rule is no longer present. The compute
stack reached `UPDATE_COMPLETE` after deployment.

## Final approved bounded retest

- Exactly one third task was launched for job
  `gmai-smoke3-20260829135226`.
- ECR pull, Parameter Store injection, task-role assumption, container start,
  and CloudWatch logging succeeded.
- The task again failed within about one second with the intentionally
  sanitized `INTERNAL_ERROR / Worker repository operation failed` message.
- The DynamoDB record remained `QUEUED`, so no successful job claim occurred.
- Twelve Data and Bedrock were not called.
- The record was conditionally moved to `FAILED` with
  `INFRASTRUCTURE_SMOKE_FAILED` and version `2`.

The gateway endpoint therefore improved the network boundary but did not by
itself resolve the repository startup failure. Because the current image hides
the underlying AWS SDK failure category by design, the remaining evidence does
not distinguish among credential-provider initialization, DNS/endpoint
resolution, network timeout, or another pre-request SDK configuration problem.
It would be inaccurate to claim cloud acceptance at this point.

## Approved safe diagnostic image

The user approved the bounded diagnostic scope. Repository failures are now
mapped from error `name`/`code` only into a small allowlist. Raw error messages,
stacks, credentials, URIs, request headers, and secret values are never copied
to the worker log. Regression tests include credential-like and private URL
strings and prove they are absent from the sanitized result.

- Service and contract tests: `49/49` passed.
- Infrastructure assertions: `5/5` passed.
- Frontend contract tests: `4/4` passed.
- Full typecheck, bundle, local one-shot smoke, lint/build, license gate, and
  high-confidence secret scan passed; secret findings: `0`.
- Local image: `linux/amd64`, `65532:65532`, `54,834,186` bytes; network-none,
  read-only, capability-drop, no-new-privileges fixture smoke passed.
- ECR tag: `worker-20260829-db9a51e2e122`.
- OCI index digest:
  `sha256:df457494598e5cc552d15e2a95e2e01f4ded697af093c42b209048d23cb5bec1`.
- Runtime manifest digest:
  `sha256:e67c297e5499bcbb264ed8764bece02c72a3e013ee732fa7f5d6d25cd3a1c7f5`.
- ECR Basic scan: `COMPLETE`, no finding severity counts reported.

The pre-deploy CDK diff contained only the task-definition image replacement
and the controller's exact `ecs:RunTask` ARN following the new revision. The
ComputeStack then reached `UPDATE_COMPLETE` with task-definition revision `2`.

## Bounded expired-job diagnosis and root cause

Exactly one already-expired diagnostic job and one Fargate task were created.
The task started with the new image, did not claim the job, and emitted only:

```text
INTERNAL_ERROR / REPOSITORY_ACCESS_DENIED / Worker repository operation failed.
```

The task exited `1`; Twelve Data and Bedrock were not called. The queued record
was conditionally changed to `FAILED` with version `2` and
`INFRASTRUCTURE_DIAGNOSTIC_ACCESS_DENIED`. Running task count returned to `0`.

The deployed worker role identity policy and IAM simulation both allowed exact
`GetItem`/`UpdateItem` on the exact table. AWS documentation identifies the
endpoint-policy mismatch: a **gateway** endpoint policy requires `Principal` to
be `*`; the permitted caller must instead be restricted with the
`aws:PrincipalArn` condition. The earlier direct role ARN in `Principal` caused
the endpoint denial.

Reference: <https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-access.html#vpc-endpoint-policies-principals>

The CDK policy was corrected to:

- `Principal: *` as required for a gateway endpoint;
- `StringEquals aws:PrincipalArn` equal to the exact worker task-role ARN;
- exact jobs table resource; and
- only `dynamodb:GetItem` and `dynamodb:UpdateItem`.

This does not grant other VPC principals access because the principal condition,
identity policy, resource, and action restrictions are all still required. The
policy-only CDK diff was reviewed, the stack reached `UPDATE_COMPLETE`, and the
deployed endpoint is `available` with the expected policy.

## Next approval gate

Endpoint-policy updates can take a few minutes to become effective. After that
propagation period, cloud acceptance requires one more already-expired job and
exactly one Fargate task. Success means DynamoDB changes the record to
`TIMED_OUT/JOB_DEADLINE_EXCEEDED` before Twelve Data or Bedrock is called. This
is a new cost-bearing task and therefore remains a separate approval gate.

Post-cleanup observations: running ECS tasks `0`; Budget limit USD `5.0`, actual
USD `0.0`, forecast USD `0.003`; both Foundation and Compute stacks are
`UPDATE_COMPLETE`; the DynamoDB gateway endpoint is `available` on two route
tables (billing data can be delayed).

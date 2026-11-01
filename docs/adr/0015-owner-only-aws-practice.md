# ADR 0015: Owner-only AWS practice, publication deferred

Status: Target accepted by the user on 2026-10-25 (Tokyo). Controller access
hardening is deployed and owner GET/anonymous rejection verified; signed second
principal and private browser acceptance remain incomplete. See the
[bounded deployment evidence](../evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md).
This supersedes the earlier local-only work restriction, not the
security, cost or data-rights controls.

## Decision

Use real AWS for private, single-owner learning, not an anonymous financial-data
service. Preserve on-demand Fargate, three languages, circuit, timeouts and
bounded acceptance. Do not add Cognito, WAF, domains, ALB, NAT Gateway or persistent
ECS services incidentally. Autonomous in-scope implementation is authorized;
purchases, vendor contact, public redistribution and GitHub pushes are not.

GitHub remains a later, separately reviewed source/documentation publication.
Publishing code does not require publishing an AWS endpoint or market data.

## Authentication boundaries

1. Preserve AWS_IAM on all four HTTP API routes. API Gateway verifies SigV4 and
   invocation permissions. IAM alone does not select one owner from all valid
   permitted identities.
2. The AWS controller factory adds an exact-owner check before routing, reading
   request content, querying jobs/circuit, writing state or launching a task. It
   uses only gateway v2 `requestContext.authorizer.iam.userArn` and account fields,
   never headers/body. Another user/account, root, assumed-role identities and
   JWT/Lambda authorizer contexts are rejected.
3. Optional infrastructure `ownerIamUserName` selects one IAM user in the
   deployment account through `PRIVATE_OWNER_USER_ARN`. The example omits it:
   missing configuration denies every request. Runtime validation binds the ARN
   to the workload account/partition. Deployment must match a fresh STS identity,
   not infer a principal from an owner tag or email.
4. Production has no anonymous-mode switch. Credential-free local fixture
   handlers are separate and do not prove AWS authentication.
5. AWS/provider credentials never enter the browser. Initial cloud use remains
   signed operator acceptance. A private browser access mechanism is still
   required for the completed UI; do not remove IAM or inject keys to connect it.

An administrator/root can change code/policies or directly invoke Lambda with a
fabricated event. This check does not sandbox privileged administrators. Preserve
MFA and short-lived sessions; exact ARN matching is not per-request MFA proof.
Recreated users or role migration require fresh review.

## Hosting and rights

The CloudFront fixture draft stays disabled and undeployed. A private S3 origin
is not private viewer access. Before hosting, prove unsigned, expired and
unauthorized access is rejected on HTML, assets and API paths. Neither an obscure
URL nor CORS is authentication. Signed URLs/cookies are bearer access, not proof
of personal identity, and need an issuance/expiry/threat-model design.

External live-data display is no longer part of the private milestone. Personal
use still does not establish every provider entitlement. Current Twelve Data
guidance describes individual educational/development use but omits the older
Basic tier from its individual heading and separately discusses internal AI use.
Account-specific free-plan display/AI-processing rights remain unverified. Keep
public display false; AI summaries do not erase provider restrictions. No plan
upgrade, agreement or vendor inquiry is made.

## Acceptance sequence

- Refresh identity, budget, ownership and IAM routes; verify jobs/display disabled,
  OPEN circuit, zero tasks/services/occupied slots.
- Pass owner rejection/configuration tests, full regression and exact controller/
  IaC review. An older bundle's proof does not cover new source.
- Deploy only the reviewed controller/configuration change, keeping admission and
  display disabled. Verify owner catalog/health and anonymous/non-owner rejection.
- Advance private browser access and personal provider entitlement without public
  exposure. Workload execution needs current image/cost evidence, one bounded job
  and recovery; verify STOPPED and restore gates afterward.
- Verify safe stop independently. Retained ECR/S3/log/DynamoDB storage can cost;
  private access and a USD 5 alert are not billing caps.

## Primary sources checked 2026-10-25

- [AWS HTTP API IAM](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control-iam.html):
  SigV4/execute-api permissions are required; HTTP APIs do not support resource
  policies. This owner check is an application decision, not a resource policy.
- [AWS Lambda event definitions](https://github.com/aws/aws-lambda-go/blob/main/events/apigw.go):
  IAM account/userArn context shape. No implementation code was copied.
- [Twelve Data usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage):
  informs the limited rights discussion, not account-specific legal approval.

Related: [API decision](0009-controller-idempotency-and-api-exposure-gate.md),
[hosting draft](0011-fixture-frontend-hosting-preparation.md),
[release gates](../FRONTEND_RELEASE_GATES.md).

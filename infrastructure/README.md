# Infrastructure boundary

2026-09-06 update deployed: Compute now uses `MAX_ACTIVE_JOBS=2`, persistent circuit reads, keyed controller transaction permissions and worker control-key exclusion. Missing circuit state fails OPEN. The prior `dynamodb:TransactWriteItems` IAM action is replaced with constituent actions and enclosing-operation conditions. No operations schedule was created. Access Analyzer found no policy issue, but the real ConditionCheck transaction remains a separately bounded acceptance gate because IAM simulation did not match that one statement. See [guard review](../docs/evidence/PHASE7_GUARD_REVIEW_2026-09-06.md).

AWS CDK with TypeScript is the selected IaC tool. The implementation covers the Phase 4 ECR/log/DynamoDB foundation, one-shot ECS/Fargate, Phase 5 IAM/secret injection, and the Phase 7 Lambda/API definition. No command in the normal local check deploys AWS resources.

## Planned stack boundaries

1. `FoundationStack`: tags, log groups, ECR, DynamoDB
2. `ComputeStack`: VPC/public subnets, security group, ECS cluster/task definition, controller Lambda
3. `ApiStack`: API Gateway routes, CORS, throttle
4. `FrontendStack`: private S3, CloudFront OAC, security headers
5. `OperationsStack`: opt-in dashboard/basic alarms; separately cost-gated custom metric alarms and encrypted topic draft without a subscription
6. `MaintenanceStack`: separately gated local handler/IAM and disabled EventBridge rule draft; not deployed
7. `AlarmCircuitStack`: separately cost-gated exact-alarm EventBridge/Lambda path that can only move the circuit to OPEN; not deployed

Cross-stack exports must be minimal. Runtime roles remain separate from the deployment role.

## Deployment stages

- `local`: no AWS resources
- `dev`: one low-cost portfolio environment
- Phase 13 lab: separate stack and name prefix; never part of main `dev`

Account IDs, role ARNs, secret values and generated CDK context containing identifiers are not committed. `environments/dev.example.json` documents only safe configuration keys.

## Implemented Phase 4–5 boundary

`FoundationStack` contains:

- one immutable ECR repository with scan-on-push
- an image lifecycle rule retaining three images
- one worker log group with seven-day retention
- one on-demand DynamoDB jobs table with AWS-managed encryption and TTL
- destroy/empty-on-delete behavior for the single disposable dev environment

`ComputeStack` is synthesized only after `GMAI_WORKER_IMAGE_DIGEST=sha256:<64 hex>` is supplied. It contains:

- a two-AZ public-subnet VPC with zero NAT gateways
- an ECS cluster with Container Insights disabled initially
- a security group with no ingress and only HTTPS plus VPC DNS egress
- one 0.25 vCPU / 512 MiB production one-shot Fargate task definition
- no ECS Service, ALB, listener, NAT Gateway or inbound port

The production task definition adds no secret value to IaC. It references the safe name `/global-market-ai-insight/dev/market-data/api-key` and injects the operator-created Standard Parameter Store `SecureString` at task launch. The task receives `JOB_ID` only through the controller override.

Role boundaries are explicit:

- execution role: exact ECR/log/Parameter Store resources needed by the ECS agent
- worker task role: exact DynamoDB read/update and Nova Lite invocation; no secret-read, task-launch, or role-pass permission
- controller role: exact job-table transaction/read/update, task launch, and narrowly conditioned PassRole; no provider secret or Bedrock permission

The previous Phase 4 local fixture remains available for Docker-only validation. The synthesized Fargate definition is now the AWS-mode task and must not be launched until its parameter, image digest, queued job, provider approval, and bounded smoke-test cost are verified.

## Implemented Phase 7 local boundary

`ComputeStack` now packages a Node.js 22 Lambda controller with 128 MiB memory, a 15-second timeout, no VPC attachment, and a pre-created seven-day log group. The account-level Lambda concurrency quota is 10 and AWS requires all 10 to remain unreserved, so function reserved concurrency is intentionally omitted. Its repository performs a conditional job put and per-minute counter in one DynamoDB transaction. It launches exactly one Fargate task using a deterministic ECS client token and passes only `JOB_ID`; a definite launch failure conditionally moves the job to `FAILED`.

`ApiStack` defines only `GET /v1/assets`, `POST /v1/jobs`, `GET /v1/jobs/{jobId}`, and `GET /v1/health`. All four routes initially require AWS IAM SigV4 authorization. The default-stage throttle is 1 request/second with burst 2, access logs omit request bodies and integration error text, and CORS permits only the two local development origins. CORS is a browser control, not authentication.

The API stack is excluded from the default CDK assembly. It is synthesized only with `GMAI_ENABLE_API=true` and an immutable worker digest. On 2026-09-05 the IAM-protected developer API was explicitly deployed. The deployed provider-job and live-display flags remain false, so `POST /v1/jobs` cannot launch Fargate. A local-only candidate now allows `GMAI_ENABLE_INTERNAL_JOBS=true` only alongside the explicit API gate and emits `API_AUTH_MODE=AWS_IAM`; result display stays false. Deploying that change, closing the circuit and making a real API-to-Fargate call remain separate Security/Cost gates. An anonymous/user-facing API requires a different reviewed design.

## Local commands

### Phase 10 local preparation (2026-09-22)

`FrontendStack` is implemented separately from the existing application assembly. Its proposed CloudFront distribution is disabled. The owner-private revision adds one public verification key and trusted key group to **every** cache behavior, alongside private S3/OAC and response controls. It does not upload files, issue cookies, connect the API or start a worker. See [ADR 0011](../docs/adr/0011-fixture-frontend-hosting-preparation.md) for the default-certificate TLS minimum limitation and pending deployment decisions.

To synthesize locally (not deploy), first supply the separately reviewed **public**
SPKI PEM in `GMAI_FRONTEND_PUBLIC_KEY_PEM`. Missing, private, malformed and unsupported
keys are rejected. No deployment key pair is generated or persisted by this code;
test keys are ephemeral. Key custody, owner-only issuance, expiry and cloud
negative acceptance are still release gates. Never put a private key in CDK
configuration, environment, repository or generated template.

```powershell
$env:GMAI_ENABLE_FRONTEND = 'true'
pnpm exec tsx infrastructure/bin/frontend.ts
Remove-Item Env:GMAI_ENABLE_FRONTEND
Remove-Item Env:GMAI_FRONTEND_PUBLIC_KEY_PEM
```

The output is under ignored `cdk.out/frontend`. The regular foundation entry point is unchanged. No `cdk deploy` or object upload belongs in a local checker. Before any future deployment, review the exact target, current costs, TLS decision, disabled/enabled state, approval and teardown plan.

`node frontend/scripts/release-audit.mjs` checks the built `frontend/dist` file allowlist and emits hashes plus proposed cache metadata. It neither writes a release archive nor uploads anything. Image metadata and unknown secret forms require the later manual privacy review; a passing audit is not publication approval.

The 2026-09-23 build strips the reviewed `caBX` chunk from **only** the built social image and the audit now rejects unstripped or malformed images. `node frontend/scripts/release-plan.mjs` proposes assets-first/HTML-last publishing with zero AWS calls. It is not an uploader, and a previous manifest without archived old files cannot perform rollback. See [local release sequence](../docs/evidence/PHASE10_LOCAL_RELEASE_SEQUENCE_2026-09-23.md).

### Phase 11 local observability draft (2026-09-23)

The operations template is excluded unless `GMAI_ENABLE_OPERATIONS=true`, `GMAI_ENABLE_API=true` and a pinned worker digest are all present. It currently proposes one dashboard and three **action-disabled** alarms on basic Lambda/API metrics; it has no SNS, schedule or automatic circuit action. Local synth is not a deployment. Alarms and dashboards can carry ongoing cost even if no task runs, so this stack needs a separate fresh cost/security review and approval before any deployment. See [the observability draft](../docs/evidence/PHASE11_LOCAL_OBSERVABILITY_2026-09-23.md).

The maintenance template additionally requires `GMAI_ENABLE_MAINTENANCE_DRAFT=true` and the operations gate. Its EventBridge rule is synthesized **disabled** and has no notification target. It was tested with a synthetic image digest locally only; never deploy that digest. Both deployment of the draft resources and later enabling the schedule require their own cost/security review. The real worker must be observed STOPPED before the job is timed out or a slot is released.

```powershell
pnpm infra:typecheck
pnpm test:infra
pnpm infra:synth:foundation
```

SecureString creation, stack deploy/update, ECR push, digest lookup, and `RunTask` are explicit AWS mutation gates. Do not run them without confirming the target identity/region, current cost assumptions and user approval. Never pass the secret value on a command line that will be logged or saved in shell history.

The 2026-10-01 `pnpm operations:phase11-preflight` command performs a
credential-free local synthesis, deletes its temporary assembly and emits a
sanitized two-stack approval packet. The reviewed first-drill delta is one
dashboard, six alarms, three dimensionless metric filters, one EventBridge rule
and one bounded alarm-circuit Lambda path. It fails if SNS/subscriptions, KMS,
schedules, ECS Services, load balancers, NAT gateways or Elastic IPs enter that
target inventory. This command never deploys, reads an AWS account or changes
the circuit. See the [controlled drill plan](../docs/PHASE11_CONTROLLED_LIVE_DRILL_PLAN.md).

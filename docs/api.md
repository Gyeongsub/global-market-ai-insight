# API Contract

## Scope of this document

The `/v1` job/catalog contract below belongs to the retained, disabled
event-driven API/Fargate learning track. The default search companion has no
application API call, and the accepted synthetic Bedrock exercise uses its own
short-lived loopback broker, not these job routes. See the
[current architecture](architecture.md) and [actual lab runbook](runbooks/synthetic-bedrock-lab.md).
The separate alternate-principal model-role rejection test does not establish
second-principal rejection for this API Gateway/controller boundary.

## Owner-only preparation — 2026-10-25

The current target is [private AWS practice](adr/0015-owner-only-aws-practice.md).
The AWS factory now requires exact gateway IAM owner context on every route,
before reading a body or calling the service. Omitted owner configuration denies
all callers. Rejection is HTTP 403 with additive public code `ACCESS_DENIED` and
fixed safe text, never a reflected principal or permission diagnostic. The
gateway may itself return its native 403 envelope before Lambda. Existing local
fixtures remain credential-free. The controller update is now deployed; owner
catalog/health GETs and anonymous 403 were verified without launching work.
A real signed second principal remains untested. See
[exact cloud scope](evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md).
The [private browser session proposal](adr/0016-private-browser-session-preparation.md)
is local-only and adds no live route or authentication fallback.

2026-09-13 morning: QLD/ja ANALYZE succeeded with exact private job/task inspection. Three live locale samples are now recorded, not every symbol/locale combination or browser integration. Public results remain disabled. [Evidence](evidence/PHASE8_QLD_JA_ACCEPTANCE_2026-09-13.md).

2026-09-12 checkpoint: one signed TSLA/en ANALYZE succeeded; exact private result/task inspection passed. The reusable inspection helper reports booleans only, not raw analysis. Live display remains disabled. See [TSLA evidence and verification limits](evidence/PHASE8_TSLA_EN_ACCEPTANCE_2026-09-12.md).

2026-09-10 checkpoint: one signed `ANALYZE/QLD/ko` job succeeded, its stored result passed bounded in-memory verification, and execution gates were restored to internal false/display false/circuit OPEN version 5. See [live analysis evidence](evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md). The result schema now uses `promptVersion: grounded-v1`, matching the existing deployed worker and ADR 0005; the prior `^v[0-9]+$` constraint was a stale contract description.

Canonical machine-readable files are in `shared/schemas/`.

## Local-only input/client hardening — 2026-10-16 resumed session

October 24 local addition: the signed operator acceptance transport also uses
the shared unambiguous JSON parser, fatal UTF-8/BOM rejection and a 4,096-chunk
work ceiling alongside the existing 64 KiB/ten-second bounds. Cancellation is
checked around reads; late responses do not resume reading and cleanup does
not block acknowledgement. One non-retried POST/poll limits are unchanged.
This is not remote rollback or proof that a task/bill stopped.
[Exact local tests and limits](evidence/LOCAL_BOUNDARIES_2026-10-24.md).

Current source refuses duplicate decoded JSON keys (including escaped aliases)
and case-aliased event headers before admission. Stored/provider JSON uses the
same bounded duplicate guard. The prepared browser client bounds streaming,
UTF8, error prose, exact job identity and any present result against the shared
schema. It preserves redacted SUCCEEDED metadata while live display is disabled.
These are mocked/local changes, not deployed code or live browser authorization.
See [scope and tests](evidence/LOCAL_JSON_AND_BROWSER_BOUNDARIES_2026-10-16_RESUME.md).

## Routes

- `GET /v1/assets`: fixed public catalog
- `POST /v1/jobs`: validates body and `Idempotency-Key`, checks circuit/rate limit, writes `QUEUED`, launches task, returns `202`
- `GET /v1/jobs/{jobId}`: returns sanitized state/result
- `GET /v1/health`: controller and circuit only; never calls provider/model or launches a task

## Idempotency

The raw key is validated as a UUID and hashed before persistence. The job ID is a deterministic, namespaced prefix plus 192 bits of that hash, so the single-table partition key can resolve a replay without a scan or secondary index. An equivalent replay returns the existing job. A replay with the same key and a different request hash returns `409` and launches no task.

The prepared admission transaction contains four operations: job Put, versioned CLOSED circuit ConditionCheck, fixed capacity-slot Put, and per-minute counter Update. Development limits are two newly admitted jobs per UTC minute and two occupied capacity slots across minute boundaries. An idempotent replay does not consume another counter or slot. ECS receives a deterministic `clientToken`, `count=1`, the fixed task definition/network configuration, and only `JOB_ID` as a container override.

The persistent circuit and capacity-slot implementation was deployed to the existing ComputeStack on 2026-09-06. Missing, malformed, expiring, or unreadable circuit records fail OPEN. The environment OPEN switch overrides storage. Admission checks the circuit atomically with reservation; opening it does not cancel work admitted before that transaction boundary. On 2026-09-07 one approved signed PRICE job exercised the complete transaction and reached `SUCCEEDED`; the internal execution flag was then returned to false and the circuit to `OPEN/version 3`.

Slots have no TTL. A timeout or uncertain launch retains capacity. The prepared reconciler releases a slot only after matching terminal job/version/creation-time and actual ECS STOPPED evidence, with a final conditional transaction. It has no deployed schedule yet. Missing evidence requires reviewed recovery; availability is intentionally sacrificed to avoid overlapping chargeable work. The cap covers this controller, not administrator-issued RunTask. Drain all occupied slots before changing the configured slot count.

The 2026-10-03 local launcher additionally requires same-account/region full
cluster and concrete-revision task-definition ARNs. A RunTask reply must prove
the exact requested Fargate task scope, disabled Exec and full JOB_ID worker
owner before its ARN is attached. Unknown or conflicting replies fail without
a second launch and do not justify freeing capacity. The stricter source has
not been redeployed; live compatibility and cleanup evidence remain required.
See [launch-identity evidence](evidence/CONTROLLER_LAUNCH_IDENTITY_2026-10-03.md).

Each browser fetch has a ten-second abort deadline; the overall polling deadline also aborts an in-flight fetch, not just the interval between requests.

## State authority

The 2026-10-24 local dashboard now exercises the existing strict client through
an explicitly injected **in-memory fixture** adapter, never native fetch. A
single-use job session snapshots operation/symbol/locale, submits at most one
POST, and requires the checked terminal GET to match that intent before result
display. Its single 90-second local window includes submission; each request
retains the ten-second boundary. Cancellation/unmount suppresses late view data
but cannot prove remote task termination. Redacted success has no invented
result, asset substitution or automatic retry. This does not enable a public
API/authentication path or confer display rights. See
[implementation and exact verification scope](evidence/CONTRACT_DASHBOARD_2026-10-24.md).

Every mutation requires an expected status/version. The worker uses a consistent keyed read and can call external services only after a conditional `QUEUED → RUNNING` claim. Terminal states do not accept worker updates. TTL is retention only and is not used as a timeout mechanism.

The physical worker repository stores the bounded result as `resultJson`; the repository decodes it to the canonical object before it reaches the API boundary. Provider raw responses are not stored.

October 25 local result-content correction: persisted-result schemas require a
non-whitespace character in summary, uncertainty, model identity, every present
analysis list item and price source. Optional empty lists stay valid; risks still
require at least one substantive item. Text is neither trimmed nor synthesized.
This tightens previously permissive blank values without changing field names,
maximum lengths or the canonical disclaimer. Existing cloud records were not
read, repaired or redeployed; a malformed old record will be rejected by the
new local validator rather than displayed as successful analysis. See
[tests and compatibility boundary](evidence/RESULT_CONTENT_BOUNDARY_2026-10-25.md).

## Public errors

The browser receives only stable code, safe message, and request ID. Provider bodies, prompt text, task ARN, secret identifier, and stack trace remain internal.

October 25 local correction: FAILED/TIMED_OUT job projections replace stored
diagnostic prose with a fixed public message and allowlist the code; unknown
codes become INTERNAL_ERROR. The existing worker JOB_DEADLINE_EXCEEDED code is
preserved without treating it as an HTTP envelope code. Other states omit stale
error fields, and only SUCCEEDED can carry a result when display is enabled.
This is undeployed source hardening, not evidence of a cloud incident or repair.
[Regression scope](evidence/LOCAL_ERROR_PRESENTATION_2026-10-25.md).

The public job projection also omits `idempotencyKeyHash`, `requestHash`, and `taskArn`. When live-result display is disabled, terminal status and timestamps remain readable but the `result` payload is omitted. The browser client rejects a response containing any internal fields, accepts HTTPS only outside localhost, never sends browser credentials, limits a response to 64 KiB, and disables caching/referrer forwarding.

## Exposure gate

The controller is fail-closed while `ENABLE_PROVIDER_BACKED_JOBS=false`. `POST /v1/jobs` then returns `503 DATA_UNAVAILABLE` before DynamoDB or ECS is called. Stored provider results are not returned while `ENABLE_LIVE_RESULT_DISPLAY=false`. The deployed flags are false after the bounded internal acceptance. A deployment-only opt-in can enable bounded internal execution solely with the IAM-protected API while display remains hard false. CORS is not treated as authentication or abuse protection, and an internal call does not grant public-display rights.

The CDK app creates `ApiStack` only when `GMAI_ENABLE_API=true` is explicitly supplied together with an immutable worker digest. Every route initially requires AWS IAM SigV4 authorization, so the endpoint is a developer acceptance surface rather than an anonymous website API. Internal execution additionally requires `GMAI_ENABLE_INTERNAL_JOBS=true`; it is rejected when the API gate is absent. Neither switch enables result display.

The operator acceptance client signs requests with the fixed `gmai-admin` browser-login profile and permits the Tokyo HTTPS `execute-api` endpoint and reviewed health/assets/job paths. Its default is a zero-call PRICE/QLD/ko plan. `--operation ANALYZE`, `--symbol` and `--locale` select one allowlisted combination without making calls; the historical operator default ko does not change the product's English default. Unsupported, missing, duplicate or bulk selectors fail before credentials/transport access. Live mode first verifies `CLOSED + jobCreationEnabled`, performs one non-retried POST for the selected combination, and makes no more than 16 status reads, separated by six seconds. It rejects result/internal-field exposure in submission or polling, a mismatched job ID, and unknown status. A terminal FAILED or TIMED_OUT result is reported with a nonzero process exit, not as successful acceptance. Selecting SPCX does not establish provider coverage: unavailable results remain failures and require separate inspection, never substitution. There is no live matrix/batch execution option.

One run permits at most one task, three provider attempts and 18 API calls. PRICE permits zero model calls; ANALYZE additionally requires `--confirm-one-bedrock-call` and the existing worker adapter allows one model attempt with at most 512 output tokens and no automatic retry or repair. These are the reviewed current worker bounds, not limits configured remotely by the CLI. Before live use, verify the deployed worker and model configuration. The 90-second job deadline is distinct from the polling duration; an operator must still verify actual task STOPPED and restore the circuit/internal flag. Signed cloud ANALYZE acceptance succeeded for QLD/ko on 2026-09-10, TSLA/en on 2026-09-12 and QLD/ja on 2026-09-13. Those dated runs do not approve another call, prove every symbol/locale combination or establish that subsequently changed local source is deployed.

The 2026-10-17 local worker lifecycle additionally rechecks the persisted deadline
after claim/provider/model stages and before requesting success. Expiry blocks
a new paid model stage and conditionally records TIMED_OUT without late result
content. Its bounded elapsed timer also propagates cancellation through provider
requests/backoff and model transport, without increasing retry/token limits.
This is not deployed acceptance or cancellation of an already accepted
upstream charge; remote cancellation remains best-effort. See the
[reproduction and precise limits](evidence/WORKER_DEADLINE_BOUNDARY_2026-10-17.md).

## Polling

The prepared API client starts at one-second intervals, uses bounded exponential backoff up to four seconds, supports abort on navigation, and has a 120-second hard maximum. It deliberately contains no AWS credential or SigV4 implementation and therefore cannot call the IAM-protected developer API. It is not connected to the public UI while provider display rights and a suitable anonymous/user-authenticated API design remain unapproved. The current fixture UI compresses timings solely for demonstration.

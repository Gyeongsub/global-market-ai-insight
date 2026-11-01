# Cost Model and Guardrails

## Synthetic Bedrock exercise — ADR 0020

**Latest accepted path, 2026-10-31:** one English browser request through the
temporary model-only role consumed 895 input and 93 output tokens. Refresh/reload
made no extra model request. The temporary role/stack were deleted and checked
independently. The parent CLI management calls and retained storage are separate
from model-token cost. [Dated rates, counts and delayed billing observations](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md).
This is not a new bill check or authorization to repeat inference for a demo.

Earlier 2026-10-28: actual unexecuted role-draft verification created no model role,
inference, provider request or compute workload and removed its temporary draft
and empty stack. A separate [credential rehearsal candidate](runbooks/synthetic-role-rehearsal.md)
is limited to one isolated IAM role, one STS assumption and automatic teardown;
it has no model invocation or always-on resource in scope. It is not live
acceptance or a zero-account-cost claim. Existing storage/request costs and
delayed billing remain outside this operation's control.

Explicit start in a separately launched lab permits one Nova Lite inference per
process. SDK retries=0, output<=512 tokens, fixed serialized request<=8192 bytes,
20-second client deadline, lifetime<=300 seconds. Input-token validation is after
the billable request, not a spending cap. Aborted or lost replies may be charged.
Duplicate clicks/reload/status do not invoke the model. Server restart resets the
allowance and must be intentional; no account-wide dollar cap is claimed. No
provider calls, task launch, subscription or provisioned throughput is added.
Retained storage costs remain. [Runbook](runbooks/synthetic-bedrock-lab.md).

2026-10-26: two actual English/Japanese calls consumed a combined 1,790 input
and 186 output tokens. Both processes closed; the scoped closing AWS check found
zero tasks/pending/services/slots and jobs/display disabled, OPEN/11. Budget
actual USD 0 / forecast USD 0.004 is delayed, not zero inference/storage cost.
[Evidence](evidence/SYNTHETIC_BEDROCK_LAB_2026-10-26.md). Subsequent UI/tests and
IAM policy-candidate synthesis were local only; no candidate role was deployed.

## Search companion — ADR 0019

Prompt generation/copy/open has no AWS, provider or paid-model API call. Existing
ChatGPT limits/subscription apply to the user's manual search; this is not an
unlimited-free claim. No new account, domain or subscription is created. Retained
AWS ECR/S3/DynamoDB/log storage and existing resources may still incur charges.
This local change performs no cloud audit or teardown and does not prove zero
account cost. AWS lab execution remains separately bounded, not triggered by the
search UI. [Decision](adr/0019-chatgpt-search-companion.md).

## No-domain local owner access — 2026-10-25

The [local owner observation](LOCAL_OWNER_OBSERVATION.md) creates no new cloud
hosting or idle service. Each explicit live check is capped at 48 readiness reads
and two signed catalog/health GETs. The latter can incur API/Lambda/DynamoDB
charges. Refreshing the local snapshot triggers zero AWS calls; the loopback
server expires within five minutes. No Fargate/provider/Bedrock work is permitted
by this first checkpoint. Existing retained AWS storage and request abuse of the
IAM endpoint remain possible costs. This is not a zero-bill guarantee or hard cap.

2026-10-25: the private AWS target adds no subscription, identity service, domain,
always-on container, ALB or NAT. A later bounded controller-only deployment
uploaded one private 283,010-byte ZIP and executed one reviewed change set; exact
code and two owner GETs/one anonymous GET were then verified without a workload
job, provider or Bedrock call. [Deployment and limits](evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md).
Final scoped reads found jobs/display disabled, OPEN/11 and zero
running/pending tasks/services/slots. One USD 5 monthly Budget reports actual USD 0,
forecast USD 0.005; Console Home displays current/forecast as USD 0.01. These are
delayed observations, not a cap or zero storage/request fees. Unauthorized HTTP
requests can still cost when denied; private access is not an account spending cap.
Subsequent session/store/authorizer development is local only, with injected
storage and no AWS calls. Per-session read limits and eventual TTL deletion are
not global cost ceilings. A real issuer/authorizer would need a separate abuse,
throttle, concurrency and key-custody review. Domain purchase was deferred, and
no hosted authentication, DNS/certificate subscription or new IAM grant was made.

2026-10-24: fixed 11+12 reads found jobs/display false, OPEN/11 and zero running/
pending tasks/services/slots. Budget actual USD 0/forecast USD 0.005; Console Home
current/forecast round to USD 0.01. No new resource, paid job, push, hosting or
subscription. Console/CLI are logged out. These are delayed scoped observations,
not an all-region inventory, immediate spending cap or zero future storage fees.
Local security/reflow work changes no AWS quotas/token caps or billing settings.
[Exact observations and closure](evidence/LOCAL_SAFE_STOP_2026-10-24.md).

2026-10-23: fixed 11+12 project-scoped AWS reads again found jobs/display false,
OPEN/11 and tasks/services/slots zero; no cloud mutation or paid job. USD 5 Budget
actual 0/forecast 0.005; Console Home current/forecast rounded to USD 0.01. Delayed
billing and existing storage/request charges are not a zero-cost guarantee.
Client timeout now bounds acknowledgement even for an ignored abort, not remote
worker lifetime or billing. Do not automatically retry after timeout; reconcile
the real job/task first. No live browser connection was enabled.
[Dated scope and closure](evidence/LOCAL_SAFE_STOP_2026-10-23.md).

2026-10-22: fixed 11 core +12 reference reads found jobs/display disabled,
OPEN/11, tasks/pending/services/slots zero, base stacks healthy, optional
operations/maintenance stacks absent and six owned/private IAM API references
intact. Budget actual USD 0/forecast USD 0.006; console current/forecast USD 0.01
rounded. No cloud mutation or paid job/push/hosting/subscription. Console signed
out; CLI cache removed and explicit reauthentication required (exit 255; the
initial exit-1-only assertion was too narrow). Loaded access tokens may remain
valid for up to 15 minutes; universal revocation is not claimed. Dated delayed
billing is not an invoice, hard cap or zero future storage/request fees.
CA/Node work is local only; owned Desktop normally stopped after its first
actual pass. [Security scope](evidence/WORKER_CA_REMEDIATION_2026-10-22.md).

2026-10-21: fixed 11 core/12 reference AWS reads again found jobs/display false,
OPEN/11, running/pending tasks/services/slots zero, base stacks healthy and the
operations/maintenance stacks absent. Budget actual USD 0/forecast USD 0.006;
console current/forecast USD 0.01 rounded. Dated delayed observations are not an
incremental invoice, zero future storage fees, account-wide safety or a hard cap.
CLI/console logout completed before later local-only work. No cloud writes,
paid workload, image push, hosting or subscription. Current-image CA UNKNOWN
findings block application runtime; all owned Docker sessions normally stopped.
No image/volume/cache purge or host trust/security change. A public-layer-only
candidate investigation was reverted, not deployed.
[Security boundary](evidence/WORKER_CA_ADVISORY_2026-10-21.md).

2026-10-20 read-only/local session: fixed 11 core/12 reference AWS reads verified
jobs/display disabled, OPEN/version 11, running/pending tasks/services/occupied
slots zero and absent Operations/AlarmCircuit/Maintenance stacks. The USD 5
monthly Budget read reported actual USD 0/forecast USD 0.006; console current and
forecast totals rounded to USD 0.01. These dated values are delayed, not today's
incremental cost, an invoice or a hard cap. Existing storage/logs/requests and
out-of-scope resources can still charge. Console/CLI sign-out was verified before
further local-only work. No cloud mutation, workload, image push, hosting or
subscription. The new cancellation/process guards are **not deployed** and are
not billed cloud-stop acceptance; local fixtures/images are isolated and Desktop
normally stopped. [Process scope](evidence/WORKER_PROCESS_CEILING_2026-10-20.md).

2026-10-04 evening: disabled patch preparations created/removed six owned
change sets, with zero executions. Bounded existing-bootstrap assets were
published/reused and retained; S3 storage/versions and requests can charge.
No new always-on resource, Fargate/provider/model job, ECR push, subscription
or public hosting was started. Closing tasks/pending/services/slots zero,
jobs/display false, OPEN/11. Budget actual USD 0.00 / forecast USD 0.009 is
delayed, not an incremental bill or cap.
[Scoped closing evidence](evidence/LOCAL_SAFE_STOP_2026-10-04_EVENING.md).

2026-10-04 temporary Phase 11 drill: current official Tokyo catalogs confirmed
standard alarms USD 0.10/metric-month, custom metrics USD 0.30/metric-month,
standard Logs ingestion USD 0.76/GB and storage USD 0.033/GB-month; the global
dashboard price is USD 3/dashboard-month. Six alarms, three metrics and one
dashboard have a USD 4.50 full-month reference; two October hours prorate to
about USD 0.0121 before other usage/tax, not an actual bill or a hard cap. The
completed drill took about eight minutes including cleanup. All new temporary
recurring resources, its synthetic stream and two new exact bootstrap S3
object versions were removed. No Logs Insights query, Fargate/provider/model
request, image push, SNS/KMS, subscription or schedule occurred. The scoped
unreserved Lambda mode left the account quota unchanged and has **no function
concurrency-one reservation**. Final Budget actual USD 0.00 / forecast USD
0.009 is delayed; historical metric/request charges and retained base storage
can appear later. See [current prices and bounds](adr/0014-low-quota-temporary-alarm-drill.md)
and [real acceptance/teardown](evidence/PHASE11_ALARM_ACCEPTANCE_2026-10-04.md).

2026-09-24 local hosting review: AWS now presents CloudFront pay-as-you-go and flat-rate plan choices, including a published $0/month Free tier. The current disabled `FrontendStack` has **no pricing-plan subscription**. Its `PRICE_CLASS_200` controls edge coverage, not maximum spend or automatic enrollment in that Free tier. Before any hosting deployment, identify the actual account/distribution billing mode and eligibility, model public traffic plus CloudFront Function requests, and include S3 storage/requests and cleanup. A Free plan's usage allowance is not an account-wide spending lock. No account inventory or bill was read during this local review. See the [official CloudFront pricing page](https://aws.amazon.com/cloudfront/pricing/), [plan documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html), [S3 pricing](https://aws.amazon.com/s3/pricing/), and the [local hosting decision precheck](evidence/PHASE10_HOSTING_DECISION_PRECHECK_2026-09-24.md).

2026-09-13 morning observation: one QLD/ja analysis, no new recurring resource. Final running/pending/services/slots 0, internal/display false, OPEN. Final Budget actual USD 0.00 / forecast USD 0.019; delayed values do not measure the job's cost. Retained storage/log charges remain possible. [Full evidence](evidence/PHASE8_QLD_JA_ACCEPTANCE_2026-09-13.md).

2026-09-12 observation: one TSLA/en ANALYZE test completed; final tasks/slots 0, circuit OPEN, internal execution restored false by successful deployment. Preflight USD 5 Budget showed actual $0.00 / forecast $0.02; post-test Budget query did not complete before logout, so these are not final billing values. Tokyo Nova Lite input $0.000072/1K and output $0.000288/1K were rechecked with AWS Price List. No new recurring resource was introduced; retained storage/log charges remain possible. [Full evidence](evidence/PHASE8_TSLA_EN_ACCEPTANCE_2026-09-12.md).

2026-09-10 observation: one signed ANALYZE job completed and its task stopped; internal execution was disabled, circuit OPEN/version 5, and task/service/occupied-slot counts were zero. Tokyo Nova Lite on-demand Price List rates were USD 0.000072/1K input tokens and USD 0.000288/1K output tokens. The USD 5 Budget showed delayed actual USD 0.00 and forecast USD 0.021. No per-run billed total or actual model-token usage was measured. See [the scoped evidence and pricing calculation](evidence/PHASE8_ANALYZE_ACCEPTANCE_2026-09-10.md). Storage charges remain possible; zero running compute is not a zero-bill guarantee.

Review date: 2026-09-05. This is a control model, not a price guarantee.

2026-09-29 Phase 11 observability review: CloudWatch Logs Insights charges are
based on uncompressed log data scanned. AWS also documents that loading a
dashboard backed by a logs query executes the query and can incur query
charges. The local Operations dashboard therefore keeps a 15-minute default
range, no automatic refresh configuration and no exact-ID trace widgets, but
these are usage guards rather than a dollar cap. The stack remains opt-in and
undeployed; current Tokyo/account pricing, resource diff and teardown need a
fresh review before approval. See the
[official CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/),
[Logs Insights documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)
and the [dated local precheck](evidence/PHASE11_OBSERVABILITY_COST_PRECHECK_2026-09-29.md).

The Operations notification template also fails closed by default: no SNS
resource or alarm action exists unless both the notification flag and a
separate notification-cost acknowledgement are true. Even then it creates one
encrypted TLS-only topic and one rotating customer-managed KMS key, but no
subscription, so it cannot deliver an email by itself. The key policy confines
CloudWatch to the project alarm prefix and source account. A future acceptance
must price alarm lifetime, SNS requests and the customer-managed KMS key/use,
confirm an approved recipient outside source control, and record the KMS
deletion waiting period during teardown.

The 2026-09-30 alarm-to-circuit draft is another independent opt-in stack. It
adds one EventBridge rule, one 128 MiB Lambda with a 5-second timeout and
reserved concurrency 1, one short-retention log group, and request-based
DynamoDB access. EventBridge delivery and Lambda asynchronous execution each
have at most one retry within 60 seconds. These are bounded request/duration
guards, not a zero-cost promise; a continuously flapping alarm can still cause
repeated state-change events over time. The stack is absent by default and
requires a separate cost acknowledgement. Before deployment, review the
current Tokyo CloudWatch/EventBridge/Lambda/DynamoDB pricing, estimate expected
alarm transitions, and plan exact removal of the rule, function, invoke config,
reserved concurrency and log group. No live resource was priced or created by
the local draft.

2026-10-01 Phase 11 bounded-drill update: the official CloudWatch pricing page
currently lists Free Tier allowances of 10 custom metrics, three custom
dashboards of up to 50 metrics and 10 standard-resolution alarm metrics. It
also states that classic custom metrics, dashboards and alarms are prorated by
the hour when chargeable. Free Tier eligibility and current account consumption
are not assumed. AWS's public US examples use USD 0.30/custom-metric-month and
USD 0.10/standard-alarm-metric-month; the page notes that prices vary by Region.
The public page did not expose a Tokyo quote in the reviewed text, so a future
live approval still requires current Tokyo/account pricing. A planning-only
upper calculation using USD 3/dashboard-month plus those example rates is USD
4.50/month for three metrics, one dashboard and six alarms, or approximately
USD 0.013 for a two-hour October drill before tiny Logs/Lambda/EventBridge/
DynamoDB usage. The drill therefore has a two-hour resource lifetime and USD
0.05 planning ceiling, neither of which is a hard billing cap. See the
[official CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/),
[official Lambda pricing](https://aws.amazon.com/lambda/pricing/),
[official EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) and
the [dated local approval-packet evidence](evidence/PHASE11_LOCAL_PREFLIGHT_2026-10-01.md).

Guard addendum, 2026-09-07: the controller reserves at most two fixed slots across time windows; slots have no TTL and are retained after uncertain failures. One approved signed PRICE acceptance temporarily enabled internal jobs, changed the circuit `OPEN/1 → CLOSED/2`, submitted one task, reached `SUCCEEDED`, restored `OPEN/3`, released the exact STOPPED slot, and returned the internal flag to false. Final running tasks, services and occupied slots were zero. The reconciler still has no schedule and cannot be counted as deployed automatic cleanup. See [ADR 0010](adr/0010-persistent-circuit-and-capacity-slots.md) and the [acceptance evidence](evidence/PHASE7_SIGNED_API_ACCEPTANCE_2026-09-07.md).

The closing Budget view on 2026-09-06 retained its USD 5 limit and reported actual USD 0.0 and forecast USD 0.026. AWS billing data can be delayed; this observation is neither an immediate charge reading nor a hard spending stop.

The subsequent user-operated circuit drill added exactly one conditional DynamoDB write and one consistent read to initialize and verify OPEN/version 1. It launched no task and called neither Twelve Data nor Bedrock. DynamoDB usage is billable even when individually negligible; the delayed Budget observation above predates this operation.

The internal-job execution opt-in defaults false and does not enable public result display. Every future use must state the exact number of Lambda, DynamoDB, Fargate, provider and Bedrock calls before approval; the flag itself is not a cost limit and must be returned to false after acceptance.

## Before any deploy

- USD 5 monthly Budget with actual and forecast notification
- verified notification email
- account/region identity check
- one development environment
- tag defaults for project cost grouping

## Cost drivers

| Area | Driver | Guardrail |
|---|---|---|
| Fargate | task runtime, CPU, memory | smallest measured task, 90-second job target, concurrency cap, no service |
| Bedrock | input/output tokens | compact facts, one repair maximum, output cap, Analyze only |
| CloudWatch/EventBridge/Lambda/SNS/KMS | log ingestion/retention, dashboard query scans, dashboard/alarm lifetime, state-change events, function requests/duration, topic requests, customer-managed key and KMS requests | JSON but no payload dump, 7–14 day dev retention, low-cardinality dimensions, 15-minute manual query window, no automatic refresh, alarm circuit absent by default with 1 concurrency/5-second/one-retry bounds, notification topic/key behind separate cost acknowledgement, scoped key policy, no subscription in IaC |
| DynamoDB | reads/writes/storage | on-demand, bounded polling, short TTL |
| CloudFront/S3 | requests/storage/transfer | versioned static assets, small evidence set |
| ECR | image storage/scanning | lifecycle retaining a few commit images |
| External data | credits/subscription/license | no paid plan or payment method by default; internal-development-only guard, public live quotes disabled, server throttle and provider cap |
| Parameter Store | parameter tier and API throughput | one Standard SecureString, standard throughput, AWS-managed key; no Advanced tier or higher throughput |
| API Gateway/Lambda | signed requests, invocation duration, access-log ingestion | API stack absent by default, AWS IAM on four exact routes, 1 request/second burst 2, Lambda 128 MiB/15 seconds, seven-day logs |

The AWS public Bulk Pricing offer published `2026-07-07T16:06:51Z` listed
Tokyo Linux/x86 Fargate at USD `0.05056` per vCPU-hour and USD `0.00553` per
GB-hour. At the project's 0.25 vCPU / 0.5 GB task size, one billed minute is
approximately USD `0.00025675`; a conservative two-minute acceptance bound is
USD `0.00051350`, excluding small log/storage/request effects. Recheck the
[official AWS public offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-northeast-1/index.json)
before a later paid run because prices can change.

The Twelve Data Basic public pricing was rechecked on 2026-10-18 as free with 8 API
credits per minute and 800 per day for internal non-display usage. The worker's
`/quote` request costs 1 API credit per symbol, so one QLD `PRICE` acceptance
uses at most one successful request in the normal path. Provider retry behavior
must still be treated as a separate request bound.
This is not an account billing/overage guarantee or a public-display license.
[Current rights/cost boundary](evidence/PROVIDER_RIGHTS_REFRESH_2026-10-18.md).

The approved 2026-08-30 normal-lifecycle acceptance launched exactly one task.
It ran at 0.25 vCPU / 0.5 GB, completed the worker operation in 893 ms, stopped
with exit code 0, and incurred the one-minute Fargate billing minimum. The
compute estimate is therefore approximately USD `0.00025675`, before small
DynamoDB and CloudWatch effects and delayed billing confirmation. Bedrock was
not invoked. The provider request count is not instrumented, so the exact API
credit count is not asserted; the configured transient-failure ceiling was
three attempts.

At the review date, Standard Parameter Store parameters and standard-throughput interactions have no additional Parameter Store charge. Advanced parameters are USD 0.05 per parameter-month and paid API interactions apply to Advanced or higher-throughput usage. KMS charges can apply. Recheck the [official Systems Manager pricing](https://aws.amazon.com/systems-manager/pricing/) before creating the parameter; this repository does not create it automatically.

## Model candidate

Amazon Nova Lite is a low-cost candidate and is currently documented as available in Tokyo with model ID `amazon.nova-lite-v1:0`. Exact account access, lifecycle, quality and current region pricing must be checked immediately before deployment:

- [Nova Lite model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html)
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)

Do not enable provisioned throughput, reserved capacity, prompt optimization, evaluation jobs, or Guardrails paid features merely because they are visible in the console.

## Layered limits

- API route throttle and atomic jobs-per-window counter
- Fargate active-task cap
- provider request/spend cap
- Bedrock max output tokens
- worker HTTP and whole-job timeout
- application/cost circuit open switch

Budgets and billing alarms are delayed signals. They do not replace hard service limits and do not guarantee a USD 5 maximum.

## Read-only safe-state checkpoint — 2026-10-10

Project-scoped closing Tokyo reads recorded monthly Budget actual USD 0 and
forecast USD 0.008; the console rounded these to USD 0.00/USD 0.01. These are
point-in-time delayed account figures, not a final invoice, zero incremental
cost claim or a guaranteed ceiling. No current paid unit-price estimate was
needed because no provider/model/Fargate job was run.

The admission and live-display flags remained false, the circuit OPEN/version
11, and running/pending tasks, services and occupied slots were zero. Operations,
AlarmCircuit and Maintenance stacks were absent. No deployment, schedule,
subscription, image push, hosting or new recurring compute was enabled.
The known project operators made 88 bounded AWS metadata reads, excluding
ordinary authentication and console page loads. Public dependency/base-image
downloads and local builds also occurred, but did not run AWS workloads.

Existing private ECR/S3/table/log storage, bounded reads and delayed earlier
usage can still incur charges. Scoped console/CLI sign-out limits session
exposure; it does not delete stored resources or stop billing by itself.
Full-account resources and past preview absence were not newly inventoried in
this checkpoint. Remaining permissions/publication gates must stay closed.

## Phase 7 deployment state

On 2026-09-05, the controller Lambda and IAM-protected API were deployed after explicit approval. The accepted scope made three direct Lambda invocations, sent no provider/Bedrock request, and launched no Fargate task. API Gateway HTTP API and Lambda are request-based rather than always-on compute, while empty/seven-day logs and bootstrap deployment assets can still create small storage effects. Billing data is delayed, so an exact incremental amount is not claimed.

The atomic development admission limit is two newly created jobs per UTC minute. The account's Lambda concurrency quota is 10 and AWS requires at least 10 unreserved executions, so this function cannot reserve a smaller slice without a quota increase. API throttle limits arrival rate but does not cap active Fargate tasks. Because neither control is a monthly hard cap, the current config also forces provider-backed job creation and live-result display off. An active-work guard remains a prerequisite before those flags can be enabled.
## Local contract dashboard cost boundary — 2026-10-24

The dashboard's new contract transport is injected in-memory Responses, not
HTTP/AWS/model/provider work. Its single-use client session has one POST maximum
and a shared 90-second local wait, with no automatic retry. This is not a cloud
spending cap: cancellation or timeout may follow already accepted remote work.
No deployment, paid worker, subscription, IAM expansion or public traffic is
part of the local change. Retained AWS storage/delayed charges are not zeroed by
a local pass. [Exact implementation](evidence/CONTRACT_DASHBOARD_2026-10-24.md).

The separate provider comparison confirms that an AWS Budget does not cap a
provider subscription/add-on/overage bill. No alternative free public-display
license or account-specific offer was established and no purchase was made.
[Current access/rights/fee distinctions](evidence/PROVIDER_RELEASE_OPTIONS_2026-10-24.md).


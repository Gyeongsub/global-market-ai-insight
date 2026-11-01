# ADR 0014 — Explicit low-quota temporary alarm drill

Date: 2026-10-04
Status: local implementation verified; live outcome recorded separately

The fresh Tokyo `GetAccountSettings` read returned total and unreserved Lambda
concurrency of 10. The default AlarmCircuit template reserves one execution;
do not knowingly deploy that incompatible template or raise the account quota
as a shortcut. AWS documents the unreserved pool requirement in
[PutFunctionConcurrency](https://docs.aws.amazon.com/lambda/latest/api/API_PutFunctionConcurrency.html).
This observation is not the established cause of an earlier failed deployment.

Keep reserved concurrency one as the ordinary/default template. Only the
dedicated development reference-only entry point may explicitly select
`GMAI_ALLOW_UNRESERVED_ALARM_DRILL=true`. This temporary mode **omits** function
reservation; it is not a function-level concurrency-one guarantee. The main
entry point rejects the flag. Invalid flag values and mixed inspection modes
fail closed. The account limit remains unchanged, and shared concurrency can
affect other functions.

Before using this mode, independently refresh the core eleven-read gate,
twelve-read resource-owner gate and exact Lambda account settings. Require
total/unreserved 10/10, disabled jobs/display, zero tasks/services/slots, OPEN,
known delayed USD 5 Budget figures and absent target stacks. Review a fresh
two-stack diff and the exact scope below. These checks do not grant standing
deployment or public release authority.

The unchanged controls are exact six-alarm EventBridge allowlisting, an
account/Region/ARN check in the handler, circuit-item-only conditional OPEN
permission, 128 MiB/5 seconds, one delivery and one async retry within 60
seconds, no provider/model/task-launch permissions, no schedules or public
endpoint, no SNS/KMS and provider-backed jobs/display OFF. There is no automatic
CLOSED transition. Alarm flapping can still generate calls; these are usage
bounds, not a hard dollar cap.

The bounded operator acceptance uses at most one exact-version temporary
CLOSED transition and one batch of two synthetic failure log events. Observe
the selected real alarm and stored automation actor/reason/version. Abort after
two evaluation periods plus delivery allowance, manually restore OPEN if
needed, and delete both temporary stacks in reverse order within two hours.
Delete only the uniquely owned synthetic stream and new exact S3 asset versions;
preserve any preexisting deployment artifact. Verify target resources absent,
jobs/display OFF, tasks/services/slots zero and OPEN before logout. This is an
isolated drill, not permanent observability acceptance or hosting/publication.

Current official Tokyo prices were read on 2026-10-04: standard alarm USD
0.10/metric-month, custom metric USD 0.30/metric-month, standard log ingestion
USD 0.76/GB, archive USD 0.033/GB-month; the global dashboard catalog says USD
3/dashboard-month. Six alarms, three emitted metrics and one dashboard have a
full-month reference of USD 4.50. For two hours in October, hourly proration
gives about USD 0.0121 before requests/storage/tax. A USD 0.05 planning allowance
is an estimate, not a spending lock. Free-tier eligibility is not assumed.
Do not open the Logs Insights dashboard during the drill.

Sources: [Tokyo CloudWatch price catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-northeast-1/index.json),
[global CloudWatch catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/index.json),
[CloudWatch hourly proration and query charges](https://aws.amazon.com/cloudwatch/pricing/),
[Tokyo Lambda catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/ap-northeast-1/index.json),
[Tokyo DynamoDB catalog](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-northeast-1/index.json),
[EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/).

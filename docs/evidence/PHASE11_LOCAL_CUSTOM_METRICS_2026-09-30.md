# Phase 11 local custom-metric checkpoint — 2026-09-30

## Scope and boundary

This checkpoint added a local-only, separately cost-gated CloudWatch Logs
metric-filter design. It did not authenticate to AWS, deploy the Operations
stack, create a metric/filter/alarm, ingest a log, run Logs Insights, subscribe
or notify a recipient, open a circuit, launch Fargate, call a provider/model or
publish to GitHub.

## Design

`GMAI_ENABLE_CUSTOM_OPERATION_METRICS=true` is accepted only when Operations is
enabled and `GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST=true`. The acknowledgement is
rejected when the feature is disabled. With both gates, the Operations template
adds exactly three JSON metric filters:

| Log group | Exact field/value | Dimensionless metric |
| --- | --- | --- |
| controller | `$.code = "TASK_LAUNCH_FAILED"` | `TaskLaunchFailures` |
| worker | `$.errorCode = "PROVIDER_ERROR"` | `ProviderFailures` |
| worker | `$.errorCode = "MODEL_ERROR"` | `ModelFailures` |

Each match emits `1` and a non-match during an ingested period emits default
`0`. No dimensions are configured, so `jobId`, request ID, symbol, locale,
arbitrary error text and account/resource identifiers cannot create new metric
series. Application roles receive no `cloudwatch:PutMetricData` permission.
The three service/field/value/suffix contracts live in one shared catalog used
by both infrastructure and local contract tests, preventing a silent string
drift between emitted logs and filters.

Each counter has one five-minute `Sum` alarm with threshold 2, missing data not
breaching, and actions disabled unless the independent notification gate is
also enabled. This avoids alerting on one expected/transient error while still
providing a bounded failure signal. The alarm names are in the alarm-circuit
allowlist, but the alarm-circuit stack remains another independent opt-in.

## Local validation

Default Operations synthesis retained exactly one dashboard, three standard
alarms, zero metric filters and no SNS/EventBridge/Lambda/custom metric writer.
The opt-in template contained exactly three filters and six total alarms. Tests
verified the fixed codes, namespace, value/default, absent dimensions, disabled
actions and all mismatched feature/cost gates. Together with the alarm-to-
controller drill, the complete local checker passed **320 tests**: 14
publication/documentation guards, 250 service/contract tests, 28 infrastructure
assertions and 21 frontend contracts. The secret scan found zero high-confidence
findings, and no AWS call occurred.

AWS documentation reviewed on 2026-09-30 confirms that filters transform
ingested log events into metrics, a default zero reduces spotty data when logs
are ingested, and extracted metrics are charged as custom metrics. It warns
that each dimension value can become a separately charged metric; this draft
therefore uses no dimensions. Sources:

- [Filter pattern syntax and custom-metric cost warning](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntaxForMetricFilters.html)
- [Creating metrics from log events](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html)
- [MetricTransformation API](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_MetricTransformation.html)

## Remaining live gates

Before deployment, recheck current Tokyo/account prices and free-tier state,
estimate the retained three custom metrics plus alarms and logs, inspect the
exact template/IAM/resource diff, approve the cost/security scope and define
teardown. A controlled live drill must emit only synthetic fixed-code failures,
verify the expected counter/alarm without provider/model calls, confirm no
high-cardinality series or unexpected notification, and then delete filters,
alarms and any independently deployed response resources. Local synthesis is
not evidence that a metric exists or that an alarm is actionable.

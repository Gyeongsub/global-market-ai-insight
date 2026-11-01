# Bounded observability queries

These are read-only CloudWatch Logs Insights query designs for the internal
development environment. The local query catalog does not call AWS, create a
dashboard, run a query, deploy resources or change the circuit.

## Operating boundary

- Start with a 15-minute time window and the exact project log groups. Expand
  the window only when the incident time is known and the additional query cost
  is justified.
- Use the exact `requestId` or `jobId` from the approved internal flow. The
  query builder rejects quotes, whitespace, line breaks and oversized values.
- Select structured allowlisted fields only. Do not select `@message`, raw
  provider/model content, environment dumps, task overrides or credentials.
- A query result is diagnostic evidence, not proof that an ECS task stopped,
  a capacity slot was released, or billing stopped. Use the exact runbook checks
  for those conclusions.
- Logs Insights queries are billable by uncompressed data scanned when
  executed. Review the
  [current AWS pricing](https://aws.amazon.com/cloudwatch/pricing/) and intended
  time range before a live query; deployment of the existing draft dashboard
  remains separately gated. See the
  [dated cost precheck](evidence/PHASE11_OBSERVABILITY_COST_PRECHECK_2026-09-29.md).

## Query catalog

The tested local catalog in
`services/operations/log_queries/src/query-catalog.ts` defines:

1. API response counts by route and status.
2. Controller rejection/failure counts by stable public/dependency code and
   HTTP status. Request bodies and public error messages are not logged.
3. Worker failure counts by stable error and repository diagnostic category.
   Failure telemetry omits raw exceptions and human-readable messages.
4. One exact request trace across API access and controller logs. An accepted
   request supplies the sanitized request ID to the `JOB_ACCEPTED` audit event,
   which provides the bounded job ID needed for the next trace.
5. One exact job trace across controller and worker lifecycle logs.

The three summary queries are embedded in the separately gated Operations
dashboard draft. They make no query during local synthesis; when that stack is
eventually approved and deployed, opening or refreshing the dashboard can run
Logs Insights queries and incur query charges. Its default interval is bounded
to 15 minutes; widening the dashboard time range also widens the query. The exact-ID trace queries stay
operator-only rather than becoming persistent dashboard widgets.

The trace queries return timestamps and bounded structured fields, but never
the raw log message, provider payload, prompt, task ARN or secret. They are not
wired to an automatic schedule, avoiding unattended query execution. An
operator must still choose the exact ID, log groups and bounded time window.

## Notification boundary

The default Operations draft creates no SNS resource and leaves all three alarm
actions disabled. A separate local template path exists only when both
`GMAI_ENABLE_ALARM_NOTIFICATIONS=true` and
`GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST=true` accompany the already explicit
API and Operations gates. That path creates one TLS-only SNS topic and one
rotating customer-managed KMS key, then connects the three alarms. The key
policy allows only the CloudWatch service and project alarm-name scope, with
source-account and source-ARN confused-deputy conditions. It deliberately
creates no email or other subscription and stores no recipient address.

This is not a working notification claim. A later controlled AWS acceptance
must separately review current alarm/SNS/customer-managed-KMS pricing, create and confirm an
approved subscription, trigger one bounded alarm, verify delivery, and remove
or retain each resource according to the approved teardown decision. KMS key
deletion has a waiting period, so teardown is not an immediate zero-resource
claim.

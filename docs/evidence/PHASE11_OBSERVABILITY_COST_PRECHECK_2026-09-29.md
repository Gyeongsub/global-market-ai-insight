# Phase 11 observability cost precheck — 2026-09-29

This was a documentation-only review. It did not sign in to AWS, deploy the
Operations stack, open a CloudWatch dashboard, execute a Logs Insights query,
create an alarm or change a notification target.

## Current AWS billing model reviewed

- AWS states that Logs Insights queries are charged for the amount of
  **uncompressed log data scanned**. A small result set is therefore not by
  itself a small-cost guarantee.
- AWS also states that loading a dashboard backed by a logs query executes the
  query and can create query charges. Refreshes and broader time ranges must be
  treated as new cost-bearing operator actions.
- Dashboard and alarm charges can be prorated while those resources exist, and
  a log-query alarm can add both alarm and query-scan charges.
- Free-tier eligibility and prices vary by Region and account state. They are
  not treated here as a project spending cap or as permission to deploy.

Primary references reviewed on 2026-09-29:

- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)
- [Analyzing log data with CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)

## Project guardrails

1. Keep the draft Operations stack opt-in and undeployed until a fresh
   account/Region resource diff, current Tokyo pricing review and explicit cost
   approval are complete.
2. If deployed later, begin with the dashboard's 15-minute default range and
   avoid automatic refresh during acceptance. Widen the range only for a known
   incident window.
3. Keep exact request/job traces operator-only. Do not put them on a persistent
   or automatically refreshed dashboard.
4. Do not add log-query alarms merely to obtain failure visibility. The current
   three draft alarms use basic service metrics and keep actions disabled.
5. After an approved drill, verify alarm state, dashboard existence, log-group
   retention, notification targets and any schedule separately. Stopping an ECS
   task does not delete these retained resources.

The 15-minute default bounds accidental scans but is not a hard dollar cap.
AWS Budgets and billing data are delayed signals, so a future deployment still
requires resource-count and teardown evidence.

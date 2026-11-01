# Demo Script

## Current demonstration order — 2026-10-31

1. Default search companion: show a fixed-symbol question, manual copy and the
   plain ChatGPT link. Do not imply that this page receives current quotes.
2. Explain the separate offline flow simulator versus the real synthetic Bedrock
   lab. The older local demo below applies to the simulator, not the default `/`.
3. For actual AWS, follow the [bounded lab runbook](runbooks/synthetic-bedrock-lab.md),
   show the invented-data warning, one model attempt, validated output and usage.
4. End session, keep the owning process alive until its temporary IAM role/stack
   is deleted, and independently verify server/credential/cloud cleanup. A failed close
   acknowledgement is not proof of server shutdown; do not hide that uncertainty.
5. Explain the retained, currently disabled provider/Fargate path with the
   [Korean learning guide](API_INTEGRATION_LEARNING_GUIDE_KO.md). CloudFront hosting
   and the older proposed cloud demo below are optional/deferred, not release prerequisites.

The current entry uses a model-only temporary STS lease, not exported owner
administrator keys. Explain the three distinct limits: 15-minute STS credential
lifetime, five-minute absolute session-policy window, and one model attempt
enforced by the application. The retained API/Fargate circuit is not a global
Bedrock spending stop. Use the [October 31 restricted browser evidence](evidence/SYNTHETIC_RESTRICTED_BROWSER_2026-10-31.md)
for the measured English path; do not silently claim all languages or mobile
restricted-inference acceptance from that one request.

## Optional offline flow simulator (not the default search page)

Open the optional simulator from the search page, or follow the separate
`/http-demo` instructions. It uses synthetic fixtures and performs no AWS request.
The historical checkpoints below are dated evidence; they do not override the
current SPCX unavailable behavior.

For a Korean, no-cloud learning exercise that connects UI observations to code
and cost/security boundaries, use the [local Architect walkthrough](LOCAL_ARCHITECT_WALKTHROUGH.md).
It is an optional exercise, not a record that the user has completed it.

1. Show that English is the default.
2. Select VOO and use Check Price; explain compressed `QUEUED → RUNNING → SUCCEEDED` states.
3. Point out demo fixture, market timestamp, retrieval timestamp, market state, freshness and source.
4. Select QLD, switch to Korean or Japanese, and run Analyze.
5. Explain daily 2× leverage, compounding/path dependency, downside risk and uncertainty.
6. Select SPCX and confirm `DATA_UNAVAILABLE` for both actions. Its intended identity is unverified; show no invented price/analysis or replacement ticker. Return to QLD for the remaining scenarios.
7. Show keyboard focus, long-language layout and persisted locale.
8. Expand Demo scenarios, select Data unavailable, and run Analyze. Explain that displayed prices remain labeled fixtures, not a result of the failed request.
9. Select Time limit exceeded and run Check Price. Explain that a UI timeout does not establish that a real worker stopped; do not automatically retry live work.
10. Select Circuit open and run either action. The local demo immediately rejects the request; it does not modify the real AWS circuit or launch a worker.
11. With QLD selected, select Normal result and run Analyze to show recovery. New work clears previous insight and disables asset/action/scenario controls while pending. SPCX must remain unavailable even in the normal scenario.
12. Reload to restore the normal scenario and clear transient state. Only the supported locale preference persists. This browser demo has no AWS or live market API connection; separate backend deployment evidence does not change that.

Checkpoint: [2026-09-19 local failure-state verification](evidence/PHASE9_FAILURE_UI_2026-09-19.md). Full assistive-technology and language/asset/viewport coverage remain; this is not a public-release acceptance record.

Second checkpoint: [local normal-path matrix and scheduler verification](evidence/PHASE9_UI_MATRIX_2026-09-19.md). All 30 normal language/asset/action combinations were checked in the browser. The deterministic runner suite additionally verifies cancellation and late callbacks. For a manual regression, start Analyze, reload during QUEUED, and confirm READY without a stale result; this reload does not stop any real cloud worker.

## Possible cloud demo additions after separate approvals

This is a future script, not evidence that the frontend, dashboard, SNS or CI
has been deployed. A fixture-only site must not be portrayed as a live market
product; it cannot call the IAM-protected developer API from an anonymous
browser. Verify today's AWS identity, resources, costs and teardown boundary
before any recorded cloud demonstration.

1. Show CloudFront HTTPS and private S3 origin.
2. Show sanitized job state and correlated logs.
3. Show that the Fargate task stops and there is no ECS Service/ALB.
4. Show least-privilege roles and secret reference without values.
5. If separately deployed, show the dashboard and an actually tested alert; verify the current Budget configuration rather than reusing historical screenshots. The Budget is not a hard spending cap.
6. Explain the fixed, dimensionless task/provider/model error counters and show
   that the default stack has no custom metric filter. Do not expose log events
   or identifiers in the recording.
7. Following the [controlled live drill plan](PHASE11_CONTROLLED_LIVE_DRILL_PLAN.md),
   show one exact alarm opening the application circuit and prove a new job is
   blocked with no task launch. Make clear that `OK` does not auto-close.
8. Explain that the drill's temporary exact-version CLOSE was permitted only
   while internal execution was false and tasks/slots were zero. Finish in
   verified OPEN/internal-false state, and show real teardown evidence only
   after cleanup is verified; do not repeat a close merely for the recording.

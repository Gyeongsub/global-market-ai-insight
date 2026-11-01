# Phase 8 single ANALYZE acceptance — 2026-09-10

## Scope and result

Completed one signed `ANALYZE / QLD / ko` API job and restored the development execution gates. The user authorized small costs and requested a self-contained session within 30 minutes. No new stack, worker image, permanent service, public access or model retry was introduced.

The existing temporary IAM user, account and Tokyo region were verified. Initial state: circuit OPEN/version 3, internal jobs false, display false, zero running ECS tasks/services and zero occupied slots. The USD 5 Budget showed actual USD 0.00 and forecast USD 0.021.

## Pricing and execution bounds

AWS `GetFoundationModel` reported `amazon.nova-lite-v1:0` ACTIVE with ON_DEMAND support in Tokyo. AWS Price List `GetProducts` was queried for AmazonBedrock, regionCode `ap-northeast-1`, model `Nova Lite`. Standard on-demand input was USD 0.000072 per 1K tokens and output USD 0.000288 per 1K tokens (returned effective date 2026-08-01). These are Tokyo-specific observations, not global pricing claims. [AWS pricing](https://aws.amazon.com/bedrock/pricing/) and [Nova Lite model information](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-lite.html).

The run used the already deployed immutable worker image and task definition revision 3. It was bounded to one task, at most three provider attempts, one Bedrock attempt, 512 output tokens and 18 signed API requests. The adapter retains a 20-second model request timeout and no automatic model retry/repair. The job deadline is 90 seconds; actual STOPPED verification remains required.

For illustration, 1,500 input tokens plus 512 output tokens at the retrieved model rates cost USD 0.000255456. Actual token usage was not collected by this acceptance, and the post-response input-usage check is not a pre-inference hard cap. The conservative whole-test estimate communicated was USD 0.02 before tax/credits, not an enforced billing ceiling. Delayed Budget values do not measure this individual run's cost.

## Reviewed change and observations

- CDK diff: Foundation unchanged; Compute changed only `ENABLE_PROVIDER_BACKED_JOBS=false → true` on the existing Lambda. No IAM, network, container image or public-display change.
- Enable deployment: UPDATE_COMPLETE.
- Circuit: conditional OPEN/version 3 → CLOSED/version 4.
- Exactly one signed ANALYZE job; terminal SUCCEEDED in seven API calls. No POST retry and no public result exposure.
- Circuit restored immediately in the execution command's cleanup path: OPEN/version 5.
- Exact stored job: SUCCEEDED/version 3, attemptCount 1.
- In-memory inspection of that job's result passed the shared schema's current field/size/version constraints, required metadata, canonical Korean disclaimer and QLD daily leverage/downside/compounding/path-dependency context. No raw price, result or prompt was printed or copied to evidence.
- Exact job-associated task: STOPPED, desired STOPPED, container exit code 0.
- STOPPED/terminal-evidence reconciliation: released 1, retained 0, other slot empty. Final occupied slots 0.
- Restore deployment: UPDATE_COMPLETE; internal jobs false, live display false, API auth AWS_IAM.
- Final live inventory: running ECS tasks 0, ECS services 0; verified circuit OPEN/version 5. Budget actual USD 0.00, forecast USD 0.021.

## Contract correction and local checks

The public analysis schema still accepted only `v1`-style prompt versions, while the deployed application has emitted `grounded-v1` since ADR 0005. The schema now requires the actual `grounded-v1` value, with a regression test tied to the application's prompt constant. This corrects the contract description without changing the deployed worker response or enabling public display. No current browser is connected to this IAM-protected acceptance API.

Focused schema, Bedrock adapter and ANALYZE acceptance tests: 15 passed. High-confidence secret scan passed with zero findings. The previous full local gate passed 110 tests on 2026-09-09; it was not rerun for this schema-only source correction. Local CDK synth/diff and both actual deployments succeeded today.

## Remaining scope

Session shutdown: AWS CLI logout removed the `gmai-admin` cached login; previously loaded tokens may remain valid for up to 15 minutes. No project test/build/dev-server or Docker process remained running in the final local process inventory. The available browser-control inventory exposed only an empty in-app browser, so the separate Chrome console session could not be signed out through the connected UI tools.

This is evidence for one Korean QLD analysis through the signed API and deployed Fargate/Bedrock path. It does not establish all-symbol/three-language cloud coverage, browser-to-API integration, provider public-display rights, deployed automatic sweeping, or portfolio completion. Local language and negative-output tests remain distinct from live coverage.

Before the next cloud test, read fresh identity, Budget, model configuration and circuit version; do not reuse the version in this record. Existing storage/log resources remain retained and can incur small charges despite zero running compute.

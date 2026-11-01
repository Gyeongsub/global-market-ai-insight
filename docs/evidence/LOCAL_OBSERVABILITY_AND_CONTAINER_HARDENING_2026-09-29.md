# Local observability and container hardening — 2026-09-29

This checkpoint is local-only. It did not query or modify AWS, run CloudWatch
Logs Insights, invoke the market provider or Bedrock, build/push an image,
publish GitHub content, or deploy a stack.

## Observability boundary

- The controller logs sanitized public rejections as stable codes and carries
  a validated API request ID into accepted/replayed/launch-failure audit events.
  This creates a bounded `requestId → jobId` correlation without request bodies.
- Worker failure telemetry now includes only a validated job ID, stable error
  code and optional allowlisted repository diagnostic category. It omits raw
  exceptions, fixtures and even the stable human-readable error sentence.
- A typed Logs Insights catalog provides three summaries and exact request/job
  traces. It rejects query-injection characters, limits rows, selects no raw
  `@message`, and uses only the three project log groups.
- The three aggregate queries are present in the opt-in Operations dashboard
  draft with a 15-minute default interval. The exact-ID traces remain manual.
  Literal log-group names outside the three reviewed project groups fail local
  synthesis; unresolved cross-stack names remain bound to the passed resources.
  Opening a future deployed dashboard can run billable queries; deployment and
  live use therefore remain separate cost/security approvals.
- The default template still contains no SNS/KMS resource and keeps alarm
  actions disabled. A separately cost-acknowledged template path creates one
  encrypted, TLS-only topic plus a rotating customer-managed KMS key and
  connects the alarms, but creates no subscription or recipient. Its key policy
  is scoped to the CloudWatch service, source account and project alarm-name
  prefix. Mismatched notification/cost flags fail before synthesis.

## Container build boundary

- `.dockerignore` now excludes service bundles, infrastructure/Terraform
  output, private-key file types, editor state and local evidence/work paths.
- Tests require immutable digests on both image stages, a non-root Distroless
  runtime, frozen dependency installation and a runtime stage that copies only
  the freshly built worker bundle.
- No new image was built or scanned. The changed source is not cleared by the
  historical August image scan.

## Verification

A fresh registry advisory lookup on 2026-09-29 reported zero known
info/low/moderate/high/critical findings for both the 37 production dependencies
and the full locked graph of 391 dependencies. This is a point-in-time package
advisory result, not a container or future-vulnerability clearance. The first
sandboxed request could not reach the registry and was interrupted; the single
approved read-only retry completed. No package was installed or changed.

The complete no-cloud checker passed:

- 244 service and contract tests
- 23 infrastructure assertions
- 21 frontend contracts
- 14 publication/documentation/secret-preflight tests
- **302 tests total**, plus type checks, lint, bundles, no-network smokes,
  Foundation synthesis, production-license inventory and the high-confidence
  secret-pattern check

The documentation guard also checked 91 internal links across 79 Markdown
files with no missing or project-escaping target.

Generated bundles and frontend output remain ignored local artifacts. The
provider display-rights, browser authorization, TLS/hosting cost, notification,
live failure drill, current image scan and GitHub publication gates are unchanged.

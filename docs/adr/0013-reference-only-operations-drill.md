# ADR 0013 — Reference-only Phase 11 assembly

Date: 2026-10-03  
Status: local implementation accepted; live acceptance pending

## Context and decision

The ordinary five-stack assembly's two Phase 11 targets require seven distinct
cross-stack imports. Today's complete, unfiltered Tokyo console export-name
table had eight names; four required names were missing. Name visibility does
not verify values or establish the earlier failed deployment's cause. A blind
exclusive retry or implicit base-stack update is not justified.

Keep the ordinary application entry point. Add a separate
`infrastructure/bin/phase11-drill-app.ts` that synthesizes only Operations and
AlarmCircuit using CDK `from*` references to the existing controller, HTTP API,
jobs table and three log groups. This is **not** a CloudFormation resource
import, ownership transfer or lookup. AWS documents the relevant existing API
reference in [HttpApi.fromHttpApiAttributes](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigatewayv2.HttpApi.html).

This assembly creates no base stack, table/API, worker definition/image,
schedule, SNS/KMS resource, load balancer or NAT gateway. A future deployment
still creates six alarms, three custom metrics/filters, a dashboard and a
bounded alarm handler/rule, and attaches filters to existing log groups.
References do **not** mean no existing-resource effect or no ongoing cost.

## Mandatory boundaries

1. Fresh core readiness: correct identity, known delayed USD 5 Budget spend,
   healthy bases/absent targets, disabled execution/display, zero work/services/
   slots, hardened digest-pinned worker and the exact OPEN control record.
2. Fresh independent reference readiness: six resource owners, same account/
   Region, healthy controller, all four IAM API routes and exact integration,
   on-demand jobs table and bounded log retention.
3. Matching private account/API/reference fingerprint. This consistency hash
   is not authentication, proof of freshness or independent live evidence.
4. Explicit dedicated entry point, exact development/Tokyo inputs, paired cost
   gates and literal false internal/maintenance/notification flags. The normal
   app refuses reference-only selection rather than synthesizing bases.
5. Exact local inventory, Lambda-only role trust/attachments, four IAM actions,
   jobs-table/circuit leading-key condition including its Null guard, new log
   stream scope, rule/function invocation, concurrency/retry/deletion bounds.
   Changed, broadened or unrecognized shapes fail closed.
6. Separate current pricing, account-specific diff, deployment, bounded circuit/
   signal drill and verified two-hour teardown. No successful local check
   authorizes a cloud write, upstream update, provider call or public release.

The shared read-only CLI runner rejects changed endpoints/TLS/debug options,
extra/duplicate arguments, foreign resources and writes before spawning. Each
instance allows at most twelve reads/three minutes, thirty seconds per call,
one attempt and bounded private output. Inherited static tokens, credential
endpoints and destination/model overrides are removed. Today's live CLI mode
was not run.

## Consequences

Avoiding export dependencies without base updates also loses automatic
cross-stack ownership coupling. Fresh ownership/identity checks immediately
before diff/deployment are therefore essential. The ordinary path still needs
complete export name/value checks; see
[CloudFormation export dependencies](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-stack-exports.html).

No deployment or live alarm acceptance occurred today; the changed source has
not been rebuilt into a fresh deployed bundle/image. See
[the dated verification boundary](../evidence/PHASE11_REFERENCE_ONLY_SAFETY_2026-10-03.md).

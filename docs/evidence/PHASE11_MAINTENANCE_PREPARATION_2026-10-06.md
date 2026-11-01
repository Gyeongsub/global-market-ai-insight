# Phase 11 Maintenance preparation — 2026-10-06

## Scope and actual cloud boundary

User requested autonomous continuation with approximately forty percent of the
five-hour allowance preserved, followed by a safe Security/Cost handoff. This
checkpoint uses local implementation and bounded cloud reads/simulations only.
No deployment, IAM write, image/code upload, provider/model request, task launch/
stop, job/slot/circuit mutation, schedule enablement or public release occurred.

The normal short-lived CLI login was renewed through the existing AWS console
identity; the temporary authorization tab was closed. The local browser
callback showed a blocked redirect, but the CLI itself completed successfully.
No transport or Windows security protection was bypassed and no permanent
access key was created. Closing sign-out is recorded separately after completion.

## Local implementation and focused verification

- Real handler → sweeper → reconciler rehearsal: seventeen fixed scenarios,
  three passes, command-boundary enforcement and no SDK client/network creation.
  The safe-integer version boundary prevents irreversible overflow effects.
- A single-stack existing-reference assembly, six exact resources, no base
  synthesis/import/lookup, disabled schedule, no notifications, no reserved
  concurrency claim, strict property/permission/retention checks.
- Four new operators included in the shared twenty-six-entry strict type check;
  default plans are zero-AWS. Pure reference input checks do not load CDK, and
  the proposed-policy tool loads assembly code only in its explicit read mode.
- The initial focused real-chain group passed twenty tests. The corrected
  Maintenance policy/reference group passed thirteen tests. Final whole-gate
  and source snapshot results belong to the closing record, not these earlier
  intermediate source versions.

## Fresh read-only reference results

Eleven core reads verified the USD 5 monthly Budget (actual USD 0, forecast
USD 0.009 at that query), healthy Foundation/Compute/API, absent temporary
operations stacks, jobs/display false, hardened digest-pinned worker, OPEN/11,
and zero running/pending tasks, services and occupied slots.

The first fourteen-read ownership attempt correctly failed closed because it
mistook CloudFormation's ECS cluster physical **name** for an ARN. One bounded
resource-inventory diagnostic and the official CloudFormation reference
confirmed the difference. The checker now binds the exact physical name to
the fresh account/Region-specific controller ARN, not an arbitrary ARN shape.
The repeat fourteen reads passed all bindings. Verified reference fingerprint:
`d35e5fc47fd7c54874981ca935801c4e23a77a0f0b2eaff77fc7ca4d22e292d4`.
This grants no deployment or execution authority.
[AWS cluster Ref semantics](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ecs-cluster.html).

## Permission findings and deliberate failed gates

The first proposed-policy run stopped at the condition-check allow. Isolated
read-only diagnostics showed that the exact-key permission passed only without
the unsupported EnclosingOperation condition. Local Maintenance and Compute
controller drafts now preserve exact table/key bounds without that condition;
DeleteItem still requires TransactWriteItems. No deployed grant was changed.
[Action-specific DynamoDB authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_dynamodb.html).

An independently bound existing controller-role simulation used four reads,
verified disabled flags and its CloudFormation ownership, and returned
`implicitDeny` for its exact circuit ConditionCheckItem despite supplied contexts
and an exact individual resource result. A preceding diagnostic with an assumed
physical-role prefix was rejected before simulation; actual CloudFormation
ownership was used instead. This proves a current simulator mismatch, not a
live job-admission failure. Do not enable jobs before a scoped correction/proof.
The attached-role matrix expands from fifteen to seventeen cases so future
verification cannot omit circuit-check authorization.

The completed unattached Maintenance matrix used exactly sixty bounded AWS
reads/simulations: fourteen before, one context discovery, thirty-one evaluations,
and fourteen after. Nine allows and all twenty denies verified. Exact-stream
CreateLogStream/PutLogEvents remained unverified; exit status was **1** and
`allExpectedDecisionsVerified=false`. Reference, policy, circuit/controller and
task definition fingerprints were stable before/after. Policy SHA-256:
`d217ee271595f604901a0ed89e53f4a51b32a8157e1e40fbb85aa04fadea8eeb`.

Log diagnostics denied the exact stream even for an unattached hypothetical
Allow/Resource `*`, but accepted a group-wildcard input. No actual wildcard grant
was attached. The tool retains its required exact-stream cases and deployment
remains blocked; it does not replace input or relabel failure as permission proof.
Unknown simulator/service differences need an independent narrow proof.
[Logs action/resource definitions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html),
[simulator limitations](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html).

The old image-only rollout must still reject the local Compute IAM delta. Do
not waive that gate or treat the historical fifteen-case result as covering
today's new circuit-check cases. The dated source/image/license proofs retain
their original scopes; no current full live authorization or licensing claim.

## Remaining work and safety limits

See the [bounded future recovery plan](../MAINTENANCE_RECOVERY_DRILL.md). Logs
authorization, dedicated disabled controller policy correction, actual recovery
runtime/ownership acceptance, notifications and hosted/public release remain
open. Existing LOW/MEDIUM image findings and three backend root-license gaps
are not cleared. GitHub remains deferred; no workflows, remote, commit or push.

No Docker start, reset, cleanup, socket operation or service repair was performed
today. Retained private storage/prior request costs can still appear; Budget is
not a hard cap. Independent final queries, local process/temp cleanup and both
login sign-outs must be recorded in the dated safe-stop handoff before closing.

## Cold-install time-bound finding

The first current-source isolated frozen install succeeded but its complete
local gate hit the former 240-second ceiling during infrastructure assertions
(240,026 ms, ETIMEDOUT). This was recorded as failure, not a test failure or pass.
The owned process count after termination was independently zero. Yesterday's
smaller gate already took 237,425 ms. With four new operators and additional
real-chain/reference assertions, the fixed local-only ceiling is now six minutes
in both copy and frozen-install proofs. No test, compiler, secret/license guard,
cloud deadline, installation hook restriction or cleanup condition is relaxed.
This timing change itself proves nothing; a separate full successful rerun is
required and is reported with its actual source fingerprint in the safe stop.

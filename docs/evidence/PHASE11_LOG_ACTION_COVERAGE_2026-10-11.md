# Maintenance log action coverage — 2026-10-11 resumed session

Scope: eight fixed **unattached** policy simulations with fourteen complete
reference reads before and after (36 calls total). No IAM write, role assumption,
Logs write, task execution, circuit change, deployment or publication.

## Why this comparison is separate

The earlier [31-case permission matrix](PHASE11_MAINTENANCE_PERMISSION_RECHECK_2026-10-11.md)
verified only 28 cases. Its three log-stream cases lacked valid identical-action/
resource positive controls. Repeating that unchanged matrix would not resolve
the uncertainty. This new diagnostic compares action matching while preserving
the exact evaluated stream and exact requested CreateLogStream/PutLogEvents
action. It neither modifies that matrix nor substitutes a broader control for
an applicable permission allow.

The [simulation API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html)
accepts supplied policy documents and actions/resources without performing the
service operations. It is not a deployed-role authorization proof. The
[Logs resource reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_logs.html)
still determines the applicable stream resource; this comparison does not
replace it with a group just to obtain an allow.

## Actual observed results

| Evaluated scope | Unattached grant | Result |
| --- | --- | --- |
| CreateLogStream, exact stream | exact action, universal resource | implicitDeny |
| CreateLogStream, same exact stream | logs service actions, exact resource | implicitDeny |
| CreateLogStream, same exact stream | all actions, exact resource | implicitDeny |
| PutLogEvents, exact stream | exact action, universal resource | implicitDeny |
| PutLogEvents, same exact stream | logs service actions, exact resource | implicitDeny |
| PutLogEvents, same exact stream | all actions, exact resource | implicitDeny |
| Independent CreateLogGroup, exact group | exact action, universal resource | allowed |
| Independent GetItem, exact project table | exact action, universal resource | allowed |

All eight observations bind the exact requested action and resource, contain no
missing context/truncation and agree between aggregate and individual decisions.
The six stream observations have zero aggregate matched statements and absent
individual matched statements. Both independent controls have one matched
statement at each level. Optional boundary/organization fields are absent and
remain unknown. No source policy identifiers/positions/contents or account ARNs
are emitted. All full reference snapshots agree before/after.

The two independent allows show that this execution can evaluate some supplied
Allow policies. The narrower conclusion is **not** that Logs permissions are
invalid, any guardrail is absent, or a specific AWS defect is established.
The exact stream/resource/service discrepancy still needs independent proof.
No blanket Allow policy was attached. `rootCauseEstablished`, live authorization,
deployment and publication remain false. Do not rerun the same failed inputs or
broaden permissions solely to make the acceptance matrix green.

## Local verification and execution boundary

The original ten-case resource-form mode retains its 38-call maximum. The new
mode is separately selected by `--execute-action-coverage-read-only`, with a
36-call/eight-simulation bound and the unchanged eight-minute deadline. Default
and `--plan-action-coverage` modes make zero AWS calls. CLI input cannot choose
arbitrary actions, resources, account, caller, policies or role assumption.

Twenty-three focused diagnostics/policy tests pass, including fixed matrices,
default-zero-call behavior, redacted broad-control observations and rejection
of wildcard/substituted replies. Strict checking of all 33 operator entrypoints
passes. These are local/operator facts, not service or recovery acceptance.

Before this comparison, a fresh eleven-read core gate verified disabled jobs/
display, OPEN/version 11, zero tasks/services/slots, absent temporary stacks,
USD 5 monthly Budget actual USD 0 and forecast USD 0.008. The initial sandboxed
identity read failed and remains separate. The first ordinary login was stopped;
the bounded ordinary existing-profile refresh exited zero. Chrome displayed a
blocked local callback page, but a new successful AWS gate independently proved
CLI authentication. No browser warning was bypassed, security setting changed,
long-term key created, permission expanded or session duration changed. The
owned authentication tab closed. Final shutdown evidence is recorded separately.

## Remaining gate

Maintenance deployment and actual stale-job recovery remain blocked. The earlier
controller correction is already applied and must not be repeated. Notification,
image scan, legal/privacy, hosting/CI and publication are independent gates.
Read/storage/delayed prior fees remain possible; no Fargate/provider/Bedrock
workload or always-on resource was introduced by this diagnostic.

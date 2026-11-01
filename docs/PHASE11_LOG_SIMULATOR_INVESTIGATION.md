# Logs simulator discrepancy — next safe decision gate

Status: diagnostic evidence only, 2026-10-15. Maintenance deployment/recovery is
still blocked. Repeating unchanged broad controls cannot substitute for missing
exact-resource acceptance. No automatic policy rewrite or permission expansion
is part of this document.

The [local Support review draft](evidence/PHASE11_SUPPORT_REVIEW_DRAFT_2026-10-15.md)
separates dated real observations from an unexecuted synthetic request shape.
It contains no private request/log/identity data and has not been sent. Current
official guidance also says missing SCP context is not surfaced: empty missing
context alone cannot rule out such an influence. No account-specific cause or
new IAM acceptance is inferred, and no unchanged simulator matrix is repeated.

## Established observations, not an assumed cause

The [October 14 local CLI wire fixture](evidence/PHASE11_LOCAL_CLI_WIRE_2026-10-14.md)
confirms the installed CLI preserves fixed synthetic policy/action/stream values
in both input forms, including bracket/dollar syntax. It uses no real credentials
or AWS endpoint and fabricates the response. Its local paginator issue was fixed;
real operators already disable pagination. It does not establish actual signed
wire, caller/service context, a historical cause or Maintenance authorization.
No new AWS simulator repeats or policy attachment followed this local check.

The original exact proposed-policy matrix has three unverified stream cases.
Subsequent isolated controls investigated resource forms, explicit owner,
action coverage, basic policy syntax and actual resource existence. The October
13 comparison also retained exact action/policy/resource between scalar and
structured CLI inputs. Both input forms still denied the existing stream;
non-applicable group inputs allowed. Official resource examples support the
stream form, but simulation is not a real service request and can differ from
live authorization. No single precise cause is established.

[Latest measured comparison](evidence/PHASE11_CLI_INPUT_COMPARISON_2026-10-13.md)
includes the exact bounded scope. Old failures, changing legacy tokens and absent
organization/boundary fields must not be reclassified as successful authorization.

## Choices that require their own authorization and evidence

1. An AWS Support investigation may clarify simulator behavior. Prepare a
   minimal example with synthetic identities and the exact pair of denied/
   allowed observations. Do not attach raw sessions, log messages, full private
   references or account-specific policies automatically. Any actual support
   submission/disclosure needs a separately reviewed destination and data scope.
   No case/email/issue is sent by this project tooling.
2. A bounded actual-service test would be a materially different action from
   these reads. It needs the exact temporary role/policy/resource/cost/teardown
   design, independent negative boundaries and explicit security-sensitive
   approval before creation, role assumption or log writing. An existing admin
   principal's successful write would not prove a future Maintenance role.
3. A documentation or simulator compatibility correction may be adopted only
   once it has independent evidence and a recorded decision. Never silently
   substitute a group input, drop an exact-stream test, attach Resource:* or
   label the current 28/31 result as all verified.

Do not redeploy healthy base stacks, repeat the October 10 controller mutation,
enable jobs/display, close the circuit, run model/provider jobs, or add public
browser access to investigate this discrepancy. The current fail-closed path
remains usable for independent local publication/privacy/reproducibility work.

This is a handoff decision map, not approval for any cloud change or publication.

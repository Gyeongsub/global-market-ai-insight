# Real circuit admission-denial acceptance — 2026-10-05

## Real result

The fixed-scope live operator passed in approximately 493 seconds including
prerequisite proofs/closing reads: 133 explicit AWS calls, two Lambda admission
configuration writes and two signed API requests, one health GET and **one**
PRICE/QLD/ko POST. No retry or job-status polling.

Fresh actual-live archive and deployed controller ZIP/source proofs preceded
temporary enablement. Ownership, budget, IAM API references and empty tasks/
services/slots passed. Persisted circuit stayed OPEN/version 11; no circuit
write, and environment override remained CLOSED so this tested persistence,
not an environment-only shortcut. Enabled health returned exactly status=ok,
circuit=OPEN and jobCreationEnabled=true. POST returned typed HTTP 503 with
public code CIRCUIT_OPEN. Consistent reads of its fresh UUID-derived job ID
proved absence before **and** after; HTTP denial alone was not cleanup proof.

Finally restored jobs false. Independent core reads proved display false,
unchanged circuit and zero running/pending tasks/services/slots. All four API
routes remained AWS_IAM with the same owned integration/reference fingerprint.
Private environment files removed. A separate root 11-read closing gate also
verified the restored state. No Fargate launch/provider/Bedrock work was
observed/expected for the denied request. No IAM/code/API exposure/circuit/ECR
push, subscription, public data/site or GitHub change was made by this operator.
This is one real denial acceptance, not production traffic enablement or full
operations/public-release completion.

## Reusable safety boundary

`operations:circuit-denial-live` defaults to zero AWS/API calls. Its sole
execution argument is `--execute-one-circuit-denial`; no alternate function,
image/profile/operation/symbol can be selected. The three-minute admission
window starts after the expensive prerequisite proofs; restoration can use
the reserved cleanup period rather than the shorter request deadline.

An enable attempt is consumed before transport, so ambiguous acknowledgement
still enters finally. The random key stays in memory. Only typed 503/
CIRCUIT_OPEN passes; unrelated 503, timeout, malformed health, changed source/
circuit/fingerprint, unexpected acceptance or missing closing inventory fail.
Local tests cover these and failed restoration. Fresh revision checks preserve
all other environment fields; current-user/System-only ACLs protect temporary
environment JSON. Call/time limits and private output are enforced.

Unexpected job existence fails closed after disabling. The operator will not
delete a record or stop an unrelated task by inference: independent exact
job/task/STOPPED recovery is required before a root operator can claim safety.
There is no automatic resubmission or arbitrary cleanup switch.

OPEN is defense in depth, not a spending cap. Two API/Lambda requests and
bounded AWS/storage reads can incur small request/log costs; delayed Budget
values are not their exact invoice. See
[patch prerequisite](PHASE12_COMPUTE_PATCH_ACCEPTANCE_2026-10-05.md) and
[runbook](../runbook.md). Session logout and Docker shutdown are separately
verified at handoff, not performed by this admission operator.

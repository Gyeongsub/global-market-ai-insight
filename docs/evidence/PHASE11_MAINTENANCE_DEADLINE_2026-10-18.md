# Maintenance elapsed/cancellation boundary — 2026-10-18 Tokyo

Local implementation and synthetic transport evidence, **not deployment or
real stale-job recovery acceptance**. The original 31-case IAM matrix still
has three unverified exact-stream controls. No policy, role, schedule, circuit,
job, task, image, public API or provider entitlement is changed by this work.

## Reproduced defect and correction

The existing sweep/reconcile timers passed AbortSignal to SDK senders but
checked cancellation only at the beginning of each slot. Six new tests were
run against that implementation: five assertion failures and one test timeout.
A sender that ignored cancellation could return valid-looking late evidence,
allow a later StopTask/update/release, or leave the caller awaiting a read.
These are synthetic reproductions, not observations of a live AWS incident.

The two existing limits stay **20,000 ms for sweep / 10,000 ms for reconcile**.
One invocation-local monotonic budget now brackets every read and mutation,
discards late completions, forwards cancellation, and races outstanding calls
against cancellation. Invalid/backward elapsed samples exhaust the budget.
Disposal clears its timer/parent listener and prevents further use. No retry,
larger timeout, broader IAM grant, extra scan, task launch or slot key is added.
Job deadlines remain separate UTC timestamps; they are not elapsed call clocks.

Unconfirmed effects remain unconfirmed. In particular an update/delete can
already have committed before its late acknowledgement is discarded. Counters
record acknowledged-in-budget outcomes only, not a guarantee of zero remote
effects. Capacity is conservatively reported for review; a later independent
read may establish that the job transitioned or the slot is already empty.
Cancellation cannot undo accepted AWS requests, stop charges by itself, or
prove task termination. No background retry is introduced.

## Verification scope

- Thirteen new local deadline/budget tests include cancellation at all six
  sweep and four reconcile boundaries, exact elapsed expiry, invalid/backward
  clocks, fixed-budget validation, pre-aborted three-slot work, a pending
  sender that ignores cancellation, late rejection consumption and disposal.
- The real three-pass maintenance composition retains its original seventeen
  recovery/race scenarios and adds four elapsed-evidence/acknowledgement cases
  (**21 total**). Exact conditional fields, owner/STOPPED evidence, no duplicate
  effects and replacement-owner preservation remain required. A tiny injected
  in-memory condition evaluator is not a DynamoDB emulator or service proof.
- The focused operator/service set passes **35 tests**; whole/frozen-source
  verification must be recorded separately. The default whole checker still
  has 87 steps/four groups, concurrency two and a 360,000 ms ceiling. Existing
  tests, assertions, deadlines and the one pre-existing OS privilege skip are
  not removed or loosened to accommodate these changes.

## Independent AWS and cost observations

The existing Chrome session refreshed only the same temporary CLI profile.
An initial failed STS readiness attempt occurred before authentication; no
later stages or cloud mutation followed that failed probe. The installed CLI
does not support the current documentation's redirect-port option: that attempt
exited before authentication. Its supported default flow then completed using
the existing session, without requesting a password/MFA, new role/key/access,
or longer duration. No callback barrier was bypassed.

Initial and closing gates each completed 11 core + 12 reference reads (46
successful gate reads total). Both found healthy Foundation/Compute/API,
absent Operations/AlarmCircuit/Maintenance, jobs/display false, persisted
OPEN/version 11, zero running/pending tasks, services and occupied slots.
All six ownership scopes, IAM routes and integration/table/log references
passed; the reference fingerprint remained
`b96088d955a64c1c37a996f7333b47d1587b949423847681b140e80ce57de10a`.
The USD 5 monthly Budget reported actual USD 0 / forecast USD 0.007; the console
rounded current/forecast totals to USD 0.01. Neither view promises zero charges
or a spending cap. Existing ECR/S3/log/table storage and delayed/read charges
remain possible; no new recurring resource or paid workload was created.

Official profile logout and independent STS exit 255/login-required/cache JSON
count zero were verified at **06:51:59.738 UTC**. Console Sign out returned the
public Japanese console-information page with sign-in controls. Authentication
callback tabs were no longer present. Already loaded tokens in unrelated tools
can survive until expiry; global revocation is not claimed. No further AWS
authentication or cloud operation is needed for the remaining local work.

## Still closed

No unchanged simulator repetition or healthy-stack policy rollout. Keep the
original Maintenance IAM/recovery, notification, provider display/derived
rights, complete source/native/OS/license, hosting/authentication/CI and final
privacy/publication gates unresolved. Historical worker/container scans do not
prove this changed complete source. GitHub upload remains deferred by the user.
[Original decision boundary](../PHASE11_LOG_SIMULATOR_INVESTIGATION.md),
[recovery plan](../MAINTENANCE_RECOVERY_DRILL.md).

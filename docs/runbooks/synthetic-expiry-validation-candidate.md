# Synthetic role time-window validation — bounded approved experiment

**Latest October 31 acceptance:** a new exactly source-gated cycle completed
valid restricted analysis and explicit session-policy denial after the absolute
window. Automatic deletion and three independent checks confirmed absence.
The two-request execution is finished; this runbook is not an automatic rerun
instruction. Remaining work is alternate-principal/RunTask denial and restricted
user-facing migration. [Actual result](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

**Latest observed October 31 result:** SDK-compatible usage handling produced a
valid restricted English analysis. The second request returned HTTP 403, but its
session-policy cause did not pass strict review. Both temporary resources were
deleted and independently confirmed absent. Fixed-category denial diagnostics
and three-language restricted HTTP integration subsequently passed 39 focused
tests; the historical 403 cannot be retrospectively classified. Any diagnostic
revalidation must again retain this exact two-request ceiling, new source proofs,
one temporary role/STS, and cleanup; it must not silently become a retry loop or
accept an arbitrary 403. The current user authorized autonomous continued work,
not weaker security gates or unlimited requests.
[Updated result](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).

**Latest October 31 follow-up:** the user requested autonomous continued work.
A newly gated cycle isolated UNKNOWN_USAGE_FIELD after HTTP 200 and was cleaned
up without a second request. SDK-compatible response projection is now locally
tested; another bounded code-version verification uses the same limits below,
not an automatic transport retry. [Current checkpoint](../evidence/SYNTHETIC_USAGE_COMPATIBILITY_2026-10-31.md).
The individual consumed approvals/outcomes below remain historical evidence.

**October 31 outcome:** the separately approved cycle is consumed. One HTTP 200
control failed usage normalization; the second request was not sent. Automatic
deletion and three independent reads confirmed role/stack cleanup. Offline null
metadata compatibility and fixed diagnostic categories were then added, without
another model call. [Result and remaining gates](../evidence/SYNTHETIC_EXPIRY_CONTRAST_2026-10-31.md).
Another actual cycle requires new explicit approval and fresh source/authentication
gates; the preparation below is not reusable permission.

**October 30 outcome:** the one approved cycle was attempted and cleaned up. The first
control failed validation, so the second request was not sent. Approval is consumed;
expiry acceptance remains unverified. See [dated evidence](../evidence/SYNTHETIC_EXPIRY_CONTRAST_2026-10-30.md).
The preparation notes below describe the original scope, not permission to rerun.

2026-10-30. The user separately approved one bounded expiry-contrast cycle.
The dedicated executable is implemented locally; live acceptance is still pending.
The completed two-read approval is consumed and cannot authorize another cycle.
See [current evidence](../evidence/SYNTHETIC_READ_DENIAL_2026-10-30.md) and
[least-privilege ADR](../adr/0021-synthetic-lab-least-privilege-candidate.md).

## What the next experiment would distinguish

The production candidate closes its credential lease at the five-minute IAM
window. That local refusal is desirable but cannot demonstrate AWS-side expiry.
An SSM/ECS call denied both before and after expiry cannot establish the time
condition either: those actions are always forbidden by the model role.

The proposed contrast uses the same restricted principal, exact Tokyo Nova Lite
model, fixed synthetic QLD payload and immutable session policy. One validated
success inside the window is followed by at most one request after it. The latter
must produce the exact model action's explicit session-policy denial; timeout,
validation error, expired STS token, signature error, missing model, an unexpected
success or a generic access error is not expiry acceptance. An AWS denial message
alone does not identify a particular statement: request/timing/policy binding and
the successful control are also required. This remains bounded evidence, not a
general IAM evaluator or proof of all other principals/actions.

## Approved one-cycle boundary

- One isolated temporary role and stack; one successful STS assumption.
- At most two model requests total, including failures. No retry/restart/fallback.
- Exact Tokyo Nova Lite, fixed invented QLD input, English, request <=8192 bytes,
  output <=512 tokens per request, <=20 seconds per request.
- The second request is attempted only after the first passes the existing
  result/usage contract and the unchanged policy window has elapsed. If the
  control fails, stop and clean up; do not obtain another allowance.
- Either accepted request may be billable. Expected rejection is not a zero-cost
  guarantee. The byte/output limits are not a hard account-dollar cap.
- No provider key/data, RunTask, new IAM user, public endpoint, durable deployment,
  browser access to credentials or change to the administrator-backed UI runner.
- Exact stack/role cleanup on every outcome; independent absence reads and local
  residue inventory. Keep existing provider jobs disabled and circuit OPEN.

The explicit user reply approved this exact scope, not a durable role or runner
migration. Current pricing, matching current/fresh-clone source proofs and renewed
authentication are still prerequisites. No retry after the approved cycle begins.

## Implementation and pre-live gates

1. Keep normal `getCredentials()` and the application's five-minute cutoff
   unchanged. Never add an ignore-expiry flag to the user-facing lease/runner.
2. A separately reviewed, non-UI test harness would need sole ownership of only
   the restricted credential object long enough to send the post-window probe.
   It must have a fixed absolute post-window cutoff, bounded parent watchdog and
   guaranteed close/clear paths. It must not persist or log credentials, share
   them with the browser, refresh STS or fall back to owner credentials.
3. Bind the exact policy start/end, model, region, request bytes and restricted
   identity for both attempts. Re-sign with the real current request time;
   changing the computer clock, signature time or policy is not an expiry test.
4. Treat reversed/invalid clocks, excessive skew, missing trusted timing evidence,
   cancellation, late responses and incomplete teardown as inconclusive/failure.
   Do not wait indefinitely or automatically rerun a failed experiment.
5. Test all transitions with injected clocks/transports first: early/duplicate
   requests, failed control, unexpected second success, cancellation during the
   wait, loss of response, parse ambiguity and cleanup failure. No real waits,
   credentials or AWS calls belong in those unit tests.
6. Verify current-source and isolated fresh-clone gates and the actual rendered
   policy before the separately approved live action. Record failed attempts
   honestly and independently recheck exact resource absence afterward.

The dedicated `synthetic-expiry-exercise.ts` harness closes the ordinary lease
after validated acquisition, retains only a private three-field restricted-key
copy for the approved experiment, and clears it on every exit. Its absolute cutoff
is window end +60 seconds, with a 450-second outer watchdog, bounded waits and
20-second requests. AWS response Date, wall/monotonic agreement, fixed request
bytes and exact session-policy denial are checked. The normal lease and UI runner
remain unchanged; no retention option is exposed to users.

`scripts/synthetic-role-rehearsal-live.ts --plan-expiry-contrast` is inert.
`--execute-temporary-role-expiry-contrast` requires the existing source and cloud
readiness gates, then uses one STS assumption and at most two model requests.
The owned cleanup path runs after success, failure or cancellation; the journal
contains sanitized counters/usage, not keys, full responses or prompts.
Local tests cover fixed inputs, clock changes, duplicate attempts, failed control,
late/cancelled responses, stuck waits, TLS verification and teardown errors.
RunTask, foreign-principal and broader negative-authorization gates remain
separate; passing this experiment would not authorize durable runner migration.

## References

[STS AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html)
documents the 900-second minimum credential duration and role/session-policy
intersection. [IAM current time](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-currenttime)
describes request-time conditions. Neither makes a local timeout into remote
revocation. [Current regional Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
must be reviewed before the proposed billable control.

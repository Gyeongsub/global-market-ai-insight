# ADR 0018 — Cloud-side, expiring owner job admission

Date: 2026-10-25. Status: local implementation candidate; not deployed or enabled.

## Why

ADR 0017's local UI expires, but the owner PC can crash before a cleanup command.
Neither closing a tab nor an AWS Budget notification is a cloud-side spending cap.
Add a fixed, absolute admission window checked by the controller itself, independently
of local process lifetime. This is defense in depth, not full release approval.

## Contract

- `OWNER_JOB_WINDOW_START` and `OWNER_JOB_WINDOW_END` are exact UTC ISO timestamps
  with milliseconds, supplied by a future reviewed operator workflow, not by an HTTP
  body/header, browser setting or renewable runtime duration.
- Both absent means no admission. Partial/malformed/over-five-minute settings fail
  configuration. A window requires the existing same-account private owner identity.
- The end must be later than start by more than 15 seconds and at most five minutes.
  The final 15 seconds are reserved: new admission/dispatch is refused then. This
  exceeds the existing controller's 12-second invocation budget; it does not prove
  AWS has not accepted an in-flight request.
- The controller requires the enable flag AND the valid window before reading the
  circuit, again after the circuit await, and after repository admission before ECS
  dispatch. The persisted CLOSED circuit and transactional capacity guards remain
  required. Missing window is disabled even if an old operator sets the flag true.
- Expiry after a newly persisted QUEUED record attempts the existing conditional
  launch-failure transition within the same invocation budget. No ECS call or retry.
  The existing error code describes a worker that could not start; a fixed internal
  `OWNER_ADMISSION_EXPIRED` event distinguishes the admission case when compensation
  succeeds. Failed/timed-out compensation requires independent reconciliation.
- An expired idempotent replay does not alter an existing job. Existing task/status
  reads are not killed. If a task already dispatched before expiry, do not mark it
  failed, release its slot or retry merely because the admission window later closes.
- Health reports effective admission after its read, not just the persistent enable
  flag. It is still an observation, not permission to bypass the POST guards.
- AWS factory always supplies a nullable window. The core service has no implicit
  test bypass; local fixture adapters/tests must explicitly provide bounded windows.

## Limits and rollout gate

This is a controller-clock admission bound, **not** a hard dollar cap, single-job
limit, credential expiry or worker cancellation. It depends on the trusted AWS
clock. Workers already running keep their own deadlines; uncertain dispatches and
capacity slots still need the existing ownership/reconciliation checks. The user
must still finish with jobs/display false, circuit OPEN and no active tasks/slots.
No timer, schedule, IAM expansion, database schema or additional cloud resource
is introduced. No deployment or environment mutation occurred for this candidate.

Existing release/change-set/image/current-source guards remain. Legacy flag-only
execution and circuit-denial tooling must not be treated as compatible with this
candidate: they need a separately reviewed finite-window workflow and renewal of
the exact controller-code proof before any live enabling. Do not simply add unknown
environment keys to existing allowlists or bypass a failed readiness check.
Provider usage rights, fixed one-job/poll budget, current worker/security proof and
complete safe closure are still gates before live PRICE/ANALYZE owner UI integration.

## Verification

### Pure environment-change planner (local only)

`services/local-owner/src/admission-change.ts` prepares, but never executes, one
conditional enable payload and one restore payload. Its window is fixed at three
minutes from preparation; enable planning requires an unchanged baseline observed
within ten seconds. Only the provider-job flag and two absolute window fields may
change. Display stays false. Restore removes only this exact window and restores
the captured disabled baseline; unrelated drift is refused rather than overwritten.
An already-restored baseline yields a no-op. An expired window can still be removed.

This module does not read AWS, reset the persisted circuit, obtain credentials,
retry an uncertain write or verify shutdown. Caller-supplied code/configuration
fingerprints are assertions, not independent evidence. A future adapter must derive
those fingerprints from fresh verified AWS reads, enforce RevisionId conditions,
handle an uncertain response without blind retry, and prove task/slot/configuration
closure independently. No deployment or enabling is authorized by producing a plan.

Local tests exercise missing/future/expired windows, duration/UTC ambiguity, disabled
flag, production factory wiring without SDK calls, expiry during circuit/admission,
replay, compensation failure, post-dispatch expiry, hidden results and the existing
request time budget. This proves code behavior with injected clocks/dependencies,
not a deployed AWS expiry drill or system-clock correctness.

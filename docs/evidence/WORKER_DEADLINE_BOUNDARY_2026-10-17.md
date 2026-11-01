# Worker stage deadline boundary — 2026-10-17 Tokyo

Local source and synthetic tests only. No actual task, market-data request,
Bedrock invocation, deployment, permission change or new chargeable resource.

## Reproduced gap

The worker checked its absolute job deadline before claiming QUEUED, but not
after that asynchronous claim or after provider/model work. Four deterministic
red cases failed: expiry during claim, late PRICE quote, expiry before ANALYZE,
and late model output. In particular a provider returning at the deadline could
still trigger the next billable model stage. Late PRICE could become SUCCEEDED.
This is a mocked control-flow observation, not a live billing incident.

## Local correction

- Production lifecycle always passes the persisted absolute deadline and its
  validated clock into operation execution.
- Recheck before provider access, after the provider returns, immediately before
  model access, after model return and before the success transition request.
- Equality is expired; invalid clocks/deadlines fail closed before external
  access. Expired work conditionally becomes TIMED_OUT/JOB_DEADLINE_EXCEEDED,
  without storing late provider/model content or starting a new paid stage.
- Existing status/version conditions remain. A concurrent sweeper terminal
  state is not overwritten or retried. PRICE still never invokes the model.
  No provider attempt/token/permission limit is increased.

Nine new regression tests cover those stages, exact expiry, one millisecond
remaining, invalid clocks/deadlines, late sanitized failure and conditional
timeout conflict. Together with existing operation/lifecycle and all synthetic
symbol/locale cases, 33 focused tests passed. Service TypeScript compile passed.

All four root bundles were subsequently rebuilt, and two bracketed in-memory
compilations matched each written artifact and its input files. The corrected
local worker is 1,485,882 bytes, SHA-256
`69210cbdeef2399ca610f9277ce9b6a9fc7940d42b5dd03deb4e40cff930e159`.
The strict fixed 34-entry operator TypeScript program also passed. These are
local generated-byte/compile checks, not a new container scan or deployment.

## Follow-up elapsed budget and cancellation propagation

The first corrected stage-boundary snapshot separately passed its genuine
frozen-install whole gate: 83 steps, 1,157 tests, 1,156 pass/one existing Windows
privilege skip, 305,235 ms. Its source fingerprint was independently reread.
That pass does not cover this later cancellation revision.

Seven more red tests reproduced absent parent-signal propagation: pre-cancelled
provider/model calls still ran, cancellation could permit a provider retry or
accept late model output, and an active stage did not receive the elapsed job
budget. The follow-up links one owned operation deadline signal into provider
requests, provider backoff and model transport. Pre-cancelled calls do not start;
parent cancellation is non-retryable and its private reason is never reflected.
Each provider retry checks the parent again. Default backoff uses an abortable
timer. Provider and Bedrock per-attempt timeouts remain; no attempt/token limit
or SDK retry allowance is increased.

The elapsed timer is bounded by remaining absolute time and the existing
300-second maximum queued-job contract. It cannot gain time from a subsequent
backward clock movement. Both success and failure clear the owned timer and
dispose the owned signal; no permanent worker/loop is introduced. Standalone
fixture calls without a deadline still use the existing adapter timeouts.

Ten added cancellation/disposal tests also cover response-body consumption,
default backoff, actual signal propagation and success cleanup. All 65 focused
provider/model/operation/lifecycle/multilingual tests passed, along with service
TypeScript compilation. The four root bundles again matched two bracketed
in-memory compilations. The follow-up worker is 1,487,575 bytes, SHA-256
`ef15ccfce82bd4898db9f5d07b48add379f2d9bc2418af22296a4537289c8e85`.
This replaces only the earlier local generated-worker byte observation, not a
cloud image, application task, signed acceptance or billing observation.

## What this does not guarantee

These are stage-admission and result-acceptance checks, not a server-side spend
cap or a hard distributed kill switch. Cancellation is best-effort through the
actual fetch/SDK transports; a mock or remote service can ignore it. Aborting
does not undo a charge already accepted upstream or establish when the remote
model stopped. Repository writes take time and can race with a sweeper;
conditional conflicts remain errors. Initial host wall clock is trusted.
Standalone fixture operation calls may omit a deadline, but the actual
AWS lifecycle path cannot. No real cloud behavior is newly accepted by mocks.

The correction was made after the October 17 local image scan. That earlier
candidate is historical and does not contain this correction. Refresh the
current source-bound candidate and its full gates before any future promotion;
do not overwrite/relabel the retained tag or reuse its clean scan as proof of
the changed runtime. Keep cloud admission/display false and the circuit OPEN.

# Controller cumulative admission budget — 2026-10-19 Tokyo

Local, not deployed. The existing Lambda timeout remains 15 seconds, SDK calls
remain single-attempt, admission/display remain disabled and IAM is unchanged.

## Reproduction and correction

Two red tests accepted cumulative late admission, and two uncooperative circuit/
admission tests exceeded their 4-second test ceilings. Individually bounded SDK
requests did not bound the complete circuit/read/slot-fallback/launch flow.

Each create request now owns one monotonic **12,000 ms** budget. It surrounds the
complete asynchronous flow and every next effect, propagates cancellation into
controller DynamoDB/ECS and the circuit read, and is disposed on every exit.
The per-call guard is now a reusable budget plus a disposable one-call wrapper;
parent cancellation cannot broaden its existing per-call maximum.

No fresh budget is granted on slot fallback or compensation. Expired normal
responses cannot start RunTask, task-reference persistence or launch-failure
compensation. An uncooperative pending promise cannot keep the API method open
or revive its continuation after completion. Late circuit replies fail OPEN;
late circuit mutation acknowledgements require an independent reread, not retry.
The HTTP response remains the existing private-free INTERNAL_ERROR envelope;
internal telemetry adds only the fixed TIMEOUT category. No new public error
vocabulary, request field, CORS/authentication or task permission is introduced.

**73 focused tests** covering the shared budget, real repository/launcher class
with synthetic senders, controller service, HTTP handler, worker repository and
circuit store pass; service TypeScript passes. Normal acceptance/replay, existing
conditional compensation and error projections remain covered. One added HTTP
test initially used an invalid fixture without Content-Type; it was corrected
to the existing required application/json contract, not by weakening validation.

## Scope and residual ambiguity

The 12-second local admission budget leaves nominal room below the unchanged
Lambda timeout; it is not a measured AWS latency guarantee, a replacement for
the Lambda deadline or proof of current deployed behavior. Job deadlines, worker
provider/model limits and task/slot caps remain separate. A RunTask sent before
expiry may already exist despite cancellation. A transaction may already have
committed a QUEUED record/slot before its acknowledgement was discarded. Nothing
here proves cancellation or rollback, deletes such a slot or fabricates a task
reference. Retained ambiguous capacity needs independent authorized reconciliation.

This source is later than both failed earlier whole snapshots. It cannot borrow
their partial results or October 18 success. Actual container/current whole
verification and ending inventory must identify their own source and outcomes.

## Reproducibility observations retained

Initial native whole receipt `aff52275-4b8f-437a-bcdc-d37c17fb2e26` timed out.
Frozen receipt `52d268b5-69df-4f28-834d-bddfd0c25ed4` stopped in installation after
88 downloads/zero reuse; its exact cause remains unknown. New diagnostics retain
only bounded exit facts and fixed hints, never raw logs/paths/URLs or arbitrary
exception fields. Twenty focused installer/journal tests pass; diagnostic code
initially had a token-boundary bug and invalid test-root fixture, both corrected.

The separate instrumented frozen receipt `cd15656b-80f9-47d5-b2ec-eade651f810c`
passed its install stage but timed out in the whole gate at 359,995 ms. Its 82
completed records contain no failing completed step and are not a complete test
or gate pass. Its copied 560-file/5,590,291-byte source SHA-256 was
`2fe30b29003fee641bf0997fccbb23e260a33633f570dfd8869e1d09f18451bc`;
later current-source comparison matched, without changing the producer's failed/
sourceUnchangedVerified:false flags. Final cumulative-budget changes are outside it.

The unchanged nine infrastructure files passed all **56 tests** in a bounded
single-file-concurrency probe: 137,353 ms, versus roughly 94–97 seconds in the
earlier two-file whole observations. These are not controlled cold benchmarks
or a proven cause. One OS read observed 6.8 GiB visible/1.1 GiB free memory; that
is a point-in-time resource hint, not an OOM diagnosis. The slower serial mode
was NOT adopted. Process isolation, concurrency two, all steps/assertions and
the 360,000 ms ceiling remain. Observed Windows development Node is 24.19.0;
the reviewed Linux worker runtime is a separate Node 22 proof, not inferred here.

After that failed isolated run, independent local inventory at 12:08:43 UTC
found all ten residue counts zero; two assistant processes/one empty work parent
were preserved. No Docker was started in that preceding scope. Any later owned
container verification/closure must be recorded separately.

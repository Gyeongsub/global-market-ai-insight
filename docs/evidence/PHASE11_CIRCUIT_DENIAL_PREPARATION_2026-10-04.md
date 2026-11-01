# Phase 11 — Stage C local admission-denial preparation

Date: 2026-10-04, Asia/Tokyo. Local only, after temporary cloud alarm resources
were torn down and the login session ended. No new login, cloud API request,
controller enablement, deployment, provider/model request or task launch.

The [real signal-only alarm drill](PHASE11_ALARM_ACCEPTANCE_2026-10-04.md)
restored OPEN/11, but it did not test a signed job rejection with internal jobs
enabled. A new reusable `runOneCircuitDenial` helper prepares that later scope:
require exact health `status=ok`, `circuit=OPEN`, `jobCreationEnabled=true`, then
make exactly one PRICE/QLD/ko POST with an in-memory random idempotency key.
Accept only a typed HTTP 503 plus allowlisted `CIRCUIT_OPEN` error. A disabled
job path, arbitrary thrown text, unrelated 503, success or connection ambiguity
does not pass. Never retry or poll a guessed/accepted job.

The returned HTTP evidence deliberately leaves independent task count, slot
count and internal-execution restoration **false/unverified**. A response alone
does not prove zero persistence, task launch, external calls or successful
cleanup. Fresh consistent circuit and identity/ownership reads, the exact
Compute diff, bounded internal enablement, zero-write evidence, before/after
task-slot inventory and finally restoration still belong to a reviewed live
operator workflow. The helper does not perform those operations.

`pnpm operations:circuit-denial-preflight` emits the fixed zero-call plan only.
All arguments, including `--execute`, are rejected without echoing values.
Importing it has no side effects. Inherited credentials/deployment flags do
not change its zero-call behavior. It cannot enable jobs or submit a request.

The underlying private signed transport was tightened for this future scope:

- canonical root/default-stage Tokyo execute-api endpoints only; no arbitrary
  path, foreign host, credentials-in-URL, query, fragment or normalized alias;
- exact method/route pairing; GET has no body/custom headers; POST has only the
  three allowlisted job fields and one canonical UUIDv4 idempotency header;
- validation before credential/network use; no caller-selected auth headers;
- one at-most-ten-second deadline spans signing, fetch and response reads;
  late credential resolution after timeout cannot send a POST;
- streaming response cap 65,536 bytes, declared-length checks, strict UTF-8,
  JSON object validation, cancellation on limit/timeout and no redirect;
- fixed public error codes/status only, no reflection of remote messages,
  unknown codes, credential/network exception detail or causes.

Twenty-two focused tests passed: the existing seven signed PRICE/ANALYZE cases,
twelve new denial/transport cases and three zero-call preflight cases. The
composed test uses the actual local HTTP handler and controller service with
mocked storage/task adapters and signed in-memory responses. OPEN prevented
all create/attach/failure-write/launch spies; an existing job's status remained
readable without result/hash/task reference. Those are **local spy counts**,
not a live ECS/DynamoDB inventory or completion of Stage C.

No general framework, dependency change, browser live-API connection or public
authority was added. Future live use must refresh all boundaries; version 11
is a historical observation, never a reusable write version.

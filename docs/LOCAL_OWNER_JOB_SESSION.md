# Local owner job-session candidate

Date: 2026-10-25. **Local preparation only; no live-job execution or live-job HTTP route.**

`services/local-owner/src/job-session.ts` is a single-use, metadata-only session
core for the future owner workstation bridge. It does not create credentials,
construct an AWS client, read configuration, enable a flag, start a web server or
schedule a worker. The currently executable observation server is still limited
to its copied catalog/health snapshot and cannot invoke this module.

## Fixed boundaries

- One validated, copied `operation/symbol/locale` intent per instance; one generated
  UUID idempotency key, at most one POST, and only the controller's exact expected
  job ID afterward. Caller mutation and repeated start do not create another job.
- A current controller-style admission window is required for the POST. This
  local check is defense in depth, not a substitute for actual AWS preflight,
  IAM owner authorization, cloud admission expiry or provider entitlement.
- At most 16 status GET attempts, one in flight, minimum four seconds between
  completed nonterminal polls, and a fixed two-minute monotonic session lifetime.
  There is no background polling, queue, automatic retry or new job on refresh.
- Missing/invalid acknowledgements consume the submission. The expected job ID
  remains an operator recovery hint, not evidence that the job exists. A future
  real workflow must record it safely **before** dispatch so process crashes do
  not lose the reconciliation target. The optional local recorded-session factory
  described below now provides a tested persistence boundary; live wiring remains absent.
- Only matching public job metadata is returned. Reject private extra fields,
  wrong identity/locale/operation, changed expiry, regressing status/timestamps,
  unknown failure codes and **all result payloads**, even schema-valid ones.
  Known failure prose is fixed locally, never selected by a remote diagnostic.
- Expiry/close cancels local acknowledgement, discards the in-memory key and
  prevents later dispatch. Parent cancellation now reaches the existing signed
  client, including pending signing; a late credential resolution cannot POST.
  Each signed request also has its own at-most-ten-second monotonic deadline,
  with exact GET 200 / POST 202 success-status checks.
- A local timeout or terminal job record is not proof of ECS STOPPED, empty slots,
  restored flags, expired credentials or stopped billing. After any POST attempt,
  `remoteMayContinue` and `independentClosureRequired` stay true, even on success.

## Verification and remaining work

Unit and composition tests use deterministic clocks and injected transports.
All 30 operation/symbol/language combinations pass through real local signing,
controller routing, owner guard and public projection with fake gateway identity,
in-memory persistence and a synthetic worker. Native network is rejected in that
composition. This does **not** prove API Gateway signature validation or real AWS
authorization/worker execution. The tested source remains unconnected to the
live observation command. A separate synthetic-only owner preview now exercises
the request boundary in a real browser; it is not the ordinary market dashboard
or a live-job release.

## Local recovery record candidate

`createRecordedOwnerJobSession` in `services/local-owner/src/recovery-record.ts`
wraps the session. It first writes a uniquely named record under the validated
workspace's ignored `outputs/owner-recovery/`, using exclusive creation, filesystem
sync and bounded readback. It rechecks the exact unchanged record before start.
Failure closes the local session without dispatch. An existing file is never
overwritten; malformed or partially written evidence is retained, not repaired.

Only expected job ID, intent, preparation time and the finite admission window are
stored. No credential, raw idempotency key, task ARN, endpoint, provider payload,
quote or analysis is stored. File/directory redirection and hard-linked records
are refused. Unix mode 0600/0700 is requested where meaningful; this is **not** a
Windows ACL guarantee or protection from another hostile local process. Filesystem
sync is not a guarantee against every hardware/power-loss failure.

The record deliberately remains `dispatchMayOccur: true` and
`reconciliationRequired: true`, including when a request never started, a response
was lost, or a public job became terminal. It is an operator recovery target, not
proof of dispatch or cloud closure. The reader performs no AWS requests and does
not resume/retry work. Closure proof must be obtained independently before any new
live session; do not delete the record merely because the browser has closed.
This recovery wrapper is not yet exposed by a CLI or HTTP route and has only used local
disposable test directories and injected transports.

## Request boundary and synthetic browser rehearsal

`job-boundary.ts` allows exactly three empty-body, same-origin capability POSTs:
`/bridge/job/start`, `/bridge/job/status`, `/bridge/job/close`. The operator-pinned
intent and job ID cannot be chosen through HTTP paths/bodies. Its 32-request,
two-minute boundary retains the existing Host/Origin/Fetch Metadata, duplicate
header and credential-header checks; it has no CORS or arbitrary upstream.
Repeated start and concurrent operations cannot dispatch a second job. Close
clears the local capability and cancels acknowledgement, not remote execution.
The boundary is a candidate library, not a live server deployment or authority.

The separate `startOwnerJobPreview` factory uses a hardcoded synthetic transport
only. It cannot accept an AWS client, endpoint or credential. It serves fixed
assets on 127.0.0.1:4175, inherits the observation server's fixed security headers
and socket limits, and closes within two minutes. Test-only port zero is validated
at the actual bound Host/Origin before normalization to the boundary's fixed origin.
The existing live observation command remains read-only and cannot use these routes.

```powershell
node scripts/local-owner-job-fixture.mjs
node scripts/local-owner-job-fixture.mjs --execute-local-fixture
```

The first command performs no action. Explicit fixture execution needs a TTY and
uses a credential-scrubbed child with a 150-second parent watchdog. Initial page
load, language changes and refresh perform no job POST or automatic status poll.
The pinned fixture is PRICE / QLD / en; changing the page language translates
controls, not the already-pinned request. A single click starts one synthetic job;
manual status reads are at least four seconds apart. No result payload is shown.
Refresh respects the server-held consumed submission. The close button/Enter or
deadline closes the owned server; pagehide clears only local display memory.
Terminal refresh uses neutral ended wording because the session deliberately does
not retain the successful/failed outcome. A directly observed failed or timed-out
metadata response uses fixed localized wording, without remote diagnostics or retry.
This does not implement the main product's asset-selection/result workflow or
prove remote stop, MFA, live IAM, provider entitlement or AWS execution.

Before integration: current source/security proof; explicit verified data-use
entitlement; current exact controller/worker release proof; one-job recovery
journal integration; fresh read-only cloud baseline; finite controller-window enable/restore
workflow; strict owner HTTP/capability boundary; private browser UX; independent
task/slot/configuration closure. An injected transport alone is never approval.
A pure three-minute enable/restore payload planner is now tested locally under
ADR 0018. It has no AWS executor and does not satisfy the independent live
configuration-change or closure gates by itself.
Do not change the metadata-only boundary to display licensed results until the
personal-display/AI entitlement gate is resolved. No plan upgrade, domain, hosting,
email inquiry or publication is performed by this implementation.

See [ADR 0017](adr/0017-local-owner-aws-bridge.md),
[cloud admission candidate](adr/0018-owner-admission-window.md), and
[read-only observation procedure](LOCAL_OWNER_OBSERVATION.md).

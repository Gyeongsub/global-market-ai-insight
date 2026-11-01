# Browser API local acknowledgement — 2026-10-23 Tokyo

Local synthetic tests only. The displayed product still uses its separate demo
runner, not the developer API. No real fetch, AWS/provider/model/task call,
credential transmission, retry, deployment or publication was added.

## Reproduction and change

The existing request/poll timers aborted their signals but awaited the injected
fetch or reader directly. A supplied transport can ignore AbortSignal. In the
synthetic pre-fix reproduction, a started fetch remained pending 150 ms after
explicit caller abort. The finite probe exited afterward; it was not a passing
deadline proof or a claim that native browser fetch is generally broken.

`frontend/src/api/jobs.ts` now races local acknowledgement against its existing
abort signal, before starting transport and around each body read. Late transport
rejections are consumed; late successful, unclaimed responses receive best-effort
body cancellation and cannot resume result parsing/status callbacks. Reader
cancellation is attempted once, without awaiting a hanging cleanup, and throwing
cancel/release implementations cannot surface private error prose.

Existing 10-second request ceiling, 90-second default/120-second maximum polling
window, response-size/chunk limits, strict JSON/schema/identity checks, credential
omission, canonical URLs and no-auto-retry behavior are unchanged. No public API
contract or authentication mode changed. Parent listeners/timers are removed.
This code uses browser-compatible primitives, not Node-only budget imports.

## Evidence and limits

23 focused API tests passed, including seven new cases: pre-aborted admission,
ignored fetch on caller abort, unchanged polling deadline with no retry/status,
late response with hanging cancellation, late private rejection, uncooperative
reader with hanging/throwing cancel and late stream bytes. Synthetic transports
performed zero real network calls. Both original cooperative-abort tests remain.
Frontend type checking and targeted lint also passed.
No gate ceiling, test skip, transport schema or financial-safety rule was weakened.

The compiler-boundary whole run preceding this change completed all 90 steps:
1,341 tests (1,340 pass/one existing OS privilege skip), 357,557 ms, no timeout.
Strict saved result/current source matched 597 files/5,835,939 bytes, SHA-256
`8dd982571f7dcf87d44500c29bcdc2969e9138f79e93a1d1c9d005c9857e6122`.
Receipt `92533683-5dc8-4870-a28c-362951864a3e` completed 10:41:19.329 UTC.
That does not cover this later API-client change; its final whole/frozen proof
is separate in [safe stop](LOCAL_SAFE_STOP_2026-10-23.md).

The later actual frozen run `5ef745f9-3f72-4c03-9e30-e44ef4f288c1` did pass
all 90 steps/1,348 tests (one existing privilege skip), 339,305 ms. Its strict
599-file source matched before handoff-only documentation. The same finite
synthetic pre-fix probe now reports settled, not still-pending. No real network,
remote cancellation or cost-stop acceptance is inferred from those passes.

Acknowledgement is not remote cancellation, rollback, stopped-task verification
or a billing cap. A noncooperative underlying transport/socket/job may continue;
verify the real job and ECS task before a new user retry. JavaScript timers need
event-loop progress; synchronous blocking code cannot be interrupted by this
helper. No actual remote cancellation or cancellation-cost acceptance is claimed.
Current rights/authentication/hosting and all other release gates remain open.

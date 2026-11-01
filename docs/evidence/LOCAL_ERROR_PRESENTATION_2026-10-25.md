# Local error and submission presentation — 2026-10-25

Local-only continuation; no AWS, provider or model call, new dependency, public
API connection, GitHub publication or vendor contact. This is an implementation
checkpoint, not final safe-stop or cloud acceptance.

## Corrected user-visible semantics

- The old adapter collapsed most failures into DATA_UNAVAILABLE. All 12 stable
  public error codes now retain their identity; local INVALID_RESPONSE and
  REQUEST_FAILED have separate, fixed en/ja/ko messages. Unknown/prototype/private
  values map to REQUEST_FAILED without coercion or API-provided prose. The view
  offers no embedded retry/link action and does not claim worker/billing stopped.
- A reproducible result-redacted SUCCEEDED record previously announced a price
  success while the visible panel showed unavailable. The polite live-region
  projection now prioritizes the unavailable message. This is not a new server
  status or fabricated result.
- SUBMITTING previously looked like an acknowledged QUEUED job. The dashboard
  now shows a distinct localized sending label until the actual acknowledgement.
  The internal busy state and public API status contract are unchanged. There is
  no new POST, retry, increased deadline or remote cancellation capability.
- A schema-valid but different local fixture is INVALID_RESPONSE, not a verified
  market result. Late responses/rejections from a stopped request cannot replace
  a newer asset/language result.

## Verification so far

The combined quote/dashboard/announcement/error/contract/HTTP-adapter suite passes
35 tests on supported Node 24.22.1. It includes all 15 error codes in three locales,
private/prototype input rejection, the redacted-result regression, all 12 known
HTTP rejection codes with one POST each, transport failure without retry, and late
acceptance/rejection after a new GOOG/ja intent. Fixtures prohibit native network.

Before the later submission-label change, actual loopback browser checks confirmed
stop-waiting focus and enabled controls in en/ja/ko (including keyboard Enter),
and REQUEST_FAILED messages/live regions in all three languages after explicitly
closing the server. One Japanese click attempt missed the short-lived stop button
because the normal fixture completed; the terminal result was inspected, then a
separate keyboard request successfully tested cancellation. No longer timeout or
slower artificial server was introduced to make the test pass.

The finite server reported 16 requests, four admitted/launched synthetic jobs,
zero active jobs, retained jobs and timers on explicit closure. Both children and
the owned browser tab closed. This was local memory work only. Screenshot and
actual assistive speech remain unverified. The later submission label has automated
coverage but no subsequent browser observation yet.

The error/submission source subsequently passed a new tracked-clone frozen-install
proof, completed 2026-10-24T22:55:07.100Z: 645 files / 6,085,126 bytes, fingerprint
`ce04977a53f89bf6374f4f254b417258e0dd995f51dd7ab5c90698e1b9c26b68`.
The private receipt `local-clone-b550b17d-dde4-4925-b109-44f5335b484d.json`
records 90 steps and 1,436 tests (1,435 passed / one existing privilege skip),
33 loopback HTTP checks, 69,276 ms installation and 306,842 ms gate time under
the unchanged six-minute gate. Strict receipt/current-source comparison passed
before subsequent edits. Independent inventory at 22:55:22.9199054Z found all ten
residue counts zero, with two assistant processes excluded and two empty parent
directories retained. The proof downloaded fixed public npm packages, never
uploaded source or used private credentials. It is not publisher clone/CI proof.

## Later controller privacy follow-up (outside that receipt)

A synthetic stored-job probe showed that publicJob copied persisted error prose.
No real cloud disclosure was observed. The local projection now emits only fixed
failure prose and known public codes (plus the existing worker deadline code),
maps unknown codes to INTERNAL_ERROR, and includes a result only for SUCCEEDED
when display is enabled. Stale diagnostics on nonfailed jobs are omitted. The
fixture timeout now uses the real worker's JOB_DEADLINE_EXCEEDED code, rather than
the status name as a code. The browser still preserves the typed TIMED_OUT status.

Three regression tests plus the actual handler/session same-key replay assertion
cover private stored prose, malformed codes, diagnostic getters, failed payloads,
disabled display and no duplicate launch. An initial run caught the fixture's old
code; after aligning it, all 37 controller/handler/browser-session/loopback tests
pass. This later source passed its own whole-source proof as recorded below. No cloud
deployment, IAM change, persisted data mutation or additional retry was performed.

## Controller-source whole proof

Completed 2026-10-24T23:09:05.928Z, private receipt
`local-clone-6c6c425c-a18c-47f5-aa4a-5040153f8f64.json`: 646 files / 6,099,187 bytes,
fingerprint `91dfc660a4a85ebee472ee3be9ff95708dc8565301803c6a23436b7a7e2f7581`.
All 90 steps passed; 1,439 tests / 1,438 pass / one existing privilege skip.
Install 73,634 ms, gate 317,415 ms under the unchanged 360,000 ms bound, 33 loopback
HTTP checks. Strict receipt/current-source comparison passed before later edits.
Independent inventory at 23:09:18.7423990Z found all ten residue counts zero, two
assistant processes excluded and two empty parents retained. Public fixed npm
downloads only, no AWS, private registry credentials, source upload or original
repository mutation. Subsequent analysis-card CSS/tests are outside this receipt.

## Boundaries

No live authentication, data rights, TLS/hosting, exact-role IAM, package/image
legal/privacy or publication gate is cleared. No account billing inventory was
refreshed. A local waiting/terminal/error screen never proves cloud work or billing
has stopped; those require independent operational evidence.

# Local response/reflow boundaries — 2026-10-24 Tokyo

Local Phase 12 work only; no API gate, public contract, IAM permission, provider/
model limit, deployed image, hosting or publication change.

## Signed operator response boundary

Three actual small injected-transport red tests failed before correction:
duplicate decoded JSON keys were accepted, 5,000 empty chunks exceeded no work
bound, and valid JSON plus unacknowledged cleanup timed out rather than returning.
No real HTTP/AWS request or credentials were used; fixture credentials are dummy.

The signed acceptance client now uses the existing shared strict JSON parser,
preserving fatal UTF-8 and refusing BOM, duplicate decoded keys, excessive nesting
or parser work. A maximum of 4,096 data chunks complements the unchanged 65,536
byte ceiling. Exactly both limits remain accepted. Each read checks cancellation
before/after completion; late reads cannot continue to another read. Idempotent,
best-effort cancellation and lock release cannot hold acknowledgement or expose
private cleanup errors. A late fetch response is discarded without parsing.

Seven new tests cover the red cases, exact positive limits, malformed/type/parser
boundaries and late fetch/read completion. All **78 api-smoke tests** passed.
Existing signatures, Tokyo endpoint/path/payload allowlists, shared ten-second
request deadline, one non-retried POST and capped polling are unchanged. This is
not remote rollback, a task-stop test, new signing permission or a spending cap.
The transport still checks JSON syntax rather than adding a MIME requirement;
no untested stronger protocol claim is made. Final whole proof is separate.

## Actual browser reflow verification

Read-only DOM observations reproduced horizontal overflow at **innerWidth 320**:
document clientWidth 299, scrollWidth 320. The user's pre-existing 75% browser
zoom and scrollbar account for physical/CSS size differences. Temporary viewport
sizes were adjusted from measured values; global/browser zoom was not changed.

Removing the fixed body minimum and allowing compact header/metadata/panel rows
to wrap produced scrollWidth=clientWidth=299 at innerWidth=320 in English,
Japanese and Korean. Visible content was not hidden/clipped to manufacture a
pass. The new CSS regression retains this requirement. Actual observations:

- English/Japanese QLD Enter-triggered analysis: queued controls disabled, then
  completed localized leverage/path-dependency/downside disclosures.
- Korean Circuit OPEN, timeout, and SPCX DATA_UNAVAILABLE: no automatic retry;
  timeout does not assert remote stop; unavailable does not substitute/fabricate.
- Korean restored and retained on reload. Default viewport restored:
  innerWidth 2,048, clientWidth=scrollWidth=2,027. Captured console error list empty.
- Existing synthetic quote/freshness/provenance labels and no-cloud-call notices
  remain visible. These are UI fixtures, not live price/model/worker acceptance.

An initial restricted server could not be reached from a separate browser.
It was closed before an OS-capable, scrubbed loopback-only 4173 server was used.
Both had a ten-minute automatic close and bounded graceful-stop fallback; final
independent inventory is still required. Temporary viewport override and owned
test tab were closed/reset before AWS console work.

The pre-fix screenshot is retained in ignored outputs. Both attempted post-fix
Japanese captures timed out, so no post-fix screenshot or full visual/matrix/WCAG
conformance is claimed. DOM geometry/observed interaction is distinct from visual
QA. The separate public AWS logout screenshot exists; it contains no credentials.

Guarded build succeeded; JS bytes are unchanged and CSS reflects only reflow.
Eleven focused frontend artifact tests passed. Service typecheck and corrected
frontend lint/type commands passed (the first root ESLint path was nonexistent,
not a lint pass). Final source/whole proof and Security/Cost closure:
[safe stop](LOCAL_SAFE_STOP_2026-10-24.md), [dependency repair](ZOD_SECURITY_REFRESH_2026-10-24.md).

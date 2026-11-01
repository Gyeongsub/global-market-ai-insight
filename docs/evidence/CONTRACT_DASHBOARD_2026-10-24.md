# Contract-driven local dashboard — 2026-10-24, second session

This is a new local implementation after the earlier same-day
[security/reflow closure](LOCAL_SAFE_STOP_2026-10-24.md). That earlier full-source
fingerprint does not cover these changes. No AWS deployment, market/model call,
public endpoint, IAM change, subscription or GitHub publication is performed.

## Implemented path

```text
Dashboard explicit click
  -> single-use JobSession -> existing MarketApiClient
  -> injected in-memory Response adapter (NOT native fetch or a server)
  -> existing demo timeline + old, explicitly labelled fixtures
  -> strict public JSON/result validation -> matching request context -> view
```

The fixed `https://fixture.invalid/` origin is parsed only inside the adapter;
every request is intercepted in memory with no fallback, credentials or endpoint
configuration. Existing fixture CSP retains `connect-src 'none'`. This is NOT
an authenticated/live browser connection or an exception to provider rights.

- `api/job-session.ts` snapshots operation/symbol/locale for one explicit intent.
  A session submits at most one POST, cannot be reused to retry, and publishes
  terminal results only after the checked GET matches the complete intent.
  Idempotent terminal acceptance metadata alone cannot produce success content.
- One non-renewable 90-second local window covers submission and polling.
  Submission now accepts the caller's AbortSignal; the existing ten-second
  request/stream bound remains. Cancellation/disposal suppress late UI updates.
  Observer exceptions cannot restart work or select public error prose.
- Unknown errors map to fixed codes. Redacted successful metadata remains
  result-unavailable: no substitute asset, fixture fallback or local translation
  is inserted into a hidden remote result. A session is not a remote task stop
  or spending cap; accepted work may continue after local cancellation/timeout.
- Dashboard price/source/timestamps now consume the checked fixture PRICE
  result. Analysis renders all nonempty observation/opportunity/risk/special
  sections, uncertainty, original UTC data time, model/fixture identity, prompt
  version and canonical localized disclaimer. React escapes text as before.
- Asset/scenario/language controls cannot relabel an active request. A later
  language/asset selection clears the prior completed result. Only the locale
  is persisted; no job payload, key or AWS credential is stored in the browser.
- The existing demo runner still supplies the in-memory backend's timeline.
  It is not a second live runner. Fixture job metadata uses local simulation
  time; the market/model observations remain the old August snapshot, not now.

## Reproductions and verification

The new pre-aborted POST test first failed: transport still started. Passing
the signal through the existing request boundary fixes it without a retry or
deadline increase. Initial new adapter tests also found JSON property-order
comparison and JSX test-runtime issues; both were corrected, not suppressed.
The initially inferred UUID parameter type needed an explicit string annotation
while retaining the same runtime UUID validation.

A later focused red assertion found that a FAILED job record incorrectly set
`remoteMayContinue=false`. A terminal database record alone is not worker-exit
proof. The session now conservatively keeps that fact true for accepted remote
failures as well as timeouts/cancellation. No UI behavior or cloud setting is
changed by this correction. The already-running first frozen proof covers the
preceding snapshot, not this later assertion/source; final verification must
cover the corrected snapshot independently.

Forty-eight focused client/session/demo/controller tests pass, including:

- 30 request combinations through the actual client/session and in-memory
  fixture adapter, with native fetch mocked to reject and observed calls zero;
- a separate 30 combinations through the actual controller HTTP handler,
  validation and public projection, using only in-memory repository/task fakes;
- original controller OPEN/disabled admission, disabled result projection,
  explicit same-key replay/conflict and launch compensation across the client;
- wrong operation/symbol/locale, redaction, private errors, single POST, ignored
  transport abort, late completion, disposal, observer failure and shared budget;
- all three localized result renderings and escaped hostile text; no actual
  Fargate/model/provider/role/notification was involved in these tests.

Frontend types and targeted lint pass after correcting the React import usage
and two unnecessary regex escapes. The module-metadata suite first failed one
existing junction test under restricted OS permissions; the identical suite
then passed **13/13** in the OS-capable environment. The test was not skipped,
deleted or weakened to clear the failure.

The browser's production build separately passed **30 normal combinations**
(five symbols x three locales x PRICE/ANALYZE) and **nine localized negative
cases** (circuit, timeout, SPCX unavailable), using Enter to submit. Busy controls,
requested-language clearing, checked price provenance and analysis metadata were
observed. At measured `innerWidth=320`, clientWidth=scrollWidth=299 throughout;
existing browser zoom was not changed. Error console entries were empty.

Temporary viewport override was reset; then-current clientWidth=scrollWidth=406.
Owned preview tab closed. The first non-interactive preview ended immediately
and its browser navigation was refused; the later explicit interactive session
was reachable, had a ten-minute automatic close, and acknowledged normal stop.
One new screenshot request timed out. No screenshot was saved and no complete
visual/screen-reader/WCAG acceptance is claimed from DOM/geometry observations.

## Bundle and supply-chain scope

No dependency/lock change. The UI-observed build before the later conservative
remote-continuation correction emits one JS chunk **244,144 bytes**,
SHA-256 `8ea7f60a4577eca435b71b5f55bc30e3faabae4616017804719ac2ebc9761bf9`,
and CSS 12,730 bytes, SHA-256
`bc4dd1f21c03463a7e5d832ad98bc56a8b05f1af6f2ec3e3f4ea13644cb23680`.
The five-file current-artifact audit matches pinned runtime/helper notices and
finds no forbidden secret, internal endpoint, personal path or source map.

Module origin metadata now explicitly categorizes the six imported first-party
contract files: strict JSON, result validation, disclaimer and the three result/
error schemas. Other shared/foreign paths remain unclassified. This is origin
categorization only, not proof of source/native/publisher/legal provenance.
The two generated helpers and all existing license/publication gates remain.
Original PNG, historical SBOM, recovery copies and manual findings are retained.

## Remaining boundary

No public backend authentication design, external/derived-data display rights,
CloudFront modern-TLS/domain/billing choice, Maintenance IAM acceptance or actual
recovery/notification is cleared here. Installed CLI is still 2.36.19; unchanged
simulator matrices were not repeated. Official documentation was reread, not
treated as an account-specific cause or permission grant:

- [IAM simulator differences](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_testing-policies.html)
- [SimulateCustomPolicy](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html)
- [Default-certificate TLS behavior](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_ViewerCertificate.html)

Final whole/frozen proof, current cloud-read limits and independent local closure
are recorded separately after completion. The earlier same-day 1,358-test proof
and earlier 11+12 AWS reads are historical, not this session's current evidence.

The first new frozen run separately passed 90 steps/1,384 tests (1,383 pass/one
existing privilege skip), 349,039 ms within the unchanged 360,000 ms ceiling.
Its 612-file source predates the later FAILED-record cost assertion/correction
and closing record. It is not the final corrected-source proof.

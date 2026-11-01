# Fixture preview security-policy parity — 2026-10-18 resumed

Local preparation only: no AWS login/read/write, publication, image push,
provider/model call or resource/subscription purchase.

## Reproduced gap and correction

A new test loaded the actual Vite configuration and failed because production
preview had no Content-Security-Policy. The future CloudFront draft already
denied API connections, but that did not establish local preview enforcement.

The exact CSP and permissions policy now have one side-effect-free shared
definition, imported by both the hosting template and production preview.
`connect-src 'none'` forbids API/XHR/WebSocket connections; scripts remain
self-only without inline/eval, frames/forms/base/object embedding are denied.
React's existing chart style attributes retain their narrowly documented
exception. `nosniff`, DENY framing, no-referrer, and disabled camera/microphone/
geolocation accompany the preview. No credentials, CORS allowance, endpoint,
remote host, user permission or policy bypass is introduced.

The CloudFront resource settings, disabled distribution, private origin,
certificate/TLS decision and number/types of resources are unchanged. This
does not deploy the shared policy or clear any hosting exit. Development HMR
remains a distinct loopback-only mode, without applying the preview CSP to its
required development connection. No global browser/OS security setting changes.

## Tests and actual response observations

The regression passes after the correction. A second test checks frozen finite
header fields and rejects accidental mutation/live-connection allowances.
Existing infrastructure assertions confirm the exact shared CSP/permissions
values, no new resource types and a disabled fixture-only distribution.
Frontend/infrastructure TypeScript pass. Seventeen focused config/HTTP/proof
tests pass in the authorized execution environment; a sandbox-only junction
creation EPERM was not converted into success or hidden with a new skip.

The actual fixed HTTP proof performed **33 loopback requests**, checking both
development and preview, exact notice bytes, sensitive-path rejection and no
CORS response to an untrusted origin. Preview HTML and every generated asset
HEAD response matched all five security headers. The notice route retains its
own stricter sandbox CSP. All owned listeners and the synthetic sentinel folder
were removed. No external network or AWS call was made by this proof.

Whole-gate wrappers now require explicit true header/HMR checks and false remote
TLS/hosting claims; missing, truthy-string or older HTTP evidence fails closed.
The existing whole-gate time ceiling, concurrency, test discovery and privilege
skip are unchanged. The separate actual browser and final whole observations
below do not borrow a unit-fixture pass or the earlier worker source hash.

The first actual whole installation for this scope is retained as failed receipt
`97c0b915-567d-416e-bdf9-996cc685ec5a`: 84/87 steps, one failed frontend-contract
step, 312,885 ms, no timeout. Its captured-before-gate source was 542 files /
5,470,492 bytes, SHA-256
`bea6a2be10badc67921ce80626d08580687d6d93121aed0d20cd005111335586`;
the failed record makes no unchanged-source or successful-cleanup claim.
The exact frontend group independently reproduced one failure among 60 tests:
an older source-format assertion required the preview object to end immediately
after `strictPort`, before the newly required headers. The corrected assertion
still requires the exact loopback/port/strict values and additionally the shared
headers; the actual loaded-config test now verifies both development/preview
ports and strict binding. No test, skip, request bound or deadline is removed.
The corrected whole result must be a new receipt, not a rewrite of this failure.

A background in-app browser also loaded the actual production preview under the
new response policy. Japanese QLD synthetic analysis completed, its existing
three risk sections rendered, Korean switching worked, and no warning/error/CSP
violation was observed in that tab. The localized notice link opened a separate
`text/plain` document with 119,919 displayed characters and zero script elements.
No network request was injected into the page. Only owned temporary tabs were
closed, the viewport override was reset, and the local port-4174 server was
stopped. The user's existing Chrome/AWS tabs were not inspected or changed.

## Final accepted implementation snapshot

Corrected fresh-install receipt `f39fc911-5f73-43bf-aac3-c9415d14f345` completed
04:14:12.165 UTC: 542 files / 5,472,371 bytes, SHA-256
`041137a4d547fbc27d06d81d7de4b08237b2d756160dbfabb08a035e961d39e5`.
All 87 steps/four groups passed, **1,219 tests** (1,218 pass / one existing
privilege skip), **309,420 ms** under the unchanged six-minute gate ceiling.
Explicit actual HTTP policy evidence, 33 requests, listener/temp closure and
independent strict current-source receipt comparison passed. Later handoff
text is outside that fingerprint and separately audited; no implementation
change follows it. The failed earlier receipt is retained, not replaced.

## Limits

We do not inject a network request into the browser to simulate a live API.
Header-byte equality plus actual rendering is not exhaustive CSP penetration
testing, remote HTTPS/HSTS/TLS/origin validation, an account-wide hard spend cap,
or screen-reader speech verification. Keep all live-data rights, auth, remote
rollback, license/privacy and publication gates closed. Docker remains stopped;
the prior worker acceptance covers its exact earlier whole-source snapshot.

# Local application request boundaries — 2026-10-15

Local source and synthetic regression tests only. No actual provider key was
read, provider/Bedrock quote or analysis requested, image built/pushed, Lambda
updated, IAM changed or AWS task run. These changes are not deployed acceptance.

## Controller: raw decoded bytes and BOM consistency

Two new regression tests first failed against the prior handler: canonical
Base64 JSON with a leading UTF8 BOM was accepted with HTTP 202, whereas plain
JSON rejected it. Default TextDecoder normalization could strip three bytes,
letting a 4,098-byte decoded request borrow a 4,095-byte text count.

The handler now bounds actual decoded bytes before decoding and preserves the
BOM so JSON parsing rejects it consistently. Canonical Base64, fatal UTF8 and
existing request/schema checks remain. Both new tests plus six existing handler
tests passed: BOM and oversized requests are rejected before circuit/repository/
task effects, the valid 4,096-byte boundary remains accepted, and no private
request text is reflected into public errors/logs.

## Twelve Data: credential and response transport

The official [authentication documentation](https://twelvedata.com/docs) was
read without authentication, bounded to 1 MB, and its exact recommended example
`Authorization: apikey your_api_key` was observed after 166,153 bytes; the unread
remainder was cancelled. This is documentation, not an account entitlement or
live provider test. No actual key or market-data endpoint was accessed.

The worker sends its validated snapshotted key in that Authorization header,
not a URL query. HTTPS destination stays fixed; automatic redirects, ambient
credentials and referrers are disabled. Invalid/control-bearing credentials and
non-integer/non-finite timeouts fail before any request. No diagnostic reflects
raw remote errors or credentials. Retry count and timeout caps remain bounded;
absent Retry-After now uses bounded backoff instead of coercing null to zero.

Success bodies must be JSON and at most 32,768 streamed bytes with fatal UTF8
and BOM rejection. Declared and actual size limits are independent. Error and
rejected streams are cancelled, and the attempt controller is aborted on exit.
There is no unbounded response.json fallback. An added empty-error-body test
first reproduced a status/retry regression in the new bounded reader; the
correction cancels optional error bodies without requiring success JSON. Empty
success still fails, and terminal empty 429 retains its rate-limit error.
Eleven provider tests passed,
including the original identity/SPCX behavior and new URL/header/redirect,
stream/cancellation, malformed-content, credential-snapshot and timeout guards.
Together with controller tests the final focused run passed 19/19 without skips.

No key rotation or permission increase was required. Public provider display/
derived-result rights remain unverified; disabled jobs/display, OPEN circuit,
image/source acceptance, maintenance IAM, hosting and release gates are unchanged.
The deployed worker/controller must not be described as containing this local
revision until their separate gated comparison/deployment is actually completed.

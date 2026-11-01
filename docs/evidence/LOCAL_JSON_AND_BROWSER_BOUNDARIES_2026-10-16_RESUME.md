# Unambiguous JSON and browser-client boundaries — 2026-10-16 resume

Local source/mocked transports only. No real key, AWS job, model/provider call,
public endpoint, deployment or GitHub action. Existing cloud guards remain
disabled/OPEN. The earlier image triage covers a retained artifact, not these
later worker/controller changes; no current-source image pass is borrowed.

## Reproduced and corrected ambiguity

Two new synthetic regressions failed before implementation: duplicate request
keys returned 202, and duplicate provider facts silently retained the last
value. Plain and Base64 bodies now reject exact and escaped-equivalent repeated
keys before circuit admission, repository creation or task launch. Provider
responses reject contradictory facts without retry or reflecting their contents.
A third reproduced regression showed case-aliased event headers being selected
silently; repeated content-type/idempotency names now fail with a fixed 400.
These are application boundary observations, not proof that API Gateway exposes
every original wire-header spelling or already-decoded SDK duplicate field.

The shared parser retains native JSON grammar but inspects original quoted keys
with an iterative per-object set. It does not evaluate source, use a recursive
reviver, trim/normalize conflicting keys or repair a malformed payload. Limits:
65,536 bytes maximum, smaller caller bounds unchanged, depth 32 and 4,096 counted
items. Exact/escaped duplicates fail even when the final value looks safe;
same keys in different objects and repeated array/string values remain valid.
Fixed parser errors contain no raw key/value/remote error. UTF8/BOM and existing
request/provider size controls remain. Persisted result and legacy text-output
decoding share this guard; already-parsed SDK tool input remains subject to its
separate existing exact shape/selection validation, not raw-text claims.

Seven shared-parser tests include 500 deterministic nested positive/duplicate
pairs, escape parity, Unicode aliases, prototype-data behavior, malformed
grammar and independent byte/depth/item limits. Controller/provider/repository/
legacy-output regressions and strict services checking pass. No token/retry/
concurrency/time limit was increased and no valid canonical result was replaced
by fixture data.

## Browser API client (still not connected to live UI/backend)

Three additional red regressions reproduced full-body collection before the
size check, unredacted transport errors and silently accepted duplicate/extra
response fields. The prepared credential-free client now:

- Stops/cancels a streamed reply at 65,536 bytes or 4,096 chunks, validates JSON
  media/length declarations and fatal UTF8/BOM/duplicate-key boundaries.
- Propagates cancellation while reading a pending stream and retains existing
  ten-second request / maximum 120-second overall polling limits.
- Rejects malformed/extra outgoing fields and malformed UUID headers before
  network submission; requests snapshot only operation, symbol and locale.
- Requires 202 for create / 200 for status, exact accepted fields, canonical UTC,
  requested job identity and known public envelope/error codes.
- Reuses the shared result schema for any present success data; refuses data on
  other states and malformed failure metadata. SUCCEEDED without a result remains
  valid metadata when live display is disabled, preserving the server contract.
- Retains known error codes/status but supplies fixed safe prose, not remote
  messages/URLs/stack traces. Result text is still untrusted presentation data.
- Snapshots polling identity/signal/callback and preserves credentials omit,
  no-store, redirect error and no-referrer. It adds no signing key or endpoint.

Sixteen focused browser-client tests and frontend type checking pass. Earlier
minimal success fixture data was replaced by a complete schema-valid quote;
separate negative cases continue rejecting that old incomplete shape. A valid
redacted success and normal error/abort behavior are explicitly tested. This
does not establish live API authentication, data rights, assistive-technology
speech, public hosting, or product acceptance. Fixture UI remains fixture-only.

## Verification boundary

The whole gate retains all four test groups, concurrency two and 360,000 ms.
The inert triage plan brought it to 80 steps; the later separate retired-key
zero-action plan brings the final resumed total to 81. Its current/frozen result
must be independently recorded for this source, not inherited from morning's
1,078-test snapshot. No lockfile, package version, CI/workflow, Git remote or
publication setting changed. Later handoff text receives its own scans.

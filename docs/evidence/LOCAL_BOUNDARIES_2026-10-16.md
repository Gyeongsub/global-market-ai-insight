# Local boundary regressions — 2026-10-16

These changes are local source only, not deployed controller/worker, actual
provider entitlement, live model acceptance or publication approval. No real
provider key, Twelve Data request, Bedrock inference or cloud mutation is used.

## Reproduced before repair

- Two text-encoding regressions failed: the secret scanner/publication audit
  silently accepted invalid UTF-8 and NUL-bearing/UTF-16 text as inspected.
- Two quote regressions failed: empty/whitespace/nondecimal values could become
  numeric facts, and missing/nonboolean market state was labeled CLOSED.
- Two analysis-adapter regressions failed: untrusted usage field names could
  enter error messages, and mutating the caller's options changed an already
  validated model/transport. A separate negative observation confirmed the
  field-name reflection, without printing the untrusted message itself.

## Revised boundaries

Text candidates now require fatal UTF-8 decoding and no NUL. Unknown encoding
is an explicit review/error category, never a clean scan. Other candidates are
still inspected; no detector/fixture is allowlisted or assertion removed.

Quote conversion accepts finite numbers or bounded decimal strings only.
Unavailable market-open state remains UNKNOWN; true/false still map to their
explicit states. No asset substitution, live freshness or exchange entitlement
is inferred. Existing issuer/symbol and response-size/redirect guards remain.

Analysis usage has exactly three owned safe-integer counters, approved limits
and consistent totals. Errors use fixed text and the returned counters are a
new object. The validated model ID and chosen transport are snapshotted; callers
cannot replace them by later changing the constructor options. No paid retry
or model/output-token boundary was increased. This is not a spending hard cap.

## Focused results

- 25 source/publication tests passed, including real temporary junction refusal.
- 22 provider/deployment tests passed at the earlier quote/drill checkpoint.
- The later complete provider/analysis group passed 21 tests; service TypeScript
  checking exited zero. No network/SDK client was used by those mock transports.

These observations overlap existing tests and must not be added as a unique
whole-suite count. Final whole/current/frozen results have separate exact source
fingerprints in [the gate observations](PHASE12_LOCAL_GATES_2026-10-16.md).

All previous release/privacy/provider/IAM/legal/image gates remain independent.

## Later escaped-string checkpoint — separate source

After the earlier frozen snapshot passed, a local probe found an additional
heuristic gap: JSON-equivalent escaped keys/values were not reported. Three
new integration regressions failed before repair, including an escaped contact
string. No actual credential, contact or account value was sent anywhere.

The shared in-memory inspection now retains the original source, a normalized
view of complete JSON-style double-quoted tokens, and decoded escaped values.
It never evaluates code or parses an object that could discard duplicate keys.
Original/duplicate fields remain inspectable. Source, frontend/backend artifact
and publication credential checks use the same bounded helper; publication also
applies contact/path/cloud-identifier review to those views. Unknown/excessive
normalization remains blocked. Fixed byte/token/work bounds prevent unbounded
decoding; this is not a universal JavaScript parser or complete privacy proof.

All 32 revised source/publication tests passed in the normal Windows context.
Current source scan reports zero high-confidence credentials; publication still
reports 27 manual findings across 24 files/492 candidates, readiness false and
zero network/push. No fixture, image/SBOM, rights review or detector was waived.
These changes are later than the 1,068-test frozen source below and require
their own whole proof; no earlier successful fingerprint is reused.

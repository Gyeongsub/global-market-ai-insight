# Expiry transport local review — compatibility corrections, live result pending

**Superseded preflight checkpoint:** the one approved live cycle has since run
and been cleaned up. HTTP 200 failed normalization; no second call occurred.
See [actual result and offline follow-up](SYNTHETIC_EXPIRY_CONTRAST_2026-10-31.md).
The historical preparation below is not authorization for a retry.

## Evidence boundary

The [October 30 attempt](SYNTHETIC_EXPIRY_CONTRAST_2026-10-30.md) failed its positive
control and was cleaned up. Its sanitized record cannot identify transport, HTTP,
timing, JSON, normalization or domain validation as the failure source. Do not
retroactively label the actual cause from today's fixtures.

On October 31 the user requested local diagnosis and separately approved one new
bounded role/STS/two-model-request cycle. That approval is distinct from the
consumed October 30 cycle. No new AWS mutation or inference has occurred at this
preflight checkpoint; full current/fresh-clone gates precede execution.

## Reproduced and corrected locally

Two new regressions failed before correction:

1. The native endpoint used a literal colon in the model URI label, unlike the
   pinned AWS SDK's `%3A`. It now matches the SDK's encoded target. A fake-credential,
   no-network SDK request-handler test compares method/origin/path, parsed request
   body, bytes, and the exact re-signed SDK authorization header using the native
   SHA/HMAC adapter. JSON property order is not a semantic payload difference.
2. Native HTTP success JSON was passed directly to the internal analysis adapter,
   bypassing the existing SDK transport's three-counter usage projection. A valid
   fixture with documented zero cache metadata was rejected. A dedicated pure
   native-response adapter now allows only zero cache-read/write counters and an
   empty cacheDetails array, then projects the three required usage counters.
   Unknown fields, nonzero/malformed cache metadata still fail; missing/invalid
   counters, token caps, sums and tool output remain subject to the unchanged
   domain validator. Prompt caching is neither requested nor enabled.

[AWS TokenUsage](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_TokenUsage.html)
and [Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)
were reviewed on October 31. Optional cache fields are part of the external API,
not permission to weaken the application's cost contract. These findings prove
local compatibility issues, not which condition caused yesterday's live failure.

## Sanitized diagnosis and unchanged limits

The operator snapshot now records fixed checkpoint labels, bounded numeric HTTP
status, transport failure category and an independent cleanup-failure flag.
Arbitrary upstream Error fields, response text, headers, prompts, identifiers and
credentials are not projected into diagnostics. A lost response is still unknown,
not an IAM denial. Successful parsing is still not positive-control acceptance.

One STS assumption, two-request maximum, no retry/admin fallback, exact Tokyo
model, 512 output tokens, 20-second requests, five-minute IAM policy and bounded
post-window credential retention are unchanged. No user-facing runner, role/trust
policy, provider switch, circuit, public endpoint or always-on service was changed.
Normal application credential expiry is unchanged.

The focused suite passed 31 tests and service TypeScript checking after correction.
No AWS calls or real credentials were used by those tests. Current/full-clone
verification and the newly approved one live cycle are the next gates.

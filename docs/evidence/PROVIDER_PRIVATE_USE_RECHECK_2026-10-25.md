# Private owner data-use check — 2026-10-25

Read-only public-source review; no account change, purchase, email or legal advice.
The user's current choice is real AWS with access restricted to the owner, no
domain purchase and no public/GitHub release. This changes the audience, not the
provider subscription's permitted uses.

## Evidence and limit

- [Individual pricing](https://twelvedata.com/pricing) describes Basic as free,
  with 8 API credits/minute, 800/day and internal non-display use. Internal display
  appears in Grow. The directly opened page timed out in this check; its current
  official search-index text supplied these descriptions, not an authenticated
  account entitlement. Displayed paid prices vary with credit configuration and
  billing term, so no minimum purchase quote is asserted here.
- [Terms of Use](https://twelvedata.com/terms), dated January 1, 2026, distinguish
  non-display from data shown to people; sections 2.1/2.2 tie permitted use to the
  subscription/add-ons/agreement. The general internal-use grant is not enough
  to disregard the plan-specific distinction.
- [Personal/commercial guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage),
  labelled updated this week, names Grow/Pro/Ultra for individual uses and Pro for
  programmatic internal AI assistants. It does not establish this Basic account's
  permission to pass market data to Bedrock.
- [US equities guidance](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data),
  dated August 18, 2026, discusses default feed access and exchange fees. Its usage
  paragraph refers to paid plans. Its Basic EOD-access statement does not resolve
  the separate plan-specific display/AI question for this workflow.

## Decision

Basic private display and AI-processing entitlement remains **unverified**. This
is not a conclusion that every personal Basic experiment is prohibited. API
success, private IAM access, attribution or hiding the final result alone cannot
establish permission for all upstream processing. Keep live market display and
new provider-backed owner-job execution blocked until the exact use is resolved.

No upgrade, paid trial, vendor inquiry or substitute provider was selected. The
user previously declined a vendor inquiry; do not send one without a new explicit
request. A reviewed alternative or explicit entitlement decision is a separate
next step, not permission inferred from autonomous implementation instructions.
Existing local synthetic tests and the actual read-only AWS catalog/health
observation remain valid within their stated scopes.

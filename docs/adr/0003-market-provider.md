# ADR 0003: Provisional Twelve Data adapter restricted to internal development

- Status: Blocked for public live display; proposed for private development evaluation
- Date: 2026-08-23

## Decision

Keep the provider-neutral interface and evaluate Twelve Data only in a private, non-production development environment. Do not activate public live quotes until all five symbols, timestamps, freshness, attribution and overage behavior are verified **and** the selected plan or written agreement explicitly permits external display.

The current individual Basic plan is free but described as internal non-display use. Twelve Data's current usage guidance says individual plans permit personal/internal educational and development use but not redistribution or commercial display to third parties. A public portfolio site therefore remains fixture/unavailable-only unless suitable external-display rights are obtained or another provider is approved.

## Why

Official documentation covers stock/ETF discovery and quote data suitable for the normalization contract. The explicit deployment guard prevents a free development entitlement from being mistaken for public display permission.

Infrastructure configuration must keep `marketDataUsageMode=internal-development-only` and `enablePublicLiveQuotes=false`. Changing either value requires a dated license review and an ADR update; a code switch alone cannot grant data rights.

## 2026-09-23 read-only license refresh

Twelve Data's [commercial/personal usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage), updated 2026-08-04 and reviewed 2026-09-23, describes individual Basic/Grow/Pro/Ultra as personal/internal, including educational development and testing, and excludes data redistribution and commercial third-party display. The [current Terms of Use](https://twelvedata.com/terms) say external display/redistribution needs an expressly permitted tier, add-on or separate written agreement. The [business-plan comparison](https://twelvedata.com/pricing-business) labels its Basic tier internal non-display and marks external display in higher business plans, but that page is not a quote or approval for this user. [Attribution guidance](https://support.twelvedata.com/en/articles/12647398-attribution-guidelines-for-using-twelve-data) addresses attribution when public display is licensed; attribution alone does not confer display rights.

**Inference for this portfolio:** even a no-fee public demonstration with live Basic-plan quotes would provide market data to third-party viewers, so we cannot treat the current Basic entitlement as authorization. Continue private acceptance and fixture-only UI. Before any live public display, obtain explicit written permission for the exact audience, symbols, freshness and result format, or select another licensed provider through a new decision. No subscription/plan change was made in this review.

An IAM-protected, explicitly approved acceptance run may separately set the deployment-only `GMAI_ENABLE_INTERNAL_JOBS=true` gate. That gate is valid only when `GMAI_ENABLE_API=true`; the controller verifies `API_AUTH_MODE=AWS_IAM`, and `ENABLE_LIVE_RESULT_DISPLAY` remains hard false. This permits bounded private provider evaluation without implying browser, redistribution or public-display rights. It defaults false and every deployment or call remains a Security/Cost approval boundary.

## 2026-10-14 read-only license refresh

The current public terms and personal-use guidance still do not establish this
account's rights for the intended third-party live display or derived results.
Personal pricing now calls the free entry plan Free rather than the support
article's Basic; no actual account entitlement change is inferred. AI-generated
text and attribution are not substitutes for the exact display-rights decision.
Keep the existing internal-development and disabled-public-display gates.
No provider API, login, purchase, agreement or support submission occurred.
See [dated source review](../evidence/PROVIDER_PUBLIC_DISPLAY_RECHECK_2026-10-14.md).

## 2026-10-24 alternative-provider precheck (no decision change)

A bounded official-source comparison of FMP, Alpha Vantage and Marketstack did
not establish a free, five-symbol, externally licensed replacement. API access
and paid-plan marketing are not equivalent to this portfolio's display/derived
rights. Provider fees are outside the AWS USD 5 Budget; no account, request,
subscription, inquiry or migration was performed. The current Twelve Data price
configuration/older From-pricing also needs clarification before any commitment.
[Dated comparison, primary sources and limits](../evidence/PROVIDER_RELEASE_OPTIONS_2026-10-24.md).

## Failure behavior

If `SPCX` does not resolve specifically to Space Exploration Technologies Corp. on the intended exchange, return `DATA_UNAVAILABLE`. Never fall back to another instrument.

# Market Data Provider Evaluation

Review date: 2026-08-29. Re-verify before signup or production-like use.

## Provisional recommendation: Twelve Data for private development only

Why it is the leading candidate:

- Official documentation exposes discovery and quote endpoints and supports stocks and ETFs.
- Official US equities guidance says subscription plans include access to US stock market data, with plan-dependent coverage and credits.
- The adapter can obtain price, change, currency, exchange/market context and timestamps without scraping.

## Current license and cost gate

- Individual Basic is currently USD `0`, with 8 API credits per minute and 800 per day.
- The pricing page labels Basic as `internal non-display usage`; Grow is the first individual tier that advertises internal display access and is paid.
- Current provider guidance says individual plans support educational projects and non-production development, but do not permit redistribution or commercial display to third parties.
- A public portfolio website counts as an external-display risk even when it is free to view. Therefore public live quotes stay disabled until Twelve Data confirms an appropriate right in writing or a different provider with suitable terms is selected.
- The conservative project scope is narrower than the broadest possible interpretation of the provider guidance: Basic may be used only for bounded private API coverage/metadata validation. Provider-returned live quotes are not enabled in the local or public UI. Dated fixtures and explicit `DATA_UNAVAILABLE` states remain the UI source until display rights are confirmed.
- Do not start Grow or any other paid provider subscription without a separate cost and licensing review plus explicit user approval.
- No Twelve Data account, subscription, API key, payment method, or API request was created during this review.

Primary references:

- [Twelve Data API overview](https://twelvedata.com/docs/introduction/overview)
- [Twelve Data symbol search](https://twelvedata.com/docs/advanced)
- [US equities market data](https://support.twelvedata.com/en/articles/9935903-us-equities-market-data)
- [Current individual pricing](https://twelvedata.com/pricing)

## Why the choice remains provisional

No API key has been used in this repository. A private development evaluation may proceed only after the user creates or confirms a Basic account without entering a paid subscription. Before enabling even that bounded evaluation, test every symbol and record:

- exact returned name, symbol, exchange and instrument type
- quote timestamp, timezone, market status, currency and freshness
- rate limit, overage behavior and response headers
- display attribution, caching and portfolio-demo rights
- behavior outside market hours and on holidays

`SPCX` deserves special validation. SEC filings in June 2026 identify Space Exploration Technologies Corp. under `SPCX`, while an older ETF previously using `SPCX` changed to `SPCK` in April 2026. The provider response must be matched by issuer and exchange, not ticker alone:

- [SpaceX offering filing](https://www.sec.gov/Archives/edgar/data/1181412/000162828026042466/spaceexplorationtechnologi.htm)
- [Former SPCX ETF ticker change](https://www.sec.gov/Archives/edgar/data/1719812/000199937126007611/cist-497_040226.htm)

Until that check passes, the server must return `DATA_UNAVAILABLE` and the UI must not substitute a security.

The local UI may display a clearly dated SPCX reference fixture because the issuer's listing and ticker are now verified from official SpaceX/SEC records. This does not establish that the provisional provider supports the symbol, does not make the fixture a live quote, and does not relax the server-side issuer/exchange check.

Primary current licensing references:

- [Individual pricing](https://twelvedata.com/pricing)
- [Commercial and personal usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)
- [Terms of use](https://twelvedata.com/terms)

The repository includes a credential-safe Twelve Data adapter with a 3.5-second timeout, at most three attempts, bounded backoff, response normalization and an explicit SPCX issuer/exchange guard. Mocked tests cover success, rate-limit retry, ticker collision and safe failure. Live coverage, entitlement and licensing validation still requires the project API key and therefore remains an AWS-login-adjacent external gate.

## Alternative noted

Alpha Vantage provides documented stock time-series and quote APIs, but its official documentation distinguishes premium real-time US market data and separate entitlement steps. It remains a fallback if Twelve Data coverage/licensing fails: [Alpha Vantage API documentation](https://www.alphavantage.co/documentation/).

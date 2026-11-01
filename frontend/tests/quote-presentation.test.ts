import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkedPriceSnapshot, quoteMoney, quotePercent, quoteTimestamp } from "../src/data/quote-presentation.js";
import { contractDemoResult } from "../src/data/contract-demo.js";
import QuoteSnapshot from "../src/components/QuoteSnapshot.js";
import type { Locale, SymbolCode } from "../src/types/market.js";
import type { NormalizedQuote } from "../../services/worker/src/quote-normalizer.js";
import en from "../src/locales/en.json" with { type: "json" };
import ja from "../src/locales/ja.json" with { type: "json" };
import ko from "../src/locales/ko.json" with { type: "json" };

const messages = { en, ja, ko };
const locales = ["en", "ja", "ko"] as const;
const symbols = ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const;
const fixture = (symbol: SymbolCode = "VOO", locale: Locale = "en") => contractDemoResult({ operation: "PRICE", symbol, locale });
function render(value: unknown, locale: Locale = "en", symbol: SymbolCode = "VOO", sourceNote?: string) {
  const labels = messages[locale];
  return renderToStaticMarkup(createElement(QuoteSnapshot, {
    quote: value as NormalizedQuote, symbol, locale, labels: labels.quoteLabels, common: labels, sourceNote,
  }));
}

test("available quote fixtures retain provenance; unverified SPCX stays unavailable without a substitute", t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("NATIVE_NETWORK_FORBIDDEN"); });
  for (const locale of locales) for (const symbol of symbols) {
    if (symbol === "SPCX") {
      assert.throws(() => fixture(symbol, locale), /FIXTURE_UNAVAILABLE/);
      const html = render(null, locale, symbol, messages[locale].spcxMockSource);
      assert.ok(html.includes(messages[locale].priceUnavailable));
      assert.doesNotMatch(html, /133\.11|15\.83|SpaceX|<time /); continue;
    }
    const raw = fixture(symbol, locale), before = JSON.stringify(raw);
    const quote = checkedPriceSnapshot(raw, symbol, locale);
    assert.ok(quote); assert.ok(Object.isFrozen(quote)); assert.notEqual(quote, raw);
    assert.equal(JSON.stringify(raw), before); assert.equal(quote.symbol, symbol);
    const html = render(quote, locale, symbol);
    assert.equal((html.match(/<time /g) ?? []).length, 3);
    assert.equal((html.match(/dateTime="2026-08-07T20:00:00.000Z"/g) ?? []).length, 2);
    assert.match(html, /dateTime="2026-08-08T00:00:00.000Z"/);
    assert.ok(html.includes(messages[locale].demoData));
    assert.ok(html.includes(messages[locale].quoteLabels.freshness.LATEST_AVAILABLE));
    assert.match(html, /local-contract-fixture/); assert.match(html, /America\/New_York/);
  }
  assert.equal(calls, 0);
});

test("untrusted or mismatched quotes fail closed without a substitute, private field or malformed number", () => {
  const raw = fixture();
  const badValues: unknown[] = [null, undefined, [], {}, "quote", { ...raw, kind: "ANALYSIS" },
    { ...raw, symbol: "TSLA" }, { ...raw, privateField: "PRIVATE_SENTINEL" },
    ...[0, -1, NaN, Infinity, -Infinity, "3"].map(price => ({ ...raw, price })),
    ...["usd", "US", "USD ", "<b>"].map(currency => ({ ...raw, currency })),
    ...["2026-02-30T00:00:00.000Z", "2026-01-01", "2026-01-01T00:00:00+00:00"].map(marketTimestamp => ({ ...raw, marketTimestamp })),
    { ...raw, retrievedAt: "invalid" }, { ...raw, source: "" }, { ...raw, marketState: "HOLIDAY" },
    { ...raw, freshness: "CURRENT" }, { ...raw, change: Infinity }, { ...raw, changePercent: NaN }];
  for (const key of Object.keys(raw)) {
    if (key === "changePercent") continue;
    const missing = { ...raw }; delete missing[key]; badValues.push(missing);
  }
  for (const bad of badValues) {
    assert.equal(checkedPriceSnapshot(bad, "VOO", "en"), null);
    const html = render(bad);
    assert.ok(html.includes(en.priceUnavailable)); assert.ok(html.includes(en.quoteLabels.marketStates.UNKNOWN));
    assert.doesNotMatch(html, /<time |<sup>|PRIVATE_SENTINEL|local-contract-fixture|NYSE\/Nasdaq/);
  }
  const throwing = Object.defineProperty({ ...raw }, "price", { enumerable: true, get() { throw Error("PRIVATE_SENTINEL"); } });
  assert.equal(checkedPriceSnapshot(throwing, "VOO", "en"), null);
});

test("fixed UTC and Eastern timestamps distinguish both DST offsets without inventing exchange state", () => {
  assert.match(quoteTimestamp("2026-07-01T20:00:00.000Z", "en", "UTC"), /20:00:00 UTC$/);
  assert.match(quoteTimestamp("2026-07-01T20:00:00.000Z", "en", "America/New_York"), /16:00:00 GMT-4 \[America\/New_York\]$/);
  assert.match(quoteTimestamp("2026-01-01T20:00:00.000Z", "en", "America/New_York"), /15:00:00 GMT-5 \[America\/New_York\]$/);
  assert.match(quoteTimestamp("2026-11-01T05:30:00.000Z", "en", "America/New_York"), /01:30:00 GMT-4/);
  assert.match(quoteTimestamp("2026-11-01T06:30:00.000Z", "en", "America/New_York"), /01:30:00 GMT-5/);
  for (const locale of locales) {
    assert.ok(quoteTimestamp("2024-02-29T00:00:00.000Z", locale, "UTC").endsWith(" UTC"));
    for (const invalid of ["", "2026-02-29T00:00:00.000Z", "2026-02-30T00:00:00.000Z", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00+00:00"])
      assert.throws(() => quoteTimestamp(invalid, locale, "UTC"), /QUOTE_TIMESTAMP_REJECTED/);
  }
});

test("display options reject runtime coercion and unsupported locales/zones instead of silently relabelling time", () => {
  const stamp = "2026-07-01T20:00:00.000Z";
  for (const locale of ["fr", "EN", "en-US", "", null, undefined, []]) {
    assert.equal(checkedPriceSnapshot(fixture(), "VOO", locale as never), null);
    assert.throws(() => quoteTimestamp(stamp, locale as never, "UTC"), /QUOTE_/);
    assert.throws(() => quoteMoney(1, "USD", locale as never), /QUOTE_/);
    assert.throws(() => quotePercent(1, locale as never), /QUOTE_/);
  }
  for (const zone of ["Asia/Tokyo", "GMT", "utc", "", null, undefined])
    assert.throws(() => quoteTimestamp(stamp, "en", zone as never), /QUOTE_TIMESTAMP_REJECTED/);
  let coerced = false;
  const object = { toString() { coerced = true; return stamp; }, valueOf() { coerced = true; return 1; } };
  assert.throws(() => quoteTimestamp(object as never, "en", "UTC"), /QUOTE_TIMESTAMP_REJECTED/);
  assert.throws(() => quoteMoney(1, object as never, "en"), /QUOTE_AMOUNT_REJECTED/);
  assert.throws(() => quoteMoney(1, "USD", "en", "yes" as never), /QUOTE_AMOUNT_REJECTED/);
  assert.equal(coerced, false);
});

test("currency and percentage-point rendering preserves signs, finite extremes and nonzero magnitudes", () => {
  assert.equal(quotePercent(0.64, "en"), "+0.64%");
  assert.equal(quotePercent(-0.64, "en"), "-0.64%");
  assert.equal(quotePercent(-0, "en"), "0.00%");
  assert.equal(quoteMoney(0, "USD", "en", true), "$0.00");
  assert.equal(quoteMoney(-0, "USD", "en", true), "$0.00");
  assert.equal(quoteMoney(12.5, "USD", "en"), "$12.50");
  assert.equal(quoteMoney(12, "JPY", "en"), "¥12");
  assert.match(quoteMoney(12.345, "BHD", "en"), /12\.345$/);
  for (const locale of locales) for (const sign of [-1, 1]) {
    assert.match(quoteMoney(sign * Number.MIN_VALUE, "USD", locale, true), /^≈ .*5E-324$/);
    assert.match(quotePercent(sign * Number.MIN_VALUE, locale), /^≈ .*5\.00E-324%$/);
    assert.match(quotePercent(sign * Number.MAX_VALUE, locale), /^≈ .*E308%$/);
    assert.match(quoteMoney(sign * Number.MAX_VALUE, "USD", locale, true), /^≈ .*E308$/);
  }
  for (const invalid of [NaN, Infinity, -Infinity, "1", null, undefined]) {
    assert.throws(() => quoteMoney(invalid as never, "USD", "en"), /QUOTE_AMOUNT_REJECTED/);
    assert.throws(() => quotePercent(invalid as never, "en"), /QUOTE_PERCENT_REJECTED/);
  }
});

test("all market/freshness classifications render their actual localized values and remain explicitly demo data", () => {
  const marketStates = ["OPEN", "CLOSED", "PRE_MARKET", "AFTER_HOURS", "UNKNOWN"] as const;
  const freshness = ["REAL_TIME", "DELAYED", "LATEST_AVAILABLE", "PREVIOUS_CLOSE"] as const;
  for (const locale of locales) {
    const labels = messages[locale].quoteLabels;
    assert.deepEqual(Object.keys(labels.marketStates).sort(), [...marketStates].sort());
    assert.deepEqual(Object.keys(labels.freshness).sort(), [...freshness].sort());
    for (const state of marketStates) for (const value of freshness) {
      const html = render({ ...fixture(), marketState: state, freshness: value }, locale);
      assert.ok(html.includes(`<strong>${labels.marketStates[state]}</strong>`));
      assert.ok(html.includes(`${messages[locale].demoData} · ${labels.freshness[value]}`));
      assert.ok(html.includes(labels.timezoneNote));
    }
  }
});

test("optional quote changes are never fabricated, and zero/negative values are not treated as absent", () => {
  const base = { ...fixture() }; delete base.changePercent;
  assert.doesNotMatch(render(base), /class="quote-change/);
  const zero = render({ ...base, change: 0, changePercent: 0 });
  assert.match(zero, /class="quote-change "/); assert.match(zero, /\$0\.00 · 0\.00%/);
  const percentOnly = render({ ...base, changePercent: -1.25 });
  assert.match(percentOnly, /class="quote-change negative">-1\.25%/);
  const amountOnly = render({ ...base, change: -1.25 });
  assert.match(amountOnly, /class="quote-change negative">-\$1\.25 ·/);
});

test("React escapes public source and explanatory notes instead of interpreting markup", () => {
  const html = render({ ...fixture(), source: '<img src=x onerror="alert(1)">' }, "en", "VOO", "<script>not executable</script>");
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/);
});

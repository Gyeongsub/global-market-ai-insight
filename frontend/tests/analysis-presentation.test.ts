import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AnalysisResult from "../src/components/AnalysisResult.js";
import { contractDemoResult } from "../src/data/contract-demo.js";
import { storedResultValid } from "../../shared/schemas/result-validation.js";
import en from "../src/locales/en.json" with { type: "json" };
import ja from "../src/locales/ja.json" with { type: "json" };
import ko from "../src/locales/ko.json" with { type: "json" };

const locales = { en, ja, ko };
const symbols = ["VOO", "QLD", "TSLA", "SPCX", "GOOG"] as const;
type Locale = keyof typeof locales;
function render(result: Record<string, unknown>, symbol: (typeof symbols)[number], locale: Locale) {
  return renderToStaticMarkup(createElement(AnalysisResult, { result, symbol, locale, labels: locales[locale].analysisLabels }));
}

test("available analysis views retain provenance; unverified SPCX has no invented analysis in any locale", t => {
  let calls = 0; t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("NETWORK_FORBIDDEN"); });
  for (const locale of Object.keys(locales) as Locale[]) for (const symbol of symbols) {
    if (symbol === "SPCX") { assert.throws(() => contractDemoResult({ operation: "ANALYZE", symbol, locale }), /FIXTURE_UNAVAILABLE/); continue; }
    const result = contractDemoResult({ operation: "ANALYZE", symbol, locale });
    const before = JSON.stringify(result), html = render(result, symbol, locale), labels = locales[locale].analysisLabels;
    assert.equal(JSON.stringify(result), before);
    for (const key of ["risks", "uncertainty", "dataAsOf", "model", "prompt"] as const) assert.ok(html.includes(labels[key]));
    for (const key of ["observations", "opportunities", "specialConsiderations"] as const)
      assert.equal(html.includes(`<h3>${labels[key]}</h3>`), (result[key] as string[]).length > 0);
    assert.match(html, /<ul><li>/); assert.match(html, /<dl class="analysis-provenance">/);
    assert.match(html, /<time dateTime="2026-08-07T20:00:00.000Z">/);
    assert.ok(html.includes(result.disclaimer as string)); assert.equal(calls, 0);
  }
});

test("maximum contract-length text and all twenty list items are preserved without truncation", () => {
  for (const locale of Object.keys(locales) as Locale[]) {
    const result = { ...contractDemoResult({ operation: "ANALYZE", symbol: "QLD", locale }),
      summary: "S".repeat(1200), uncertainty: "U".repeat(800), modelId: "M".repeat(120),
      observations: Array.from({ length: 5 }, () => "O".repeat(500)),
      opportunities: Array.from({ length: 5 }, () => "P".repeat(500)),
      risks: Array.from({ length: 5 }, () => "R".repeat(500)),
      specialConsiderations: Array.from({ length: 5 }, () => "C".repeat(500)) };
    assert.equal(storedResultValid(result, { operation: "ANALYZE", symbol: "QLD", locale }), true);
    const html = render(result, "QLD", locale);
    for (const text of [result.summary, result.uncertainty, result.modelId, ...result.observations,
      ...result.opportunities, ...result.risks, ...result.specialConsiderations]) assert.ok(html.includes(text));
    assert.equal((html.match(/<li>/g) ?? []).length, 20);
    assert.equal((html.match(/<section class="insight-item">/g) ?? []).length, 4);
  }
});

test("untrusted prose is inert text in every analysis section, never executable elements or links", () => {
  const payload = '<script>alert("fixture")</script><a href="https://untrusted.invalid">text</a>';
  for (const locale of Object.keys(locales) as Locale[]) {
    const result = { ...contractDemoResult({ operation: "ANALYZE", symbol: "VOO", locale }),
      summary: payload, observations: [payload], opportunities: [payload], risks: [payload],
      specialConsiderations: [payload], uncertainty: payload, modelId: payload };
    const html = render(result, "VOO", locale);
    assert.ok(html.length > 0); assert.equal((html.match(/&lt;script&gt;/g) ?? []).length, 7);
    assert.doesNotMatch(html, /<(?:script|a|img|iframe)\b/);
  }
});

test("invalid or cross-request analyses render no partial prose, including oversize and altered disclaimer", () => {
  const good = contractDemoResult({ operation: "ANALYZE", symbol: "VOO", locale: "en" });
  for (const invalid of [{ ...good, symbol: "GOOG" }, { ...good, locale: "ja" },
    { ...good, summary: "x".repeat(1201) }, { ...good, observations: Array(6).fill("x") },
    { ...good, risks: [] }, { ...good, risks: [" "] }, { ...good, summary: "\u3000" },
    { ...good, uncertainty: "" }, { ...good, uncertainty: "\t " }, { ...good, disclaimer: "PRIVATE_SENTINEL" },
    { ...good, dataAsOf: "2026-02-30T20:00:00.000Z" }, { ...good, privateData: "PRIVATE_SENTINEL" }])
    assert.equal(render(invalid, "VOO", "en"), "");
});

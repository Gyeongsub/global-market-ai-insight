import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS } from "../../../controller/src/contracts.js";
import { attachApplicationMetadata } from "../../../worker/src/analysis.js";
import { groundedSelectionPolicy, renderGroundedAnalysis } from "../../../worker/src/grounded-analysis.js";
import { normalizeQuote } from "../../../worker/src/quote-normalizer.js";
import { inspectAnalysisResult } from "../src/analysis-inspection.js";

for (const symbol of SUPPORTED_SYMBOLS) for (const locale of SUPPORTED_LOCALES) {
  test(`private analysis inspection ${symbol}/${locale} validates metadata and canonical risk policy`, () => {
    const quote = normalizeQuote({ symbol, price: 100, currency: "USD", marketTimestamp: "2026-09-10T20:00:00Z", retrievedAt: "2026-09-10T20:01:00Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "synthetic-fixture" }, symbol);
    const policy = groundedSelectionPolicy(symbol, quote);
    const expected = { symbol, locale, modelId: "amazon.nova-lite-v1:0" };
    const result = attachApplicationMetadata(renderGroundedAnalysis({ observationIds: policy.required.observations, riskIds: policy.required.risks, specialConsiderationIds: policy.required.special, uncertaintyId: policy.required.uncertainty }, { symbol, locale, quote }), { ...expected, dataAsOf: quote.marketTimestamp });
    assert.equal(inspectAnalysisResult(result, expected).passed, true);
    for (const changed of [
      null, [], { ...result, privateExtra: "must-not-leak" }, { ...result, summary: 123 },
      { ...result, modelId: "unexpected" }, { ...result, promptVersion: "v1" },
      { ...result, disclaimer: "wrong disclaimer content" }, { ...result, risks: [] },
      { ...result, risks: ["invented risk"] }, { ...result, uncertainty: "invented forecast" },
      { ...result, dataAsOf: "2026-02-30T00:00:00Z" }, { ...result, observations: [null] },
      { ...result, summary: "Buy this stock now" }, { ...result, opportunities: ["unsupported"] },
      { ...result, locale: locale === "en" ? "ja" : "en" },
    ]) {
      const inspected = inspectAnalysisResult(changed, expected);
      assert.equal(inspected.passed, false);
      assert.ok(Object.values(inspected).every((item) => typeof item === "boolean"));
    }
    if (symbol === "QLD") assert.equal(inspectAnalysisResult({ ...result, specialConsiderations: [result.specialConsiderations[0]] }, expected).passed, false);
  });
}

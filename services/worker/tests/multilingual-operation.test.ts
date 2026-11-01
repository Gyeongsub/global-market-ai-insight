import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS } from "../../controller/src/contracts.js";
import { inspectAnalysisResult } from "../../operations/api-smoke/src/analysis-inspection.js";
import { BedrockAnalysisAdapter, type BedrockConverseTransport } from "../src/providers/bedrock-analysis-adapter.js";
import { MarketDataProviderError } from "../src/providers/market-data-provider.js";
import { executeWorkerOperation } from "../src/worker-operation.js";

for (const symbol of SUPPORTED_SYMBOLS) for (const locale of SUPPORTED_LOCALES) {
  test(`synthetic worker ANALYZE ${symbol}/${locale} propagates facts, locale and one-call limits`, async () => {
    let providerCalls = 0;
    let modelCalls = 0;
    const modelId = "amazon.nova-lite-v1:0";
    const transport: BedrockConverseTransport = { async converse(request) {
      modelCalls += 1;
      assert.equal(request.modelId, modelId);
      assert.equal(request.inferenceConfig.maxTokens, 512);
      const facts = JSON.parse(request.messages[0]!.content[0]!.text);
      assert.equal(facts.symbol, symbol);
      assert.equal(facts.locale, locale);
      assert.equal(facts.quote.price, 100);
      assert.equal(facts.quote.source, "synthetic-not-live");
      const required = facts.policy.required;
      return { stopReason: "tool_use", output: { message: { content: [{ toolUse: {
        name: "select_grounded_insights", input: { observationIds: required.observations, riskIds: required.risks, specialConsiderationIds: required.special, uncertaintyId: required.uncertainty },
      } }] } }, usage: { inputTokens: 600, outputTokens: 100, totalTokens: 700 } };
    } };
    const result = await executeWorkerOperation({ operation: "ANALYZE", symbol, locale }, {
      marketDataProvider: { async getQuote(requested) {
        providerCalls += 1;
        assert.equal(requested, symbol);
        return { symbol, price: 100, currency: "USD", marketTimestamp: "2026-09-10T20:00:00Z", retrievedAt: "2026-09-10T20:01:00Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "synthetic-not-live" };
      } }, analysisEngine: new BedrockAnalysisAdapter({ modelId, transport }),
    });
    assert.equal(providerCalls, 1);
    assert.equal(modelCalls, 1);
    assert.equal(inspectAnalysisResult(result, { symbol, locale, modelId }).passed, true);
    if (result.kind !== "ANALYSIS") assert.fail("Expected analysis");
    assert.match(result.summary, /USD 100/);
    assert.match(result.summary, /2026-09-10/);
    assert.equal(result.dataAsOf, "2026-09-10T20:00:00.000Z");
    assert.ok(result.specialConsiderations.some((value) => value.includes("synthetic-not-live") && value.includes("LATEST_AVAILABLE")));
  });
}

test("unavailable SPCX and invalid provider identity never reach Bedrock in any locale", async () => {
  let modelCalls = 0;
  const analysisEngine = { async analyze(): Promise<never> { modelCalls += 1; throw new Error("Must not invoke"); } };
  for (const locale of SUPPORTED_LOCALES) {
    const unavailable = new MarketDataProviderError("DATA_UNAVAILABLE", "Unavailable", false);
    await assert.rejects(() => executeWorkerOperation({ operation: "ANALYZE", symbol: "SPCX", locale }, {
      marketDataProvider: { async getQuote() { throw unavailable; } }, analysisEngine,
    }), (error) => error === unavailable);
    await assert.rejects(() => executeWorkerOperation({ operation: "ANALYZE", symbol: "TSLA", locale }, {
      marketDataProvider: { async getQuote() { return { symbol: "GOOG", price: 100, currency: "USD", marketTimestamp: "2026-09-10T20:00:00Z", retrievedAt: "2026-09-10T20:01:00Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "synthetic" }; } }, analysisEngine,
    }), /symbol mismatch/);
  }
  assert.equal(modelCalls, 0);
});

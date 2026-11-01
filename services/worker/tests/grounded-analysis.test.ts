import assert from "node:assert/strict";
import test from "node:test";
import { buildGroundedSelectionToolConfig, parseGroundedAnalysisSelection, renderGroundedAnalysis } from "../src/grounded-analysis.js";
import { normalizeQuote } from "../src/quote-normalizer.js";

const quote = normalizeQuote({
  symbol: "QLD",
  price: 138.17,
  currency: "USD",
  marketTimestamp: "2026-08-07T20:00:00Z",
  retrievedAt: "2026-08-08T00:00:00Z",
  marketState: "CLOSED",
  freshness: "LATEST_AVAILABLE",
  source: "local-contract-fixture",
  change: 1.64,
  changePercent: 1.21,
}, "QLD");

const approvedSelection = {
  observationIds: ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"],
  riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
  specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"],
  uncertaintyId: "SINGLE_QUOTE_NO_FORECAST",
};

test("exposes only allowlisted identifiers to the grounded tool", () => {
  const config = buildGroundedSelectionToolConfig("QLD");
  assert.equal(config.toolChoice.tool.name, "select_grounded_insights");
  const schema = config.tools[0].toolSpec.inputSchema.json;
  assert.deepEqual(Object.keys(schema), ["type", "properties", "required"]);
  assert.ok(schema.properties.riskIds.items.enum.includes("QLD_PATH_DEPENDENCY"));
});

test("rejects unknown, duplicate, and insufficient evidence selections", () => {
  assert.throws(() => parseGroundedAnalysisSelection({ ...approvedSelection, riskIds: ["MADE_UP"] }, "QLD", quote), /unapproved/);
  assert.throws(() => parseGroundedAnalysisSelection({ ...approvedSelection, observationIds: ["QUOTE_SNAPSHOT", "QUOTE_SNAPSHOT"] }, "QLD", quote), /duplicate/);
  assert.throws(() => parseGroundedAnalysisSelection({ ...approvedSelection, riskIds: ["MARKET_PRICE_RISK"] }, "QLD", quote), /QLD_LEVERAGED_DOWNSIDE/);
});

test("renders deterministic localized text without model-authored prose", () => {
  const selection = parseGroundedAnalysisSelection(approvedSelection, "QLD", quote);
  for (const locale of ["en", "ja", "ko"] as const) {
    const result = renderGroundedAnalysis(selection, { symbol: "QLD", locale, quote });
    assert.equal(result.opportunities.length, 0);
    assert.equal(result.risks.length, 3);
    assert.match(result.summary, /QLD/);
    assert.doesNotMatch(JSON.stringify(result), /NASDAQ|Nasdaq|investment opportunity|投資機会|투자 기회/i);
  }
});

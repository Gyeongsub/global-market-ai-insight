import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_TOOL_NAME, attachApplicationMetadata, buildAnalysisPrompt, buildAnalysisToolConfig, parseModelAnalysisOutput, validateAnalysisResult } from "../src/analysis.js";
import { normalizeQuote } from "../src/quote-normalizer.js";

const rawQuote = {
  symbol: "QLD",
  price: 138.17,
  currency: "USD",
  marketTimestamp: "2026-08-07T20:00:00Z",
  retrievedAt: "2026-08-08T00:00:00Z",
  marketState: "CLOSED",
  freshness: "LATEST_AVAILABLE",
  source: "fixture-provider",
  change: 1.64,
  changePercent: 1.21,
};

test("normalizes a valid provider quote and rejects mismatched symbols", () => {
  const quote = normalizeQuote(rawQuote, "QLD");
  assert.equal(quote.kind, "PRICE");
  assert.equal(quote.marketTimestamp, "2026-08-07T20:00:00.000Z");
  assert.throws(() => normalizeQuote({ ...rawQuote, symbol: "VOO" }, "QLD"), /symbol mismatch/);
  assert.throws(() => normalizeQuote({ ...rawQuote, price: 0 }, "QLD"), /provider price/);
});

test("builds a facts-only prompt with explicit QLD safeguards", () => {
  const prompt = buildAnalysisPrompt({ symbol: "QLD", locale: "ko", quote: normalizeQuote(rawQuote, "QLD") });
  assert.match(prompt.system, /Use only the supplied facts/);
  assert.match(prompt.system, /personalized buy, sell, or hold/);
  assert.match(prompt.system, /tool exactly once/);
  assert.match(prompt.system, /select only IDs/);
  assert.match(prompt.system, /do not add free-form text/);
  assert.match(prompt.factsJson, /path dependency/);
  assert.match(prompt.factsJson, /QLD_PATH_DEPENDENCY/);
  assert.doesNotMatch(prompt.factsJson, /api[_-]?key/i);
});

test("forces one schema-bound analysis tool call", () => {
  const config = buildAnalysisToolConfig();
  assert.equal(config.toolChoice.tool.name, ANALYSIS_TOOL_NAME);
  assert.equal(config.tools[0].toolSpec.name, ANALYSIS_TOOL_NAME);
  const schema = config.tools[0].toolSpec.inputSchema.json;
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.required, [
    "observationIds",
    "riskIds",
    "specialConsiderationIds",
    "uncertaintyId",
  ]);
  assert.deepEqual(Object.keys(schema), ["type", "properties", "required"]);
});

test("parses only the exact compact model-output contract", () => {
  const valid = JSON.stringify({
    summary: "QLD는 하루 수익률의 2배를 목표로 합니다.",
    observations: ["기준 가격은 과거 스냅샷입니다."],
    opportunities: [],
    risks: ["손실도 확대될 수 있습니다."],
    specialConsiderations: ["복리와 경로 의존성이 있습니다."],
    uncertainty: "이 데이터만으로 미래 방향을 판단할 수 없습니다.",
  });
  assert.equal(parseModelAnalysisOutput(valid).risks.length, 1);
  assert.throws(() => parseModelAnalysisOutput('{"summary":"PRIVATE_SENTINEL",' + valid.slice(1)), /not valid JSON/);
  assert.throws(() => parseModelAnalysisOutput('{"summ\\u0061ry":"PRIVATE_SENTINEL",' + valid.slice(1)), /not valid JSON/);

  assert.throws(() => parseModelAnalysisOutput(`\`\`\`json\n${valid}\n\`\`\``), /code fences/);
  assert.throws(() => parseModelAnalysisOutput(JSON.stringify({ ...JSON.parse(valid), confidence: 0.8 })), /approved keys/);
  assert.throws(() => parseModelAnalysisOutput(JSON.stringify({ ...JSON.parse(valid), risks: [] })), /at least 1 item/);
  assert.throws(() => parseModelAnalysisOutput(JSON.stringify({ ...JSON.parse(valid), summary: "x".repeat(241) })), /exceeds 240/);
});

test("attaches the canonical disclaimer in application code", () => {
  const result = attachApplicationMetadata({
    summary: "QLD는 하루 기준 2배를 목표로 합니다.",
    observations: ["일일 수익률 기준입니다."],
    opportunities: [],
    risks: ["손실도 확대될 수 있습니다."],
    specialConsiderations: ["복리와 경로 의존성을 고려해야 합니다."],
    uncertainty: "한 시점의 가격만으로 미래를 알 수 없습니다.",
  }, { symbol: "QLD", locale: "ko", dataAsOf: "2026-08-07T20:00:00Z", modelId: "logical-model-alias" });

  assert.match(result.disclaimer, /금융 자문이 아닙니다/);
  assert.equal(validateAnalysisResult(result), result);
});

test("rejects trade instructions and missing leveraged-product context", () => {
  const base = attachApplicationMetadata({
    summary: "A neutral summary.",
    observations: [],
    opportunities: [],
    risks: ["Market risk exists."],
    specialConsiderations: [],
    uncertainty: "Future outcomes are uncertain.",
  }, { symbol: "VOO", locale: "en", dataAsOf: "2026-08-07T20:00:00Z", modelId: "logical-model-alias" });
  assert.throws(() => validateAnalysisResult({ ...base, summary: "Buy this ETF now." }), /trade instruction/);
  assert.throws(() => validateAnalysisResult({ ...base, summary: "This offers high returns." }), /promotional or suitability/);
  assert.throws(() => validateAnalysisResult({ ...base, summary: "단기 투자 기회입니다." }), /promotional or suitability/);
  assert.throws(() => validateAnalysisResult({ ...base, summary: "It tracks the NASDAQ-100." }), /benchmark or index/);
  assert.throws(() => validateAnalysisResult({ ...base, symbol: "QLD" }), /leveraged-product context/);
});

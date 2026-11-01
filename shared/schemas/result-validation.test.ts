import assert from "node:assert/strict";
import test from "node:test";
import { attachApplicationMetadata } from "../../services/worker/src/analysis.js";
import { groundedSelectionPolicy, renderGroundedAnalysis } from "../../services/worker/src/grounded-analysis.js";
import { normalizeQuote } from "../../services/worker/src/quote-normalizer.js";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS } from "../../services/controller/src/contracts.js";
import { storedResultValid } from "./result-validation.js";

const priceRequest = { operation: "PRICE", symbol: "QLD", locale: "ko" } as const;
const analysisRequest = { operation: "ANALYZE", symbol: "QLD", locale: "ko" } as const;
const price = {
  kind: "PRICE", symbol: "QLD", price: 138.17, currency: "USD", change: 1.64, changePercent: 1.21,
  marketTimestamp: "2026-08-07T20:00:00.000Z", retrievedAt: "2026-08-08T00:00:00.000Z",
  marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "local-contract-fixture",
};
const analysis = {
  kind: "ANALYSIS", symbol: "QLD", locale: "ko", summary: "예시 시장 상황입니다.",
  observations: ["관측된 데이터입니다."], opportunities: [], risks: ["손실 위험이 있습니다."],
  specialConsiderations: ["일일 2배 레버리지와 경로 의존성에 유의하세요."],
  uncertainty: "미래 성과는 알 수 없습니다.", dataAsOf: "2026-08-07T20:00:00.000Z",
  modelId: "amazon.nova-lite-v1:0", promptVersion: "grounded-v1",
  disclaimer: "교육 목적의 시장 인사이트이며 금융 자문이 아닙니다.",
};

test("validates canonical stored PRICE without leaking extra fields", () => {
  assert.equal(storedResultValid(price, priceRequest), true);
  for (const candidate of [
    { ...price, price: 0 },
    { ...price, price: "138.17" },
    { ...price, currency: "usd" },
    { ...price, marketTimestamp: "2026-08-07T20:00:00Z" },
    { ...price, source: "x".repeat(81) },
    { ...price, rawProviderPayload: "private" },
    { ...price, symbol: "TSLA" },
  ]) assert.equal(storedResultValid(candidate, priceRequest), false);
});

test("validates stored ANALYZE identity, structure and application disclaimer", () => {
  assert.equal(storedResultValid(analysis, analysisRequest), true);
  for (const candidate of [
    { ...analysis, locale: "ja" },
    { ...analysis, disclaimer: "Model-generated disclaimer" },
    { ...analysis, promptVersion: "unknown-v2" },
    { ...analysis, risks: [] },
    { ...analysis, summary: "x".repeat(1_201) },
    { ...analysis, internalPrompt: "private" },
  ]) assert.equal(storedResultValid(candidate, analysisRequest), false);
});

test("rejects missing, non-finite, oversized and non-canonical persisted values", () => {
  for (const candidate of [
    { ...price, price: Number.NaN },
    { ...price, change: Number.POSITIVE_INFINITY },
    { ...price, marketTimestamp: "2026-02-30T20:00:00.000Z" },
    Object.fromEntries(Object.entries(price).filter(([key]) => key !== "source")),
  ]) assert.equal(storedResultValid(candidate, priceRequest), false);
  for (const candidate of [
    { ...analysis, observations: Array(6).fill("example") },
    { ...analysis, risks: [false] },
    { ...analysis, dataAsOf: "2026-08-07T20:00:00+00:00" },
    Object.fromEntries(Object.entries(analysis).filter(([key]) => key !== "uncertainty")),
  ]) assert.equal(storedResultValid(candidate, analysisRequest), false);
});

test("all synthetic grounded results remain readable through the stored-result boundary", () => {
  for (const symbol of SUPPORTED_SYMBOLS) {
    const quote = normalizeQuote({
      symbol, price: 1, currency: "USD", marketTimestamp: "2026-08-07T20:00:00Z",
      retrievedAt: "2026-08-08T00:00:00Z", marketState: "CLOSED",
      freshness: "LATEST_AVAILABLE", source: "synthetic-contract-fixture",
    }, symbol);
    const policy = groundedSelectionPolicy(symbol, quote);
    const selection = {
      observationIds: policy.required.observations,
      riskIds: policy.required.risks,
      specialConsiderationIds: policy.required.special,
      uncertaintyId: policy.required.uncertainty,
    };
    for (const locale of SUPPORTED_LOCALES) {
      const rendered = renderGroundedAnalysis(selection, { symbol, locale, quote });
      const result = attachApplicationMetadata(rendered, { symbol, locale, dataAsOf: quote.marketTimestamp, modelId: "logical-test-model" });
      assert.equal(storedResultValid(result, { operation: "ANALYZE", symbol, locale }), true, `${symbol}/${locale}`);
    }
  }
});

test("required narrative and provenance cannot be blank or Unicode whitespace only", () => {
  for (const blank of ["", " ", "\t\r\n", "\u00a0", "\u3000", " \u00a0\u3000\n"]) {
    for (const field of ["summary", "uncertainty", "modelId"])
      assert.equal(storedResultValid({ ...analysis, [field]: blank }, analysisRequest), false, field);
    for (const field of ["observations", "opportunities", "risks", "specialConsiderations"])
      assert.equal(storedResultValid({ ...analysis, [field]: [blank] }, analysisRequest), false, field);
    assert.equal(storedResultValid({ ...price, source: blank }, priceRequest), false, "source");
  }
});

test("optional empty lists and substantive multilingual prose are still accepted without rewriting", () => {
  for (const text of ["Context remains uncertain.", "不確実性があります。", "불확실성이 있습니다.", "  bounded context  "]) {
    const candidate = { ...analysis, summary: text, uncertainty: text, risks: [text],
      observations: [], opportunities: [], specialConsiderations: [] };
    const before = JSON.stringify(candidate);
    assert.equal(storedResultValid(candidate, analysisRequest), true);
    assert.equal(JSON.stringify(candidate), before);
  }
});

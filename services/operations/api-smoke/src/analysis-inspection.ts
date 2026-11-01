import { readFileSync } from "node:fs";
import { SUPPORTED_LOCALES, SUPPORTED_SYMBOLS, type Locale, type SymbolCode } from "../../../controller/src/contracts.js";
import { attachApplicationMetadata, PROMPT_VERSION, validateAnalysisResult, type AnalysisResult } from "../../../worker/src/analysis.js";
import { groundedSelectionPolicy, renderGroundedAnalysis } from "../../../worker/src/grounded-analysis.js";
import type { NormalizedQuote } from "../../../worker/src/quote-normalizer.js";

interface FieldSchema {
  type?: string; const?: unknown; enum?: unknown[]; minLength?: number; maxLength?: number;
  minItems?: number; maxItems?: number; format?: string; items?: FieldSchema;
}
const schema = JSON.parse(readFileSync(new URL("../../../../shared/schemas/analysis-result.schema.json", import.meta.url), "utf8")) as {
  required: string[]; properties: Record<string, FieldSchema>;
};

function fieldValid(value: unknown, spec: FieldSchema): boolean {
  if (spec.const !== undefined && value !== spec.const) return false;
  if (spec.enum && !spec.enum.includes(value)) return false;
  if (spec.type === "string") {
    if (typeof value !== "string" || value.length < (spec.minLength ?? 0) || value.length > (spec.maxLength ?? Infinity)) return false;
    if (spec.format === "date-time") {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
      if (new Date(value).toISOString() !== value.replace(/(?<!\.\d{3})Z$/, ".000Z")) return false;
    }
  } else if (spec.type === "array") {
    if (!Array.isArray(value) || value.length < (spec.minItems ?? 0) || value.length > (spec.maxItems ?? Infinity)) return false;
    if (!spec.items || !value.every((item) => fieldValid(item, spec.items!))) return false;
  } else if (spec.type !== undefined) return false;
  return true;
}

/** Private in-memory inspection. Returns booleans only, never input text or exceptions. */
export function inspectAnalysisResult(value: unknown, expected: { symbol: SymbolCode; locale: Locale; modelId: string }) {
  const checks = { schemaValid: false, metadataValid: false, riskContextValid: false, safetyValid: false, passed: false };
  try {
    if (!SUPPORTED_SYMBOLS.includes(expected.symbol) || !SUPPORTED_LOCALES.includes(expected.locale) || !expected.modelId) return checks;
    if (!value || typeof value !== "object" || Array.isArray(value)) return checks;
    const record = value as Record<string, unknown>;
    checks.schemaValid = Object.keys(record).length === schema.required.length
      && schema.required.every((key) => Object.hasOwn(record, key))
      && Object.entries(schema.properties).every(([key, spec]) => fieldValid(record[key], spec));
    if (!checks.schemaValid) return checks;
    const result = value as AnalysisResult;
    const disclaimer = attachApplicationMetadata({ summary: "", observations: [], opportunities: [], risks: [], specialConsiderations: [], uncertainty: "" }, {
      ...expected, dataAsOf: result.dataAsOf,
    }).disclaimer;
    checks.metadataValid = result.kind === "ANALYSIS" && result.symbol === expected.symbol && result.locale === expected.locale
      && result.modelId === expected.modelId && result.promptVersion === PROMPT_VERSION && result.disclaimer === disclaimer;
    // Static policy text only: this fixture is never used as evidence for a live price.
    const referenceQuote: NormalizedQuote = { kind: "PRICE", symbol: expected.symbol, price: 1, currency: "USD", marketTimestamp: "2000-01-01T00:00:00.000Z", retrievedAt: "2000-01-01T00:00:00.000Z", marketState: "UNKNOWN", freshness: "LATEST_AVAILABLE", source: "inspection-reference" };
    const policy = groundedSelectionPolicy(expected.symbol, referenceQuote);
    const reference = renderGroundedAnalysis({ observationIds: policy.required.observations, riskIds: policy.required.risks, specialConsiderationIds: policy.required.special, uncertaintyId: policy.required.uncertainty }, { ...expected, quote: referenceQuote });
    checks.riskContextValid = result.risks.length === reference.risks.length
      && reference.risks.every((risk) => result.risks.includes(risk))
      && result.uncertainty === reference.uncertainty
      && (expected.symbol !== "QLD" || result.specialConsiderations.includes(reference.specialConsiderations[1]!));
    validateAnalysisResult(result);
    checks.safetyValid = result.opportunities.length === 0;
    checks.passed = checks.schemaValid && checks.metadataValid && checks.riskContextValid && checks.safetyValid;
  } catch { /* Never reflect private data in diagnostics. */ }
  return checks;
}

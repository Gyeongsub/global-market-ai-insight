import type { Locale, SymbolCode } from "../../controller/src/contracts.js";
import { canonicalDisclaimer } from "../../../shared/schemas/disclaimer.js";
import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";
import { buildGroundedSelectionToolConfig, groundedSelectionPolicy, GROUNDED_SELECTION_TOOL_NAME, GROUNDED_SELECTION_VERSION } from "./grounded-analysis.js";
import type { NormalizedQuote } from "./quote-normalizer.js";

export const PROMPT_VERSION = "grounded-v1" as const;
export const ANALYSIS_TOOL_NAME = GROUNDED_SELECTION_TOOL_NAME;

export interface ModelAnalysisOutput {
  summary: string;
  observations: string[];
  opportunities: string[];
  risks: string[];
  specialConsiderations: string[];
  uncertainty: string;
}

const MODEL_OUTPUT_KEYS = [
  "summary",
  "observations",
  "opportunities",
  "risks",
  "specialConsiderations",
  "uncertainty",
] as const;

const MAX_MODEL_OUTPUT_CHARACTERS = 2_400;
const MAX_SUMMARY_CHARACTERS = 240;
const MAX_UNCERTAINTY_CHARACTERS = 240;
const MAX_ARRAY_ITEMS = 2;
const MAX_ITEM_CHARACTERS = 180;

export interface AnalysisResult {
  kind: "ANALYSIS";
  symbol: SymbolCode;
  locale: Locale;
  summary: string;
  observations: string[];
  opportunities: string[];
  risks: string[];
  specialConsiderations: string[];
  uncertainty: string;
  dataAsOf: string;
  modelId: string;
  promptVersion: typeof PROMPT_VERSION;
  disclaimer: string;
}

const languageName: Record<Locale, string> = { en: "English", ja: "Japanese", ko: "Korean" };

export function buildAnalysisPrompt(input: { symbol: SymbolCode; locale: Locale; quote: NormalizedQuote }) {
  const facts = {
    selectionVersion: GROUNDED_SELECTION_VERSION,
    symbol: input.symbol,
    quote: input.quote,
    policy: groundedSelectionPolicy(input.symbol, input.quote),
    constraints: input.symbol === "QLD"
      ? ["Explain daily 2x leverage", "Explain compounding and path dependency", "Explain elevated downside risk"]
      : ["Do not infer a causal driver without supplied evidence"],
  };

  return {
    promptVersion: PROMPT_VERSION,
    system: [
      "You are an educational market explainer.",
      `The requested output language is ${languageName[input.locale]}, but you must not write natural-language analysis.`,
      `Call the ${ANALYSIS_TOOL_NAME} tool exactly once and select only IDs present in the supplied policy.`,
      "Use only the supplied facts and do not provide personalized buy, sell, or hold instructions.",
      "Include every required ID, do not duplicate IDs, and do not add free-form text.",
    ].join(" "),
    factsJson: JSON.stringify(facts),
  };
}

export function buildAnalysisToolConfig() {
  return buildGroundedSelectionToolConfig("QLD");
}

function assertCompactString(value: unknown, field: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Model output field ${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new Error(`Model output field ${field} exceeds ${maxLength} characters.`);
  }
}

function assertCompactStringArray(value: unknown, field: string, minimumItems = 0): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`Model output field ${field} must be an array.`);
  if (value.length < minimumItems) throw new Error(`Model output field ${field} requires at least ${minimumItems} item.`);
  if (value.length > MAX_ARRAY_ITEMS) throw new Error(`Model output field ${field} exceeds ${MAX_ARRAY_ITEMS} items.`);
  value.forEach((item, index) => assertCompactString(item, `${field}[${index}]`, MAX_ITEM_CHARACTERS));
}

export function parseModelAnalysisOutput(rawText: string): ModelAnalysisOutput {
  if (rawText.trim().length === 0) throw new Error("Model output is empty.");
  if (rawText.length > MAX_MODEL_OUTPUT_CHARACTERS) throw new Error("Model output exceeds the raw response limit.");
  if (/```/.test(rawText)) throw new Error("Model output must not contain Markdown code fences.");

  let parsed: unknown;
  try {
    parsed = parseUnambiguousJson(rawText);
  }
  catch {
    throw new Error("Model output is not valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Model output must be one JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...MODEL_OUTPUT_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Model output must contain exactly the approved keys.");
  }

  assertCompactString(record.summary, "summary", MAX_SUMMARY_CHARACTERS);
  assertCompactStringArray(record.observations, "observations");
  assertCompactStringArray(record.opportunities, "opportunities");
  assertCompactStringArray(record.risks, "risks", 1);
  assertCompactStringArray(record.specialConsiderations, "specialConsiderations");
  assertCompactString(record.uncertainty, "uncertainty", MAX_UNCERTAINTY_CHARACTERS);

  return record as unknown as ModelAnalysisOutput;
}

export function attachApplicationMetadata(
  value: Omit<AnalysisResult, "kind" | "symbol" | "locale" | "dataAsOf" | "modelId" | "promptVersion" | "disclaimer">,
  input: { symbol: SymbolCode; locale: Locale; dataAsOf: string; modelId: string },
): AnalysisResult {
  return {
    kind: "ANALYSIS",
    symbol: input.symbol,
    locale: input.locale,
    ...value,
    dataAsOf: new Date(input.dataAsOf).toISOString(),
    modelId: input.modelId,
    promptVersion: PROMPT_VERSION,
    disclaimer: canonicalDisclaimer(input.locale),
  };
}

export function validateAnalysisResult(result: AnalysisResult): AnalysisResult {
  const text = [result.summary, ...result.observations, ...result.opportunities, ...result.risks, ...result.specialConsiderations, result.uncertainty].join(" ");
  if (text.length > 5_000) throw new Error("Analysis output exceeds the application limit.");
  if (/\b(buy|sell|hold)\s+(this|the|your)?\s*(stock|etf|position|now)\b/i.test(text)) throw new Error("Analysis contains prohibited trade instruction phrasing.");
  if (/guaranteed return|cannot lose|risk[- ]free/i.test(text)) throw new Error("Analysis contains a prohibited guarantee.");
  if (/high returns?|investment opportunit(?:y|ies)|expected gains?|suitable for|not suitable for|高いリターン|高収益|投資機会|適して|向いて|고수익|투자 기회|적합|부적합/i.test(text)) {
    throw new Error("Analysis contains unsupported promotional or suitability phrasing.");
  }
  if (/NASDAQ|Nasdaq|S&P|Dow Jones|Russell|ナスダック|ダウ|러셀|나스닥|다우/i.test(text)) {
    throw new Error("Analysis contains a benchmark or index that was not supplied to the model.");
  }
  if (!result.summary || !result.uncertainty || result.risks.length === 0) throw new Error("Analysis is missing required content.");
  if (result.symbol === "QLD" && !/(2x|2×|two.times|2倍|２倍|2배|２x)/i.test(text)) throw new Error("QLD analysis is missing leveraged-product context.");
  return result;
}

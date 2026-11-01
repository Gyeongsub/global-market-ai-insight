import type { Locale, SymbolCode } from "../../controller/src/contracts.js";
import type { ModelAnalysisOutput } from "./analysis.js";
import type { NormalizedQuote } from "./quote-normalizer.js";

export const GROUNDED_SELECTION_VERSION = "v1" as const;
export const GROUNDED_SELECTION_TOOL_NAME = "select_grounded_insights" as const;

const OBSERVATION_IDS = ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"] as const;
const RISK_IDS = ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"] as const;
const SPECIAL_IDS = ["DATA_PROVENANCE", "QLD_DAILY_RESET"] as const;
const UNCERTAINTY_IDS = ["SINGLE_QUOTE_NO_FORECAST"] as const;

type ObservationId = (typeof OBSERVATION_IDS)[number];
type RiskId = (typeof RISK_IDS)[number];
type SpecialId = (typeof SPECIAL_IDS)[number];
type UncertaintyId = (typeof UNCERTAINTY_IDS)[number];

export interface GroundedAnalysisSelection {
  observationIds: ObservationId[];
  riskIds: RiskId[];
  specialConsiderationIds: SpecialId[];
  uncertaintyId: UncertaintyId;
}

const selectionKeys = ["observationIds", "riskIds", "specialConsiderationIds", "uncertaintyId"] as const;

function allowedForSymbol(symbol: SymbolCode, quote?: NormalizedQuote) {
  return {
    observations: quote && (quote.change === undefined || quote.changePercent === undefined)
      ? ["QUOTE_SNAPSHOT"] as ObservationId[]
      : [...OBSERVATION_IDS],
    risks: symbol === "QLD" ? [...RISK_IDS] : ["MARKET_PRICE_RISK"] as RiskId[],
    special: symbol === "QLD" ? [...SPECIAL_IDS] : ["DATA_PROVENANCE"] as SpecialId[],
    uncertainty: [...UNCERTAINTY_IDS],
  };
}

export function groundedSelectionPolicy(symbol: SymbolCode, quote: NormalizedQuote) {
  const allowed = allowedForSymbol(symbol, quote);
  return {
    allowed,
    required: {
      observations: ["QUOTE_SNAPSHOT"] as ObservationId[],
      risks: symbol === "QLD"
        ? ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"] as RiskId[]
        : ["MARKET_PRICE_RISK"] as RiskId[],
      special: symbol === "QLD"
        ? ["DATA_PROVENANCE", "QLD_DAILY_RESET"] as SpecialId[]
        : ["DATA_PROVENANCE"] as SpecialId[],
      uncertainty: "SINGLE_QUOTE_NO_FORECAST" as UncertaintyId,
    },
  };
}

export function buildGroundedSelectionToolConfig(symbol: SymbolCode, quote?: NormalizedQuote) {
  const allowed = allowedForSymbol(symbol, quote);
  return {
    tools: [{
      toolSpec: {
        name: GROUNDED_SELECTION_TOOL_NAME,
        description: "Select only approved insight identifiers. Do not generate natural-language analysis.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              observationIds: { type: "array", items: { type: "string", enum: allowed.observations } },
              riskIds: { type: "array", items: { type: "string", enum: allowed.risks } },
              specialConsiderationIds: { type: "array", items: { type: "string", enum: allowed.special } },
              uncertaintyId: { type: "string", enum: allowed.uncertainty },
            },
            required: [...selectionKeys],
          },
        },
      },
    }],
    toolChoice: { tool: { name: GROUNDED_SELECTION_TOOL_NAME } },
  } as const;
}

function assertIdArray(value: unknown, field: string, allowed: readonly string[]): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array.`);
  if (value.some((item) => typeof item !== "string" || !allowed.includes(item))) throw new Error(`${field} contains an unapproved insight ID.`);
  if (new Set(value).size !== value.length) throw new Error(`${field} contains a duplicate insight ID.`);
}

export function parseGroundedAnalysisSelection(value: unknown, symbol: SymbolCode, quote: NormalizedQuote): GroundedAnalysisSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Grounded selection must be one object.");
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...selectionKeys].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("Grounded selection must contain exactly the approved keys.");
  }

  const allowed = allowedForSymbol(symbol, quote);
  assertIdArray(record.observationIds, "observationIds", allowed.observations);
  assertIdArray(record.riskIds, "riskIds", allowed.risks);
  assertIdArray(record.specialConsiderationIds, "specialConsiderationIds", allowed.special);
  if (typeof record.uncertaintyId !== "string" || !allowed.uncertainty.includes(record.uncertaintyId as UncertaintyId)) {
    throw new Error("uncertaintyId is not approved.");
  }

  if (!record.observationIds.includes("QUOTE_SNAPSHOT")) throw new Error("QUOTE_SNAPSHOT is required.");
  if (record.observationIds.includes("QUOTE_CHANGE") && (quote.change === undefined || quote.changePercent === undefined)) {
    throw new Error("QUOTE_CHANGE requires normalized change fields.");
  }
  if (!record.riskIds.includes("MARKET_PRICE_RISK")) throw new Error("MARKET_PRICE_RISK is required.");
  if (!record.specialConsiderationIds.includes("DATA_PROVENANCE")) throw new Error("DATA_PROVENANCE is required.");
  if (symbol === "QLD") {
    for (const id of ["QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"] as const) {
      if (!record.riskIds.includes(id)) throw new Error(`${id} is required for QLD.`);
    }
    if (!record.specialConsiderationIds.includes("QLD_DAILY_RESET")) throw new Error("QLD_DAILY_RESET is required for QLD.");
  }

  return record as unknown as GroundedAnalysisSelection;
}

const numberLocales: Record<Locale, string> = { en: "en-US", ja: "ja-JP", ko: "ko-KR" };

export function renderGroundedAnalysis(
  selection: GroundedAnalysisSelection,
  input: { symbol: SymbolCode; locale: Locale; quote: NormalizedQuote },
): ModelAnalysisOutput {
  const price = new Intl.NumberFormat(numberLocales[input.locale], { maximumFractionDigits: 4 }).format(input.quote.price);
  const change = input.quote.change === undefined ? "" : new Intl.NumberFormat(numberLocales[input.locale], { maximumFractionDigits: 4, signDisplay: "always" }).format(input.quote.change);
  const changePercent = input.quote.changePercent === undefined ? "" : new Intl.NumberFormat(numberLocales[input.locale], { maximumFractionDigits: 2, signDisplay: "always" }).format(input.quote.changePercent);
  const date = input.quote.marketTimestamp.slice(0, 10);
  const isRealTime = input.quote.freshness === "REAL_TIME";

  const localized = {
    en: {
      summary: input.symbol === "QLD"
        ? `${input.symbol} dated snapshot: ${input.quote.currency} ${price} as of ${date}. QLD targets 2x daily performance; this is not a forecast.`
        : `${input.symbol} dated snapshot: ${input.quote.currency} ${price} as of ${date}. This is not a forecast.`,
      observations: {
        QUOTE_SNAPSHOT: `${input.symbol} was ${input.quote.currency} ${price} at the supplied market timestamp.`,
        QUOTE_CHANGE: `The supplied change was ${change} (${changePercent}%).`,
      },
      risks: {
        MARKET_PRICE_RISK: "Market prices can rise or fall, and one quote does not establish a future direction.",
        QLD_LEVERAGED_DOWNSIDE: "QLD's daily 2x objective can amplify downside as well as upside.",
        QLD_PATH_DEPENDENCY: "Compounding and path dependency can make multi-day outcomes differ from 2x the period return.",
      },
      special: {
        DATA_PROVENANCE: isRealTime
          ? `Source ${input.quote.source} labels this quote real-time; retrieval time remains visible for verification.`
          : `Source ${input.quote.source} labels freshness as ${input.quote.freshness}; it is not presented as real-time.`,
        QLD_DAILY_RESET: "QLD's stated leverage context is daily, not a promise of a 2x multi-day result.",
      },
      uncertainty: "The supplied quote alone cannot identify a cause or predict future performance.",
    },
    ja: {
      summary: input.symbol === "QLD"
        ? `${input.symbol}の日時付きスナップショットは${date}時点で${input.quote.currency} ${price}です。QLDは日次2倍を目標としますが、これは予測ではありません。`
        : `${input.symbol}の日時付きスナップショットは${date}時点で${input.quote.currency} ${price}です。これは予測ではありません。`,
      observations: {
        QUOTE_SNAPSHOT: `提供された市場時刻における${input.symbol}の価格は${input.quote.currency} ${price}でした。`,
        QUOTE_CHANGE: `提供された変化は${change}（${changePercent}%）でした。`,
      },
      risks: {
        MARKET_PRICE_RISK: "市場価格は上下し、単一の価格情報から将来の方向性は判断できません。",
        QLD_LEVERAGED_DOWNSIDE: "QLDの日次2倍目標は上昇だけでなく下落も拡大させる可能性があります。",
        QLD_PATH_DEPENDENCY: "複利と経路依存性により、複数日の結果は期間収益率の単純な2倍と異なる場合があります。",
      },
      special: {
        DATA_PROVENANCE: isRealTime
          ? `情報源「${input.quote.source}」はリアルタイムと表示していますが、検証用に取得時刻も示します。`
          : `情報源「${input.quote.source}」の鮮度表示は${input.quote.freshness}であり、リアルタイムとして表示しません。`,
        QLD_DAILY_RESET: "QLDのレバレッジ目標は日次であり、複数日にわたる2倍の結果を約束するものではありません。",
      },
      uncertainty: "提供された単一の価格情報だけでは原因の特定や将来のパフォーマンス予測はできません。",
    },
    ko: {
      summary: input.symbol === "QLD"
        ? `${input.symbol}의 날짜 표시 스냅샷은 ${date} 기준 ${input.quote.currency} ${price}입니다. QLD는 일일 2배를 목표로 하지만 이는 예측이 아닙니다.`
        : `${input.symbol}의 날짜 표시 스냅샷은 ${date} 기준 ${input.quote.currency} ${price}입니다. 이는 예측이 아닙니다.`,
      observations: {
        QUOTE_SNAPSHOT: `제공된 시장 시각의 ${input.symbol} 가격은 ${input.quote.currency} ${price}였습니다.`,
        QUOTE_CHANGE: `제공된 변동값은 ${change} (${changePercent}%)였습니다.`,
      },
      risks: {
        MARKET_PRICE_RISK: "시장 가격은 상승하거나 하락할 수 있으며 단일 가격만으로 미래 방향을 판단할 수 없습니다.",
        QLD_LEVERAGED_DOWNSIDE: "QLD의 일일 2배 목표는 상승뿐 아니라 하락도 확대할 수 있습니다.",
        QLD_PATH_DEPENDENCY: "복리와 경로 의존성 때문에 여러 날의 결과는 기간 수익률의 단순 2배와 다를 수 있습니다.",
      },
      special: {
        DATA_PROVENANCE: isRealTime
          ? `'${input.quote.source}'가 실시간으로 표시한 자료이며 검증을 위해 조회 시각도 함께 제공합니다.`
          : `'${input.quote.source}'의 freshness는 ${input.quote.freshness}이며 실시간으로 표시하지 않습니다.`,
        QLD_DAILY_RESET: "QLD의 레버리지 목표는 일일 기준이며 여러 날 동안 2배 결과를 약속하지 않습니다.",
      },
      uncertainty: "제공된 단일 가격만으로 원인을 특정하거나 미래 성과를 예측할 수 없습니다.",
    },
  }[input.locale];

  return {
    summary: localized.summary,
    observations: selection.observationIds.map((id) => localized.observations[id]),
    opportunities: [],
    risks: selection.riskIds.map((id) => localized.risks[id]),
    specialConsiderations: selection.specialConsiderationIds.map((id) => localized.special[id]),
    uncertainty: localized.uncertainty,
  };
}

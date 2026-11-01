import { SUPPORTED_SYMBOLS, type SymbolCode } from "../../controller/src/contracts.js";

export interface ProviderQuote {
  symbol: unknown;
  price: unknown;
  currency: unknown;
  marketTimestamp: unknown;
  retrievedAt: unknown;
  marketState: unknown;
  freshness: unknown;
  source: unknown;
  change?: unknown;
  changePercent?: unknown;
}

export interface NormalizedQuote {
  kind: "PRICE";
  symbol: SymbolCode;
  price: number;
  currency: string;
  marketTimestamp: string;
  retrievedAt: string;
  marketState: "OPEN" | "CLOSED" | "PRE_MARKET" | "AFTER_HOURS" | "UNKNOWN";
  freshness: "REAL_TIME" | "DELAYED" | "LATEST_AVAILABLE" | "PREVIOUS_CLOSE";
  source: string;
  change?: number;
  changePercent?: number;
}

const marketStates = new Set(["OPEN", "CLOSED", "PRE_MARKET", "AFTER_HOURS", "UNKNOWN"]);
const freshnessValues = new Set(["REAL_TIME", "DELAYED", "LATEST_AVAILABLE", "PREVIOUS_CLOSE"]);

function dateTime(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${field}.`);
  return new Date(value).toISOString();
}

export function normalizeQuote(raw: ProviderQuote, expectedSymbol: SymbolCode): NormalizedQuote {
  if (raw.symbol !== expectedSymbol || !SUPPORTED_SYMBOLS.includes(raw.symbol as SymbolCode)) throw new Error("Provider symbol mismatch.");
  if (typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price <= 0) throw new Error("Invalid provider price.");
  if (typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency)) throw new Error("Invalid provider currency.");
  if (typeof raw.marketState !== "string" || !marketStates.has(raw.marketState)) throw new Error("Invalid market state.");
  if (typeof raw.freshness !== "string" || !freshnessValues.has(raw.freshness)) throw new Error("Invalid freshness.");
  if (typeof raw.source !== "string" || raw.source.length < 1 || raw.source.length > 80) throw new Error("Invalid provider source.");

  const result: NormalizedQuote = {
    kind: "PRICE",
    symbol: expectedSymbol,
    price: raw.price,
    currency: raw.currency,
    marketTimestamp: dateTime(raw.marketTimestamp, "marketTimestamp"),
    retrievedAt: dateTime(raw.retrievedAt, "retrievedAt"),
    marketState: raw.marketState as NormalizedQuote["marketState"],
    freshness: raw.freshness as NormalizedQuote["freshness"],
    source: raw.source,
  };

  if (typeof raw.change === "number" && Number.isFinite(raw.change)) result.change = raw.change;
  if (typeof raw.changePercent === "number" && Number.isFinite(raw.changePercent)) result.changePercent = raw.changePercent;
  return result;
}

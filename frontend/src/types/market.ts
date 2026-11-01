export type Locale = "en" | "ja" | "ko";
export type SymbolCode = "VOO" | "QLD" | "TSLA" | "SPCX" | "GOOG";
export type JobOperation = "PRICE" | "ANALYZE";
export type JobStatus = "IDLE" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";

export interface Asset {
  symbol: SymbolCode;
  name: string;
  type: "ETF" | "LEVERAGED_ETF" | "STOCK" | "UNVERIFIED";
  price: number | null;
  changePercent: number | null;
  bars: number[];
  available: boolean;
}

export interface InsightItem {
  title: string;
  body: string;
}

export interface LocalizedInsight {
  summary: string;
  items: InsightItem[];
  risk: string;
}

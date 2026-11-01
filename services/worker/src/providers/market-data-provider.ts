import type { SymbolCode } from "../../../controller/src/contracts.js";
import type { ProviderQuote } from "../quote-normalizer.js";

export interface MarketDataProvider {
  getQuote(symbol: SymbolCode, options?: { abortSignal?: AbortSignal }): Promise<ProviderQuote>;
}

export type ProviderErrorCode = "DATA_UNAVAILABLE" | "PROVIDER_RATE_LIMITED" | "PROVIDER_ERROR";

export class MarketDataProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MarketDataProviderError";
  }
}

import type { SymbolCode } from "../../../controller/src/contracts.js";
import type { ProviderQuote } from "../quote-normalizer.js";
import { MarketDataProviderError, type MarketDataProvider } from "./market-data-provider.js";
import { parseUnambiguousJson } from "../../../../shared/schemas/strict-json.js";
import { setTimeout as sleepTimer } from "node:timers/promises";
import { ElapsedBudget } from "../../../../shared/time/elapsed-budget.js";

interface HttpResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}

type FetchLike = (url: string, init: {
  signal: AbortSignal;
  headers: Record<string, string>;
  redirect: "error";
  credentials: "omit";
  referrerPolicy: "no-referrer";
}) => Promise<HttpResponseLike>;
type Sleep = (milliseconds: number, abortSignal?: AbortSignal) => Promise<void>;
const MAX_RESPONSE_BYTES = 32_768;

interface TwelveDataProviderOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: Sleep;
  now?: () => Date;
  elapsedNow?: () => number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MarketDataProviderError("PROVIDER_ERROR", "Provider returned an invalid response.", false);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, field: string): number {
  // Never let JavaScript coerce missing/whitespace or hex/binary strings into
  // a price, change or timestamp. Only finite decimal wire values are facts.
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.length <= 128 &&
    /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new MarketDataProviderError("PROVIDER_ERROR", `Provider response is missing a valid ${field}.`, false);
  }
  return parsed;
}

function marketTimestamp(value: unknown): string {
  const seconds = finiteNumber(value, "timestamp");
  const result = new Date(seconds * 1_000);
  if (Number.isNaN(result.getTime())) {
    throw new MarketDataProviderError("PROVIDER_ERROR", "Provider returned an invalid timestamp.", false);
  }
  return result.toISOString();
}

function retryDelay(response: HttpResponseLike, attempt: number): number {
  const header = response.headers.get("retry-after");
  const retryAfter = header !== null && /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : Number.NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1_000, 2_000);
  return Math.min(200 * 2 ** (attempt - 1), 2_000);
}

async function readResponse(response: HttpResponseLike, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return {};
  }
  const reader = response.body?.getReader();
  if (!reader) throw new MarketDataProviderError("PROVIDER_ERROR", "Provider returned an invalid response.", false);
  let cancellation: Promise<void> | undefined;
  const cancel = () => { cancellation ??= reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new Error("Invalid length");
    const contentType = response.headers.get("content-type") ?? "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Error("Invalid content type");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Response too large");
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    return asRecord(parseUnambiguousJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), MAX_RESPONSE_BYTES));
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    await cancellation;
  }
}

function verifyIdentity(symbol: SymbolCode, body: Record<string, unknown>): void {
  if (body.symbol !== symbol) {
    throw new MarketDataProviderError("DATA_UNAVAILABLE", "Provider returned a different symbol.", false);
  }

  if (symbol === "SPCX") {
    const issuer = typeof body.name === "string" ? body.name.toUpperCase() : "";
    const exchange = typeof body.exchange === "string" ? body.exchange.toUpperCase() : "";
    if (!issuer.includes("SPACE EXPLORATION TECHNOLOGIES") || !exchange.includes("NASDAQ")) {
      throw new MarketDataProviderError("DATA_UNAVAILABLE", "SPCX issuer and exchange could not be verified.", false);
    }
  }
}

export class TwelveDataProvider implements MarketDataProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly sleep: Sleep;
  private readonly now: () => Date;
  private readonly elapsedNow: (() => number) | undefined;

  constructor(options: TwelveDataProviderOptions) {
    if (typeof options.apiKey !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(options.apiKey)) throw new Error("A valid Twelve Data API key is required.");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.timeoutMs = options.timeoutMs ?? 3_500;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.sleep = options.sleep ?? (async (milliseconds, signal) => { await sleepTimer(milliseconds, undefined, { signal }); });
    this.now = options.now ?? (() => new Date());
    this.elapsedNow = options.elapsedNow;

    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 10_000) throw new Error("Provider timeout must be between 100 and 10000 milliseconds.");
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 3) throw new Error("Provider attempts must be between 1 and 3.");
  }

  async getQuote(symbol: SymbolCode, options?: { abortSignal?: AbortSignal }): Promise<ProviderQuote> {
    const cancelled = () => new MarketDataProviderError("PROVIDER_ERROR", "Provider request was cancelled.", false);
    if (options?.abortSignal?.aborted) throw cancelled();
    // The existing three-attempt and two-second backoff caps also form one
    // non-renewable elapsed ceiling, including body cancellation/backoff waits.
    const budget = new ElapsedBudget(this.timeoutMs * this.maxAttempts + 2_000 * (this.maxAttempts - 1),
      this.elapsedNow, options?.abortSignal, () => new MarketDataProviderError("PROVIDER_ERROR", "Provider request timed out.", true));
    try {
      return await budget.call(signal => this.getQuoteWithinBudget(symbol, budget, signal));
    } catch (error) {
      if (options?.abortSignal?.aborted) throw cancelled();
      if (!budget.active()) throw new MarketDataProviderError("PROVIDER_ERROR", "Provider request timed out.", true);
      throw error;
    } finally { budget.dispose(); }
  }

  private async getQuoteWithinBudget(symbol: SymbolCode, budget: ElapsedBudget, parent: AbortSignal): Promise<ProviderQuote> {
    const cancelled = () => new MarketDataProviderError("PROVIDER_ERROR", "Provider request was cancelled.", false);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      if (parent.aborted || !budget.active()) throw cancelled();
      const requestBudget = new ElapsedBudget(this.timeoutMs, this.elapsedNow, parent,
        () => new MarketDataProviderError("PROVIDER_ERROR", "Provider request timed out.", true));
      let waitMs: number;

      try {
        const url = new URL("https://api.twelvedata.com/quote");
        url.searchParams.set("symbol", symbol);
        const response = await requestBudget.call(async signal => {
          const received = await this.fetchImpl(url.toString(), {
            signal,
            headers: { Accept: "application/json", Authorization: `apikey ${this.apiKey}` },
            redirect: "error",
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          // A late fetch can still own an unread body. Request cancellation
          // without waiting for an uncooperative cancellation acknowledgement.
          if (!requestBudget.active()) void received.body?.cancel().catch(() => undefined);
          return received;
        });
        const body = await requestBudget.call(signal => readResponse(response, signal));
        if (parent.aborted || !budget.active()) throw cancelled();
        // Cancellation is cooperative: a late fetch/body may still resolve.
        // Reject its payload and use only the already bounded timeout retries.
        if (!requestBudget.active()) throw Object.assign(new Error("Provider request timed out."), { name: "AbortError" });

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < this.maxAttempts) {
            waitMs = retryDelay(response, attempt);
          } else {
            const code = response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR";
            throw new MarketDataProviderError(code, `Provider request failed with status ${response.status}.`, retryable);
          }
        } else {
          if (body.status === "error") {
            throw new MarketDataProviderError("DATA_UNAVAILABLE", "Provider has no verified quote for this symbol.", false);
          }

          verifyIdentity(symbol, body);
          const result: ProviderQuote = {
            symbol,
            price: finiteNumber(body.close, "close"),
            currency: body.currency,
            marketTimestamp: marketTimestamp(body.timestamp),
            retrievedAt: this.now().toISOString(),
            marketState: body.is_market_open === true ? "OPEN" : body.is_market_open === false ? "CLOSED" : "UNKNOWN",
            freshness: "LATEST_AVAILABLE",
            source: "twelve-data",
            change: finiteNumber(body.change, "change"),
            changePercent: finiteNumber(body.percent_change, "percent_change"),
          };
          if (!requestBudget.active() || !budget.active()) throw Object.assign(new Error("Provider request timed out."), { name: "AbortError" });
          return result;
        }
      } catch (error) {
        if (parent.aborted || !budget.active()) throw cancelled();
        const expired = !requestBudget.active();
        if (!expired && error instanceof MarketDataProviderError) throw error;
        const retryable = expired || error instanceof Error && error.name === "AbortError";
        if (retryable && attempt < this.maxAttempts) {
          waitMs = Math.min(200 * 2 ** (attempt - 1), 2_000);
        } else {
          throw new MarketDataProviderError("PROVIDER_ERROR", retryable ? "Provider request timed out." : "Provider request failed.", retryable);
        }
      } finally {
        requestBudget.dispose();
      }
      try { await budget.call(signal => this.sleep(waitMs, signal)); }
      catch { throw cancelled(); }
    }

    throw new MarketDataProviderError("PROVIDER_ERROR", "Provider request failed.", true);
  }
}

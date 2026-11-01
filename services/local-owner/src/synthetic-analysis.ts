import { performance } from "node:perf_hooks";
import type { Locale } from "../../controller/src/contracts.js";
import { normalizeQuote } from "../../worker/src/quote-normalizer.js";
import { BedrockAnalysisAdapter, type BedrockConverseTransport, type BedrockAnalysisExecution } from "../../worker/src/providers/bedrock-analysis-adapter.js";

export const SYNTHETIC_LAB = Object.freeze({ region: "ap-northeast-1", modelId: "amazon.nova-lite-v1:0",
  lifetimeMs: 300000, timeoutMs: 20000, maxOutputTokens: 512, maxRequestBytes: 8192, maxAttempts: 1 });
export const SYNTHETIC_QUOTE = Object.freeze(normalizeQuote({ symbol: "QLD", price: 100, change: 2, changePercent: 2.040816,
  currency: "USD", marketTimestamp: "2026-01-01T00:00:00Z", retrievedAt: "2026-01-01T00:00:00Z",
  marketState: "UNKNOWN", freshness: "PREVIOUS_CLOSE", source: "synthetic-learning-fixture-NOT-MARKET-DATA" }, "QLD"));

/** One process admits one model attempt, including failures. A reload or another
 * tab can only observe the same result. No arbitrary text, provider or ticker. */
export function createSyntheticAnalysisSession(transport: BedrockConverseTransport,
  options: { lifetimeMs?: number; elapsedNow?: () => number; timeoutMs?: number } = {}) {
  const lifetime = options.lifetimeMs ?? SYNTHETIC_LAB.lifetimeMs, timeout = options.timeoutMs ?? SYNTHETIC_LAB.timeoutMs;
  if (!Number.isSafeInteger(lifetime) || lifetime < 1 || lifetime > SYNTHETIC_LAB.lifetimeMs ||
      !Number.isSafeInteger(timeout) || timeout < 500 || timeout > SYNTHETIC_LAB.timeoutMs) throw Error("SYNTHETIC_LAB_LIMIT_INVALID");
  const now = options.elapsedNow ?? (() => performance.now()), started = now(), abort = new AbortController();
  let state: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CLOSED" = "READY", attempts = 0, locale: Locale = "en";
  let result: BedrockAnalysisExecution | undefined, completedAt: string | undefined;
  const adapter = new BedrockAnalysisAdapter({ modelId: SYNTHETIC_LAB.modelId, maxOutputTokens: SYNTHETIC_LAB.maxOutputTokens,
    timeoutMs: timeout, transport: { async converse(request, callOptions) {
      const bounded = { ...request, system: [...request.system, { text: "All quote numbers and dates are invented synthetic learning data, not observed market prices. Do not infer current conditions." }] };
      if (Buffer.byteLength(JSON.stringify(bounded), "utf8") > SYNTHETIC_LAB.maxRequestBytes || attempts !== 0 || !active() || abort.signal.aborted) throw Error("SYNTHETIC_LAB_LIMIT");
      attempts++;
      return transport.converse(bounded, callOptions);
    } } });
  function close() { state = "CLOSED"; result = undefined; completedAt = undefined; abort.abort(); }
  function active() { if (now() - started >= lifetime) close(); return state !== "CLOSED"; }
  function snapshot() {
    active();
    return structuredClone({ state, attempts, locale, dataOrigin: "synthetic" as const, quote: SYNTHETIC_QUOTE,
      region: SYNTHETIC_LAB.region, modelId: SYNTHETIC_LAB.modelId,
      remainingMs: state === "CLOSED" ? 0 : Math.max(0, Math.floor(lifetime - (now() - started))),
      ...(result ? { result: result.result, usage: result.usage, completedAt } : {}) });
  }
  async function start(language: string) {
    if (!["en", "ja", "ko"].includes(language)) throw Error("SYNTHETIC_LAB_LOCALE_INVALID");
    if (!active() || state !== "READY") return snapshot();
    // Consume the allowance synchronously, before awaiting credentials/network.
    state = "RUNNING"; locale = language as Locale;
    try {
      const value = await adapter.analyze({ symbol: "QLD", locale, quote: SYNTHETIC_QUOTE }, { abortSignal: abort.signal });
      if (active()) { result = value; completedAt = new Date().toISOString(); state = "SUCCEEDED"; }
    } catch { if (active()) state = "FAILED"; } // Never expose upstream errors/identifiers.
    return snapshot();
  }
  return { snapshot, start, close };
}
export type SyntheticAnalysisSession = ReturnType<typeof createSyntheticAnalysisSession>;

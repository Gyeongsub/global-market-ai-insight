import assert from "node:assert/strict";
import test from "node:test";
import { BedrockAnalysisAdapter, type BedrockConverseTransport } from "../src/providers/bedrock-analysis-adapter.js";
import type { MarketDataProvider } from "../src/providers/market-data-provider.js";
import { executeWorkerOperation, WorkerOperationDeadlineError } from "../src/worker-operation.js";

const providerQuote = {
  symbol: "QLD",
  price: 138.17,
  currency: "USD",
  marketTimestamp: "2026-08-07T20:00:00Z",
  retrievedAt: "2026-08-08T00:00:00Z",
  marketState: "CLOSED",
  freshness: "LATEST_AVAILABLE",
  source: "mocked-provider",
  change: 1.64,
  changePercent: 1.21,
};

test("runs mocked provider and Bedrock adapters through one ANALYZE operation", async () => {
  let providerCalls = 0;
  let bedrockCalls = 0;
  const marketDataProvider: MarketDataProvider = {
    async getQuote() {
      providerCalls += 1;
      return providerQuote;
    },
  };
  const transport: BedrockConverseTransport = {
    async converse(request) {
      bedrockCalls += 1;
      assert.equal(request.toolConfig.toolChoice.tool.name, "select_grounded_insights");
      return {
        stopReason: "tool_use",
        output: { message: { content: [{
          toolUse: {
            name: "select_grounded_insights",
            input: {
              observationIds: ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"],
              riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
              specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"],
              uncertaintyId: "SINGLE_QUOTE_NO_FORECAST",
            },
          },
        }] } },
        usage: { inputTokens: 600, outputTokens: 100, totalTokens: 700 },
      };
    },
  };
  const analysisEngine = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });

  const result = await executeWorkerOperation({ operation: "ANALYZE", symbol: "QLD", locale: "ja" }, { marketDataProvider, analysisEngine });
  assert.equal(providerCalls, 1);
  assert.equal(bedrockCalls, 1);
  assert.equal(result.kind, "ANALYSIS");
  if (result.kind === "ANALYSIS") {
    assert.equal(result.locale, "ja");
    assert.equal(result.promptVersion, "grounded-v1");
    assert.match(result.summary, /日次2倍/);
    assert.doesNotMatch(JSON.stringify(result), /QQQ|NASDAQ|投資機会/);
  }
});

test("PRICE operation never invokes the analysis engine", async () => {
  const marketDataProvider: MarketDataProvider = { getQuote: async () => providerQuote };
  let bedrockCalls = 0;
  const analysisEngine = {
    async analyze() {
      bedrockCalls += 1;
      throw new Error("must not run");
    },
  };
  const result = await executeWorkerOperation({ operation: "PRICE", symbol: "QLD", locale: "en" }, { marketDataProvider, analysisEngine });
  assert.equal(result.kind, "PRICE");
  assert.equal(bedrockCalls, 0);
});

test("an expired or invalid deadline fails closed before provider or model access", async () => {
  let externalCalls = 0;
  const dependencies = {
    marketDataProvider: { async getQuote() { externalCalls += 1; return providerQuote; } },
    analysisEngine: { async analyze(): Promise<never> { externalCalls += 1; throw new Error("must not call"); } },
  };
  for (const deadline of [
    { deadlineAt: "2026-08-08T00:00:00Z", now: () => new Date("2026-08-08T00:00:00Z") },
    { deadlineAt: "invalid", now: () => new Date("2026-08-08T00:00:00Z") },
    { deadlineAt: "2026-08-08T00:00:00Z", now: () => new Date(Number.NaN) },
  ]) {
    await assert.rejects(executeWorkerOperation({ operation: "ANALYZE", symbol: "QLD", locale: "en" }, dependencies, deadline), WorkerOperationDeadlineError);
  }
  assert.equal(externalCalls, 0);
});

test("PRICE may complete one millisecond before the deadline with no model call", async () => {
  const result = await executeWorkerOperation({ operation: "PRICE", symbol: "QLD", locale: "en" }, {
    marketDataProvider: { async getQuote() { return providerQuote; } },
    analysisEngine: { async analyze(): Promise<never> { throw new Error("must not call"); } },
  }, { deadlineAt: "2026-08-08T00:00:01.000Z", now: () => new Date("2026-08-08T00:00:00.999Z") });
  assert.equal(result.kind, "PRICE");
});

for (const stage of ["provider", "model"] as const) {
  test(`the elapsed job budget cancels the active ${stage} and clears its timer`, async () => {
    let observed: AbortSignal | undefined; let modelCalls = 0; let fallbacks = 0;
    const waitForAbort = (signal: AbortSignal | undefined) => new Promise<void>((resolve, reject) => {
      observed = signal;
      const fallback = setTimeout(() => { fallbacks++; resolve(); }, 250);
      signal?.addEventListener("abort", () => { clearTimeout(fallback); reject(new Error("PRIVATE_TRANSPORT_REASON")); }, { once: true });
    });
    await assert.rejects(executeWorkerOperation({ operation: "ANALYZE", symbol: "QLD", locale: "en" }, {
      marketDataProvider: { async getQuote(_symbol, options) {
        if (stage === "provider") await waitForAbort(options?.abortSignal);
        return providerQuote;
      } },
      analysisEngine: { async analyze(_input, options) {
        modelCalls++;
        if (stage === "model") await waitForAbort(options?.abortSignal);
        throw new Error("PRIVATE_TRANSPORT_REASON");
      } },
    }, { deadlineAt: "2026-08-08T00:00:00.030Z", now: () => new Date("2026-08-08T00:00:00Z") }),
    (error: unknown) => error instanceof WorkerOperationDeadlineError && !error.message.includes("PRIVATE"));
    assert.equal(observed?.aborted, true); assert.equal(fallbacks, 0);
    assert.equal(modelCalls, stage === "model" ? 1 : 0);
  });
}

test("elapsed exhaustion prevents model work even before timers run or after a wall-clock rollback", async () => {
  for (const clock of ["frozen", "backwards"] as const) {
    let elapsed = 0, modelCalls = 0;
    let wall = Date.parse("2026-08-08T00:00:00Z");
    await assert.rejects(executeWorkerOperation({ operation: "ANALYZE", symbol: "QLD", locale: "en" }, {
      marketDataProvider: { async getQuote() { elapsed = 50; if (clock === "backwards") wall -= 60_000; return providerQuote; } },
      analysisEngine: { async analyze(): Promise<never> { modelCalls++; throw new Error("must not call"); } },
    }, { deadlineAt: "2026-08-08T00:00:00.050Z", now: () => new Date(wall), elapsedNow: () => elapsed }), WorkerOperationDeadlineError);
    assert.equal(modelCalls, 0);
  }
});

test("successful PRICE disposes its owned deadline signal without invoking a model", async () => {
  let signal: AbortSignal | undefined;
  const result = await executeWorkerOperation({ operation: "PRICE", symbol: "QLD", locale: "en" }, {
    marketDataProvider: { async getQuote(_symbol, options) { signal = options?.abortSignal; return providerQuote; } },
    analysisEngine: { async analyze(): Promise<never> { throw new Error("must not call"); } },
  }, { deadlineAt: "2026-08-08T00:01:00Z", now: () => new Date("2026-08-08T00:00:00Z") });
  assert.equal(result.kind, "PRICE");
  assert.equal(signal?.aborted, true);
});

for (const stage of ["provider", "model"] as const) {
  test(`job expiry settles even when the ${stage} ignores cancellation`, async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let modelCalls = 0;
    const work = executeWorkerOperation({ operation: "ANALYZE", symbol: "QLD", locale: "en" }, {
      marketDataProvider: { async getQuote() { if (stage === "provider") await pending; return providerQuote; } },
      analysisEngine: { async analyze(): Promise<never> { modelCalls++; await pending; throw new Error("PRIVATE_LATE_ERROR"); } },
    }, { deadlineAt: "2026-08-08T00:00:00.020Z", now: () => new Date("2026-08-08T00:00:00Z") });
    const outcome = work.then(() => "accepted", error => error instanceof WorkerOperationDeadlineError ? "expired" : "other");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observed = await Promise.race([outcome, new Promise<string>(resolve => { timer = setTimeout(() => resolve("still-pending"), 200); })]);
    clearTimeout(timer); finish(); await outcome;
    assert.equal(observed, "expired");
    assert.equal(modelCalls, stage === "model" ? 1 : 0);
  });
}

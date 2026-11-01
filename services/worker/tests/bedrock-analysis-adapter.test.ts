import assert from "node:assert/strict";
import test from "node:test";
import {
  BedrockAnalysisAdapter,
  BedrockAnalysisError,
  type BedrockConverseRequest,
  type BedrockConverseResponse,
  type BedrockConverseTransport,
} from "../src/providers/bedrock-analysis-adapter.js";
import { normalizeQuote } from "../src/quote-normalizer.js";

const quote = normalizeQuote({
  symbol: "QLD",
  price: 138.17,
  currency: "USD",
  marketTimestamp: "2026-08-07T20:00:00Z",
  retrievedAt: "2026-08-08T00:00:00Z",
  marketState: "CLOSED",
  freshness: "LATEST_AVAILABLE",
  source: "local-contract-fixture",
  change: 1.64,
  changePercent: 1.21,
}, "QLD");

const selection = {
  observationIds: ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"],
  riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
  specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"],
  uncertaintyId: "SINGLE_QUOTE_NO_FORECAST",
};

function successfulResponse(input: unknown = selection): BedrockConverseResponse {
  return {
    stopReason: "tool_use",
    output: { message: { content: [{ toolUse: { toolUseId: "test-tool-use", name: "select_grounded_insights", input } }] } },
    usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600 },
  };
}

class MockTransport implements BedrockConverseTransport {
  calls: BedrockConverseRequest[] = [];
  constructor(private readonly handler: (request: BedrockConverseRequest, signal: AbortSignal) => Promise<BedrockConverseResponse>) {}
  async converse(request: BedrockConverseRequest, options: { abortSignal: AbortSignal }) {
    this.calls.push(request);
    return this.handler(request, options.abortSignal);
  }
}

test("parent cancellation settles an uncooperative model request without retry", async () => {
  const controller = new AbortController();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const transport = new MockTransport(async () => { controller.abort(new Error("PRIVATE_REASON")); await pending; return successfulResponse(); });
  const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
  const outcome = adapter.analyze({symbol: "QLD", locale: "en", quote}, {abortSignal: controller.signal}).then(() => "accepted", error =>
    error instanceof BedrockAnalysisError && error.code === "BEDROCK_TIMEOUT" && !error.retryable && !error.message.includes("PRIVATE") ? "cancelled" : "other");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observed = await Promise.race([outcome, new Promise<string>(resolve => { timer = setTimeout(() => resolve("still-pending"), 200); })]);
  clearTimeout(timer); finish(); await outcome;
  assert.equal(observed, "cancelled"); assert.equal(transport.calls.length, 1);
});

test("a model acknowledgement cannot win ahead of a delayed timer after elapsed expiry", async () => {
  let elapsed = 0;
  const transport = new MockTransport(async () => { elapsed = 500; return successfulResponse(); });
  const adapter = new BedrockAnalysisAdapter({transport, modelId: "amazon.nova-lite-v1:0", timeoutMs: 500, elapsedNow: () => elapsed});
  await assert.rejects(adapter.analyze({symbol: "QLD", locale: "en", quote}), (error: unknown) =>
    error instanceof BedrockAnalysisError && error.code === "BEDROCK_TIMEOUT" && error.retryable);
  assert.equal(transport.calls.length, 1);
});

test("a valid model response arriving after its own timeout is discarded without a second request", async () => {
  const transport = new MockTransport(async (_request, signal) => {
    await new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), {once:true}));
    return successfulResponse();
  });
  const adapter = new BedrockAnalysisAdapter({transport,modelId:"amazon.nova-lite-v1:0",timeoutMs:500});
  await assert.rejects(adapter.analyze({symbol:"QLD",locale:"en",quote}),
    (error:unknown)=>error instanceof BedrockAnalysisError && error.code==="BEDROCK_TIMEOUT" && error.retryable);
  assert.equal(transport.calls.length,1);
});

test("a pre-cancelled job never invokes Bedrock or exposes the cancellation reason", async () => {
  const controller = new AbortController(); controller.abort(new Error("PRIVATE_ABORT_REASON"));
  const transport = new MockTransport(async () => successfulResponse());
  const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
  await assert.rejects(adapter.analyze({ symbol: "QLD", locale: "en", quote }, { abortSignal: controller.signal }),
    (error: unknown) => error instanceof BedrockAnalysisError && error.code === "BEDROCK_TIMEOUT" && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(transport.calls.length, 0);
});

test("job cancellation reaches Bedrock transport and discards a late response without retry", async () => {
  const controller = new AbortController(); let propagated = false;
  const transport = new MockTransport(async (_request, signal) => {
    controller.abort(new Error("PRIVATE_ABORT_REASON")); propagated = signal.aborted;
    return successfulResponse();
  });
  const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
  await assert.rejects(adapter.analyze({ symbol: "QLD", locale: "en", quote }, { abortSignal: controller.signal }),
    (error: unknown) => error instanceof BedrockAnalysisError && error.code === "BEDROCK_TIMEOUT" && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(transport.calls.length, 1); assert.equal(propagated, true);
});

test("connects a mocked Bedrock tool response to deterministic Korean analysis", async () => {
  const transport = new MockTransport(async () => successfulResponse());
  const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0", maxOutputTokens: 512 });
  const execution = await adapter.analyze({ symbol: "QLD", locale: "ko", quote });

  assert.equal(transport.calls.length, 1);
  assert.equal(transport.calls[0]?.toolConfig.toolChoice.tool.name, "select_grounded_insights");
  assert.equal(transport.calls[0]?.inferenceConfig.maxTokens, 512);
  assert.equal(execution.usage.totalTokens, 600);
  assert.match(execution.result.summary, /일일 2배/);
  assert.match(execution.result.disclaimer, /금융 자문이 아닙니다/);
  assert.equal(execution.result.opportunities.length, 0);
  assert.doesNotMatch(JSON.stringify(execution.result), /QQQ|NASDAQ|고수익|투자 기회/);
});

test("all three locales preserve quote time, provenance, QLD risks and application disclaimer", async () => {
  const expectations = {
    en: [/2x daily/, /Compounding and path dependency/, /not financial advice/],
    ja: [/日次2倍/, /複利と経路依存性/, /金融アドバイスではありません/],
    ko: [/일일 2배/, /복리와 경로 의존성/, /금융 자문이 아닙니다/],
  } as const;
  for (const locale of ["en", "ja", "ko"] as const) {
    const transport = new MockTransport(async () => successfulResponse());
    const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
    const { result } = await adapter.analyze({ symbol: "QLD", locale, quote });
    assert.equal(transport.calls.length, 1);
    assert.equal(result.locale, locale);
    assert.equal(result.dataAsOf, quote.marketTimestamp);
    assert.equal(result.promptVersion, "grounded-v1");
    assert.equal(result.modelId, "amazon.nova-lite-v1:0");
    assert.match(result.summary, expectations[locale][0]);
    assert.match(result.risks.join(" "), expectations[locale][1]);
    assert.match(result.disclaimer, expectations[locale][2]);
    assert.match(result.specialConsiderations.join(" "), /local-contract-fixture/);
    assert.match(result.specialConsiderations.join(" "), /LATEST_AVAILABLE/);
    assert.ok(result.uncertainty.length > 0);
    assert.deepEqual(result.opportunities, []);
  }
});

test("refusal, output truncation and missing QLD context fail after one model attempt", async () => {
  for (const response of [
    { ...successfulResponse(), stopReason: "guardrail_intervened" },
    { ...successfulResponse(), stopReason: "max_tokens" },
    successfulResponse({ ...selection, riskIds: ["MARKET_PRICE_RISK"] }),
    successfulResponse({ ...selection, specialConsiderationIds: ["DATA_PROVENANCE"] }),
  ]) {
    const transport = new MockTransport(async () => response);
    const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
    await assert.rejects(() => adapter.analyze({ symbol: "QLD", locale: "ko", quote }), (error: unknown) => {
      assert.ok(error instanceof BedrockAnalysisError);
      assert.equal(error.code, "BEDROCK_INVALID_OUTPUT");
      assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(transport.calls.length, 1);
  }
});

test("fails safely on unknown IDs without retrying or exposing raw model content", async () => {
  const rawSecretLikeText = "do-not-expose-model-content";
  const transport = new MockTransport(async () => successfulResponse({ ...selection, riskIds: [rawSecretLikeText] }));
  const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });

  await assert.rejects(adapter.analyze({ symbol: "QLD", locale: "en", quote }), (error: unknown) => {
    assert.ok(error instanceof BedrockAnalysisError);
    assert.equal(error.code, "BEDROCK_INVALID_OUTPUT");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(error.message, new RegExp(rawSecretLikeText));
    return true;
  });
  assert.equal(transport.calls.length, 1);
});

test("rejects free text, token-boundary violations, and inconsistent usage", async () => {
  const cases: BedrockConverseResponse[] = [
    { ...successfulResponse(), output: { message: { content: [{ text: "unexpected" }, ...successfulResponse().output.message.content] } } },
    { ...successfulResponse(), usage: { inputTokens: 1_501, outputTokens: 100, totalTokens: 1_601 } },
    { ...successfulResponse(), usage: { inputTokens: 500, outputTokens: 100, totalTokens: 999 } },
  ];
  for (const response of cases) {
    const transport = new MockTransport(async () => response);
    const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
    await assert.rejects(adapter.analyze({ symbol: "QLD", locale: "ja", quote }), (error: unknown) => {
      assert.ok(error instanceof BedrockAnalysisError);
      assert.equal(error.code, "BEDROCK_INVALID_OUTPUT");
      return true;
    });
    assert.equal(transport.calls.length, 1);
  }
});

test("maps timeout and throttling to stable retryable errors without internal details", async () => {
  const timeoutTransport = new MockTransport(async (_request, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("internal timeout detail"), { name: "AbortError" })), { once: true });
  }));
  const timeoutAdapter = new BedrockAnalysisAdapter({ transport: timeoutTransport, modelId: "amazon.nova-lite-v1:0", timeoutMs: 500 });
  await assert.rejects(timeoutAdapter.analyze({ symbol: "QLD", locale: "en", quote }), (error: unknown) => {
    assert.ok(error instanceof BedrockAnalysisError);
    assert.equal(error.code, "BEDROCK_TIMEOUT");
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /internal timeout detail/);
    return true;
  });

  const throttleTransport = new MockTransport(async () => { throw Object.assign(new Error("account detail"), { name: "ThrottlingException" }); });
  const throttleAdapter = new BedrockAnalysisAdapter({ transport: throttleTransport, modelId: "amazon.nova-lite-v1:0" });
  await assert.rejects(throttleAdapter.analyze({ symbol: "QLD", locale: "en", quote }), (error: unknown) => {
    assert.ok(error instanceof BedrockAnalysisError);
    assert.equal(error.code, "BEDROCK_THROTTLED");
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /account detail/);
    return true;
  });
});

test("usage accepts only three owned bounded counters and never reflects an untrusted field name", async () => {
  for (const usage of [{ ...successfulResponse().usage, PRIVATE_SENTINEL: "bad" }, null, [],
    { ...successfulResponse().usage, PRIVATE_SENTINEL: 1 }, { inputTokens: 500, outputTokens: 100 },
    { inputTokens: 500.5, outputTokens: 100, totalTokens: 600.5 }]) {
    const transport = new MockTransport(async () => ({ ...successfulResponse(), usage } as unknown as BedrockConverseResponse));
    const adapter = new BedrockAnalysisAdapter({ transport, modelId: "amazon.nova-lite-v1:0" });
    await assert.rejects(adapter.analyze({ symbol: "QLD", locale: "en", quote }), (error: unknown) => {
      assert.ok(error instanceof BedrockAnalysisError); assert.equal(error.code, "BEDROCK_INVALID_OUTPUT");
      assert.equal(error.retryable, false); assert.equal(error.message.includes("PRIVATE_SENTINEL"), false); return true;
    });
    assert.equal(transport.calls.length, 1);
  }
});

test("validated model and transport are snapshotted rather than changed through the caller's options", async () => {
  const response = successfulResponse();
  const transport = new MockTransport(async () => response);
  const options = { transport, modelId: "amazon.nova-lite-v1:0" };
  const adapter = new BedrockAnalysisAdapter(options);
  options.modelId = "PRIVATE_SENTINEL";
  options.transport = new MockTransport(async () => { throw new Error("PRIVATE_SENTINEL"); });
  const execution = await adapter.analyze({ symbol: "QLD", locale: "en", quote });
  assert.equal(transport.calls.length, 1); assert.equal(options.transport.calls.length, 0);
  assert.equal(transport.calls[0]?.modelId, "amazon.nova-lite-v1:0");
  assert.equal(execution.result.modelId, "amazon.nova-lite-v1:0");
  response.usage.inputTokens = 999;
  assert.equal(execution.usage.inputTokens, 500);
});

import assert from "node:assert/strict";
import test from "node:test";
import { MarketDataProviderError } from "../src/providers/market-data-provider.js";
import { TwelveDataProvider } from "../src/providers/twelve-data-provider.js";

const quote = {
  symbol: "QLD",
  name: "ProShares Ultra QQQ",
  exchange: "NASDAQ",
  currency: "USD",
  timestamp: 1_754_597_600,
  close: "138.17",
  change: "1.64",
  percent_change: "1.21",
  is_market_open: false,
};

function response(status: number, body: unknown, retryAfter: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...(retryAfter === null ? {} : { "retry-after": retryAfter }) },
  });
}

for (const stage of ["fetch", "body-cancel"] as const) {
  test(`provider timeout settles without a cooperative ${stage}`, async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    let calls = 0;
    const provider = new TwelveDataProvider({ apiKey: "test-key", timeoutMs: 100, maxAttempts: 1,
      fetchImpl: async () => {
        calls++;
        if (stage === "fetch") { await pending; return response(200, quote); }
        return new Response(new ReadableStream<Uint8Array>({ cancel: () => pending }), { status: 429 });
      },
    });
    const outcome = provider.getQuote("QLD").then(() => "accepted", error =>
      error instanceof MarketDataProviderError && error.code === "PROVIDER_ERROR" ? "expired" : "other");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observed = await Promise.race([outcome, new Promise<string>(resolve => { timer = setTimeout(() => resolve("still-pending"), 350); })]);
    clearTimeout(timer); finish(); await outcome;
    assert.equal(observed, "expired"); assert.equal(calls, 1);
  });
}

test("provider elapsed expiry discards a late acknowledgement without waiting for its timer", async () => {
  let elapsed = 0, calls = 0;
  const provider = new TwelveDataProvider({apiKey: "test-key", timeoutMs: 100, maxAttempts: 1, elapsedNow: () => elapsed,
    fetchImpl: async () => { calls++; elapsed = 100; return response(200, quote); }});
  await assert.rejects(provider.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError && error.retryable);
  assert.equal(calls, 1);
});

test("provider backoff shares the total budget and cannot dispatch another attempt after expiry", async () => {
  let elapsed = 0, calls = 0, sleeps = 0;
  const provider = new TwelveDataProvider({apiKey: "test-key", timeoutMs: 100, elapsedNow: () => elapsed,
    fetchImpl: async () => { calls++; return response(429, {}, "2"); },
    sleep: async () => { sleeps++; elapsed = 4_300; },
  });
  await assert.rejects(provider.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError && error.retryable);
  assert.equal(calls, 1); assert.equal(sleeps, 1);
});

test("cancelling a stalled backoff settles before the custom sleeper acknowledges and never retries", async () => {
  const parent = new AbortController(); let finish!: () => void, calls = 0;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const provider = new TwelveDataProvider({apiKey: "test-key", timeoutMs: 100,
    fetchImpl: async () => { calls++; return response(429, {}, "0"); },
    sleep: async () => { parent.abort(new Error("PRIVATE_PARENT_REASON")); await pending; },
  });
  const outcome = provider.getQuote("QLD", {abortSignal: parent.signal}).then(() => "accepted", error =>
    error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE") ? "cancelled" : "other");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observed = await Promise.race([outcome, new Promise<string>(resolve => { timer = setTimeout(() => resolve("still-pending"), 200); })]);
  clearTimeout(timer); finish(); await outcome;
  assert.equal(observed, "cancelled"); assert.equal(calls, 1);
});

for (const stage of ["fetch","body"] as const) test(`a valid quote arriving after its own ${stage} timeout cannot succeed`, async () => {
  let calls=0;
  const provider=new TwelveDataProvider({apiKey:"test-key",timeoutMs:100,maxAttempts:1,fetchImpl:async(_url,options)=>{
    calls++;
    if(stage==="fetch") {
      await new Promise<void>(resolve=>options.signal.addEventListener("abort",()=>resolve(),{once:true}));
      return response(200,quote);
    }
    return new Response(new ReadableStream<Uint8Array>({start(controller){options.signal.addEventListener("abort",()=>{
      controller.enqueue(new TextEncoder().encode(JSON.stringify(quote)));controller.close();
    },{once:true});}}),{headers:{"content-type":"application/json"}});
  }});
  await assert.rejects(provider.getQuote("QLD"),(error:unknown)=>error instanceof MarketDataProviderError && error.code==="PROVIDER_ERROR" && error.retryable);
  assert.equal(calls,1);
});

test("an adapter timeout retains the existing provider retry cap but never accepts the late first quote",async()=>{
  let calls=0,sleeps=0;
  const provider=new TwelveDataProvider({apiKey:"test-key",timeoutMs:100,sleep:async()=>{sleeps++;},fetchImpl:async(_url,options)=>{
    if(++calls===1){await new Promise<void>(resolve=>options.signal.addEventListener("abort",()=>resolve(),{once:true}));return response(200,{...quote,close:"999999"});}
    return response(200,quote);
  }});
  const result=await provider.getQuote("QLD");assert.equal(result.price,138.17);assert.equal(calls,2);assert.equal(sleeps,1);
});

test("duplicate provider facts cannot hide a contradictory first value or cause retries", async () => {
  for (const prefix of ['"close":"999999",', '"cl\\u006fse":"999999",', '"symbol":"TSLA",']) {
    let calls = 0;
    const raw = "{" + prefix + JSON.stringify(quote).slice(1);
    const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => { calls++;
      return new Response(raw, { headers: { "content-type": "application/json" } }); } });
    await assert.rejects(provider.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError &&
      error.code === "PROVIDER_ERROR" && !error.retryable && !/999999|TSLA|test-key/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("maps a verified Twelve Data quote without exposing the credential", async () => {
  let requestedUrl = "";
  const provider = new TwelveDataProvider({
    apiKey: "secret-provider-key",
    fetchImpl: async (url, init) => {
      requestedUrl = url;
      assert.equal(init.headers.Authorization, "apikey secret-provider-key");
      assert.equal(init.redirect, "error");
      assert.equal(init.credentials, "omit");
      assert.equal(init.referrerPolicy, "no-referrer");
      return response(200, quote);
    },
    now: () => new Date("2026-08-08T00:00:00Z"),
  });

  const result = await provider.getQuote("QLD");
  assert.equal(result.price, 138.17);
  assert.equal(result.source, "twelve-data");
  assert.equal(result.marketState, "CLOSED");
  assert.match(requestedUrl, /symbol=QLD/);
  assert.doesNotMatch(requestedUrl, /apikey|secret-provider-key/);
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-key/);
});

test("rejects unsafe credentials and non-finite or fractional timeouts before any request", () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(200, quote); };
  for (const apiKey of ["", " ", "key\r\nAuthorization: leaked", "key\u0000", "é", "x".repeat(1025)]) {
    assert.throws(() => new TwelveDataProvider({ apiKey, fetchImpl }), /valid Twelve Data API key/);
  }
  for (const timeoutMs of [Number.NaN, Infinity, 3500.5, 99, 10001]) {
    assert.throws(() => new TwelveDataProvider({ apiKey: "test-key", timeoutMs, fetchImpl }), /Provider timeout/);
  }
  assert.equal(calls, 0);
});

test("cancels an unread error response and applies bounded default backoff when retry-after is absent", async () => {
  let cancelled = 0;
  let calls = 0;
  const sleeps: number[] = [];
  const provider = new TwelveDataProvider({
    apiKey: "test-key",
    fetchImpl: async () => ++calls === 1 ? new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled += 1; },
    }), { status: 429 }) : response(200, quote),
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });
  await provider.getQuote("QLD");
  assert.equal(calls, 2);
  assert.equal(cancelled, 1);
  assert.deepEqual(sleeps, [200]);
});

test("empty error bodies preserve rate-limit retries and terminal status without reading success JSON", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const retry = new TwelveDataProvider({
    apiKey: "test-key", sleep: async ms => { sleeps.push(ms); },
    fetchImpl: async () => ++calls === 1 ? new Response(null, { status: 429 }) : response(200, quote),
  });
  assert.equal((await retry.getQuote("QLD")).symbol, "QLD");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [200]);
  const terminal = new TwelveDataProvider({ apiKey: "test-key", maxAttempts: 1,
    fetchImpl: async () => new Response(null, { status: 429 }) });
  await assert.rejects(terminal.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError &&
    error.code === "PROVIDER_RATE_LIMITED" && error.retryable);
  const emptySuccess = new TwelveDataProvider({ apiKey: "test-key",
    fetchImpl: async () => new Response(null, { status: 200 }) });
  await assert.rejects(emptySuccess.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError &&
    error.code === "PROVIDER_ERROR" && !error.retryable);
});

test("fails closed on oversized, malformed, or unexpected provider responses without reflecting contents", async () => {
  const bodies = [
    new Response("x".repeat(32769), { headers: { "content-type": "application/json" } }),
    new Response("secret-response", { headers: { "content-type": "text/html" } }),
    new Response("secret-response", { headers: { "content-type": "application/json", "content-length": "32769" } }),
    new Response("secret-response", { headers: { "content-type": "application/json", "content-length": "bad" } }),
    new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    new Response("\uFEFF" + JSON.stringify(quote), { headers: { "content-type": "application/json" } }),
    new Response("secret-response", { headers: { "content-type": "application/json" } }),
  ];
  for (const body of bodies) {
    let calls = 0;
    const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => { calls += 1; return body; } });
    await assert.rejects(provider.getQuote("QLD"), (error: unknown) => {
      assert.ok(error instanceof MarketDataProviderError);
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /secret-response|test-key/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("cancels successful streams immediately when an advertised or streamed size bound is exceeded", async () => {
  for (const advertised of [true, false]) {
    let cancelled = 0;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(32769)); },
      cancel() { cancelled += 1; },
    });
    const provider = new TwelveDataProvider({
      apiKey: "test-key",
      fetchImpl: async () => new Response(stream, { headers: {
        "content-type": "application/json", ...(advertised ? { "content-length": "32769" } : {}),
      } }),
    });
    await assert.rejects(provider.getQuote("QLD"), MarketDataProviderError);
    assert.equal(cancelled, 1);
    assert.ok(pulls <= 2);
  }
});

test("does not retry or reflect redirect errors and snapshots the validated credential", async () => {
  let calls = 0;
  const options = {
    apiKey: "original-test-key",
    fetchImpl: async (_url: string, init: { headers: Record<string, string> }) => {
      calls += 1;
      assert.equal(init.headers.Authorization, "apikey original-test-key");
      throw new TypeError("redirect to secret-provider-key");
    },
  };
  const provider = new TwelveDataProvider(options);
  options.apiKey = "mutated-test-key";
  await assert.rejects(provider.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError &&
    error.retryable === false && error.message === "Provider request failed.");
  assert.equal(calls, 1);
});

test("retries bounded rate-limit responses before succeeding", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const provider = new TwelveDataProvider({
    apiKey: "test-key",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(429, {}, "0") : response(200, quote);
    },
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });

  await provider.getQuote("QLD");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [0]);
});

test("rejects an SPCX ticker collision unless issuer and exchange both match", async () => {
  const provider = new TwelveDataProvider({
    apiKey: "test-key",
    fetchImpl: async () => response(200, { ...quote, symbol: "SPCX", name: "AXS SPAC and New Issue ETF" }),
  });

  await assert.rejects(
    provider.getQuote("SPCX"),
    (error: unknown) => error instanceof MarketDataProviderError && error.code === "DATA_UNAVAILABLE",
  );
});

test("accepts SPCX only when the provider returns the verified issuer and Nasdaq", async () => {
  const provider = new TwelveDataProvider({
    apiKey: "test-key",
    fetchImpl: async () => response(200, {
      ...quote,
      symbol: "SPCX",
      name: "Space Exploration Technologies Corp.",
      exchange: "NASDAQ",
    }),
  });

  const result = await provider.getQuote("SPCX");
  assert.equal(result.symbol, "SPCX");
});

test("returns a stable, credential-safe error after the final provider failure", async () => {
  const provider = new TwelveDataProvider({
    apiKey: "never-print-this-key",
    maxAttempts: 1,
    fetchImpl: async () => response(503, {}),
  });

  await assert.rejects(provider.getQuote("VOO"), (error: unknown) => {
    assert.ok(error instanceof MarketDataProviderError);
    assert.equal(error.code, "PROVIDER_ERROR");
    assert.equal(error.retryable, true);
    assert.doesNotMatch(error.message, /never-print-this-key/);
    return true;
  });
});

test("provider numeric fields cannot coerce empty, whitespace or nondecimal strings into facts", async () => {
  for (const field of ["close", "change", "percent_change", "timestamp"]) {
    for (const value of ["", " ", "\t\n", "0x10", "0b10"]) {
      let calls = 0;
      const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => {
        calls += 1; return response(200, { ...quote, [field]: value });
      } });
      await assert.rejects(provider.getQuote("QLD"), (error: unknown) => error instanceof MarketDataProviderError &&
        error.code === "PROVIDER_ERROR" && !error.retryable);
      assert.equal(calls, 1);
    }
  }
});

test("missing or nonboolean market-open status remains unknown, never a claimed closed market", async () => {
  for (const value of [undefined, null, "false", "true", 0, 1]) {
    const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => response(200, { ...quote, is_market_open: value }) });
    assert.equal((await provider.getQuote("QLD")).marketState, "UNKNOWN");
  }
  const open = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => response(200, { ...quote, is_market_open: true }) });
  assert.equal((await open.getQuote("QLD")).marketState, "OPEN");
});

test("a pre-cancelled job never starts a provider request or exposes its abort reason", async () => {
  const controller = new AbortController(); controller.abort(new Error("PRIVATE_ABORT_REASON"));
  let calls = 0;
  const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => { calls++; return response(200, quote); } });
  await assert.rejects(provider.getQuote("QLD", { abortSignal: controller.signal }),
    (error: unknown) => error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(calls, 0);
});

test("job cancellation reaches the active provider signal and cannot trigger another attempt", async () => {
  const controller = new AbortController(); let calls = 0; let propagated = false;
  const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async (_url, options) => {
    calls++; controller.abort(new Error("PRIVATE_ABORT_REASON")); propagated = options.signal.aborted;
    if (options.signal.aborted) throw Object.assign(new Error("PRIVATE_ABORT_REASON"), { name: "AbortError" });
    return response(200, quote);
  } });
  await assert.rejects(provider.getQuote("QLD", { abortSignal: controller.signal }),
    (error: unknown) => error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(calls, 1); assert.equal(propagated, true);
});

test("cancelling while rate-limit backoff is pending prevents a second provider attempt", async () => {
  const controller = new AbortController(); let calls = 0;
  const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => {
    calls++; return calls === 1 ? response(429, {}, "0") : response(200, quote);
  }, sleep: async () => { controller.abort(new Error("PRIVATE_ABORT_REASON")); } });
  await assert.rejects(provider.getQuote("QLD", { abortSignal: controller.signal }),
    (error: unknown) => error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(calls, 1);
});

test("job cancellation aborts the default backoff timer without another provider request", async () => {
  const controller = new AbortController(); let calls = 0;
  const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async () => {
    calls++; setImmediate(() => controller.abort(new Error("PRIVATE_ABORT_REASON")));
    return response(429, {}, "2");
  } });
  await assert.rejects(provider.getQuote("QLD", { abortSignal: controller.signal }),
    (error: unknown) => error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(calls, 1);
});

test("cancellation during provider body consumption stays sanitized and cannot retry", async () => {
  const controller = new AbortController(); let calls = 0;
  const provider = new TwelveDataProvider({ apiKey: "test-key", fetchImpl: async (_url, options) => {
    calls++;
    const body = new ReadableStream<Uint8Array>({ start(stream) {
      options.signal.addEventListener("abort", () => stream.error(new Error("PRIVATE_BODY_REASON")), { once: true });
      queueMicrotask(() => controller.abort(new Error("PRIVATE_ABORT_REASON")));
    } });
    return new Response(body, { headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(provider.getQuote("QLD", { abortSignal: controller.signal }),
    (error: unknown) => error instanceof MarketDataProviderError && !error.retryable && !error.message.includes("PRIVATE"));
  assert.equal(calls, 1);
});

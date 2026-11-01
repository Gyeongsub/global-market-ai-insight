import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { Script } from "node:vm";
import { createSyntheticAnalysisSession, SYNTHETIC_LAB } from "../src/synthetic-analysis.js";
import { startSyntheticAnalysisServer } from "../src/synthetic-server.js";
import { SYNTHETIC_JS, syntheticPage } from "../src/synthetic-page.js";
import type { BedrockConverseRequest, BedrockConverseResponse } from "../../worker/src/providers/bedrock-analysis-adapter.js";

function success(): BedrockConverseResponse { return { stopReason: "tool_use", usage: { inputTokens: 800, outputTokens: 100, totalTokens: 900 },
  output: { message: { content: [{ toolUse: { name: "select_grounded_insights", input: {
    observationIds: ["QUOTE_SNAPSHOT", "QUOTE_CHANGE"], riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
    specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"], uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" } } }] } } }; }

test("synthetic session: all locales use actual transport contract, fixed input and one attempt", async () => {
  for (const locale of ["en", "ja", "ko"]) {
    const calls: BedrockConverseRequest[] = [];
    const s = createSyntheticAnalysisSession({ async converse(input) { calls.push(input); return success(); } });
    try {
      assert.equal(s.snapshot().attempts, 0);
      const result = await s.start(locale); assert.equal(result.state, "SUCCEEDED");
      assert.equal(result.result?.locale, locale); assert.equal(result.dataOrigin, "synthetic");
      assert.equal(result.result?.modelId, SYNTHETIC_LAB.modelId);
      assert.match(result.result!.summary, /100/);
      await s.start(locale); await s.start("en"); assert.equal(calls.length, 1);
      assert.match(JSON.stringify(calls[0]), /invented synthetic/);
      assert.match(JSON.stringify(calls[0]), /NOT-MARKET-DATA/);
      assert.equal(calls[0]!.inferenceConfig.maxTokens, 512);
      assert.ok(Buffer.byteLength(JSON.stringify(calls[0])) < 8192);
      result.result!.summary = "MUTATED"; assert.notEqual(s.snapshot().result?.summary, "MUTATED");
    } finally { s.close(); }
    assert.equal(s.snapshot().result, undefined); assert.equal(s.snapshot().state, "CLOSED");
  }
});

test("simultaneous starts, failed and malformed outputs never create a second attempt", async () => {
  let finish!: (r: BedrockConverseResponse) => void, calls = 0;
  const s = createSyntheticAnalysisSession({ converse() { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = s.start("ko"); assert.equal((await s.start("ja")).state, "RUNNING");
  finish(success()); await first; assert.equal(calls, 1); s.close();
  for (const invalid of [null, { ...success(), stopReason: "max_tokens" }, { ...success(), usage: { inputTokens: 800, outputTokens: 513, totalTokens: 1313 } }]) {
    let count = 0;
    const session = createSyntheticAnalysisSession({ async converse() { count++; if (!invalid) throw Error("PRIVATE_AWS_CREDENTIAL_SENTINEL"); return invalid; } });
    assert.equal((await session.start("en")).state, "FAILED"); await session.start("en"); assert.equal(count, 1);
    assert.doesNotMatch(JSON.stringify(session.snapshot()), /PRIVATE|Credential|summary/); session.close();
  }
});

test("closing cancels an in-flight call and discards a late valid response", async () => {
  let finish!: (r: BedrockConverseResponse) => void, signal: AbortSignal | undefined;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const s = createSyntheticAnalysisSession({ converse(_request, options) { signal = options.abortSignal; entered(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = s.start("en"); await ready; s.close(); assert.equal(signal?.aborted, true);
  finish(success()); await pending; assert.equal(s.snapshot().state, "CLOSED"); assert.equal(s.snapshot().result, undefined);
  await s.start("en"); assert.equal(s.snapshot().attempts, 1);
});

test("elapsed expiry, invalid locale and noncooperative timeout fail closed", async () => {
  let elapsed = 0, calls = 0;
  const s = createSyntheticAnalysisSession({ async converse() { calls++; return success(); } }, { lifetimeMs: 10, elapsedNow: () => elapsed });
  await assert.rejects(s.start("ko?input=secret")); assert.equal(calls, 0);
  elapsed = 11; assert.equal((await s.start("en")).state, "CLOSED"); assert.equal(calls, 0);
  const slow = createSyntheticAnalysisSession({ async converse() { return new Promise(() => {}); } }, { timeoutMs: 500 });
  assert.equal((await slow.start("en")).state, "FAILED"); slow.close();
  for (const lifetimeMs of [0, 300001, NaN]) assert.throws(() => createSyntheticAnalysisSession({ async converse() { return success(); } }, { lifetimeMs }));
});

const nav = { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
function http(origin: string, path = "/", method = "GET", headers: Record<string, string> = nav) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request(origin + path, { method, headers, timeout: 2000 }, response => {
      let body = ""; response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body, headers: response.headers }));
    }); req.on("error", reject); req.on("timeout", () => req.destroy(Error("HTTP_TIMEOUT"))); req.end();
  });
}
test("HTTP: navigation is free; hostile requests denied; authorized click once; refresh free; close clears", async () => {
  let calls = 0;
  const session = createSyntheticAnalysisSession({ async converse() { calls++; return success(); } });
  const app = await startSyntheticAnalysisServer(session, 0);
  try {
    const cross = await http(app.origin, "/", "GET", { ...nav, "sec-fetch-site": "cross-site" });
    assert.equal(cross.status, 403); assert.doesNotMatch(cross.body, /lab-capability|100/);
    const page = await http(app.origin); assert.equal(page.status, 200); assert.equal(calls, 0);
    assert.equal(page.headers["cache-control"], "no-store"); assert.equal(page.headers["access-control-allow-origin"], undefined);
    const cap = /name="lab-capability" content="([a-f0-9]{64})"/.exec(page.body)![1]!;
    const headers = { origin: app.origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", "x-gmai-local-capability": cap, "content-length": "0" };
    for (const [key, value] of [["origin", "https://evil.invalid"], ["host", "localhost:4175"], ["x-gmai-local-capability", "0".repeat(64)], ["content-length", "1"], ["cookie", "PRIVATE"]])
      assert.equal((await http(app.origin, "/bridge/start/ko", "POST", { ...headers, [key!]: value! })).status, 403);
    for (const path of ["/bridge/start/ko?x=1", "/bridge/start/invalid", "/v1/jobs", "/.aws/credentials"])
      assert.equal((await http(app.origin, path, "POST", headers)).status, 403);
    assert.equal(calls, 0);
    assert.equal(JSON.parse((await http(app.origin, "/bridge/start/ko", "POST", headers)).body).state, "SUCCEEDED");
    await http(app.origin); await http(app.origin, "/bridge/start/en", "POST", headers);
    const status = JSON.parse((await http(app.origin, "/bridge/status", "POST", headers)).body);
    assert.equal(status.locale, "ko"); assert.equal(status.usage.totalTokens, 900); assert.equal(calls, 1);
    assert.equal((await http(app.origin, "/bridge/close", "POST", headers)).status, 200); await app.finished;
    assert.equal(app.snapshot().listening, false); assert.equal(app.snapshot().capabilityRetained, false); assert.equal(app.snapshot().resultRetained, false);
  } finally { await app.close(); }
});
test("server expiry discards capability/result and releases port", async () => {
  const s = createSyntheticAnalysisSession({ async converse() { return success(); } }, { lifetimeMs: 20 });
  const app = await startSyntheticAnalysisServer(s, 0);
  try { await app.finished; assert.equal(app.snapshot().closed, true); assert.equal(app.snapshot().modelAttempts, 0); }
  finally { await app.close(); }
});
test("browser script parses; no HTML injection, persistence or automatic paid start", () => {
  assert.doesNotThrow(() => new Script(SYNTHETIC_JS));
  assert.doesNotMatch(SYNTHETIC_JS, /innerHTML|localStorage|sessionStorage|document\.cookie|setInterval|console\./);
  assert.match(SYNTHETIC_JS, /el\("run"\)\.onclick/); assert.match(SYNTHETIC_JS, /textContent=value/);
  assert.match(syntheticPage("1".repeat(64)), /SYNTHETIC DATA/); assert.throws(() => syntheticPage("<script>"));
});

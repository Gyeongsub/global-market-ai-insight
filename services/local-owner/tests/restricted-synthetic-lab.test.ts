import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { createRestrictedSyntheticRuntime } from "../src/restricted-synthetic-runtime.js";
import { startRestrictedSyntheticLab } from "../src/restricted-synthetic-lab.js";
import { startSyntheticAnalysisServer } from "../src/synthetic-server.js";

function fixture(remaining = 5000) {
  let closed = false, leaseCloses = 0, destroys = 0, attempts = 0;
  const credentials = { accessKeyId: "TEST_ONLY", secretAccessKey: "TEST_ONLY", sessionToken: "TEST_ONLY", expiration: new Date() };
  const lease = {
    getCredentials() { if (closed) throw Error("PRIVATE_SENTINEL"); return credentials; },
    close() { closed = true; leaseCloses++; credentials.accessKeyId = credentials.secretAccessKey = credentials.sessionToken = ""; },
    remainingMs() { return closed ? 0 : remaining; }, toJSON() { return { mode: "test-only" } as any; },
  };
  const runtime = () => createRestrictedSyntheticRuntime(lease, () => ({
    transport: { async converse() { attempts++; throw Error("PRIVATE_SENTINEL"); } }, destroy() { destroys++; },
  }));
  return { lease, runtime, credentials, counts: () => ({ leaseCloses, destroys, attempts, closed }) };
}

test("real loopback listener starts without inference and explicit close releases the restricted lease", async () => {
  const f = fixture();
  const app = await startRestrictedSyntheticLab(f.lease, { runtime: f.runtime, listen: session => startSyntheticAnalysisServer(session, 0) });
  try {
    assert.match(app.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(app.snapshot().listening, true); assert.equal(f.counts().attempts, 0);
    const first = app.close(); assert.equal(app.close(), first); await first; await app.finished;
    assert.equal(app.snapshot().listening, false); assert.equal(app.snapshot().capabilityRetained, false);
    assert.equal(app.snapshot().resultRetained, false); assert.equal(f.credentials.secretAccessKey, "");
    assert.equal(f.counts().destroys, 1); assert.equal(f.counts().closed, true);
  } finally { await app.close(); }
});

test("automatic expiry closes the real server and lease without an administrator or extra lifetime", async () => {
  const f = fixture(100);
  const app = await startRestrictedSyntheticLab(f.lease, { runtime: f.runtime, listen: session => startSyntheticAnalysisServer(session, 0) });
  try {
    await app.finished;
    assert.equal(app.snapshot().listening, false); assert.equal(f.counts().closed, true);
    assert.equal(f.counts().attempts, 0); assert.equal(f.counts().destroys, 1);
  } finally { await app.close(); }
});

test("construction and bind failures clear credentials and never return a usable listener", async () => {
  const a = fixture();
  await assert.rejects(startRestrictedSyntheticLab(a.lease, { runtime: () => { throw Error("PRIVATE_SENTINEL"); } }),
    { message: "SYNTHETIC_RESTRICTED_LAB_START_REJECTED" });
  assert.equal(a.counts().closed, true);
  const b = fixture();
  await assert.rejects(startRestrictedSyntheticLab(b.lease, { runtime: b.runtime, listen: async () => { throw Error("PRIVATE_SENTINEL"); } }),
    { message: "SYNTHETIC_RESTRICTED_LAB_START_REJECTED" });
  assert.equal(b.counts().closed, true); assert.equal(b.counts().destroys, 1);
});

test("server-close failure still destroys the client and clears credentials, without claiming success", async () => {
  const f = fixture(); let closeCalls = 0, finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const app = await startRestrictedSyntheticLab(f.lease, { runtime: f.runtime, listen: async () => ({
    origin: "http://127.0.0.1:4175", finished: done,
    close: async () => { closeCalls++; finish(); throw Error("PRIVATE_SENTINEL"); },
    snapshot: () => ({ listening: false, closed: true, requests: 0, capabilityRetained: false, modelAttempts: 0, resultRetained: false }),
  }) });
  await assert.rejects(app.close(), { message: "SYNTHETIC_RESTRICTED_LAB_CLOSE_UNVERIFIED" });
  await assert.rejects(app.finished, { message: "SYNTHETIC_RESTRICTED_LAB_CLOSE_UNVERIFIED" });
  assert.equal(closeCalls, 1); assert.equal(f.counts().destroys, 1); assert.equal(f.counts().closed, true);
});

test("unexpected public or credential-bearing origin is rejected and cleanup still runs", async () => {
  for (const origin of ["http://0.0.0.0:4175", "https://example.invalid/", "http://127.0.0.1:4175/?key=PRIVATE_SENTINEL"]) {
    const f = fixture(); let closed = false;
    await assert.rejects(startRestrictedSyntheticLab(f.lease, { runtime: f.runtime, listen: async () => ({
      origin, finished: Promise.resolve(), close: async () => { closed = true; },
      snapshot: () => ({ listening: false, closed, requests: 0, capabilityRetained: false, modelAttempts: 0, resultRetained: false }),
    }) }), { message: "SYNTHETIC_RESTRICTED_LAB_START_REJECTED" });
    assert.equal(closed, true); assert.equal(f.counts().closed, true); assert.equal(f.counts().attempts, 0);
  }
});

const navigation = { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
function localHttp(origin: string, path = "/", method = "GET", headers: Record<string, string> = navigation) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(origin + path, { method, headers, timeout: 2000 }, response => {
      let body = ""; response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body }));
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(Error("LOCAL_HTTP_TIMEOUT"))); req.end();
  });
}
const validAnalysis = () => ({ stopReason: "tool_use", usage: { inputTokens: 800, outputTokens: 100, totalTokens: 900 },
  output: { message: { content: [{ toolUse: { name: "select_grounded_insights", input: {
    observationIds: ["QUOTE_SNAPSHOT"], riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
    specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"], uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" } } }] } } });

test("restricted lease to real HTTP: explicit click once, refresh free, no key disclosure, browser close clears all", async () => {
  for (const locale of ["en", "ja", "ko"]) {
    const f = fixture(); let calls = 0, destroys = 0;
    const app = await startRestrictedSyntheticLab(f.lease, {
      runtime: lease => createRestrictedSyntheticRuntime(lease, credentials => ({
        transport: { async converse(input) {
          assert.equal(credentials(), f.credentials); calls++;
          assert.equal(input.inferenceConfig.maxTokens, 512);
          assert.match(JSON.stringify(input), /invented synthetic/);
          return validAnalysis();
        } }, destroy() { destroys++; },
      })),
      listen: session => startSyntheticAnalysisServer(session, 0),
    });
    try {
      const page = await localHttp(app.origin);
      assert.equal(page.status, 200); assert.equal(calls, 0);
      assert.doesNotMatch(page.body, /TEST_ONLY|secretAccessKey|sessionToken/);
      const capability = /name="lab-capability" content="([a-f0-9]{64})"/.exec(page.body)![1]!;
      const headers = { origin: app.origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty", "x-gmai-local-capability": capability, "content-length": "0" };
      assert.equal((await localHttp(app.origin, `/bridge/start/${locale}`, "POST", {
        ...headers, origin: "https://untrusted.invalid",
      })).status, 403);
      assert.equal(calls, 0);
      const first = JSON.parse((await localHttp(app.origin, `/bridge/start/${locale}`, "POST", headers)).body);
      assert.equal(first.state, "SUCCEEDED"); assert.equal(first.locale, locale);
      assert.equal(first.dataOrigin, "synthetic"); assert.equal(first.usage.totalTokens, 900);
      await localHttp(app.origin); await localHttp(app.origin, "/bridge/start/en", "POST", headers);
      const refreshed = await localHttp(app.origin, "/bridge/status", "POST", headers);
      assert.equal(JSON.parse(refreshed.body).locale, locale); assert.equal(calls, 1);
      assert.doesNotMatch(refreshed.body, /TEST_ONLY|secretAccessKey|sessionToken|accessKeyId/);
      assert.equal((await localHttp(app.origin, "/bridge/close", "POST", headers)).status, 200);
      await app.finished;
      assert.equal(app.snapshot().listening, false); assert.equal(app.snapshot().capabilityRetained, false);
      assert.equal(app.snapshot().resultRetained, false); assert.equal(f.credentials.secretAccessKey, "");
      assert.equal(f.counts().closed, true); assert.equal(destroys, 1);
    } finally { await app.close(); }
  }
});

test("restricted lease revoked before HTTP start yields one local failure and zero transport calls", async () => {
  const f = fixture(); let calls = 0;
  const app = await startRestrictedSyntheticLab(f.lease, {
    runtime: lease => createRestrictedSyntheticRuntime(lease, () => ({
      transport: { async converse() { calls++; return validAnalysis(); } }, destroy() {},
    })), listen: session => startSyntheticAnalysisServer(session, 0),
  });
  try {
    const page = await localHttp(app.origin);
    const capability = /name="lab-capability" content="([a-f0-9]{64})"/.exec(page.body)![1]!;
    const headers = { origin: app.origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty", "x-gmai-local-capability": capability, "content-length": "0" };
    f.lease.close();
    const response = await localHttp(app.origin, "/bridge/start/en", "POST", headers);
    assert.equal(JSON.parse(response.body).state, "FAILED");
    await localHttp(app.origin, "/bridge/start/ko", "POST", headers);
    assert.equal(calls, 0); assert.doesNotMatch(response.body, /PRIVATE_SENTINEL|TEST_ONLY/);
  } finally { await app.close(); }
  await app.finished;
  assert.equal(app.snapshot().listening, false); assert.equal(f.counts().closed, true);
});

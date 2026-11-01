import assert from "node:assert/strict";
import test from "node:test";
import { createRestrictedSyntheticRuntime } from "../src/restricted-synthetic-runtime.js";

function fixture(remaining = 5000) {
  let closed = false, checks = 0;
  const credentials = { accessKeyId: "TEST_ONLY", secretAccessKey: "TEST_ONLY", sessionToken: "TEST_ONLY", expiration: new Date() };
  return { lease: { getCredentials() { checks++; if (closed) throw Error("PRIVATE_SENTINEL"); return credentials; },
    close() { closed = true; credentials.accessKeyId = ""; credentials.secretAccessKey = ""; credentials.sessionToken = ""; },
    remainingMs() { return closed ? 0 : remaining; }, toJSON() { return { mode: "test-only" } as any; } },
    checks: () => checks, credentials, closed: () => closed };
}
const response = () => ({ stopReason: "tool_use", usage: { inputTokens: 800, outputTokens: 100, totalTokens: 900 },
  output: { message: { content: [{ toolUse: { name: "select_grounded_insights", input: {
    observationIds: ["QUOTE_SNAPSHOT"], riskIds: ["MARKET_PRICE_RISK", "QLD_LEVERAGED_DOWNSIDE", "QLD_PATH_DEPENDENCY"],
    specialConsiderationIds: ["DATA_PROVENANCE", "QLD_DAILY_RESET"], uncertaintyId: "SINGLE_QUOTE_NO_FORECAST" } } }] } } });

test("restricted composition preserves remaining window, explicit credentials and one model attempt", async () => {
  const f = fixture(); let calls = 0, destroyed = 0;
  const runtime = createRestrictedSyntheticRuntime(f.lease, credentials => ({ transport: { async converse() {
    assert.equal(credentials(), f.credentials); calls++; return response();
  } }, destroy() { destroyed++; } }));
  assert.equal(calls, 0); assert.ok(runtime.session.snapshot().remainingMs <= 5000);
  assert.equal((await runtime.session.start("en")).state, "SUCCEEDED");
  await runtime.session.start("ko"); assert.equal(calls, 1); assert.ok(f.checks() >= 2);
  runtime.close(); runtime.close(); assert.equal(destroyed, 1); assert.equal(f.closed(), true);
  assert.equal(f.credentials.secretAccessKey, ""); assert.equal(runtime.session.snapshot().result, undefined);
});

test("expired or failed construction closes credentials without creating an inference path", () => {
  const expired = fixture(0); let created = 0;
  assert.throws(() => createRestrictedSyntheticRuntime(expired.lease, () => { created++; throw Error(); }), { message: "SYNTHETIC_RESTRICTED_RUNTIME_REJECTED" });
  assert.equal(created, 0); assert.equal(expired.closed(), true);
  const f = fixture(); assert.throws(() => createRestrictedSyntheticRuntime(f.lease, () => { throw Error("PRIVATE_SENTINEL"); }), { message: "SYNTHETIC_RESTRICTED_RUNTIME_REJECTED" });
  assert.equal(f.closed(), true);
});

test("a cached SDK credential cannot authorize another call after the lease closes", async () => {
  const f = fixture(); let calls = 0;
  const runtime = createRestrictedSyntheticRuntime(f.lease, () => ({ transport: { async converse() { calls++; return response(); } }, destroy() {} }));
  f.lease.close(); assert.equal((await runtime.session.start("ja")).state, "FAILED"); assert.equal(calls, 0);
  runtime.close();
});

test("close attempts every cleanup and reports a sanitized unverified cleanup failure", () => {
  const f = fixture(); let destroyed = 0;
  const runtime = createRestrictedSyntheticRuntime(f.lease, () => ({ transport: { async converse() { return response(); } },
    destroy() { destroyed++; throw Error("PRIVATE_SENTINEL"); } }));
  assert.throws(() => runtime.close(), { message: "SYNTHETIC_RESTRICTED_CLOSE_UNVERIFIED" });
  assert.equal(f.closed(), true); assert.equal(destroyed, 1); assert.equal(runtime.session.snapshot().state, "CLOSED");
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSyntheticExpiryResponse, syntheticExpiryResponseFailureSummary } from "../src/synthetic-expiry-response.js";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const usage = { inputTokens: 800, outputTokens: 100, totalTokens: 900 };
test("native usage projection is pure and strips only known inactive cache metadata", () => {
  const raw = { usage: { ...usage, cacheReadInputTokens: 0, cacheWriteInputTokens: 0, cacheDetails: [] }, stopReason: "tool_use" };
  const before = JSON.stringify(raw);
  assert.deepEqual(normalizeSyntheticExpiryResponse(raw), { usage, stopReason: "tool_use" });
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(normalizeSyntheticExpiryResponse({ usage }).usage, usage);
});
test("normalizer rejects active or malformed known cache fields without exposing them", () => {
  for (const cache of [{ cacheReadInputTokens: 1 }, { cacheWriteInputTokens: 1 },
    { cacheReadInputTokens: "0" }, { cacheWriteInputTokens: false }, { cacheDetails: [{}] }, { cacheDetails: {} }]) {
    assert.throws(() => normalizeSyntheticExpiryResponse({ usage: { ...usage, ...cache } }), { message: "SYNTHETIC_EXPIRY_RESPONSE_UNVERIFIED" });
  }
  for (const raw of [null, {}, [], { usage: null }, { usage: [] }]) assert.throws(() => normalizeSyntheticExpiryResponse(raw));
});

test("optional null cache metadata matches pinned SDK deserialization without a network request", async () => {
  const raw = { usage: { ...usage, cacheReadInputTokens: null, cacheWriteInputTokens: null, cacheDetails: null } };
  let intercepted = 0;
  const client = new BedrockRuntimeClient({ region: "ap-northeast-1", maxAttempts: 1,
    credentials: { accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-only" },
    requestHandler: { async handle() { intercepted++; return { response: { statusCode: 200,
      headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(raw)) } }; }, destroy() {} } });
  try {
    const decoded = await client.send(new ConverseCommand({ modelId: "amazon.nova-lite-v1:0",
      messages: [{ role: "user", content: [{ text: "offline fixture" }] }] }));
    assert.equal(intercepted, 1);
    assert.deepEqual(decoded.usage, usage);
    assert.deepEqual(normalizeSyntheticExpiryResponse(raw).usage, decoded.usage);
    assert.deepEqual(normalizeSyntheticExpiryResponse({ usage: { ...raw.usage, unknown: null } }).usage, usage);
  } finally { client.destroy(); }
});

test("native usage projection agrees with the SDK when the service adds response metadata", async () => {
  const raw = { usage: { ...usage, futureMetadata: { marker: "PRIVATE_SENTINEL" }, futureCounter: 123 } };
  let intercepted = 0;
  const client = new BedrockRuntimeClient({ region: "ap-northeast-1", maxAttempts: 1,
    credentials: { accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "fixture-only" },
    requestHandler: { async handle() { intercepted++; return { response: { statusCode: 200,
      headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(raw)) } }; }, destroy() {} } });
  try {
    const decoded = await client.send(new ConverseCommand({ modelId: "amazon.nova-lite-v1:0",
      messages: [{ role: "user", content: [{ text: "offline fixture" }] }] }));
    assert.equal(intercepted, 1);
    assert.deepEqual(decoded.usage, usage);
    const normalized = normalizeSyntheticExpiryResponse(raw);
    assert.deepEqual(normalized.usage, decoded.usage);
    assert.doesNotMatch(JSON.stringify(normalized), /PRIVATE_SENTINEL|futureMetadata|futureCounter/);
  } finally { client.destroy(); }
});
test("normalizer never repairs missing or invalid domain counters", () => {
  for (const bad of [{}, { ...usage, inputTokens: "800" }, { ...usage, outputTokens: 9000 }, { ...usage, totalTokens: 1 }]) {
    const normalized = normalizeSyntheticExpiryResponse({ usage: bad });
    for (const field of ["inputTokens", "outputTokens", "totalTokens"] as const)
      assert.equal(normalized.usage[field], (bad as any)[field]);
  }
});

test("normalization failures report only own fixed categories", () => {
  for (const [raw, expected] of [
    [null, "RESPONSE_SHAPE"], [{}, "USAGE_SHAPE"],
    [{ usage: { ...usage, cacheReadInputTokens: 1 } }, "CACHE_READ_USAGE"],
    [{ usage: { ...usage, cacheWriteInputTokens: "PRIVATE_SENTINEL" } }, "CACHE_WRITE_USAGE"],
    [{ usage: { ...usage, cacheDetails: [{ PRIVATE_SENTINEL: true }] } }, "CACHE_DETAILS"],
  ] as const) {
    assert.throws(() => normalizeSyntheticExpiryResponse(raw), error => {
      assert.equal(syntheticExpiryResponseFailureSummary(error), expected);
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SENTINEL|do-not-log/);
      return true;
    });
  }
  assert.equal(syntheticExpiryResponseFailureSummary({ reason: "CACHE_DETAILS" }), null);
  assert.equal(syntheticExpiryResponseFailureSummary(Object.assign(Error("private"), { reason: "CACHE_DETAILS" })), null);
});

test("unmodeled metadata cannot repair required counters or hide known active caching", () => {
  for (const extra of [null, 0, 1, "PRIVATE_SENTINEL", { inputTokens: 800 }, [1]]) {
    const raw = { usage: { inputTokens: null, outputTokens: "bad", futureMetadata: extra } };
    const before = JSON.stringify(raw);
    assert.deepEqual(normalizeSyntheticExpiryResponse(raw).usage,
      { inputTokens: null, outputTokens: "bad", totalTokens: undefined });
    assert.equal(JSON.stringify(raw), before);
    assert.throws(() => normalizeSyntheticExpiryResponse({ usage: { ...usage, futureMetadata: extra, cacheReadInputTokens: 1 } }));
    assert.throws(() => normalizeSyntheticExpiryResponse({ usage: { ...usage, futureMetadata: extra, cacheWriteInputTokens: 1 } }));
    assert.throws(() => normalizeSyntheticExpiryResponse({ usage: { ...usage, futureMetadata: extra, cacheDetails: [{}] } }));
  }
});

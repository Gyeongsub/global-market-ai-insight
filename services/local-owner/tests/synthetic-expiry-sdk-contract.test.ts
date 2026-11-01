import assert from "node:assert/strict";
import test from "node:test";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { EXPIRY_ENDPOINT, syntheticExpiryRequestBody } from "../src/synthetic-expiry-transport.js";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "../src/synthetic-read-denial-transport.js";

test("native target and fixed payload agree with pinned SDK serialization without network access", async () => {
  let captured: any, calls = 0;
  const body = await syntheticExpiryRequestBody();
  const client = new BedrockRuntimeClient({ region: "ap-northeast-1",
    endpoint: "https://bedrock-runtime.ap-northeast-1.amazonaws.com", maxAttempts: 1,
    credentials: { accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "synthetic-test-only-token" },
    requestHandler: { async handle(request: any) { calls++; captured = request; throw Error("LOCAL_CAPTURE_ONLY"); }, destroy() {} } });
  try { await assert.rejects(client.send(new ConverseCommand({ modelId: "amazon.nova-lite-v1:0", ...JSON.parse(body) }))); }
  finally { client.destroy(); }
  assert.equal(calls, 1);
  assert.equal(captured.method, "POST");
  assert.equal(captured.protocol, "https:");
  assert.equal(captured.hostname, new URL(EXPIRY_ENDPOINT).hostname);
  assert.equal(captured.path, new URL(EXPIRY_ENDPOINT).pathname);
  const wireBody = typeof captured.body === "string" ? captured.body : new TextDecoder().decode(captured.body);
  assert.deepEqual(JSON.parse(wireBody), JSON.parse(body));
  assert.equal(Buffer.byteLength(wireBody), Buffer.byteLength(body));
  // Re-sign exactly the captured SDK wire request using our pinned signer/SHA
  // adapter and the SDK's actual signing time. No signing clock is changed live.
  const stamp = captured.headers["x-amz-date"];
  assert.match(stamp, /^\d{8}T\d{6}Z$/);
  const signingDate = new Date(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
  const headers = { ...captured.headers }; delete headers.authorization;
  const signer = new SignatureV4({ region: "ap-northeast-1", service: "bedrock", sha256: Sha256,
    credentials: { accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "synthetic-test-only-token" } });
  const signed = await signer.sign({ method: "POST", protocol: "https:", hostname: captured.hostname,
    path: captured.path, headers, body: wireBody }, { signingDate });
  assert.equal(signed.headers.authorization, captured.headers.authorization);
});

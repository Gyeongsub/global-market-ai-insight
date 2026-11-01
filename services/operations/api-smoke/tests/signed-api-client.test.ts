import assert from "node:assert/strict";
import test from "node:test";
import { AwsIamApiClient, runOnePriceAcceptance } from "../src/signed-api-client.js";

const credentials = async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example-secret", sessionToken: "example-token" });

test("signs only allowlisted Tokyo API requests without logging or persisting credentials", async () => {
  let authorization = "";
  const client = new AwsIamApiClient("https://abc123.execute-api.ap-northeast-1.amazonaws.com", credentials, async (_url, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  });
  await client.request("GET", "v1/health");
  assert.match(authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
  assert.match(authorization, /SignedHeaders=accept;host;x-amz-content-sha256;x-amz-date;x-amz-security-token/);
  await assert.rejects(() => client.request("GET", "admin/secrets"), /outside the acceptance allowlist/);
  assert.throws(() => new AwsIamApiClient("http://abc123.execute-api.ap-northeast-1.amazonaws.com", credentials), /Tokyo HTTPS/);
});

test("one acceptance launches once, bounds polling, and rejects any result exposure", async () => {
  let posts = 0;
  let reads = 0;
  const jobId = `job_${"a".repeat(48)}`;
  const client = { async request(method: "GET" | "POST", path: string) {
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    if (method === "POST") { posts += 1; return { jobId, status: "QUEUED" }; }
    reads += 1;
    return { jobId, status: reads === 2 ? "SUCCEEDED" : "RUNNING" };
  } };
  const outcome = await runOnePriceAcceptance(client, { symbol: "QLD", locale: "ko", sleep: async () => {} });
  assert.deepEqual(outcome, { jobId, status: "SUCCEEDED", apiCalls: 4 });
  assert.equal(posts, 1);

  const leaking = { async request(method: "GET" | "POST", path: string) {
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    if (method === "POST") return { jobId };
    return { jobId, status: "SUCCEEDED", result: { price: 1 } };
  } };
  await assert.rejects(() => runOnePriceAcceptance(leaking, { symbol: "QLD", locale: "ko", sleep: async () => {} }), /RESULT_EXPOSURE_GATE_FAILED/);
});

test("an unready gate performs no POST and status polling is capped", async () => {
  let calls = 0;
  const unready = { async request() { calls += 1; return { circuit: "OPEN", jobCreationEnabled: true }; } };
  await assert.rejects(() => runOnePriceAcceptance(unready), /ACCEPTANCE_GATE_NOT_READY/);
  assert.equal(calls, 1);

  const jobId = `job_${"b".repeat(48)}`;
  const pending = { async request(method: "GET" | "POST", path: string) {
    if (path === "v1/health") return { circuit: "CLOSED", jobCreationEnabled: true };
    if (method === "POST") return { jobId };
    return { jobId, status: "RUNNING" };
  } };
  await assert.rejects(() => runOnePriceAcceptance(pending, { symbol: "QLD", locale: "ko", sleep: async () => {}, maxStatusReads: 2 }), /BOUNDED_POLL_TIMEOUT/);
});

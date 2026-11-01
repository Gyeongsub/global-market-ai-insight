import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { AwsIamApiClient } from "../src/signed-api-client.js";

const endpoint = "https://abc123.execute-api.ap-northeast-1.amazonaws.com";
const credentials = async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example-secret", sessionToken: "example-token" });
const body = { operation: "PRICE", symbol: "QLD", locale: "en" };
const headers = { "idempotency-key": "00000000-0000-4000-8000-000000000000" };

test("a pre-closed owner session cannot resolve credentials or dispatch and leaves no parent listener", async () => {
  const parent = new AbortController(); parent.abort(Error("PRIVATE_SENTINEL"));
  let signing = 0, fetches = 0;
  const client = new AwsIamApiClient(endpoint, async () => { signing++; return credentials(); }, async () => { fetches++; return new Response("{}"); });
  await assert.rejects(client.request("POST", "v1/jobs", body, headers, parent.signal), /^Error: API request timed out\.$/);
  assert.equal(signing, 0); assert.equal(fetches, 0); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("owner cancellation while signing suppresses a late POST without exposing its reason", async () => {
  const parent = new AbortController(); let resume!: () => void, fetches = 0;
  const delayed = new Promise<void>(resolve => { resume = resolve; });
  const client = new AwsIamApiClient(endpoint, async () => { await delayed; return credentials(); }, async () => { fetches++; return new Response("{}", { status: 202 }); });
  const pending = client.request("POST", "v1/jobs", body, headers, parent.signal);
  const rejected = assert.rejects(pending, /^Error: API request timed out\.$/);
  await new Promise(resolve => setImmediate(resolve)); parent.abort(Error("PRIVATE_SENTINEL")); await rejected;
  resume(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches, 0); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("cancelled uncooperative fetch is bounded and its late body is discarded", async () => {
  const parent = new AbortController(); let complete!: (value: Response) => void, cancelled = 0, fetches = 0;
  const client = new AwsIamApiClient(endpoint, credentials, async () => { fetches++; return new Promise(resolve => { complete = resolve; }); });
  const pending = client.request("GET", "v1/health", undefined, {}, parent.signal);
  const rejected = assert.rejects(pending, /API request timed out/);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(fetches, 1);
  parent.abort(); await rejected;
  complete(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, 1); assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("GET requires HTTP 200 and POST HTTP 202, even if another success status has plausible JSON", async () => {
  for (const [method, statuses] of [["GET", [201, 202, 206]], ["POST", [200, 201, 206]]] as const) {
    for (const status of statuses) {
      const client = new AwsIamApiClient(endpoint, credentials, async () => new Response("{}", { status }));
      await assert.rejects(client.request(method, method === "GET" ? "v1/health" : "v1/jobs",
        method === "GET" ? undefined : body, method === "GET" ? {} : headers), /status is outside/);
    }
  }
  const parent = new AbortController();
  const client = new AwsIamApiClient(endpoint, credentials, async (_url, init) => new Response("{}", { status: init?.method === "POST" ? 202 : 200 }));
  assert.deepEqual(await client.request("POST", "v1/jobs", body, headers, parent.signal), {});
  assert.deepEqual(await client.request("GET", "v1/health", undefined, {}, parent.signal), {});
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ApiResponseError, AwsIamApiClient, runOneCircuitDenial } from "../src/signed-api-client.js";
import { ControllerService } from "../../../controller/src/controller-service.js";
import { createHandler } from "../../../controller/src/http-handler.js";
import { createQueuedJob } from "../../../controller/src/job.js";

const endpoint = "https://abc123.execute-api.ap-northeast-1.amazonaws.com";
const credentials = async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example-secret", sessionToken: "example-token" });
const health = { status: "ok", circuit: "OPEN", jobCreationEnabled: true };

test("one strict circuit denial reports only HTTP evidence, never zero tasks or completed restoration", async () => {
  let calls = 0;
  const client = new AwsIamApiClient(endpoint, credentials, async (url, init) => {
    calls++;
    if (new URL(url).pathname === "/v1/health") return new Response(JSON.stringify(health));
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { operation: "PRICE", symbol: "QLD", locale: "ko" });
    return new Response(JSON.stringify({ error: { code: "CIRCUIT_OPEN", message: "SYNTHETIC_PRIVATE_SENTINEL", requestId: "private-sentinel" } }), { status: 503 });
  });
  assert.deepEqual(await runOneCircuitDenial(client), { apiCalls: 2, denialResponseVerified: true,
    taskCountIndependentlyVerified: false, slotCountIndependentlyVerified: false, internalExecutionRestored: false });
  assert.equal(calls, 2);
});

test("disabled jobs, stale CLOSED, missing or private health fields never submit a denial request", async () => {
  for (const invalid of [{ ...health, jobCreationEnabled: false }, { ...health, circuit: "CLOSED" },
    { ...health, status: "unknown" }, { circuit: "OPEN", jobCreationEnabled: true }, { ...health, taskArn: "private" }]) {
    let calls = 0;
    await assert.rejects(runOneCircuitDenial({ async request() { calls++; return invalid; } }), /GATE_NOT_READY/);
    assert.equal(calls, 1);
  }
});

test("ambiguous, unrelated or unexpected accepted requests never retry or query a guessed job", async () => {
  for (const outcome of [new Error("API_503_CIRCUIT_OPEN PRIVATE_SENTINEL"), new ApiResponseError(403, "CIRCUIT_OPEN"),
    new ApiResponseError(503, "DATA_UNAVAILABLE"), new ApiResponseError(500, "INTERNAL_ERROR"), { jobId: "private" }]) {
    let calls = 0;
    const client = { async request() { calls++; if (calls === 1) return health; if (outcome instanceof Error) throw outcome; return outcome; } };
    await assert.rejects(runOneCircuitDenial(client), error => error instanceof Error &&
      /^CIRCUIT_DENIAL_(RESPONSE_UNVERIFIED|UNEXPECTED_ACCEPTANCE)$/.test(error.message) && !error.message.includes("PRIVATE"));
    assert.equal(calls, 2);
  }
});

test("only canonical default-stage Tokyo endpoints can receive signed credentials", () => {
  for (const invalid of ["PRIVATE_SENTINEL", endpoint + "/stage", endpoint + "/v1/../", endpoint + "/?private=1",
    endpoint + "#private", endpoint.replace("abc123", "another.abc123"), endpoint.replace("abc123", "abc-123"),
    endpoint.replace("ap-northeast-1", "us-east-1"), endpoint.replace("https://", "https://private@"),
    endpoint.replace("https://", "http://"), endpoint + ":443", endpoint.replace("https://", "HTTPS://"),
    endpoint.replace("abc123", "ABC123")]) {
    assert.throws(() => new AwsIamApiClient(invalid, credentials), error => error instanceof Error &&
      error.message.includes("Tokyo HTTPS") && !error.message.includes("PRIVATE_SENTINEL"));
  }
  assert.doesNotThrow(() => new AwsIamApiClient(endpoint + "/", credentials));
});

test("method, job payload and idempotency-header expansion fail before credentials or network", async () => {
  let signing = 0, network = 0;
  const client = new AwsIamApiClient(endpoint, async () => { signing++; return credentials(); }, async () => { network++; return new Response("{}"); });
  const body = { operation: "PRICE", symbol: "QLD", locale: "ko" };
  const key = { "idempotency-key": "11111111-1111-4111-8111-111111111111" };
  const cases: any[] = [["POST", "v1/health", body, key], ["GET", "v1/jobs"], ["GET", "v1/health", body],
    ["GET", "v1/assets", undefined, key], ["POST", "v1/jobs", body, {}], ["POST", "v1/jobs", { ...body, token: "private" }, key],
    ["POST", "v1/jobs", { ...body, symbol: "SPY" }, key], ["POST", "v1/jobs", { ...body, locale: "fr" }, key],
    ["POST", "v1/jobs", { ...body, operation: { toString: () => "PRICE" } }, key],
    ["POST", "v1/jobs", body, { "Idempotency-Key": key["idempotency-key"] }],
    ["POST", "v1/jobs", body, { ...key, authorization: "private" }],
    ["POST", "v1/jobs", body, { "idempotency-key": "-".repeat(36) }], ["DELETE", "v1/health"]];
  for (const [method, path, payload, headers] of cases) await assert.rejects(client.request(method, path, payload, headers), /allowlist/);
  assert.equal(signing, 0); assert.equal(network, 0);
});

test("oversized declared/streamed bodies are cancelled rather than accumulated without a cap", async () => {
  for (const declared of ["65537", "PRIVATE_SENTINEL", "-1"]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const client = new AwsIamApiClient(endpoint, credentials, async () => new Response(stream, { headers: { "content-length": declared } }));
    await assert.rejects(client.request("GET", "v1/health"), /bounded size/);
    assert.equal(cancelled, true);
  }
  let cancelled = false, reads = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(32768)); }, cancel() { cancelled = true; } });
  const client = new AwsIamApiClient(endpoint, credentials, async () => new Response(stream));
  await assert.rejects(client.request("GET", "v1/health"), /bounded size/);
  assert.equal(cancelled, true); assert.ok(reads <= 4);
});

test("invalid UTF-8, malformed JSON, arrays and redirected responses never establish acceptance", async () => {
  const redirected = new Response("{}"); Object.defineProperty(redirected, "url", { value: "https://private.example/" });
  for (const response of [new Response(new Uint8Array([0xff])), new Response("{PRIVATE_SENTINEL"), new Response("[]"), redirected]) {
    const client = new AwsIamApiClient(endpoint, credentials, async () => response);
    await assert.rejects(client.request("GET", "v1/health"), error => error instanceof Error &&
      /invalid JSON|invalid object|destination changed/.test(error.message) && !error.message.includes("PRIVATE"));
  }
});

test("remote messages, unknown codes and expanded error payloads are not reflected into diagnostics", async () => {
  for (const payload of [{ error: { code: "CIRCUIT_OPEN", message: "PRIVATE_SENTINEL" }, jobId: "private" },
    { error: { code: "CIRCUIT_OPEN", taskArn: "private" } }, { error: { code: "PRIVATE_SENTINEL" } },
    { error: "PRIVATE_SENTINEL" }, { error: [{ code: "CIRCUIT_OPEN" }] }]) {
    const client = new AwsIamApiClient(endpoint, credentials, async () => new Response(JSON.stringify(payload), { status: 503 }));
    await assert.rejects(client.request("GET", "v1/health"), error => error instanceof Error &&
      error.message === "API error response is outside the public contract.");
  }
  const client = new AwsIamApiClient(endpoint, credentials, async () => new Response(JSON.stringify({ error: { code: "CIRCUIT_OPEN", message: "PRIVATE_SENTINEL" } }), { status: 503 }));
  await assert.rejects(client.request("GET", "v1/health"), error => error instanceof ApiResponseError &&
    error.httpStatus === 503 && error.publicCode === "CIRCUIT_OPEN" && !JSON.stringify(error).includes("PRIVATE"));
});

test("real local HTTP/controller composition rejects OPEN before persistence/launch while existing status remains readable", async () => {
  const now = new Date("2026-10-04T00:00:00Z");
  const jobId = `job_${"d".repeat(48)}`;
  const job = createQueuedJob({ request: { operation: "PRICE", symbol: "QLD", locale: "ko" },
    idempotencyKey: "11111111-1111-4111-8111-111111111111", jobId, now, timeoutSeconds: 90, ttlSeconds: 86400 });
  const counts = { create: 0, attach: 0, failureWrite: 0, launches: 0, get: 0, requests: 0 };
  const handler = createHandler(new ControllerService({
    async create() { counts.create++; return { job, created: true }; },
    async get() { counts.get++; return { ...job, taskArn: "PRIVATE_TASK_SENTINEL", result: "PRIVATE_PROVIDER_SENTINEL" }; },
    async attachTaskArn() { counts.attach++; }, async markLaunchFailed() { counts.failureWrite++; return job; },
  }, { async launch() { counts.launches++; throw new Error("A denied job must never reach launch."); } },
  { state: async () => "OPEN" }, { jobCreationEnabled: true, liveResultDisplayEnabled: false,
    admissionWindow: { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300_000 } }, { write() {} }, () => now));
  const client = new AwsIamApiClient(endpoint, credentials, async (url, init) => {
    counts.requests++;
    const path = new URL(url).pathname;
    const statusRead = path === `/v1/jobs/${jobId}`;
    const response = await handler({ routeKey: `${init?.method} ${statusRead ? "/v1/jobs/{jobId}" : path}`,
      headers: Object.fromEntries(new Headers(init?.headers)), body: typeof init?.body === "string" ? init.body : null,
      ...(statusRead ? { pathParameters: { jobId } } : {}), requestContext: { requestId: "local-denial-proof" } });
    return new Response(response.body, { status: response.statusCode, headers: response.headers });
  });
  const result = await runOneCircuitDenial(client);
  assert.equal(result.denialResponseVerified, true);
  const existing = await client.request("GET", `v1/jobs/${jobId}`);
  assert.equal(existing.jobId, jobId);
  assert.equal(existing.status, "QUEUED");
  assert.doesNotMatch(JSON.stringify(existing), /PRIVATE_|taskArn|result|requestHash|idempotencyKeyHash/);
  assert.deepEqual(counts, { create: 0, attach: 0, failureWrite: 0, launches: 0, get: 1, requests: 3 });
  // These are local spy counts, not a live ECS/DynamoDB inventory.
  assert.equal(result.taskCountIndependentlyVerified, false);
});

test("credential and network failures expose neither private errors nor their causes", async () => {
  const failingCredentials = new AwsIamApiClient(endpoint, async () => { throw new Error("PRIVATE_CREDENTIAL_SENTINEL"); });
  const failingNetwork = new AwsIamApiClient(endpoint, credentials, async () => { throw new Error("PRIVATE_NETWORK_SENTINEL"); });
  for (const client of [failingCredentials, failingNetwork]) await assert.rejects(client.request("GET", "v1/health"), error =>
    error instanceof Error && error.message === "SIGNED_API_TRANSPORT_UNVERIFIED" && !("cause" in error));
  await assert.rejects(runOneCircuitDenial({ async request() { throw new Error("PRIVATE_HEALTH_SENTINEL"); } }), /HEALTH_UNVERIFIED/);
});

test("one deadline bounds signing and prevents a late credential resolution from sending a POST", async () => {
  let resume!: () => void, requests = 0;
  const delayed = new Promise<void>(resolve => { resume = resolve; });
  const client = new AwsIamApiClient(endpoint, async () => { await delayed; return credentials(); },
    async () => { requests++; return new Response("{}"); }, 10);
  await assert.rejects(client.request("POST", "v1/jobs", { operation: "PRICE", symbol: "QLD", locale: "ko" },
    { "idempotency-key": "11111111-1111-4111-8111-111111111111" }), /timed out/);
  resume();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requests, 0);
  for (const limit of [0, -1, 10001, NaN, Infinity, 1.5]) assert.throws(() => new AwsIamApiClient(endpoint, credentials, fetch, limit), /ten seconds/);
});

test("the same request deadline aborts stalled response reads without retrying", async () => {
  let cancelled = false, requests = 0;
  const client = new AwsIamApiClient(endpoint, credentials, async () => {
    requests++;
    return new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }));
  }, 20);
  await assert.rejects(client.request("GET", "v1/health"), /timed out/);
  assert.equal(cancelled, true); assert.equal(requests, 1);
});

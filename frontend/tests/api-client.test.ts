import assert from "node:assert/strict";
import test from "node:test";
import { MarketApiClient, MarketApiError } from "../src/api/jobs.js";

const jobId = "job_0123456789abcdef0123456789abcdef0123456789abcdef";
const accepted = { jobId, status: "QUEUED", statusUrl: `/v1/jobs/${jobId}`, expiresAt: "2026-09-06T00:00:00.000Z" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const completed = () => ({ jobId, operation: "PRICE", symbol: "QLD", locale: "ko", status: "SUCCEEDED",
  createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:01.000Z",
  expiresAt: "2026-09-06T00:00:00.000Z", schemaVersion: "1.0.0", result: {
    kind: "PRICE", symbol: "QLD", price: 1, currency: "USD", marketTimestamp: "2026-09-05T00:00:00.000Z",
    retrievedAt: "2026-09-05T00:00:01.000Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "test-fixture" } });

test("malformed request fields and private extras are rejected before any network transmission", async () => {
  let calls = 0;
  const client = new MarketApiClient("https://api.example.test", async () => { calls++; return json(accepted, 202); });
  for (const request of [null, [], { operation: "PRICE", symbol: "OTHER", locale: "ko" }, { operation: "PRICE", symbol: "QLD", locale: "xx" },
    { operation: "OTHER", symbol: "QLD", locale: "ko" }, { operation: "PRICE", symbol: "QLD", locale: "ko", key: "PRIVATE_SENTINEL" }])
    await assert.rejects(client.createJob(request as unknown as Parameters<MarketApiClient["createJob"]>[0]),
      e => e instanceof MarketApiError && e.code === "VALIDATION_ERROR" && !e.message.includes("PRIVATE_SENTINEL"));
  for (const id of ["", "PRIVATE_SENTINEL", "018f1c2a-b3d4-7e5f-8a90-123456789abc\r\nOther: secret"])
    await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }, id), e => e instanceof MarketApiError && e.code === "VALIDATION_ERROR");
  assert.equal(calls, 0);
});

test("media/length/encoding failures cancel reads and never disclose invalid response contents", async () => {
  const valid = new TextEncoder().encode(JSON.stringify(accepted));
  for (const body of [new Uint8Array([0xff]), new Uint8Array([0xef, 0xbb, 0xbf, ...valid])]) {
    const client = new MarketApiClient("https://api.example.test", async () => new Response(body, { status: 202, headers: { "content-type": "application/json" } }));
    await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE");
  }
  for (const headers of [{ "content-type": "text/html" }, { "content-type": "application/json", "content-length": "65537" },
    { "content-type": "application/json", "content-length": "bad" }, { "content-type": "application/json", "content-length": "-1" }]) {
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(valid); }, cancel() { cancelled++; } });
    const client = new MarketApiClient("https://api.example.test", async () => new Response(stream, { status: 202, headers }));
    await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE");
    assert.equal(cancelled, 1);
  }
});

test("successful HTTP status, exact accepted shape and canonical UTC are checked", async () => {
  for (const [payload, status] of [[accepted, 200], [{ ...accepted, expiresAt: "2026-02-30T00:00:00.000Z" }, 202],
    [{ ...accepted, statusUrl: "https://invalid.example/PRIVATE_SENTINEL" }, 202], [{ ...accepted, status: "OTHER" }, 202]] as const) {
    const client = new MarketApiClient("https://api.example.test", async () => json(payload, status));
    await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE");
  }
});

test("job identity, terminal invariants and the shared result schema are validated before returning data", async () => {
  const good = completed();
  for (const payload of [{ ...good, jobId: "job_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    { ...good, result: { kind: "PRICE" } }, { ...good, result: { ...good.result, symbol: "TSLA" } },
    { ...good, result: { ...good.result, privateField: "PRIVATE_SENTINEL" } },
    { ...good, result: { ...good.result, source: "\u3000\t " } },
    { ...good, status: "RUNNING" }, { ...good, privateField: "PRIVATE_SENTINEL" },
    { ...good, status: "FAILED", result: undefined }, { ...good, errorCode: "MODEL_ERROR", errorMessage: "private" },
    { ...good, createdAt: "2026-02-30T00:00:00.000Z" }]) {
    const client = new MarketApiClient("https://api.example.test", async () => json(payload));
    await assert.rejects(client.getJob(jobId), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE" && !e.message.includes("PRIVATE_SENTINEL"));
  }
  const redacted = await new MarketApiClient("https://api.example.test", async () => json({ ...good, result: undefined })).getJob(jobId);
  assert.equal(redacted.status, "SUCCEEDED"); assert.equal(redacted.result, undefined);
});

test("known error codes retain their meaning but never select remote prose; unknown envelopes fail closed", async () => {
  const privateError = { error: { code: "CIRCUIT_OPEN", message: "PRIVATE_SENTINEL", requestId: "request-1" } };
  const client = new MarketApiClient("https://api.example.test", async () => json(privateError, 503));
  await assert.rejects(client.getJob(jobId), e => e instanceof MarketApiError && e.code === "CIRCUIT_OPEN" && e.status === 503 && !e.message.includes("PRIVATE_SENTINEL"));
  for (const payload of [{ ...privateError, privateField: "PRIVATE_SENTINEL" },
    { error: { ...privateError.error, code: "PRIVATE_SENTINEL" } }, { error: { ...privateError.error, message: "x".repeat(301) } },
    { error: { code: "CIRCUIT_OPEN", message: "PRIVATE_SENTINEL" } }]) {
    const invalid = new MarketApiClient("https://api.example.test", async () => json(payload, 503));
    await assert.rejects(invalid.getJob(jobId), e => e instanceof MarketApiError && e.code === "API_ERROR" && !e.message.includes("PRIVATE_SENTINEL"));
  }
  const failed = { ...completed(), result: undefined, status: "FAILED", errorCode: "MODEL_ERROR", errorMessage: "PRIVATE_SENTINEL" };
  const safe = await new MarketApiClient("https://api.example.test", async () => json(failed)).getJob(jobId);
  assert.equal(safe.errorCode, "MODEL_ERROR"); assert.doesNotMatch(safe.errorMessage!, /PRIVATE_SENTINEL/);
});

test("aborting while a response stream is pending cancels the stream and settles polling", async () => {
  let ready: (() => void) | undefined, cancelled = 0;
  const started = new Promise<void>(r => { ready = r; }), abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ pull() { ready?.(); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const client = new MarketApiClient("https://api.example.test", async () => new Response(stream, { headers: { "content-type": "application/json" } }));
  const pending = client.pollJob({ ...accepted, status: "QUEUED" }, { signal: abort.signal });
  await started; abort.abort();
  await assert.rejects(pending, e => e instanceof DOMException && e.name === "AbortError"); assert.equal(cancelled, 1);
});

test("finite zero-byte chunk flooding is rejected without waiting for the outer deadline", async () => {
  let reads = 0, cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { if (++reads <= 5000) c.enqueue(new Uint8Array()); else c.close(); }, cancel() { cancelled++; } });
  const client = new MarketApiClient("https://api.example.test", async () => new Response(stream, { headers: { "content-type": "application/json" } }));
  await assert.rejects(client.getJob(jobId), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE");
  assert.equal(cancelled, 1); assert.ok(reads <= 4099);
});

test("oversized streamed replies are cancelled before the full body is collected", async () => {
  let cancelled = 0, pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++;
    if (pulls === 1) controller.enqueue(new Uint8Array(65537));
    else if (pulls === 2) controller.enqueue(new Uint8Array(16)); else controller.close(); },
    cancel() { cancelled++; } });
  const client = new MarketApiClient("https://api.example.test", async () => new Response(stream, { headers: { "content-type": "application/json" } }));
  await assert.rejects(client.getJob(jobId), e => e instanceof MarketApiError && e.code === "INVALID_RESPONSE");
  assert.equal(cancelled, 1);
});

test("unknown transport errors are sanitized rather than returning private remote details", async () => {
  const client = new MarketApiClient("https://api.example.test", async () => { throw new Error("PRIVATE_SENTINEL"); });
  await assert.rejects(client.getJob(jobId), error => error instanceof MarketApiError && error.code === "API_ERROR" &&
    !error.message.includes("PRIVATE_SENTINEL"));
});

test("duplicate accepted identifiers and unexpected fields cannot be normalized into an accepted job", async () => {
  for (const raw of ['{"jobId":"PRIVATE_SENTINEL",' + JSON.stringify(accepted).slice(1),
    JSON.stringify({ ...accepted, taskArn: "PRIVATE_SENTINEL" })]) {
    const client = new MarketApiClient("https://api.example.test", async () => new Response(raw, { status: 202, headers: { "content-type": "application/json" } }));
    await assert.rejects(client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }),
      error => error instanceof MarketApiError && error.code === "INVALID_RESPONSE" && !error.message.includes("PRIVATE_SENTINEL"));
  }
});

test("omits browser credentials and sends only the UUID idempotency header", async () => {
  let captured: RequestInit | undefined;
  const client = new MarketApiClient("https://api.example.test/", async (_url, init) => {
    captured = init;
    return new Response(JSON.stringify(accepted), { status: 202, headers: { "content-type": "application/json" } });
  });
  const result = await client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }, "018f1c2a-b3d4-7e5f-8a90-123456789abc");
  assert.equal(result.jobId, jobId);
  assert.equal(captured?.credentials, "omit");
  assert.equal(captured?.referrerPolicy, "no-referrer");
  assert.deepEqual(captured?.headers, { "content-type": "application/json", "idempotency-key": "018f1c2a-b3d4-7e5f-8a90-123456789abc" });
  assert.equal(JSON.stringify(captured).includes("authorization"), false);
});

test("rejects insecure non-local API URLs and URL-embedded credentials", () => {
  assert.throws(() => new MarketApiClient("http://example.test"), /HTTPS/);
  assert.throws(() => new MarketApiClient("https://user:password@example.test"), /credentials/);
  assert.doesNotThrow(() => new MarketApiClient("http://127.0.0.1:4173"));
});

test("maps a bounded public error without reflecting unknown response content", async () => {
  const client = new MarketApiClient("https://api.example.test", async () => new Response(JSON.stringify({ error: { code: "DATA_UNAVAILABLE", message: "Provider-backed jobs are unavailable.", requestId: "request-1" } }), { status: 503, headers: { "content-type": "application/json" } }));
  await assert.rejects(() => client.createJob({ operation: "PRICE", symbol: "QLD", locale: "ko" }), (error: unknown) => {
    assert.ok(error instanceof MarketApiError);
    assert.equal(error.code, "DATA_UNAVAILABLE");
    assert.equal(error.status, 503);
    return true;
  });
});

test("validates public jobs and rejects internal-field-only payloads", async () => {
  const client = new MarketApiClient("https://api.example.test", async () => new Response(JSON.stringify({
    jobId, operation: "PRICE", symbol: "QLD", locale: "ko", status: "SUCCEEDED",
    createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:01.000Z",
    expiresAt: "2026-09-06T00:00:00.000Z", schemaVersion: "1.0.0", result: {
      kind: "PRICE", symbol: "QLD", price: 1, currency: "USD", marketTimestamp: "2026-09-05T00:00:00.000Z",
      retrievedAt: "2026-09-05T00:00:01.000Z", marketState: "CLOSED", freshness: "LATEST_AVAILABLE", source: "test-fixture",
    },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const result = await client.getJob(jobId);
  assert.equal(result.status, "SUCCEEDED");

  const invalid = new MarketApiClient("https://api.example.test", async () => new Response(JSON.stringify({
    jobId, operation: "PRICE", symbol: "QLD", locale: "ko", status: "SUCCEEDED",
    createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:01.000Z",
    expiresAt: "2026-09-06T00:00:00.000Z", schemaVersion: "1.0.0",
    taskArn: "arn:aws:ecs:ap-northeast-1:000000000000:task/private",
  }), { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(() => invalid.getJob(jobId), (error: unknown) => error instanceof MarketApiError && error.code === "INVALID_RESPONSE");
});

test("polling abort reaches an in-flight network request", async () => {
  const abort = new AbortController();
  let started: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const client = new MarketApiClient("https://api.example.test", async (_url, init) => {
    started?.();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  });
  const pending = client.pollJob({ ...accepted, status: "QUEUED" }, { signal: abort.signal });
  await ready;
  abort.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("polling deadline cancels a request that never returns", async () => {
  let cancelled = false;
  const client = new MarketApiClient("https://api.example.test", async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => { cancelled = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  }));
  await assert.rejects(client.pollJob({ ...accepted, status: "QUEUED" }, { maxDurationMs: 1_000 }), (error: unknown) => error instanceof MarketApiError && error.code === "POLL_TIMEOUT");
  assert.equal(cancelled, true);
});

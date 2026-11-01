import assert from "node:assert/strict";
import test from "node:test";
import { ControllerService, type ControllerJobRepository, type TaskLauncher } from "../src/controller-service.js";
import { PublicError } from "../src/contracts.js";
import { createQueuedJob } from "../src/job.js";
import { createHandler, publicErrorLogFields } from "../src/http-handler.js";

const request = { operation: "PRICE", symbol: "QLD", locale: "ko" } as const;
const idempotencyKey = "018f1c2a-b3d4-7e5f-8a90-123456789abc";
const now = new Date("2026-09-05T00:00:00.000Z");
const admissionWindow = { startsAtMs: now.getTime(), expiresAtMs: now.getTime() + 300_000 };
const job = createQueuedJob({ request, idempotencyKey, jobId: "job_0123456789abcdef0123456789abcdef0123456789abcdef", now, timeoutSeconds: 90, ttlSeconds: 86_400 });

function handler() {
  const repository: ControllerJobRepository = {
    async create() { return { job, created: false }; },
    async get() { return { ...job, taskArn: "arn:private" }; },
    async attachTaskArn() {}, async markLaunchFailed() { return job; },
  };
  const tasks: TaskLauncher = { async launch() { throw new Error("must not launch on replay"); } };
  return createHandler(new ControllerService(
    repository,
    tasks,
    { state: async () => "CLOSED" },
    { jobCreationEnabled: true, liveResultDisplayEnabled: true, admissionWindow },
    { write() {} },
    () => now,
  ));
}

test("serves the catalog and health without launching work", async () => {
  const run = handler();
  const assets = await run({ routeKey: "GET /v1/assets", requestContext: { requestId: "request-1" } });
  assert.equal(assets.statusCode, 200);
  assert.equal((JSON.parse(assets.body) as { assets: unknown[] }).assets.length, 5);
  const health = await run({ routeKey: "GET /v1/health", requestContext: { requestId: "request-2" } });
  assert.deepEqual(JSON.parse(health.body), { status: "ok", circuit: "CLOSED", jobCreationEnabled: true });
});

test("returns 202 for a valid request and never reflects internal fields", async () => {
  const result = await handler()({
    routeKey: "POST /v1/jobs", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(request), requestContext: { requestId: "request-3" },
  });
  assert.equal(result.statusCode, 202);
  assert.doesNotMatch(result.body, /idempotencyKeyHash|requestHash|taskArn|arn:private/);
});

test("returns a stable error envelope for malformed JSON", async () => {
  const result = await handler()({
    routeKey: "POST /v1/jobs", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: "{", requestContext: { requestId: "request-4" },
  });
  assert.equal(result.statusCode, 400);
  assert.deepEqual(JSON.parse(result.body), { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON.", requestId: "request-4" } });
});

test("public rejection logs contain only stable correlation fields", () => {
  const privateMessage = "private request body and credential marker";
  const fields = publicErrorLogFields(new PublicError("VALIDATION_ERROR", privateMessage, 400), "request-4");
  assert.deepEqual(fields, {
    level: "warn",
    service: "controller",
    code: "REQUEST_REJECTED",
    publicCode: "VALIDATION_ERROR",
    requestId: "request-4",
    httpStatus: 400,
  });
  assert.doesNotMatch(JSON.stringify(fields), /private request body|credential marker/);
  const unsafe = publicErrorLogFields(new PublicError("VALIDATION_ERROR", privateMessage, 400), "unsafe\nprivate-marker");
  assert.equal(unsafe.requestId, "unknown");
  assert.doesNotMatch(JSON.stringify(unsafe), /private-marker/);
});

test("accepts canonical base64 JSON and rejects malformed or non-UTF8 bytes", async () => {
  const run = handler();
  const headers = { "content-type": "application/json", "idempotency-key": idempotencyKey };
  const encoded = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  const accepted = await run({ routeKey: "POST /v1/jobs", headers, body: encoded, isBase64Encoded: true });
  assert.equal(accepted.statusCode, 202);
  for (const body of [encoded + " ", encoded.slice(0, -1), Buffer.from([0xff]).toString("base64"), "A/=="]) {
    const rejected = await run({ routeKey: "POST /v1/jobs", headers, body, isBase64Encoded: true });
    assert.equal(rejected.statusCode, 400);
    assert.equal((JSON.parse(rejected.body) as { error: { code: string } }).error.code, "VALIDATION_ERROR");
  }
});

test("returns job state without hashes or task ARN", async () => {
  const result = await handler()({ routeKey: "GET /v1/jobs/{jobId}", pathParameters: { jobId: job.jobId }, requestContext: { requestId: "request-5" } });
  assert.equal(result.statusCode, 200);
  assert.doesNotMatch(result.body, /idempotencyKeyHash|requestHash|taskArn|arn:private/);
});

test("plain and Base64 JSON both reject a leading UTF8 BOM before any job/circuit/task effect", async (t) => {
  const logs: string[] = [];
  t.mock.method(console, "warn", (...values: unknown[]) => { logs.push(values.map(String).join(" ")); });
  for (const isBase64Encoded of [false, true]) {
    const effects = { create: 0, circuit: 0, launch: 0 };
    const service = new ControllerService({
      async create() { effects.create++; return { job, created: false }; }, async get() { return job; },
      async attachTaskArn() {}, async markLaunchFailed() { return job; },
    }, { async launch() { effects.launch++; return { taskArn: "SYNTHETIC" }; } },
    { async state() { effects.circuit++; return "CLOSED"; } },
    { jobCreationEnabled: true, liveResultDisplayEnabled: false, admissionWindow }, { write() {} }, () => now);
    const text = "\ufeff" + JSON.stringify(request);
    const result = await createHandler(service)({ routeKey: "POST /v1/jobs", isBase64Encoded,
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: isBase64Encoded ? Buffer.from(text).toString("base64") : text });
    assert.equal(result.statusCode, 400);
    assert.equal(JSON.parse(result.body).error.code, "VALIDATION_ERROR");
    assert.deepEqual(effects, { create: 0, circuit: 0, launch: 0 });
  }
  assert.doesNotMatch(logs.join("\n"), /PRICE|QLD|018f1c2a|ufeff/);
});

test("the 4096-byte boundary is applied to decoded wire bytes, not BOM-normalized text", async (t) => {
  t.mock.method(console, "warn", () => {});
  const json = JSON.stringify(request), headers = { "content-type": "application/json", "idempotency-key": idempotencyKey };
  for (const isBase64Encoded of [false, true]) {
    const atLimit = json + " ".repeat(4096 - Buffer.byteLength(json));
    const accepted = await handler()({ routeKey: "POST /v1/jobs", headers, isBase64Encoded,
      body: isBase64Encoded ? Buffer.from(atLimit).toString("base64") : atLimit });
    assert.equal(accepted.statusCode, 202);
    const tooLarge = "\ufeff" + json + " ".repeat(4098 - 3 - Buffer.byteLength(json));
    assert.equal(Buffer.byteLength(tooLarge), 4098);
    const rejected = await handler()({ routeKey: "POST /v1/jobs", headers, isBase64Encoded,
      body: isBase64Encoded ? Buffer.from(tooLarge).toString("base64") : tooLarge });
    assert.equal(rejected.statusCode, 400);
  }
});

test("duplicate or escaped-equivalent JSON keys are rejected before any admission or persistence", async (t) => {
  const logs: string[] = []; t.mock.method(console, "warn", (...v: unknown[]) => { logs.push(v.join(" ")); });
  for (const isBase64Encoded of [false, true]) for (const raw of [
    '{"operation":"ANALYZE","operation":"PRICE","symbol":"QLD","locale":"ko"}',
    '{"operation":"PRICE","symbol":"TSLA","sym\\u0062ol":"QLD","locale":"ko"}',
    '{"operation":"PRICE","symbol":"QLD","locale":"en","locale":"ko"}',
  ]) {
    const effects = { create: 0, circuit: 0, launch: 0 };
    const service = new ControllerService({
      async create() { effects.create++; return { job, created: false }; }, async get() { return job; },
      async attachTaskArn() {}, async markLaunchFailed() { return job; },
    }, { async launch() { effects.launch++; return { taskArn: "SYNTHETIC" }; } },
    { async state() { effects.circuit++; return "CLOSED"; } },
    { jobCreationEnabled: true, liveResultDisplayEnabled: false, admissionWindow }, { write() {} }, () => now);
    const result = await createHandler(service)({ routeKey: "POST /v1/jobs", isBase64Encoded,
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: isBase64Encoded ? Buffer.from(raw).toString("base64") : raw });
    assert.equal(result.statusCode, 400); assert.equal(JSON.parse(result.body).error.code, "VALIDATION_ERROR");
    assert.deepEqual(effects, { create: 0, circuit: 0, launch: 0 });
  }
  assert.doesNotMatch(logs.join("\n"), /ANALYZE|PRICE|TSLA|QLD|sym\\u0062/);
});

test("case-aliased request headers are rejected instead of silently selecting one value", async (t) => {
  t.mock.method(console, "warn", () => {});
  const headers = { "content-type": "application/json", "idempotency-key": idempotencyKey };
  for (const extra of [{ "Content-Type": "application/json" }, { "Content-Type": "text/plain" },
    { "Idempotency-Key": idempotencyKey }, { "Idempotency-Key": "PRIVATE_SENTINEL" }]) {
    const result = await handler()({ routeKey: "POST /v1/jobs", headers: { ...headers, ...extra }, body: JSON.stringify(request) });
    assert.equal(result.statusCode, 400); assert.equal(JSON.parse(result.body).error.code, "VALIDATION_ERROR");
    assert.doesNotMatch(result.body, /PRIVATE_SENTINEL|018f1c2a/);
  }
});

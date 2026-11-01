import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import { AwsIamApiClient } from "../src/signed-api-client.js";

const endpoint = "https://abc123.execute-api.ap-northeast-1.amazonaws.com";
const credentials = async () => ({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example-secret" });
const clientFor = (response: Response) => new AwsIamApiClient(endpoint, credentials, async () => response, 1000);

test("signed acceptance refuses duplicate decoded keys instead of trusting the last value", async () => {
  for (const body of ['{"circuit":"OPEN","circuit":"CLOSED"}', '{"status":"failed","st\\u0061tus":"ok"}']) {
    await assert.rejects(clientFor(new Response(body)).request("GET", "v1/health"), /invalid JSON/);
  }
});

test("empty chunks have a finite work bound even when accumulated bytes remain small", async () => {
  let reads = 0, cancels = 0;
  const response = new Response("{}");
  Object.defineProperty(response, "body", { value: { getReader: () => ({
    async read() { reads++; return reads <= 5000 ? { done: false, value: new Uint8Array() }
      : reads === 5001 ? { done: false, value: new TextEncoder().encode("{}") } : { done: true }; },
    async cancel() { cancels++; }, releaseLock() {},
  }) } });
  await assert.rejects(clientFor(response).request("GET", "v1/health"), /bounded chunk limit/);
  assert.equal(reads, 4097); assert.equal(cancels, 1);
});

test("a valid result does not wait forever for an uncooperative reader cleanup", async () => {
  let reads = 0, cancels = 0, releases = 0;
  const response = new Response("{}");
  Object.defineProperty(response, "body", { value: { getReader: () => ({
    async read() { return ++reads === 1 ? { done: false, value: new TextEncoder().encode("{}") } : { done: true }; },
    cancel() { cancels++; return new Promise<void>(() => {}); }, releaseLock() { releases++; },
  }) } });
  assert.deepEqual(await clientFor(response).request("GET", "v1/health"), {});
  assert.equal(cancels, 1); assert.equal(releases, 1);
});

test("the exact byte and chunk ceilings still accept an unambiguous object", async () => {
  for (const exact of ["bytes", "chunks"]) {
    let reads = 0;
    const body = new TextEncoder().encode(JSON.stringify({ value: "a".repeat(65524) }));
    assert.equal(body.byteLength, 65536);
    const response = new Response("{}");
    Object.defineProperty(response, "body", { value: { getReader: () => ({
      async read() {
        reads++;
        if (exact === "chunks" && reads < 4096) return { done: false, value: new Uint8Array() };
        if (reads === (exact === "chunks" ? 4096 : 1)) return { done: false, value: body };
        return { done: true };
      }, async cancel() {}, releaseLock() {},
    }) } });
    assert.deepEqual(await clientFor(response).request("GET", "v1/health"), { value: "a".repeat(65524) });
    assert.equal(reads, exact === "chunks" ? 4097 : 2);
  }
});

test("ambiguous nested keys, parser work excess, BOM and non-byte chunks fail safely", async () => {
  const bodies = ['{"value":{"x":1,"x":2}}', `{"x":${"[".repeat(33)}0${"]".repeat(33)}}`,
    `{"x":[${Array(4097).fill("0").join(",")}]}`, "\ufeff{}"];
  for (const body of bodies) await assert.rejects(clientFor(new Response(body)).request("GET", "v1/health"),
    error => error instanceof Error && error.message === "API returned invalid JSON." && !("cause" in error));
  const response = new Response("{}"); let cancels = 0;
  Object.defineProperty(response, "body", { value: { getReader: () => ({
    async read() { return { done: false, value: "PRIVATE_SENTINEL" }; },
    cancel() { cancels++; throw Error("PRIVATE_SENTINEL"); }, releaseLock() { throw Error("PRIVATE_SENTINEL"); },
  }) } });
  await assert.rejects(clientFor(response).request("GET", "v1/health"), /^Error: API returned invalid JSON\.$/);
  assert.equal(cancels, 1);
});

test("late read completion after timeout cannot issue another read or retain abort listeners", async () => {
  let reads = 0, cancels = 0, releases = 0, requests = 0, signal: AbortSignal | null | undefined;
  let resolveRead!: (value: { done: false; value: Uint8Array }) => void;
  const pendingRead = new Promise<{ done: false; value: Uint8Array }>(resolve => { resolveRead = resolve; });
  const response = new Response("{}");
  Object.defineProperty(response, "body", { value: { getReader: () => ({
    read() { reads++; return pendingRead; },
    cancel() { cancels++; return new Promise<void>(() => {}); }, releaseLock() { releases++; },
  }) } });
  const client = new AwsIamApiClient(endpoint, credentials, async (_url, init) => {
    requests++; signal = init?.signal; return response;
  }, 100);
  await assert.rejects(client.request("GET", "v1/health"), /timed out/);
  assert.equal(requests, 1); assert.equal(reads, 1); assert.equal(cancels, 1); assert.equal(signal?.aborted, true);
  resolveRead({ done: false, value: new TextEncoder().encode("{}") });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reads, 1); assert.equal(cancels, 1); assert.equal(releases, 1);
  assert.equal(getEventListeners(signal!, "abort").length, 0);
});

test("a late fetch body is cancelled without opening or parsing it", async () => {
  let finish!: (value: Response) => void, reads = 0, cancels = 0, requests = 0;
  const late = new Promise<Response>(resolve => { finish = resolve; });
  const response = new Response("{}");
  Object.defineProperty(response, "body", { value: {
    getReader() { reads++; throw Error("PRIVATE_SENTINEL"); },
    cancel() { cancels++; return new Promise<void>(() => {}); },
  } });
  const client = new AwsIamApiClient(endpoint, credentials, async () => { requests++; return late; }, 100);
  await assert.rejects(client.request("GET", "v1/health"), /timed out/);
  finish(response); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(requests, 1); assert.equal(reads, 0); assert.equal(cancels, 1);
});

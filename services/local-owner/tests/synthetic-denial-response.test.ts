import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readSyntheticDenialResponse } from "../src/synthetic-denial-response.js";

const failure = { message: "SYNTHETIC_READ_DENIAL_TRANSPORT_UNVERIFIED" };
function stream(status = 400, headers: Record<string, string | string[]> = { "content-type": "application/x-amz-json-1.1" }) {
  const value = Object.assign(new PassThrough(), { statusCode: status, headers, complete: true });
  return { value, response: value as unknown as IncomingMessage };
}
const signal = () => new AbortController().signal;

test("bounded error envelopes preserve UTF-8 split across chunks without exposing headers", async () => {
  const body = '{"message":"拒否됨","__type":"AccessDeniedException"}';
  const bytes = Buffer.from(body), s = stream(403, { "content-type": "application/json; charset=UTF-8",
    "content-length": String(bytes.length), "x-amzn-errortype": "AccessDeniedException", "x-private": "PRIVATE_SENTINEL" });
  const result = readSyntheticDenialResponse(s.response, signal());
  for (let i = 0; i < bytes.length; i++) s.value.write(bytes.subarray(i, i + 1));
  s.value.end();
  assert.deepEqual(await result, { status: 403, body, errorType: "AccessDeniedException" });
});

test("success, redirects and malformed headers are rejected before consuming any data", async () => {
  const headers = { "content-type": "application/json" };
  for (const [status, extra] of [[200, {}], [301, {}], [500, {}], [400, { location: "https://example.invalid/" }],
    [400, { "content-type": "text/html" }], [400, { "content-length": "16385" }],
    [400, { "content-length": "-1" }], [400, { "content-length": "1.0" }], [400, { "content-length": "1e2" }],
    [400, { "x-amzn-errortype": ["one", "two"] }], [400, { "x-amzn-errortype": "x".repeat(257) }]] as const) {
    const s = stream(status, { ...headers, ...extra } as Record<string, string | string[]>);
    await assert.rejects(readSyntheticDenialResponse(s.response, signal()), failure);
    assert.equal(s.value.destroyed, true); assert.equal(s.value.listenerCount("data"), 0);
    s.value.emit("error", Error("PRIVATE_SENTINEL"));
  }
});

test("body byte and chunk limits terminate oversized responses; exact byte bound is accepted", async () => {
  for (const mode of ["bytes", "chunks"] as const) {
    const s = stream(), pending = assert.rejects(readSyntheticDenialResponse(s.response, signal()), failure);
    if (mode === "bytes") s.value.write(Buffer.alloc(16385));
    else for (let i = 0; i < 257; i++) s.value.write(Buffer.from("x"));
    await pending; assert.equal(s.value.destroyed, true);
  }
  const s = stream(), accepted = readSyntheticDenialResponse(s.response, signal());
  s.value.end(Buffer.alloc(16384, 120)); assert.equal((await accepted).body.length, 16384);
});

test("invalid UTF-8, incomplete messages and mismatched declared lengths fail closed", async () => {
  for (const mode of ["utf8", "incomplete", "length"] as const) {
    const s = stream(400, { "content-type": "application/json", ...(mode === "length" ? { "content-length": "9" } : {}) });
    if (mode === "incomplete") s.value.complete = false;
    const pending = assert.rejects(readSyntheticDenialResponse(s.response, signal()), failure);
    s.value.end(mode === "utf8" ? Buffer.from([0xc3, 0x28]) : Buffer.from("{}")); await pending;
  }
});

test("cancellation before/during response, aborted and premature-close events cannot hang", async () => {
  for (const mode of ["before", "during", "aborted", "close", "error"] as const) {
    const s = stream(), controller = new AbortController();
    if (mode === "before") controller.abort();
    const pending = assert.rejects(readSyntheticDenialResponse(s.response, controller.signal), failure);
    if (mode === "during") { s.value.write(Buffer.from("{")); controller.abort(); }
    if (mode === "aborted") s.value.emit("aborted");
    if (mode === "close") s.value.destroy();
    if (mode === "error") s.value.emit("error", Error("PRIVATE_SENTINEL"));
    await pending; assert.equal(s.value.destroyed, true);
  }
});

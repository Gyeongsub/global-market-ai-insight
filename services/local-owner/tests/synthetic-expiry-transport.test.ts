import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { createSyntheticExpiryTransport, readSyntheticExpiryResponse, syntheticExpiryRequestBody, syntheticExpiryFailureSummary } from "../src/synthetic-expiry-transport.js";

const credentials = () => ({ accessKeyId: `ASIA${"X".repeat(16)}`, secretAccessKey: "x".repeat(40), sessionToken: "synthetic-test-only-token" });
class Response extends EventEmitter {
  statusCode = 403; complete = true; destroyed = false;
  headers: Record<string, string | undefined> = { "content-type": "application/json", date: new Date().toUTCString() };
  destroy() { this.destroyed = true; return this; }
}
test("fixed request builder is English synthetic QLD, no model override, bounded output and bytes", async () => {
  const raw = await syntheticExpiryRequestBody(), body = JSON.parse(raw);
  assert.equal(body.modelId, undefined); assert.equal(body.inferenceConfig.maxTokens, 512);
  assert.match(raw, /invented synthetic/); assert.match(raw, /QLD/); assert.ok(Buffer.byteLength(raw) <= 8192);
  assert.equal(await syntheticExpiryRequestBody(), raw);
});
test("native request uses fixed TLS-verified private agent without opening a socket", async () => {
  const original = https.request; let observed: any; let url = "";
  try {
    (https as any).request = (address: string, options: any, callback: (r: any) => void) => {
      url = address; observed = options;
      const req = new EventEmitter() as any; req.destroy = () => {};
      req.end = () => { const response = new Response(); callback(response); response.emit("data", Buffer.from("{}")); response.emit("end"); };
      return req;
    }; syncBuiltinESMExports();
    const transport = await createSyntheticExpiryTransport(credentials);
    try { await transport.send(new AbortController().signal); }
    finally { transport.destroy(); }
    assert.equal(url, "https://bedrock-runtime.ap-northeast-1.amazonaws.com/model/amazon.nova-lite-v1%3A0/converse");
    assert.equal(observed.rejectUnauthorized, true); assert.equal(observed.minVersion, "TLSv1.2");
    assert.equal(observed.agent.options.rejectUnauthorized, true); assert.equal(observed.agent.options.keepAlive, false);
  } finally { https.request = original; syncBuiltinESMExports(); }
});
test("wire signs only two identical bodies, no retry after a failure, and clears on destroy", async () => {
  let calls = 0, closes = 0; const bodies: string[] = [];
  const transport = await createSyntheticExpiryTransport(credentials, { async send(headers, body) {
    calls++; bodies.push(body); assert.match(headers.authorization!, /bedrock\/aws4_request/);
    return { status: 403, body: "{}", serverDate: new Date().toUTCString() };
  }, destroy() { closes++; } });
  const signal = new AbortController().signal;
  await transport.send(signal); await transport.send(signal); await assert.rejects(transport.send(signal));
  assert.equal(calls, 2); assert.equal(closes, 1); assert.equal(bodies[0], bodies[1]);
  const failed = await createSyntheticExpiryTransport(credentials, { async send() { calls++; throw Error("PRIVATE"); }, destroy() {} });
  await assert.rejects(failed.send(signal), { message: "SYNTHETIC_EXPIRY_TRANSPORT_UNVERIFIED" });
  await assert.rejects(failed.send(signal)); assert.equal(calls, 3);
});
test("response reader rejects success alternatives, redirect, encoding, missing date and oversized content", async () => {
  for (const mutate of [
    (r: Response) => { r.statusCode = 500; }, (r: Response) => { r.headers.location = "https://example.invalid"; },
    (r: Response) => { r.headers.date = undefined; }, (r: Response) => { r.headers["content-encoding"] = "gzip"; },
    (r: Response) => { r.headers["content-length"] = "16385"; }, (r: Response) => { r.headers["content-type"] = "text/html"; },
  ]) {
    const r = new Response(); mutate(r);
    await assert.rejects(readSyntheticExpiryResponse(r as any, new AbortController().signal)); assert.equal(r.destroyed, true);
  }
});
test("response reader rejects truncated, over-limit, malformed UTF8, abort and early close", async () => {
  for (const mode of ["incomplete", "bytes", "utf8", "abort", "close", "length"]) {
    const r = new Response(), controller = new AbortController();
    if (mode === "length") r.headers["content-length"] = "5";
    const pending = readSyntheticExpiryResponse(r as any, controller.signal); const rejected = assert.rejects(pending);
    if (mode === "abort") controller.abort();
    else if (mode === "close") r.emit("close");
    else { if (mode === "incomplete") r.complete = false;
      r.emit("data", mode === "bytes" ? Buffer.alloc(16385) : mode === "utf8" ? Buffer.from([255]) : Buffer.from("{}")); r.emit("end"); }
    await rejected; assert.equal(r.destroyed, true);
  }
});

test("safe diagnostics keep status/category but never arbitrary upstream text or properties", async () => {
  for (const [status, stage] of [[429, "STATUS"], [200, "HEADERS"]] as const) {
    const r = new Response(); r.statusCode = status;
    if (status === 200) r.headers.date = "PRIVATE_SENTINEL";
    try { await readSyntheticExpiryResponse(r as any, new AbortController().signal); assert.fail(); }
    catch (error) { assert.deepEqual(syntheticExpiryFailureSummary(error), { stage, httpStatus: status });
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE_SENTINEL/); }
  }
  const forged = Object.assign(Error("PRIVATE_SENTINEL"), { stage: "STATUS", httpStatus: 200 });
  assert.equal(syntheticExpiryFailureSummary(forged), null);
  const transport = await createSyntheticExpiryTransport(credentials, { async send() { throw forged; }, destroy() {} });
  try { await transport.send(new AbortController().signal); assert.fail(); }
  catch (error) { assert.deepEqual(syntheticExpiryFailureSummary(error), { stage: "WIRE", httpStatus: null }); }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { closeOwnedLocalServer, localRequestOptions } from "../scripts/local-http-safety-proof.mjs";

test("HTTP proof destinations are always explicit loopback with bounded read/test methods", () => {
  const options = localRequestOptions(4173, "/THIRD_PARTY_NOTICES.txt", "HEAD", { Origin: "https://example.invalid" });
  assert.equal(options.hostname, "127.0.0.1"); assert.equal(options.port, 4173);
  assert.equal(options.method, "HEAD"); assert.equal(options.agent, false);
  assert.equal(options.headers.Connection, "close");
});

test("invalid paths, methods, ports and sensitive/arbitrary headers fail before a socket is created", () => {
  for (const port of [0, 65536, "4173", NaN]) assert.throws(() => localRequestOptions(port, "/"));
  for (const path of ["https://example.invalid/", "//example.invalid/", "/\n", "/" + "x".repeat(8192), undefined])
    assert.throws(() => localRequestOptions(4173, path));
  for (const method of ["DELETE", "PUT", "CONNECT"]) assert.throws(() => localRequestOptions(4173, "/", method));
  for (const headers of [{ Authorization: "SYNTHETIC_ONLY" }, { Cookie: "SYNTHETIC_ONLY" }, { Origin: "x\r\nHost: y" }])
    assert.throws(() => localRequestOptions(4173, "/", "GET", headers));
});

test("unsupported CLI flags cannot start local listeners or expose the supplied value", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/local-http-safety-proof.mjs", import.meta.url)), "--upload=SYNTHETIC_PRIVATE_ONLY"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.match(result.stderr, /LOCAL_HTTP_PROOF_INCOMPLETE/); assert.doesNotMatch(result.stderr, /SYNTHETIC_PRIVATE_ONLY/);
});

test("owned shutdown closes even a server that failed before it started listening", async () => {
  let calls = 0;
  await closeOwnedLocalServer({ httpServer: { listening: false }, async close() { calls += 1; } });
  assert.equal(calls, 1);
});

test("a close promise that leaves an active listener cannot produce success evidence", async () => {
  await assert.rejects(closeOwnedLocalServer({ httpServer: { listening: true }, async close() {} }), /must be closed/);
  await assert.rejects(closeOwnedLocalServer({ httpServer: { listening: false }, async close() { throw new Error("Synthetic close failure"); } }), /Synthetic close failure/);
});

test("local shutdown deadlines are bounded and stalled promises fail without a persistent timer", async () => {
  const stalled = { httpServer: { listening: true }, close() { return new Promise(() => {}); } };
  await assert.rejects(closeOwnedLocalServer(stalled, 10), /deadline exceeded/);
  for (const deadline of [0, -1, 5001, Infinity]) await assert.rejects(closeOwnedLocalServer(stalled, deadline), /Unbounded/);
});

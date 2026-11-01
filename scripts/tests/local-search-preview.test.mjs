import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { localSearchPreviewPlan } from "../local-search-preview.mjs";
import { runLocalSearchPreview } from "../../frontend/scripts/local-search-lifecycle.mjs";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

function harness({ port = 4173, closeThrows = false, stillListening = false } = {}) {
  const io = new EventEmitter(); io.stdin = new EventEmitter();
  let destroyed = false, closes = 0, timer;
  io.stdin.destroy = () => { destroyed = true; };
  const packets = [], server = { listening: true, address: () => ({ address: "127.0.0.1", port }) };
  const app = { httpServer: server, close: async () => { closes++; if (closeThrows) throw Error("PRIVATE_SENTINEL"); server.listening = stillListening; } };
  const clock = { set: (callback, ms) => { assert.equal(ms, 300000); timer = callback; return 1; }, clear: () => { timer = undefined; } };
  return { io, app, clock, packets, report: v => packets.push(v), expire: () => timer?.(),
    snapshot: () => ({ destroyed, closes, timerRetained: !!timer }) };
}

test("search preview defaults to zero actions and rejects arbitrary endpoints/arguments", () => {
  const p = localSearchPreviewPlan();
  assert.equal(p.awsCalls, 0); assert.equal(p.serverStarted, false); assert.equal(p.credentialsPassed, false);
  assert.equal(p.lifetimeMs, 300000); assert.equal(p.automaticModelCalls, 0); assert.equal(p.publicationPerformed, false);
  for (const arg of ["--host", "--port", "--aws", "--publish"]) assert.throws(() => localSearchPreviewPlan([arg]));
  const result = spawnSync(process.execPath, [resolve("scripts/local-search-preview.mjs"), "--execute-local-search-preview", "PRIVATE_SENTINEL"],
    { env: cleanSourceChildEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "LOCAL_SEARCH_PREVIEW_INCOMPLETE");
});

test("Enter, stop, EOF, signals and timer close once and detach every owned handler", async () => {
  for (const cause of ["enter", "stop", "end", "SIGINT", "SIGTERM", "timer"]) {
    const h = harness();
    const session = await runLocalSearchPreview(async () => h.app, h.io, h.clock, h.report);
    assert.equal(h.packets[0].mode, "local-search-preview-ready");
    if (cause === "timer") h.expire(); else if (cause === "enter" || cause === "stop") h.io.stdin.emit("data", Buffer.from(cause === "enter" ? "\r\n" : "stop\n"));
    else if (cause === "end") h.io.stdin.emit("end"); else h.io.emit(cause);
    await session.stop(); await session.stop();
    assert.deepEqual(h.snapshot(), { destroyed: true, closes: 1, timerRetained: false });
    assert.equal(h.io.eventNames().length, 0); assert.equal(h.io.stdin.eventNames().length, 0);
    assert.equal(h.packets.at(-1).closureVerified, true);
  }
});

test("stop during setup closes a late server without announcing ready", async () => {
  const h = harness(); let deliver;
  const pending = runLocalSearchPreview(() => new Promise(resolve => { deliver = resolve; }), h.io, h.clock, h.report);
  h.io.stdin.emit("data", Buffer.from("stop\n")); deliver(h.app);
  assert.equal(await pending, null); assert.equal(h.snapshot().closes, 1);
  assert.equal(h.packets.some(p => p.mode === "local-search-preview-ready"), false);
  assert.equal(h.packets.at(-1).closureVerified, true);
});

test("failed close or surviving listener never produces a verified close", async () => {
  for (const options of [{ closeThrows: true }, { stillListening: true }]) {
    const h = harness(options), session = await runLocalSearchPreview(async () => h.app, h.io, h.clock, h.report);
    await session.stop(); assert.equal(h.io.exitCode, 1); assert.equal(h.packets.at(-1).closureVerified, false);
    assert.doesNotMatch(JSON.stringify(h.packets), /PRIVATE_SENTINEL/);
  }
});

test("wrong binding and factory failure are redacted, non-successful and cleaned up", async () => {
  const bad = harness({ port: 9000 });
  assert.equal(await runLocalSearchPreview(async () => bad.app, bad.io, bad.clock, bad.report), null);
  assert.equal(bad.snapshot().closes, 1); assert.equal(bad.io.exitCode, 1);
  assert.equal(bad.packets.some(p => p.mode === "local-search-preview-ready"), false);
  const failed = harness();
  assert.equal(await runLocalSearchPreview(async () => { throw Error("PRIVATE_SENTINEL"); }, failed.io, failed.clock, failed.report), null);
  assert.equal(failed.io.exitCode, 1); assert.equal(failed.snapshot().destroyed, true);
  assert.equal(failed.snapshot().timerRetained, false); assert.doesNotMatch(JSON.stringify(failed.packets), /PRIVATE_SENTINEL|closureVerified/);
});

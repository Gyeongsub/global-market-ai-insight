import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { runLocalHttpDevelopment } from "../scripts/local-http-lifecycle.mjs";

const input = () => {
  const stdin = Object.assign(new EventEmitter(), { destroyed: false, destroy() { this.destroyed = true; } });
  return Object.assign(new EventEmitter(), { stdin, exitCode: undefined });
};
const quiet = t => {
  const log = [], error = [];
  t.mock.method(console, "log", value => log.push(value));
  t.mock.method(console, "error", value => error.push(value));
  return { log, error };
};

test("strict-port/listen failure closes the already-created Vite instance and stdin", async t => {
  const output = quiet(t), io = input(); let closes = 0;
  assert.equal(await runLocalHttpDevelopment(async () => ({
    async listen() { throw Error("PRIVATE_SENTINEL"); }, async close() { closes++; },
  }), io), null);
  assert.equal(closes, 1); assert.equal(io.stdin.destroyed, true); assert.equal(io.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_SENTINEL|dev-ready/);
});

test("factory failure leaves no started server or stdin waiter and prints no private cause", async t => {
  const output = quiet(t), io = input();
  assert.equal(await runLocalHttpDevelopment(async () => { throw Error("PRIVATE_SENTINEL"); }, io), null);
  assert.equal(io.stdin.destroyed, true); assert.equal(io.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_SENTINEL|dev-ready/);
});

test("stop, EOF and signals coalesce into one close and clear the five-minute timer", async t => {
  quiet(t); const io = input(); let closes = 0;
  const app = await runLocalHttpDevelopment(async () => ({ async listen() {}, async close() { closes++; } }), io);
  assert.ok(app); t.after(() => app.stop());
  io.stdin.emit("data", Buffer.from("stop\n")); io.stdin.emit("end"); io.emit("SIGTERM"); io.emit("SIGINT");
  await Promise.all([app.stop(), app.stop()]);
  assert.equal(closes, 1); assert.equal(io.stdin.destroyed, true); assert.equal(io.exitCode, undefined);
});

test("a failed server close is never reported as a successful child exit", async t => {
  const output = quiet(t), io = input();
  const app = await runLocalHttpDevelopment(async () => ({ async listen() {}, async close() { throw Error("PRIVATE_SENTINEL"); } }), io);
  assert.ok(app); t.after(() => app.stop()); await app.stop();
  assert.equal(io.exitCode, 1); assert.equal(io.stdin.destroyed, true);
  assert.ok(output.error.includes("LOCAL_HTTP_DEMO_DEV_CLOSE_INCOMPLETE"));
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE_SENTINEL/);
});

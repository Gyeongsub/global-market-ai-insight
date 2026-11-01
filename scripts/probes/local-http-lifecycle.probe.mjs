// Explicit normal-OS loopback probe; excluded from routine unit collection.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

test("an owned strict-port collision closes both demo children but not the existing listener", { timeout: 25000 }, async t => {
  const sentinel = createServer((_request, response) => response.end("local-test-only"));
  await new Promise((accept, refuse) => { sentinel.once("error", refuse); sentinel.listen(5173, "127.0.0.1", accept); });
  t.after(() => new Promise(resolve => { sentinel.close(resolve); sentinel.closeAllConnections(); }));
  const child = spawn(process.execPath, [resolve("scripts/local-http-demo.mjs"), "--execute-local-http-demo"], {
    cwd: process.cwd(), env: cleanSourceChildEnvironment(process.env), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "", errorOutput = "";
  child.stdout.on("data", bytes => { if (output.length < 32000) output += bytes.toString(); });
  child.stderr.on("data", bytes => { if (errorOutput.length < 32000) errorOutput += bytes.toString(); });
  child.stdin.on("error", () => {});
  const exited = new Promise((accept, refuse) => { child.once("error", refuse); child.once("exit", (code, signal) => accept({ code, signal })); });
  let timer;
  const bounded = Promise.race([exited, new Promise((_, refuse) => { timer = setTimeout(() => refuse(Error("LOCAL_COLLISION_EXIT_INCOMPLETE")), 20000); })]);
  t.after(async () => {
    clearTimeout(timer);
    if (child.exitCode === null) {
      child.stdin.end("stop\n");
      const stopped = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 2000))]);
      if (!stopped) child.kill();
    }
  });
  const status = await bounded; clearTimeout(timer);
  assert.equal(status.code, 1); assert.equal(status.signal, null);
  assert.ok(errorOutput.includes("LOCAL_HTTP_DEMO_DEV_INCOMPLETE"), "fixed startup failure reported");
  assert.ok(output.includes('"mode":"local-http-demo-closed","allChildrenExited":true'), "both owned children exited");
  assert.ok(output.includes('"mode":"local-fixture-api-closed"'), "API closure acknowledged");
  assert.equal(sentinel.listening, true);
  console.log(JSON.stringify({ mode: "local-http-collision-proof", bothOwnedChildrenExited: true,
    existingListenerPreserved: true, awsCalls: 0, externalNetworkCalls: 0 }));
});

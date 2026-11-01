import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { localHttpDemoPlan } from "../local-http-demo.mjs";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

test("development HTTP demo defaults to zero actions and cannot change origin or production mode", () => {
  const p = localHttpDemoPlan(); assert.equal(p.subprocessesStarted, 0); assert.equal(p.serverStarted, false); assert.equal(p.awsCalls, 0);
  assert.equal(p.productionBuildConnected, false); assert.equal(p.credentialsPassed, false); assert.equal(p.lifetimeMs, 300000);
  assert.equal(p.apiOrigin, "http://127.0.0.1:4174");
  for (const arg of ["--port", "--origin", "--upstream", "--publish"]) assert.throws(() => localHttpDemoPlan([arg]));
});

test("extra configuration is rejected without echoing it or starting a server", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/local-http-demo.mjs"), "--execute-local-http-demo", "PRIVATE_SENTINEL"], {
    env: cleanSourceChildEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr.trim(), "LOCAL_HTTP_DEMO_INCOMPLETE");
  assert.doesNotMatch(result.stderr, /PRIVATE_SENTINEL/);
});

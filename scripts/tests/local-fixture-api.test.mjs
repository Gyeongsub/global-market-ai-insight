import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { localFixtureApiPlan } from "../local-fixture-api.mjs";
import { cleanSourceChildEnvironment } from "../local-proof-environment.mjs";

test("local fixture CLI is zero-action by default and never authorizes upstream or dashboard exposure", () => {
  const p = localFixtureApiPlan();
  assert.equal(p.subprocessesStarted, 0); assert.equal(p.serverStarted, false); assert.equal(p.networkCalls, 0);
  assert.equal(p.dashboardConnected, false); assert.equal(p.credentialsPassed, false); assert.equal(p.upstreamConfigAccepted, false);
  assert.equal(p.port, 4174); assert.equal(p.lifetimeMs, 300000); assert.equal(p.maxJobs, 32);
  for (const arg of ["--port", "--host", "--aws", "--url", "--execute"]) assert.throws(() => localFixtureApiPlan([arg]));
});

test("invalid execution/configuration arguments fail before a subprocess, without echoing private text", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/local-fixture-api.mjs"), "--host", "PRIVATE_SENTINEL"], {
    env: cleanSourceChildEnvironment(process.env), encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "LOCAL_FIXTURE_START_INCOMPLETE"); assert.doesNotMatch(result.stderr, /PRIVATE_SENTINEL/);
});

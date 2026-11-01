import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { localOwnerFixturePlan } from "../local-owner-fixture.mjs";

test("owner fixture is explicit, zero-AWS by default and cannot accept arbitrary arguments", () => {
  assert.deepEqual(localOwnerFixturePlan(), { mode: "dry-run", awsCalls: 0, serversStarted: 0,
    lifetimeMs: 300000, origin: "http://127.0.0.1:4175", source: "local-test-fixture" });
  assert.throws(() => localOwnerFixturePlan(["--execute-local-fixture"]));
  const result = spawnSync(process.execPath, ["scripts/local-owner-fixture.mjs"], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout), localOwnerFixturePlan()); assert.equal(result.stderr, "");
});

test("fixture wrapper has no AWS client, credential fallback, arbitrary upstream or deployment", () => {
  const source = readFileSync(new URL("../local-owner-fixture.mjs", import.meta.url), "utf8");
  assert.match(source, /env: cleanSourceChildEnvironment\(process.env\)/);
  assert.match(source, /source:'local-test-fixture'/); assert.match(source, /await app.close/);
  assert.doesNotMatch(source, /AwsIamApiClient|defaultProvider|execute-read-only|GMAI_AWS_CLI_PATH|AWS_PROFILE|fetch\(/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { localOwnerJobFixturePlan } from "../local-owner-job-fixture.mjs";

test("owner job preview is zero-action by default, synthetic only and has no arbitrary selectors", () => {
  assert.deepEqual(localOwnerJobFixturePlan(), { mode: "dry-run", awsCalls: 0, serversStarted: 0, lifetimeMs: 120000,
    origin: "http://127.0.0.1:4175", source: "local-test-fixture", request: { operation: "PRICE", symbol: "QLD", locale: "en" }, syntheticPostsMax: 1 });
  for (const args of [["--execute"], ["--url", "https://evil.invalid"], ["--profile", "gmai-admin"]]) assert.throws(() => localOwnerJobFixturePlan(args));
});
test("synthetic job preview child is credential-scrubbed with terminal and watchdog closure", () => {
  const source = readFileSync(new URL("../local-owner-job-fixture.mjs", import.meta.url), "utf8");
  assert.match(source, /cleanSourceChildEnvironment\(process.env\)/);
  assert.match(source, /stdin.once\('end',stop\)/); assert.match(source, /finally\{await app.close\(\)/);
  assert.match(source, /setTimeout\(\(\) => child.kill\(\), 150000\)/);
  assert.doesNotMatch(source, /AwsIamApiClient|defaultProvider|aws\.exe|--execute-read-only|writeFile/);
});

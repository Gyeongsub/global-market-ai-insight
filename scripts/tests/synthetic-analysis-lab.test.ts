import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { syntheticLabPlan, runSyntheticLab } from "../synthetic-analysis-lab.js";

test("unsupported runtime fails before configuration, credentials or environment mutation", async () => {
  const version = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  const environment = { ...process.env };
  try {
    Object.defineProperty(process.versions, "node", { ...version, value: "24.19.0" });
    assert.equal(syntheticLabPlan().awsCalls, 0);
    await assert.rejects(runSyntheticLab(), { message: "PROJECT_NODE_SECURITY_BASELINE_REQUIRED" });
    assert.deepEqual({ ...process.env }, environment);
  } finally { Object.defineProperty(process.versions, "node", version); }
});

test("synthetic lab defaults to zero-call plan, pinned Tokyo Nova Lite and one-attempt limit", () => {
  const plan = syntheticLabPlan();
  assert.equal(plan.awsCalls, 0); assert.equal(plan.providerCalls, 0); assert.equal(plan.maxAttempts, 1);
  assert.equal(plan.region, "ap-northeast-1"); assert.equal(plan.modelId, "amazon.nova-lite-v1:0");
  assert.equal(plan.maxOutputTokens, 512); assert.equal(plan.lifetimeMs, 300000);
  assert.throws(() => syntheticLabPlan(["--endpoint", "https://evil.invalid"]));
});
test("stable live entry has only the gated temporary model-role lifecycle, no owner-key fallback", () => {
  const source = readFileSync(new URL("../synthetic-analysis-lab.ts", import.meta.url), "utf8");
  assert.match(source, /runSyntheticRoleRehearsal\("restricted-browser"\)/);
  assert.match(source, /!result.completed \|\| !result.stackAbsent \|\| !result.roleAbsent/);
  assert.doesNotMatch(source, /export-credentials|BedrockRuntimeClient|fromNodeProviderChain|createSyntheticAnalysisSession/);
  const plan = syntheticLabPlan();
  assert.equal(plan.administratorKeysExported, false); assert.equal(plan.restrictedLeaseOnly, true);
  assert.equal(plan.plannedTemporaryRolesMax, 1); assert.equal(plan.plannedAssumptionsMax, 1);
  assert.equal(plan.exactSourceAndFreshInstallRequired, true); assert.equal(plan.automaticStackCleanupRequired, true);
});

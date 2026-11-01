import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { buildCircuitDenialPlan } from "../circuit-denial-preflight.js";

test("Stage C preparation has zero calls and leaves all deployment/enablement/cleanup gates unresolved", () => {
  const plan = buildCircuitDenialPlan();
  assert.deepEqual([plan.awsCalls, plan.apiCalls, plan.cloudMutations], [0, 0, 0]);
  assert.deepEqual(plan.futureRequestLimit, { healthReads: 1, jobSubmissions: 1, retries: 0, statusPolling: 0 });
  assert.equal(plan.expectedHttpStatus, 503); assert.equal(plan.expectedPublicCode, "CIRCUIT_OPEN");
  assert.equal(plan.readyForExecution, false); assert.equal(plan.internalJobsEnabled, false);
  assert.equal(plan.httpDenialIsCleanupEvidence, false);
  assert.equal(plan.taskAndSlotInventoryRequiredBeforeAndAfter, true);
  assert.equal(plan.internalExecutionRestoreRequired, true);
  assert.equal(plan.independentZeroJobWriteEvidenceRequired, true);
  assert.equal(plan.freshRuntimeImageScanRequired, true);
  assert.equal(plan.exactLiveRegistryDigestProofRequired, true);
  assert.equal(plan.localImageScanProvesLiveImage, false);
  assert.equal(plan.allowUnscannedWorkerEnablement, false);
});

test("import and CLI plans cannot read credentials or consume inherited live opt-ins", () => {
  const script = resolve("scripts/circuit-denial-preflight.ts");
  const env = { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_ENABLE_INTERNAL_JOBS: "true" };
  const plan = spawnSync(process.execPath, ["--import", "tsx", script], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
  assert.equal(plan.status, 0); assert.equal(plan.stderr, "");
  assert.equal(JSON.parse(plan.stdout).awsCalls, 0); assert.equal(plan.stdout.includes("PRIVATE"), false);
  const imported = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'await import("./scripts/circuit-denial-preflight.ts");'],
    { encoding: "utf8", env, timeout: 5000, windowsHide: true });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});

test("execution, upload, destination and all other arguments fail without echoing their values", () => {
  for (const args of [["--execute"], ["--enable-internal-jobs"], ["--endpoint", "PRIVATE_SENTINEL"], ["--upload"], ["--execute", "--execute"]]) {
    assert.throws(() => buildCircuitDenialPlan(args), /ARGUMENTS_REJECTED/);
    const run = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/circuit-denial-preflight.ts"), ...args],
      { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.notEqual(run.status, 0); assert.equal(run.stdout, ""); assert.equal(run.stderr.includes("PRIVATE_SENTINEL"), false);
  }
});

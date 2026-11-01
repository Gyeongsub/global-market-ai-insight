import assert from "node:assert/strict";
import test from "node:test";
import { RECOVERY_SCENARIOS, runMaintenanceRecoveryRehearsal, runRecoveryScenario, type RecoveryScenario } from "../maintenance-recovery-rehearsal.js";

test("actual maintenance chain handles all fixed recovery and race scenarios without cloud calls", async () => {
  const report = await runMaintenanceRecoveryRehearsal();
  assert.equal(report.scenariosPassed, 21);
  assert.deepEqual(report.scenarios.map(result => result.scenario), RECOVERY_SCENARIOS);
  assert.deepEqual(report.realImplementationsExercised, ["StaleJobSweeper", "SlotReconciler", "runMaintenance"]);
  for (const key of ["awsCalls", "networkCalls", "cloudMutations", "providerCalls", "modelCalls", "ownedServersStarted", "sdkClientsCreated"] as const) assert.equal(report[key], 0);
  assert.equal(report.liveAcceptance, false);
  assert.equal(report.readyForDeployment, false);
  assert.equal(report.readyForPublication, false);
  const serialized = JSON.stringify(report);
  for (const privatePattern of [/arn:aws:/, /job_[a-f0-9]{48}/, /PRIVATE_SYNTHETIC/, /synthetic-maintenance-jobs/, /2026-10-06T/, /000000000000/]) assert.doesNotMatch(serialized, privatePattern);
});

test("a delayed/ambiguous stop or job version conflict retains capacity before independent next-pass confirmation", async () => {
  for (const scenario of ["slow-stop", "ambiguous-stop-response", "concurrent-job-version"] as const) {
    const result = await runRecoveryScenario(scenario);
    assert.equal(result.passes[0]?.sweep.timedOut, 0);
    assert.equal(result.passes[0]?.reconcile.released, 0);
    assert.equal(result.passes[1]?.sweep.stopRequested, 0);
    assert.equal(result.passes[1]?.reconcile.released, 1);
    assert.equal(result.stopEffects, 1);
    assert.equal(result.conditionalJobUpdates, 1);
    assert.equal(result.conditionalReleaseEffects, 1);
    assert.equal(result.finalSlot, "empty");
  }
});

test("a reassigned slot and its new active worker are preserved at both conditional-write race boundaries", async () => {
  for (const scenario of ["slot-reassigned-before-update", "slot-reassigned-before-release"] as const) {
    const result = await runRecoveryScenario(scenario);
    assert.equal(result.finalSlot, "replacement-retained");
    assert.equal(result.replacementUnaffected, true);
    assert.equal(result.conditionalReleaseEffects, 0);
    assert.equal(result.stopEffects, 1);
    assert.equal(result.conditionalJobUpdates, 1);
    assert.equal(result.passes[2]?.reconcile.retained, 1);
  }
});

test("an ambiguous atomic release is not falsely reported as acknowledged or repeated", async () => {
  const result = await runRecoveryScenario("ambiguous-release-response");
  assert.equal(result.passes[0]?.reconcile.released, 0);
  assert.equal(result.passes[0]?.reconcile.retained, 1);
  assert.equal(result.conditionalReleaseEffects, 1);
  assert.equal(result.passes[1]?.reconcile.empty, 2);
  assert.equal(result.finalSlot, "empty");
});

test("unverifiable task/read/version evidence cannot free the original slot", async () => {
  for (const scenario of ["missing-task", "wrong-task-owner", "owner-changed-after-stop", "read-failure", "future-deadline", "version-exhausted"] as const) {
    const result = await runRecoveryScenario(scenario);
    assert.equal(result.finalSlot, "original-retained");
    assert.equal(result.conditionalReleaseEffects, 0);
    assert.equal(result.conditionalJobUpdates, 0);
  }
});

test("the last incrementable version works but the exhausted version cannot stop a task", async () => {
  const last = await runRecoveryScenario("last-safe-version");
  assert.equal(last.conditionalJobUpdates, 1);
  assert.equal(last.finalSlot, "empty");
  const exhausted = await runRecoveryScenario("version-exhausted");
  assert.equal(exhausted.stopEffects, 0);
  assert.equal(exhausted.conditionalJobUpdates, 0);
});

test("a pre-aborted whole maintenance chain makes no even simulated calls", async () => {
  const result = await runRecoveryScenario("pre-aborted");
  assert.equal(result.inMemoryCommands, 0);
  for (const pass of result.passes) {
    assert.equal(pass.sweep.retainedForReview, 2);
    assert.equal(pass.reconcile.retained, 2);
  }
});

test("unrecognized scenarios cannot widen the fixed synthetic rehearsal", async () => {
  await assert.rejects(runRecoveryScenario("execute-live" as RecoveryScenario), { message: "MAINTENANCE_REHEARSAL_INVARIANT_FAILED" });
});

test("expired running/stopped evidence waits for a fresh pass before any next effect", async () => {
  for (const scenario of ["expired-running-evidence", "expired-stopped-evidence"] as const) {
    const result = await runRecoveryScenario(scenario);
    assert.equal(result.passes[0]?.sweep.timedOut, 0);
    assert.equal(result.passes[0]?.sweep.retainedForReview, 2);
    assert.equal(result.passes[0]?.reconcile.released, 0);
    assert.equal(result.passes[1]?.reconcile.released, 1);
    assert.equal(result.stopEffects, 1);
    assert.equal(result.conditionalJobUpdates, 1);
    assert.equal(result.conditionalReleaseEffects, 1);
  }
});

test("late mutation acknowledgement is not success; independent state reads reconcile the actual effect", async () => {
  const updated = await runRecoveryScenario("expired-timeout-ack");
  assert.equal(updated.passes[0]?.sweep.timedOut, 0);
  assert.equal(updated.passes[0]?.reconcile.released, 1);
  assert.equal(updated.conditionalJobUpdates, 1);
  const released = await runRecoveryScenario("expired-release-ack");
  assert.equal(released.passes[0]?.reconcile.released, 0);
  assert.equal(released.passes[0]?.reconcile.retained, 2);
  assert.equal(released.passes[1]?.reconcile.empty, 2);
  assert.equal(released.conditionalReleaseEffects, 1);
});

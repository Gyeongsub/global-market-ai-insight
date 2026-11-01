import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { recordedFreshInstallPlan, runRecordedFreshInstallProof, safeFreshInstallResult } from "../record-fresh-install-proof.mjs";
import { createFreshInstallGateFailure, createFrozenInstallFailure, freshInstallFailureObservation } from "../fresh-install-proof.mjs";

test("a failed installation keeps private-free stage/exit evidence after cleanup, never a completed gate", async () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    const failure = createFrozenInstallFailure({ status: 1, signal: null, stdout: "PRIVATE_SENTINEL", stderr: "ERR_PNPM_EPERM PRIVATE_SENTINEL" },
      500, { files: 1, bytes: 1, sha256: "a".repeat(64) });
    const report = await runRecordedFreshInstallProof(root, async () => { throw failure; });
    assert.equal(report.passed, false); assert.equal(report.failureObservation.mode, "failed-frozen-install-observation");
    assert.equal(report.failureObservation.sourceObservationStage, "copied-before-install");
    assert.equal(report.failureObservation.exitCode, 1); assert.equal(report.failureObservation.freshInstallVerified, false);
    assert.equal(report.failureObservation.fullLocalGatePassed, false); assert.equal(report.failureObservation.sourceUnchangedVerified, false);
    assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
    const path = join(root, "outputs/local-gates", readdirSync(join(root, "outputs/local-gates"))[0]);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), report);
  } finally { rmSync(root, { recursive: true }); }
});

const fixture = () => ({ mode: "isolated-frozen-install-build-proof", pinnedPnpm: "11.16.0", toolArchiveSha256: "a".repeat(64),
  toolArchiveIntegrityMatched: true, toolFiles: 1, sourceFingerprint: { files: 1, bytes: 1, sha256: "b".repeat(64) }, lockedIdentities: 391,
  nonRegistryResolutionPresent: false, lockfileUnchanged: true, freshInstallVerified: true, fullLocalGatePassed: true,
  awsCalls: 0, cloudMutations: 0, lifecycleScriptsEnabled: false, dependencyReuse: false, existingInstallationModified: false,
  temporaryTreeRetained: false, cleanGitCloneClaimed: false, publicationPerformed: false, readyForPublication: false,
  tests: { groups: 4, total: 8, passed: 8, skipped: 0 }, installElapsedMs: 1, gateElapsedMs: 1,
  stepTimings: { observedRecords: 50, measuredSteps: 50, recordsValid: true, failedSteps: 0, totalMeasuredStepMs: 1,
    slowestSteps: [{ index: 1, elapsedMs: 1, successfulExit: true }], stepNamesPrinted: false, rawDetailsSuppressed: true, successfulGateClaimed: false },
  fullLocalGateTimeoutMs: 600000, loopbackHttpRequests: 33, localHttpServersClosed: true,
  publicPackageDownloadsPerformed: true, privateRegistryCredentialsPassed: false });
test("recorded installer defaults to zero actions and never treats execution-shaped args as a plan", () => {
  const p = recordedFreshInstallPlan(); assert.equal(p.reportFilesWritten, 0); assert.equal(p.awsCalls, 0);
  assert.throws(() => recordedFreshInstallPlan(["--execute-isolated-install"]));
});
test("one producer execution has independently readable completion and never overwrites old evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n"); let calls = 0;
    const report = await runRecordedFreshInstallProof(root, async () => { calls++; return fixture(); });
    assert.equal(calls, 1); assert.equal(report.passed, true); assert.equal(report.completed, true);
    const directory = join(root, "outputs/local-gates"), first = readdirSync(directory)[0];
    assert.deepEqual(JSON.parse(readFileSync(join(directory, first), "utf8")), report);
    await runRecordedFreshInstallProof(root, async () => fixture());
    assert.equal(readdirSync(directory).length, 2); assert.deepEqual(JSON.parse(readFileSync(join(directory, first), "utf8")), report);
  } finally { rmSync(root, { recursive: true }); }
});
test("failures and incomplete producer success never persist exception text or claim a passed install", async () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    for (const op of [async () => { throw new Error("PRIVATE_SENTINEL"); }, async () => ({ ...fixture(), freshInstallVerified: false }),
      async () => ({ ...fixture(), dependencyReuse: true }), async () => ({ ...fixture(), temporaryTreeRetained: true }),
      async () => ({ ...fixture(), awsCalls: 1 }), async () => ({ ...fixture(), publicationPerformed: true })]) {
      const report = await runRecordedFreshInstallProof(root, op); assert.equal(report.passed, false);
      assert.equal(report.independentLocalClosureRequired, true); assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
    }
  } finally { rmSync(root, { recursive: true }); }
});
test("unknown or private fields at any result depth cannot enter the durable journal", () => {
  assert.ok(safeFreshInstallResult(fixture()));
  for (const mutate of [p => { p.privatePath = "PRIVATE_SENTINEL"; }, p => { p.sourceFingerprint.path = "PRIVATE_SENTINEL"; },
    p => { p.tests.private = "PRIVATE_SENTINEL"; }, p => { p.stepTimings.rawLog = "PRIVATE_SENTINEL"; },
    p => { p.stepTimings.slowestSteps[0].path = "PRIVATE_SENTINEL"; }, p => { p.toolArchiveSha256 = "PRIVATE_SENTINEL"; },
    p => { p.sourceFingerprint.sha256 = "PRIVATE_SENTINEL"; }, p => { p.tests.total = 9; }, p => { p.fullLocalGateTimeoutMs = 900000; },
    p => { p.stepTimings.recordsValid = false; }]) {
    const p = fixture(); mutate(p); assert.equal(safeFreshInstallResult(p), null);
  }
});

test("failed gate identity and numeric diagnostics survive cleanup without becoming an install pass", async () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    const source = { files: 1, bytes: 1, sha256: "b".repeat(64) };
    const line = JSON.stringify({ mode: "local-check-step-timing", schemaVersion: 1, step: "PRIVATE SENTINEL",
      elapsedMs: 10, successfulExit: true, rawDetailsSuppressed: true });
    const failure = createFreshInstallGateFailure({ status: null, signal: "SIGKILL", error: { code: "ETIMEDOUT", message: "PRIVATE_SENTINEL" },
      stdout: line + "\nPRIVATE_SENTINEL", stderr: "PRIVATE_SENTINEL" }, 360025, source);
    source.sha256 = "c".repeat(64);
    const report = await runRecordedFreshInstallProof(root, async () => { throw failure; });
    assert.equal(report.passed, false); assert.equal(report.proof, undefined); assert.equal(report.completed, true);
    assert.equal(report.failureObservation.sourceFingerprint.sha256, "b".repeat(64));
    assert.equal(report.failureObservation.sourceObservationStage, "copied-before-gate");
    assert.equal(report.failureObservation.sourceUnchangedVerified, false);
    assert.equal(report.failureObservation.fullLocalGatePassed, false); assert.equal(report.failureObservation.timeout, true);
    assert.equal(report.failureObservation.stepTimings.measuredSteps, 1);
    assert.equal(JSON.stringify(report).includes("PRIVATE"), false);
    const path = join(root, "outputs/local-gates", readdirSync(join(root, "outputs/local-gates"))[0]);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), report);
    const detached = freshInstallFailureObservation(failure); detached.sourceFingerprint.sha256 = "d".repeat(64);
    assert.equal(freshInstallFailureObservation(failure).sourceFingerprint.sha256, "b".repeat(64));
  } finally { rmSync(root, { recursive: true }); }
});

test("forged exception fields and private fingerprint extensions cannot enter failure evidence", () => {
  for (const forged of [new Error("PRIVATE_SENTINEL"), { failureObservation: { privatePath: "PRIVATE_SENTINEL" } }, null, "PRIVATE_SENTINEL"])
    assert.equal(freshInstallFailureObservation(forged), null);
  const good = { files: 1, bytes: 1, sha256: "a".repeat(64) };
  for (const source of [{ ...good, path: "PRIVATE_SENTINEL" }, { ...good, files: 0 }, { ...good, sha256: "PRIVATE_SENTINEL" }])
    assert.throws(() => createFreshInstallGateFailure({}, 1, source), /^Error: FRESH_INSTALL_FAILURE_SCOPE_INVALID$/);
});

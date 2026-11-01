import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { syntheticRoleDraftLivePlan, reviewSyntheticDraftSourceProofs, syntheticDraftCliResponse, runSyntheticRoleDraft } from "../synthetic-role-draft-live.js";

const runId = "12345678-1234-1234-1234-123456789abc", cloneId = "12345678-1234-1234-1234-123456789def";
const now = Date.parse("2026-10-26T00:00:00.000Z"), fp = { files: 1, bytes: 1, sha256: "b".repeat(64) };
const current = () => ({ runId, mode: "current-installation-local-gate", schemaVersion: 2, completed: true, passed: true,
  sourceUnchanged: true, completedAt: new Date(now - 1000).toISOString(), awsCalls: 0, externalNetworkCalls: 0,
  httpServersClosed: true, stepTimings: { failedSteps: 0, recordsValid: true }, sourceFingerprint: fp });
const fresh = () => ({ mode: "isolated-frozen-install-build-proof", pinnedPnpm: "11.16.0", toolArchiveSha256: "a".repeat(64),
  toolArchiveIntegrityMatched: true, toolFiles: 1, sourceFingerprint: fp, lockedIdentities: 392,
  nonRegistryResolutionPresent: false, lockfileUnchanged: true, freshInstallVerified: true, fullLocalGatePassed: true,
  awsCalls: 0, cloudMutations: 0, lifecycleScriptsEnabled: false, dependencyReuse: false, existingInstallationModified: false,
  temporaryTreeRetained: false, cleanGitCloneClaimed: false, publicationPerformed: false, readyForPublication: false,
  tests: { groups: 4, total: 8, passed: 8, skipped: 0 }, installElapsedMs: 1, gateElapsedMs: 1,
  stepTimings: { observedRecords: 50, measuredSteps: 50, recordsValid: true, failedSteps: 0, totalMeasuredStepMs: 1,
    slowestSteps: [{ index: 1, elapsedMs: 1, successfulExit: true }], stepNamesPrinted: false, rawDetailsSuppressed: true, successfulGateClaimed: false },
  fullLocalGateTimeoutMs: 600000, loopbackHttpRequests: 33, localHttpServersClosed: true,
  publicPackageDownloadsPerformed: true, privateRegistryCredentialsPassed: false });
const clone = (): any => ({ mode: "recorded-local-git-snapshot-frozen-proof", runId: cloneId, completed: true, passed: true,
  completedAt: new Date(now - 1000).toISOString(), proof: {
    mode: "local-git-snapshot-frozen-proof", gitVersion: "2.53.0.windows.3", sourceFingerprint: fp,
    trackedFiles: 1, gitObjectsChecked: true, byteIdenticalClone: true, localSnapshotCloneVerified: true, frozenInstallFromCloneVerified: true,
    freshInstallProof: fresh(), sourceRepositoryModified: false, remoteRepositoryContacted: false, cloneRemoteRemoved: true,
    gitHooksAndUserConfigurationUsed: false, temporaryTreeRetained: false, publishedRepositoryCloneVerified: false, ciExecuted: false,
    awsCalls: 0, publicationPerformed: false, readyForPublication: false } });

test("draft operator defaults to no effects and exposes no execution/role permission path", () => {
  const p = syntheticRoleDraftLivePlan(); assert.equal(p.awsCalls, 0); assert.equal(p.filesWritten, 0);
  assert.equal(p.changeSetsExecuted, 0); assert.equal(p.roleCreateRequests, 0);
  assert.throws(() => syntheticRoleDraftLivePlan(["--execute"]));
  const source = readFileSync(new URL("../synthetic-role-draft-live.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /"execute-change-set"|"create-role"|"attach-role-policy"|"put-role-policy"/);
  assert.match(source, /timeout: 20000/); assert.match(source, /AWS_MAX_ATTEMPTS: "1"/);
  assert.match(source, /BootstraplessSynthesizer/);
});

test("both recent receipts must match exact source and nested fresh-install safety proof", () => {
  assert.equal(reviewSyntheticDraftSourceProofs(current(), clone(), fp, runId, cloneId, now).freshCloneVerified, true);
  for (const mutate of [
    (r: any) => { r.completed = false; }, (r: any) => { r.passed = false; },
    (r: any) => { r.runId = runId; }, (r: any) => { r.completedAt = new Date(now - 3600001).toISOString(); },
    (r: any) => { r.completedAt = new Date(now + 1).toISOString(); },
    (r: any) => { r.proof.sourceFingerprint = { ...fp, sha256: "c".repeat(64) }; },
    (r: any) => { r.proof.freshInstallProof.privateRegistryCredentialsPassed = true; },
    (r: any) => { r.proof.freshInstallProof.lifecycleScriptsEnabled = true; },
    (r: any) => { r.proof.temporaryTreeRetained = true; }, (r: any) => { r.proof.awsCalls = 1; },
  ]) { const r = clone(); mutate(r); assert.throws(() => reviewSyntheticDraftSourceProofs(current(), r, fp, runId, cloneId, now)); }
  assert.throws(() => reviewSyntheticDraftSourceProofs({ ...current(), passed: false }, clone(), fp, runId, cloneId, now));
});

test("CLI absence classification is operation-specific, errors stay private and buffers dropped", () => {
  for (const [operation, stderr] of [
    ["get-role", "An error occurred (NoSuchEntity) when calling the GetRole operation: PRIVATE_SENTINEL"],
    ["describe-change-set", "An error occurred (ChangeSetNotFound) when calling the DescribeChangeSet operation: PRIVATE_SENTINEL"],
    ["describe-stacks", "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id PRIVATE_SENTINEL does not exist"],
  ]) {
    const child = { status: 255, signal: null, stdout: "PRIVATE_SENTINEL", stderr: stderr! };
    assert.deepEqual(syntheticDraftCliResponse(operation!, child), { ok: false, code: "ABSENT" });
    assert.equal(child.stdout, ""); assert.equal(child.stderr, "");
  }
  for (const child of [
    { status: 255, signal: null, stdout: "", stderr: "An error occurred (AccessDenied) PRIVATE_SENTINEL" },
    { status: 0, signal: null, stdout: "[1]", stderr: "" }, { status: 0, signal: null, stdout: "PRIVATE_SENTINEL", stderr: "" },
    { status: 0, signal: "SIGTERM", stdout: "{}", stderr: "" },
  ]) assert.deepEqual(syntheticDraftCliResponse("describe-stacks", child), { ok: false, code: "UNVERIFIED" });
  assert.deepEqual(syntheticDraftCliResponse("describe-stacks", { status: 0, signal: null, stdout: "{\"Stacks\":[]}", stderr: "" }), { ok: true, data: { Stacks: [] } });
});

test("live preflight checks runtime before path, credentials, files or AWS", async () => {
  const original = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  try { Object.defineProperty(process.versions, "node", { ...original, value: "24.0.0" }); await assert.rejects(runSyntheticRoleDraft(), /NODE_SECURITY_BASELINE/); }
  finally { Object.defineProperty(process.versions, "node", original); }
});

test("only exact bounded DeleteStack token conflicts retain a sanitized diagnostic", () => {
  const message = "An error occurred (TokenAlreadyExists) when calling the DeleteStack operation";
  for (const stderr of [message + ": PRIVATE_SENTINEL", "aws: [ERROR]: " + message + " (reached max retries: 0): PRIVATE_SENTINEL\r\n"]) {
    const child = { status: 255, signal: null, stdout: "PRIVATE_SENTINEL", stderr };
    assert.deepEqual(syntheticDraftCliResponse("delete-stack", child), { ok: false, code: "TOKEN_CONFLICT" });
    assert.equal(child.stdout, ""); assert.equal(child.stderr, "");
  }
  for (const [operation, stderr] of [["execute-change-set", message + ": PRIVATE_SENTINEL"],
    ["delete-stack", message + " (reached max retries: 1): PRIVATE_SENTINEL"],
    ["delete-stack", "noise\n" + message + ": PRIVATE_SENTINEL"],
    ["delete-stack", message + ": " + "x".repeat(4096)],
    ["delete-stack", message.replace("DeleteStack", "DescribeStacks") + ": PRIVATE_SENTINEL"]]) {
    assert.deepEqual(syntheticDraftCliResponse(operation!, { status: 255, signal: null, stdout: "", stderr: stderr! }), { ok: false, code: "UNVERIFIED" });
  }
});

test("stack absence accepts the CLI zero-retry envelope but rejects ambiguous diagnostics", () => {
  const message = "An error occurred (ValidationError) when calling the DescribeStacks operation";
  const tail = ": Stack with id PRIVATE_SENTINEL does not exist";
  for (const stderr of [message + tail, "aws: [ERROR]: " + message + " (reached max retries: 0)" + tail + "\r\n"]) {
    const child = { status: 255, signal: null, stdout: "", stderr };
    assert.deepEqual(syntheticDraftCliResponse("describe-stacks", child), { ok: false, code: "ABSENT" });
    assert.equal(child.stderr, "");
  }
  for (const stderr of [
    message + " (reached max retries: 1)" + tail,
    message + tail + " but AccessDenied occurred",
    "AccessDenied\n" + message + tail,
    message.replace("ValidationError", "AccessDenied") + tail,
    message.replace("DescribeStacks", "DeleteStack") + tail,
    message + ": Stack with id PRIVATE_SENTINEL is unavailable",
  ]) assert.deepEqual(syntheticDraftCliResponse("describe-stacks", { status: 255, signal: null, stdout: "", stderr }), { ok: false, code: "UNVERIFIED" });
});

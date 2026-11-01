import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { freshInstallFailureObservation, freshInstallPlan, runFreshInstallProof } from "./fresh-install-proof.mjs";
import { ownedLocalGateReportDirectory } from "./local-gate-proof.mjs";
import { LOCAL_CHECK_GATE_TIMEOUT_MS } from "./local-check-step.mjs";

export function recordedFreshInstallPlan(args = []) {
  if (args.length) throw new Error("RECORDED_INSTALL_ARGUMENTS_REJECTED");
  return { ...freshInstallPlan(), durableResultOnExplicitExecution: true, reportFilesWritten: 0 };
}

export function safeFreshInstallResult(value) {
  try {
    const serialized = JSON.stringify(value); if (typeof serialized !== "string" || serialized.length > 20000) return null;
    const p = JSON.parse(serialized);
    const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v) &&
      JSON.stringify(Object.keys(v).sort()) === JSON.stringify([...keys].sort());
    const number = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
    const keys = ["mode", "pinnedPnpm", "toolArchiveSha256", "toolArchiveIntegrityMatched", "toolFiles", "sourceFingerprint",
      "lockedIdentities", "nonRegistryResolutionPresent", "lockfileUnchanged", "dependencyReuse", "freshInstallVerified",
      "lifecycleScriptsEnabled", "fullLocalGatePassed", "tests", "installElapsedMs", "gateElapsedMs", "stepTimings",
      "fullLocalGateTimeoutMs", "awsCalls", "cloudMutations", "loopbackHttpRequests", "localHttpServersClosed",
      "publicPackageDownloadsPerformed", "privateRegistryCredentialsPassed", "existingInstallationModified",
      "temporaryTreeRetained", "cleanGitCloneClaimed", "publicationPerformed", "readyForPublication"];
    if (!exact(p, keys) || p.mode !== "isolated-frozen-install-build-proof" || p.pinnedPnpm !== "11.16.0" ||
        !/^[a-f0-9]{64}$/.test(p.toolArchiveSha256) || !number(p.toolFiles, 2000) || !number(p.lockedIdentities, 1000) ||
        p.toolFiles < 1 || p.lockedIdentities < 1 || p.fullLocalGateTimeoutMs !== LOCAL_CHECK_GATE_TIMEOUT_MS || p.awsCalls !== 0 || p.cloudMutations !== 0 ||
        !number(p.installElapsedMs, 185000) || !number(p.gateElapsedMs, LOCAL_CHECK_GATE_TIMEOUT_MS + 5000) || !number(p.loopbackHttpRequests, 40) || p.loopbackHttpRequests < 1)
      return null;
    for (const key of ["toolArchiveIntegrityMatched", "lockfileUnchanged", "freshInstallVerified", "fullLocalGatePassed",
      "localHttpServersClosed", "publicPackageDownloadsPerformed"]) if (p[key] !== true) return null;
    for (const key of ["nonRegistryResolutionPresent", "dependencyReuse", "lifecycleScriptsEnabled", "privateRegistryCredentialsPassed",
      "existingInstallationModified", "temporaryTreeRetained", "cleanGitCloneClaimed", "publicationPerformed", "readyForPublication"])
      if (p[key] !== false) return null;
    const f = p.sourceFingerprint, t = p.tests, s = p.stepTimings;
    if (!exact(f, ["files", "bytes", "sha256"]) || !number(f.files, 2000) || f.files < 1 || !number(f.bytes, 64000000) ||
        !/^[a-f0-9]{64}$/.test(f.sha256) || !exact(t, ["groups", "total", "passed", "skipped"]) || t.groups !== 4 ||
        !number(t.total, 10000) || t.total < 1 || !number(t.passed, 10000) || !number(t.skipped, 10000) || t.total !== t.passed + t.skipped ||
        !exact(s, ["observedRecords", "measuredSteps", "recordsValid", "failedSteps", "totalMeasuredStepMs", "slowestSteps",
          "stepNamesPrinted", "rawDetailsSuppressed", "successfulGateClaimed"]) || !number(s.measuredSteps, 100) || s.measuredSteps < 50 ||
        s.observedRecords !== s.measuredSteps || s.recordsValid !== true || s.failedSteps !== 0 || !number(s.totalMeasuredStepMs, LOCAL_CHECK_GATE_TIMEOUT_MS) ||
        s.stepNamesPrinted !== false || s.rawDetailsSuppressed !== true || s.successfulGateClaimed !== false ||
        !Array.isArray(s.slowestSteps) || s.slowestSteps.length > 10) return null;
    if (s.slowestSteps.some(row => !exact(row, ["index", "elapsedMs", "successfulExit"]) || !number(row.index, s.measuredSteps) || row.index < 1 ||
      !number(row.elapsedMs, LOCAL_CHECK_GATE_TIMEOUT_MS) || row.successfulExit !== true)) return null;
    return p;
  } catch { return null; }
}

/** The producer returns fixed public facts, never raw logs/paths/credentials.
 * Keep them on disk after its finally-cleanup, independently of tool delivery.
 * A killed outer process leaves only completed:false and cannot prove a pass. */
export async function runRecordedFreshInstallProof(root = process.cwd(), operation = runFreshInstallProof) {
  const directory = ownedLocalGateReportDirectory(root), runId = randomUUID(), path = join(directory, `fresh-${runId}.json`);
  const initial = { mode: "recorded-isolated-frozen-install", runId, completed: false, passed: false,
    startedAt: new Date().toISOString(), rawDetailsSuppressed: true, independentLocalClosureRequired: true };
  writeFileSync(path, JSON.stringify(initial) + "\n", { flag: "wx" });
  let result, error = null, failureObservation = null;
  try {
    result = safeFreshInstallResult(await operation());
    if (result === null) throw new Error("PRODUCER_RESULT_INCOMPLETE");
  } catch (cause) {
    result = null; error = "RECORDED_FRESH_INSTALL_INCOMPLETE";
    failureObservation = freshInstallFailureObservation(cause);
  }
  const packet = { ...initial, completed: true, completedAt: new Date().toISOString(), passed: result !== null,
    // Only the reviewed producer's success result is nested. Exception/log text
    // is never recorded; incomplete cleanup still requires independent checks.
    ...(result ? { proof: result } : { error, ...(failureObservation ? { failureObservation } : {}) }) };
  if (ownedLocalGateReportDirectory(root) !== directory || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() ||
      realpathSync(path) !== path || readFileSync(path, "utf8") !== JSON.stringify(initial) + "\n")
    throw new Error("RECORDED_INSTALL_REPORT_OWNER_CHANGED");
  writeFileSync(path, JSON.stringify(packet) + "\n"); return packet;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(recordedFreshInstallPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-isolated-install") throw new Error("RECORDED_INSTALL_ARGUMENTS_REJECTED");
      const packet = await runRecordedFreshInstallProof(); console.log(JSON.stringify(packet)); if (!packet.passed) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "RECORDED_FRESH_INSTALL_INCOMPLETE", rawDetailsSuppressed: true,
    independentLocalClosureRequired: true })); process.exitCode = 1; }
}

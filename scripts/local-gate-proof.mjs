import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment, fingerprintCurrentSource, LOCAL_GATE_TIMEOUT_MS, summarizeLocalGateTests } from "./clean-source-build-proof.mjs";
import { summarizeLocalCheckTimings } from "./local-check-step.mjs";
import { summarizeLocalTestFailures } from "./local-test-failure-summary.mjs";

export function localGatePlan(args = []) {
  if (args.length) throw new Error("LOCAL_GATE_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, externalNetworkCalls: 0, subprocessesStarted: 0,
    fullGateTimeoutMs: LOCAL_GATE_TIMEOUT_MS, freshInstallVerified: false,
    currentSourceBoundaryRequired: true, sourceCopied: false,
    deploymentAuthorized: false, publicationPerformed: false };
}

/** Never write raw child logs, arguments, environment, paths or exception text. */
export function summarizeCurrentInstallationGate(result, elapsedMs, expectedStepNames, sourceBoundary) {
  const validFingerprint = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "bytes,files,sha256" &&
    Number.isSafeInteger(value.files) && value.files >= 1 && value.files <= 2_000 &&
    Number.isSafeInteger(value.bytes) && value.bytes >= 1 && value.bytes <= 64_000_000 && /^[a-f0-9]{64}$/.test(value.sha256 ?? "");
  const validBoundary = sourceBoundary && Object.keys(sourceBoundary).sort().join(",") === "after,before" &&
    validFingerprint(sourceBoundary.before) && validFingerprint(sourceBoundary.after);
  const sourceUnchanged = validBoundary === true && ["files", "bytes", "sha256"].every(key => sourceBoundary.before[key] === sourceBoundary.after[key]);
  const packet = { mode: "current-installation-local-gate", schemaVersion: 2, passed: false,
    sourceUnchanged, sourceFingerprint: validBoundary ? { ...sourceBoundary.before } : null,
    immutableSnapshotClaimed: false, dependencyBytesVerified: false,
    elapsedMs: Number.isSafeInteger(elapsedMs) && elapsedMs >= 0 && elapsedMs <= LOCAL_GATE_TIMEOUT_MS + 5000 ? elapsedMs : null,
    timeout: result?.error?.code === "ETIMEDOUT", bufferLimit: result?.error?.code === "ENOBUFS",
    stepTimings: summarizeLocalCheckTimings(typeof result?.stdout === "string" ? result.stdout : ""),
    freshInstallVerified: false, cleanGitCloneClaimed: false, deploymentAuthorized: false,
    publicationPerformed: false, rawDetailsSuppressed: true, independentLocalClosureRequired: true };
  try {
    if (!sourceUnchanged || result?.status !== 0 || result.signal !== null || result.error || packet.elapsedMs === null ||
        !Array.isArray(expectedStepNames) || expectedStepNames.length < 1 || expectedStepNames.length > 100 ||
        expectedStepNames.some(name => typeof name !== "string" || !/^[A-Za-z0-9 ()/;-]{1,160}$/.test(name)) ||
        !packet.stepTimings.recordsValid || packet.stepTimings.measuredSteps !== expectedStepNames.length || packet.stepTimings.failedSteps !== 0)
      return packet;
    const timingLines = result.stdout.split(/\r?\n/).filter(line => line.startsWith('{"mode":"local-check-step-timing",'));
    if (timingLines.some((line, i) => JSON.parse(line).step !== expectedStepNames[i])) return packet;
    const tests = summarizeLocalGateTests(result.stdout);
    const lines = result.stdout.split(/\r?\n/).filter(line => line.startsWith('{"mode":"local-http-safety-proof",'));
    if (lines.length !== 1) return packet;
    const h = JSON.parse(lines[0]);
    if (h.awsCalls !== 0 || h.externalNetworkCalls !== 0 || h.serversClosed !== true || h.temporaryFixtureRetained !== false ||
        h.publicationPerformed !== false || h.developmentAndPreviewPassed !== true || h.exactNoticeBytesMatched !== true ||
        h.fixturePreviewSecurityHeadersMatched !== true || h.developmentHmrPolicyUnchanged !== true || h.remoteTlsOrHostingVerified !== false ||
        h.privateSentinelReturned !== false || !Number.isSafeInteger(h.loopbackHttpRequests) || h.loopbackHttpRequests < 1 || h.loopbackHttpRequests > 40)
      return packet;
    return { ...packet, passed: true, tests, awsCalls: 0, externalNetworkCalls: 0,
      loopbackHttpRequests: h.loopbackHttpRequests, httpServersClosed: true, httpFixtureRetained: false };
  } catch { return packet; }
}

export function ownedLocalGateReportDirectory(root) {
  const base = resolve(root);
  if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink() || realpathSync(base) !== base ||
      !/^outputs\/$/m.test(readFileSync(join(base, ".gitignore"), "utf8"))) throw new Error("LOCAL_GATE_REPORT_SCOPE_INVALID");
  let current = base;
  for (const name of ["outputs", "local-gates"]) {
    current = join(current, name);
    if (!existsSync(current)) mkdirSync(current);
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink() || realpathSync(current) !== current)
      throw new Error("LOCAL_GATE_REPORT_SCOPE_INVALID");
  }
  return current;
}

export function runCurrentInstallationGate(root = process.cwd()) {
  const base = resolve(root), before = fingerprintCurrentSource(base), directory = ownedLocalGateReportDirectory(base), runId = randomUUID();
  const report = join(directory, `${runId}.json`);
  const gateSource = readFileSync(join(base, "scripts/check-all.mjs"), "utf8");
  const expectedStepNames = [...gateSource.matchAll(/\n\s+name: "([^"]+)"/g)].map(match => match[1]);
  const startedAt = new Date().toISOString();
  const started = { mode: "current-installation-local-gate", schemaVersion: 2, runId, startedAt, sourceFingerprint: before,
    completed: false, passed: false, independentLocalClosureRequired: true, rawDetailsSuppressed: true };
  // Unique, exclusively created output never overwrites an earlier run. A killed
  // outer process leaves completed:false, which must never count as a pass.
  writeFileSync(report, JSON.stringify(started) + "\n", { flag: "wx" });
  const begin = Date.now(); let result;
  try {
    result = spawnSync(process.execPath, [join(base, "scripts/check-all.mjs")], { cwd: base,
      env: cleanSourceChildEnvironment(process.env), encoding: "utf8", windowsHide: true,
      timeout: LOCAL_GATE_TIMEOUT_MS, maxBuffer: 2_000_000 });
  } catch { result = {}; }
  const elapsed = Date.now() - begin; let after = null;
  try { after = fingerprintCurrentSource(base); } catch { /* Changed/unreadable source cannot be a pass. */ }
  const packet = { ...summarizeCurrentInstallationGate(result, elapsed, expectedStepNames, { before, after }),
    runId, startedAt, completedAt: new Date().toISOString(), completed: true };
  // Keep future intermittent failures diagnosable without persisting raw child
  // logs. This never changes passed:false or grants a retry/deployment permit.
  if (!packet.passed) packet.failureDiagnostics = summarizeLocalTestFailures(result?.stdout);
  if (ownedLocalGateReportDirectory(base) !== directory || !lstatSync(report).isFile() || lstatSync(report).isSymbolicLink() ||
      realpathSync(report) !== report || readFileSync(report, "utf8") !== JSON.stringify(started) + "\n")
    throw new Error("LOCAL_GATE_REPORT_OWNER_CHANGED");
  // A partial write cannot be valid JSON. Fresh filesystem reads remain required.
  writeFileSync(report, JSON.stringify(packet) + "\n");
  return packet;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localGatePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local") throw new Error("LOCAL_GATE_ARGUMENTS_REJECTED");
      const result = runCurrentInstallationGate(); console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
    }
  } catch { console.error(JSON.stringify({ error: "LOCAL_GATE_PROOF_INCOMPLETE", rawDetailsSuppressed: true,
    independentLocalClosureRequired: true })); process.exitCode = 1; }
}

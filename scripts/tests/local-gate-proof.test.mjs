import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localGatePlan, ownedLocalGateReportDirectory, summarizeCurrentInstallationGate as summarizeSourceGate } from "../local-gate-proof.mjs";
import { LOCAL_CHECK_GATE_TIMEOUT_MS } from "../local-check-step.mjs";

const fingerprint = () => ({ files: 1, bytes: 1, sha256: "a".repeat(64) });
const sourceBoundary = () => ({ before: fingerprint(), after: fingerprint() });
const summarizeCurrentInstallationGate = (result, elapsed, expected, boundary = sourceBoundary()) => summarizeSourceGate(result, elapsed, expected, boundary);

const names = ["one", "two"];
const timing = step => JSON.stringify({ mode: "local-check-step-timing", schemaVersion: 1,
  step, elapsedMs: 1, successfulExit: true, rawDetailsSuppressed: true });
const summary = "# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0";
const http = { mode: "local-http-safety-proof", awsCalls: 0, externalNetworkCalls: 0, serversClosed: true,
  temporaryFixtureRetained: false, publicationPerformed: false, developmentAndPreviewPassed: true,
  exactNoticeBytesMatched: true, privateSentinelReturned: false, loopbackHttpRequests: 33,
  fixturePreviewSecurityHeadersMatched:true,developmentHmrPolicyUnchanged:true,remoteTlsOrHostingVerified:false };
const output = (steps = names, h = http) => [...steps.map(timing), ...Array(4).fill(summary), JSON.stringify(h), "PRIVATE_SENTINEL"].join("\n");
const result = stdout => ({ status: 0, signal: null, stdout, stderr: "PRIVATE_SENTINEL" });

test("default is zero-action plan and rejects execution-shaped arguments", () => {
  assert.equal(localGatePlan().subprocessesStarted, 0); assert.equal(localGatePlan().awsCalls, 0);
  assert.equal(localGatePlan().deploymentAuthorized, false);
  assert.throws(() => localGatePlan(["--execute-local"]), /^Error: LOCAL_GATE_ARGUMENTS_REJECTED$/);
});
test("complete result requires all ordered steps, all four groups and closed safe HTTP", () => {
  const report = summarizeCurrentInstallationGate(result(output()), 50, names);
  assert.equal(report.passed, true); assert.deepEqual(report.tests, { groups: 4, total: 8, passed: 8, skipped: 0 });
  assert.equal(report.httpServersClosed, true); assert.equal(report.freshInstallVerified, false);
  assert.equal(report.deploymentAuthorized, false); assert.equal(report.independentLocalClosureRequired, true);
  assert.equal(report.schemaVersion, 2); assert.equal(report.sourceUnchanged, true);
  assert.deepEqual(report.sourceFingerprint, fingerprint()); assert.equal(report.immutableSnapshotClaimed, false);
  assert.equal(report.dependencyBytesVerified, false);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
});

test("unverified, changed or private source boundary evidence cannot make a successful-looking gate pass", () => {
  assert.equal(summarizeSourceGate(result(output()), 50, names).passed, false);
  for (const mutate of [s => { s.after = null; }, s => { s.before = null; }, s => { s.after.files++; },
    s => { s.after.bytes++; }, s => { s.after.sha256 = "b".repeat(64); },
    s => { s.before.path = "PRIVATE_SENTINEL"; }, s => { s.extra = "PRIVATE_SENTINEL"; },
    s => { s.before.bytes = 64000001; }, s => { s.before.files = 2001; }, s => { s.after.sha256 = "PRIVATE_SENTINEL"; }]) {
    const boundary = sourceBoundary(); mutate(boundary);
    const report = summarizeSourceGate(result(output()), 50, names, boundary);
    assert.equal(report.passed, false); assert.equal(report.sourceUnchanged, false);
    assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  }
});
test("a missing, duplicate, reordered or failed timing step cannot pass", () => {
  for (const steps of [["one"], ["one", "one"], ["two", "one"]])
    assert.equal(summarizeCurrentInstallationGate(result(output(steps)), 50, names).passed, false);
  const failed = output().replace('"successfulExit":true', '"successfulExit":false');
  assert.equal(summarizeCurrentInstallationGate(result(failed), 50, names).passed, false);
});
test("timeout, failed exit, signals, buffer overflow and invalid clocks never inherit successful-looking output", () => {
  for (const extra of [{ status: 1 }, { signal: "SIGTERM" }, { error: { code: "ETIMEDOUT", message: "PRIVATE_SENTINEL" } },
    { error: { code: "ENOBUFS" } }]) {
    const report = summarizeCurrentInstallationGate({ ...result(output()), ...extra }, 50, names);
    assert.equal(report.passed, false); assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  }
  for (const elapsed of [NaN, -1, LOCAL_CHECK_GATE_TIMEOUT_MS + 5001])
    assert.equal(summarizeCurrentInstallationGate(result(output()), elapsed, names).passed, false);
  // The wrapper allows five seconds of termination/receipt overhead, not a
  // second execution budget. Keep both sides tied to the shared finite limit.
  assert.equal(summarizeCurrentInstallationGate(result(output()), LOCAL_CHECK_GATE_TIMEOUT_MS + 5000, names).passed, true);
});
test("unsafe, missing or repeated HTTP evidence remains incomplete", () => {
  for (const field of ["serversClosed", "exactNoticeBytesMatched", "developmentAndPreviewPassed","fixturePreviewSecurityHeadersMatched","developmentHmrPolicyUnchanged"])
    for(const value of [false,undefined,"true",1])
      assert.equal(summarizeCurrentInstallationGate(result(output(names, { ...http, [field]: value })), 50, names).passed, false);
  for (const extra of [{ awsCalls: 1 }, { externalNetworkCalls: 1 }, { privateSentinelReturned: true },
    { temporaryFixtureRetained: true }, { publicationPerformed: true }, { loopbackHttpRequests: 41 },{remoteTlsOrHostingVerified:true},{remoteTlsOrHostingVerified:undefined}])
    assert.equal(summarizeCurrentInstallationGate(result(output(names, { ...http, ...extra })), 50, names).passed, false);
  assert.equal(summarizeCurrentInstallationGate(result(output() + "\n" + JSON.stringify(http)), 50, names).passed, false);
  assert.equal(summarizeCurrentInstallationGate(result(output(names, { mode: "not-http" })), 50, names).passed, false);
});
test("missing or failed test groups cannot be masked by a zero child exit", () => {
  for (const text of [output().replace(summary, ""), output().replace("# fail 0", "# fail 1")])
    assert.equal(summarizeCurrentInstallationGate(result(text), 50, names).passed, false);
});
test("report location is fixed, physical and explicitly ignored; old evidence stays untouched", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    const directory = ownedLocalGateReportDirectory(root);
    assert.equal(directory, join(root, "outputs/local-gates"));
    writeFileSync(join(directory, "prior.json"), "PRIVATE_SENTINEL");
    assert.equal(ownedLocalGateReportDirectory(root), directory);
    assert.deepEqual(readdirSync(directory), ["prior.json"]);
    assert.equal(readFileSync(join(directory, "prior.json"), "utf8"), "PRIVATE_SENTINEL");
    writeFileSync(join(root, ".gitignore"), "outputs-does-not-match/\n");
    assert.throws(() => ownedLocalGateReportDirectory(root), /^Error: LOCAL_GATE_REPORT_SCOPE_INVALID$/);
  } finally { rmSync(root, { recursive: true }); }
});
test("a redirected output directory is refused before any report write", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-local-gate-tests-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n"); mkdirSync(join(root, "foreign"));
    symlinkSync(join(root, "foreign"), join(root, "outputs"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => ownedLocalGateReportDirectory(root), /^Error: LOCAL_GATE_REPORT_SCOPE_INVALID$/);
    assert.deepEqual(readdirSync(join(root, "foreign")), []);
  } finally { rmSync(root, { recursive: true }); }
});

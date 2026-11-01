import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localSafeStopInventoryPlan, summarizeLocalSafeStopSnapshot, localSafeStopChildEnvironment,
  validateLocalSafeStopChild, parseLocalSafeStopArguments, LOCAL_SAFE_STOP_SCRIPT_SHA256, LOCAL_SAFE_STOP_TIMEOUT_MS } from "../local-safe-stop-inventory.mjs";

const residues = ["dockerProcesses", "awsCliProcesses", "projectHelperProcesses", "unattributedHelperProcesses", "scopedListeners",
  "ownedTempDirectories", "backendStagingDirectories", "frontendWorkDirectories", "loginCacheJsonFiles", "dockerActiveSocketDirectories"];
const stamp = "2026-10-18T07:00:00.0000000+00:00", time = Date.parse(stamp);
const snapshot = () => ({ mode: "windows-local-safe-stop-snapshot", schemaVersion: 1, observedAtUtc: stamp,
  processInventoryComplete: true, networkInventoryComplete: true, filesystemInventoryComplete: true, authCacheInventoryComplete: true,
  counts: Object.fromEntries([...residues, "assistantProcessesExcluded", "retainedReviewDirectories", "emptyWorkDirectoriesRetained"].map(key => [key, 0])) });

test("default/import plan cannot start diagnostics or authorize recovery/cloud/publication", () => {
  const plan = localSafeStopInventoryPlan();
  for (const key of ["subprocessesStarted", "filesRead", "awsCalls", "externalNetworkCalls", "processStops", "filesDeleted"]) assert.equal(plan[key], 0);
  for (const key of ["inventoryVerified", "localClosureVerified", "settingsChanged", "cloudSafetyVerified", "allCredentialsRevoked", "releaseAuthorized", "publicationPerformed"]) assert.equal(plan[key], false);
  assert.throws(() => localSafeStopInventoryPlan(["execute"]), /UNVERIFIED/);
});

test("complete zero observations retain the explicit scope/exclusion and non-authorizing fields", () => {
  const raw = snapshot(); raw.counts.assistantProcessesExcluded = 2; raw.counts.retainedReviewDirectories = 3;
  raw.counts.emptyWorkDirectoriesRetained = 1;
  const result = summarizeLocalSafeStopSnapshot(raw);
  assert.equal(result.inventoryVerified, true); assert.equal(result.localClosureVerified, true);
  assert.equal(result.counts.assistantProcessesExcluded, 2); assert.equal(result.counts.retainedReviewDirectories, 3);
  assert.equal(result.counts.emptyWorkDirectoriesRetained, 1);
  for (const key of ["cloudSafetyVerified", "allCredentialsRevoked", "releaseAuthorized", "publicationPerformed", "settingsChanged"]) assert.equal(result[key], false);
  assert.equal(result.awsCalls, 0); assert.equal(result.externalNetworkCalls, 0);
});

test("each real residue prevents a zero-residue claim without stopping/deleting anything", () => {
  for (const key of residues) {
    const raw = snapshot(); raw.counts[key] = 1;
    const result = summarizeLocalSafeStopSnapshot(raw);
    assert.equal(result.localClosureVerified, false, key);
    assert.equal(result.processStops, 0); assert.equal(result.filesDeleted, 0);
  }
});

test("unavailable or truthy completeness is not silently converted to an empty inventory", () => {
  for (const key of ["processInventoryComplete", "networkInventoryComplete", "filesystemInventoryComplete", "authCacheInventoryComplete"]) {
    for (const value of [false, undefined, null, 1, "true"]) {
      const raw = snapshot(); raw[key] = value;
      assert.throws(() => summarizeLocalSafeStopSnapshot(raw), /UNVERIFIED/);
    }
  }
});

test("missing, ambiguous, oversized and private fields cannot enter a sanitized summary", () => {
  for (const change of [raw => { delete raw.counts.scopedListeners; }, raw => { raw.counts.extra = 0; },
    raw => { raw.rawPath = "PRIVATE_SYNTHETIC_PATH"; }, raw => { raw.counts.scopedListeners = "0"; },
    raw => { raw.counts.scopedListeners = -1; }, raw => { raw.counts.scopedListeners = 0.5; },
    raw => { raw.counts.scopedListeners = 10001; }, raw => { raw.counts.scopedListeners = Number.NaN; },
    raw => { raw.schemaVersion = 2; }, raw => { raw.observedAtUtc = "invalid"; }]) {
    const raw = snapshot(); change(raw);
    assert.throws(() => summarizeLocalSafeStopSnapshot(raw), { message: "LOCAL_SAFE_STOP_INVENTORY_UNVERIFIED" });
  }
});

const environment = { SystemRoot: "C:\\Windows", USERPROFILE: "C:\\Users\\synthetic", LOCALAPPDATA: "C:\\Users\\synthetic\\AppData\\Local",
  TEMP: "C:\\Temp", TMP: "C:\\Temp", AWS_ACCESS_KEY_ID: "PRIVATE_SYNTHETIC", AWS_PROFILE: "other-profile", NODE_OPTIONS: "--inspect",
  GITHUB_TOKEN: "PRIVATE_SYNTHETIC", HTTP_PROXY: "PRIVATE_SYNTHETIC", PSModulePath: "C:\\untrusted", PATH: "C:\\untrusted" };

test("the diagnostic receives only fixed OS bootstrap and its exact scope, never credentials or overrides", () => {
  const env = localSafeStopChildEnvironment(environment, "C:\\project with 'quote", 63732, 1234);
  assert.deepEqual(Object.keys(env).sort(), ["SystemRoot", "USERPROFILE", "LOCALAPPDATA", "TEMP", "TMP", "WINDIR", "ComSpec", "PATH",
    "PSModulePath", "GMAI_INVENTORY_ROOT", "GMAI_INVENTORY_PID", "GMAI_INVENTORY_CALLBACK_PORT"].sort());
  assert.equal(env.GMAI_INVENTORY_ROOT, "C:\\project with 'quote");
  assert.equal(env.GMAI_INVENTORY_CALLBACK_PORT, "63732");
  assert.equal(env.PSModulePath, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules");
  assert.doesNotMatch(JSON.stringify(env), /PRIVATE_SYNTHETIC|untrusted|--inspect|other-profile/);
});

test("invalid paths/ports/PIDs cannot widen or inject the child environment", () => {
  for (const [env, root, port, pid] of [[{ ...environment, SystemRoot: "C:\\other" }, "C:\\project", 0, 123],
    [{ ...environment, TEMP: "relative" }, "C:\\project", 0, 123], [environment, "bad\nroot", 0, 123],
    [environment, "C:\\project", 80, 123], [environment, "C:\\project", 65536, 123], [environment, "C:\\project", 0, 0]])
    assert.throws(() => localSafeStopChildEnvironment(env, root, port, pid), /UNVERIFIED/);
});

test("only explicit read-only CLI input and at most one bounded callback port are accepted", () => {
  assert.deepEqual(parseLocalSafeStopArguments([]), { execute: false, callbackPort: 0 });
  assert.deepEqual(parseLocalSafeStopArguments(["--execute-local-read-only"]), { execute: true, callbackPort: 0 });
  assert.deepEqual(parseLocalSafeStopArguments(["--execute-local-read-only", "--callback-port", "63732"]), { execute: true, callbackPort: 63732 });
  for (const args of [["--execute"], ["--callback-port", "63732"], ["--execute-local-read-only", "--callback-port", "80"],
    ["--execute-local-read-only", "--callback-port", "65536"], ["--execute-local-read-only", "--callback-port", "1e4"],
    ["--execute-local-read-only", "--callback-port", "63732", "--delete"], ["--execute-local-read-only", "--root", "elsewhere"]])
    assert.throws(() => parseLocalSafeStopArguments(args), /UNVERIFIED/);
});

test("fresh successful child result is required; stale/failed/partial/raw output stays unknown", () => {
  const child = { status: 0, signal: null, stdout: JSON.stringify(snapshot()) };
  assert.equal(validateLocalSafeStopChild(child, time - 1, time + 1).localClosureVerified, true);
  for (const broken of [{ ...child, status: 1 }, { ...child, signal: "SIGTERM" }, { ...child, error: new Error("PRIVATE_SYNTHETIC") },
    { ...child, stdout: "PRIVATE_SYNTHETIC" }, { ...child, stdout: "x".repeat(16001) }, { ...child, stdout: "{}" }])
    assert.throws(() => validateLocalSafeStopChild(broken, time - 1, time + 1), { message: "LOCAL_SAFE_STOP_INVENTORY_UNVERIFIED" });
  for (const [start, finish] of [[time + 1, time + 2], [time - 2, time - 1], [time, time - 1], [time - 22000, time], [Number.NaN, time]])
    assert.throws(() => validateLocalSafeStopChild(child, start, finish), /UNVERIFIED/);
});

test("the reviewed PowerShell is hash-pinned, read-only and non-recursive", () => {
  const source = readFileSync(new URL("../local-safe-stop-snapshot.ps1", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(source).digest("hex"), LOCAL_SAFE_STOP_SCRIPT_SHA256);
  assert.doesNotMatch(source, /\b(?:Remove-Item|Move-Item|Stop-Process|Start-Process|Set-Item|Set-Content|Invoke-WebRequest|Invoke-Expression)\b|\s-Recurse\b/i);
  for (const query of ["Get-CimInstance Win32_Process", "Get-NetTCPConnection -State Listen", "Get-ChildItem -LiteralPath", "ReparsePoint"])
    assert.ok(source.includes(query));
  assert.ok(source.includes("LOCAL_SAFE_STOP_SNAPSHOT_UNAVAILABLE"));
  assert.equal(LOCAL_SAFE_STOP_TIMEOUT_MS, 20_000);
});

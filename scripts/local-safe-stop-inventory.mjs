import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LOCAL_SAFE_STOP_SCRIPT_SHA256 = "edec0fe31d6800c9a158d172863f6e18b4a9b8a1ed445f7a026a5073f87630bd";
export const LOCAL_SAFE_STOP_TIMEOUT_MS = 20_000;
const RESIDUES = Object.freeze(["dockerProcesses", "awsCliProcesses", "projectHelperProcesses", "unattributedHelperProcesses",
  "scopedListeners", "ownedTempDirectories", "backendStagingDirectories", "frontendWorkDirectories",
  "loginCacheJsonFiles", "dockerActiveSocketDirectories"]);
const EXCLUSIONS = ["assistantProcessesExcluded", "retainedReviewDirectories", "emptyWorkDirectoriesRetained"];
const COMPLETE = ["processInventoryComplete", "networkInventoryComplete", "filesystemInventoryComplete", "authCacheInventoryComplete"];
const fail = () => { throw new Error("LOCAL_SAFE_STOP_INVENTORY_UNVERIFIED"); };
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const noEffects = () => ({ awsCalls: 0, externalNetworkCalls: 0, processStops: 0, filesDeleted: 0, settingsChanged: false,
  cloudSafetyVerified: false, allCredentialsRevoked: false, releaseAuthorized: false, publicationPerformed: false });

export function localSafeStopInventoryPlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", operation: "local-safe-stop-inventory", subprocessesStarted: 0, filesRead: 0,
    inventoryVerified: false, localClosureVerified: false, ...noEffects() };
}

export function summarizeLocalSafeStopSnapshot(snapshot) {
  if (!exact(snapshot, ["mode", "schemaVersion", "observedAtUtc", ...COMPLETE, "counts"]) ||
      snapshot.mode !== "windows-local-safe-stop-snapshot" || snapshot.schemaVersion !== 1 ||
      typeof snapshot.observedAtUtc !== "string" ||
      !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{7}\+00:00$/.test(snapshot.observedAtUtc) ||
      !Number.isFinite(Date.parse(snapshot.observedAtUtc)) || COMPLETE.some(key => snapshot[key] !== true) ||
      !exact(snapshot.counts, [...RESIDUES, ...EXCLUSIONS]) ||
      Object.values(snapshot.counts).some(value => !Number.isSafeInteger(value) || value < 0 || value > 10000)) fail();
  return { mode: "local-safe-stop-inventory", schemaVersion: 1, observedAtUtc: snapshot.observedAtUtc,
    inventoryVerified: true, localClosureVerified: RESIDUES.every(key => snapshot.counts[key] === 0),
    counts: { ...snapshot.counts }, privateDetailsSuppressed: true, ...noEffects() };
}

export function localSafeStopChildEnvironment(input, root, callbackPort, selfPid) {
  if (typeof root !== "string" || !root || root.length > 4096 || /[\0\r\n]/.test(root) ||
      !Number.isSafeInteger(selfPid) || selfPid <= 0 || !Number.isSafeInteger(callbackPort) ||
      callbackPort !== 0 && (callbackPort < 1024 || callbackPort > 65535)) fail();
  const env = {};
  for (const name of ["SystemRoot", "USERPROFILE", "LOCALAPPDATA", "TEMP", "TMP"]) {
    const key = Object.keys(input).find(key => key.toUpperCase() === name.toUpperCase());
    const value = key === undefined ? undefined : input[key];
    if (typeof value !== "string" || !win32.isAbsolute(value) || value.length > 4096 || /[\0\r\n]/.test(value)) fail();
    env[name] = value;
  }
  if (!/^[A-Za-z]:\\Windows$/i.test(env.SystemRoot)) fail();
  const system32 = win32.join(env.SystemRoot, "System32"), powershell = win32.join(system32, "WindowsPowerShell", "v1.0");
  return { ...env, WINDIR: env.SystemRoot, ComSpec: win32.join(system32, "cmd.exe"), PATH: `${system32};${powershell}`,
    PSModulePath: win32.join(powershell, "Modules"), GMAI_INVENTORY_ROOT: root,
    GMAI_INVENTORY_PID: String(selfPid), GMAI_INVENTORY_CALLBACK_PORT: String(callbackPort) };
}

export function validateLocalSafeStopChild(result, startedAtMs, finishedAtMs) {
  if (result?.status !== 0 || result.signal !== null || result.error || typeof result.stdout !== "string" ||
      Buffer.byteLength(result.stdout, "utf8") > 16000) fail();
  let snapshot;
  try { snapshot = JSON.parse(result.stdout); } catch { fail(); }
  const packet = summarizeLocalSafeStopSnapshot(snapshot), observed = Date.parse(packet.observedAtUtc);
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0 || !Number.isSafeInteger(finishedAtMs) ||
      finishedAtMs < startedAtMs || finishedAtMs - startedAtMs > LOCAL_SAFE_STOP_TIMEOUT_MS + 1000 ||
      observed < startedAtMs || observed > finishedAtMs) fail();
  return packet;
}

/** Read-only diagnostics. No stop/delete/recovery, AWS call or credential read.
 * Failure/unknown is not zero, and a local observation never clears cloud gates. */
export function runLocalSafeStopInventory(callbackPort = 0) {
  if (process.platform !== "win32") fail();
  const root = resolve(process.cwd()), script = join(root, "scripts", "local-safe-stop-snapshot.ps1");
  if (dirname(fileURLToPath(import.meta.url)) !== join(root, "scripts") || realpathSync(root) !== root ||
      !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink() ||
      !lstatSync(script).isFile() || lstatSync(script).isSymbolicLink() || realpathSync(script) !== script || lstatSync(script).size > 16000) fail();
  const source = readFileSync(script, "utf8"), sourceSha256 = createHash("sha256").update(source).digest("hex");
  if (sourceSha256 !== LOCAL_SAFE_STOP_SCRIPT_SHA256) fail();
  const env = localSafeStopChildEnvironment(process.env, root, callbackPort, process.pid);
  const host = win32.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!lstatSync(host).isFile() || lstatSync(host).isSymbolicLink() || realpathSync(host) !== host) fail();
  const startedAtMs = Date.now();
  const result = spawnSync(host, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `& {\n${source}\n}`], {
    env, encoding: "utf8", windowsHide: true, timeout: LOCAL_SAFE_STOP_TIMEOUT_MS, maxBuffer: 16000,
  });
  return { ...validateLocalSafeStopChild(result, startedAtMs, Date.now()), sourceSha256, executionPolicyChanged: false };
}

export function parseLocalSafeStopArguments(args) {
  if (args.length === 0) return { execute: false, callbackPort: 0 };
  if (args[0] !== "--execute-local-read-only" || ![1, 3].includes(args.length)) fail();
  let callbackPort = 0;
  if (args.length === 3) {
    if (args[1] !== "--callback-port" || !/^[1-9][0-9]{3,4}$/.test(args[2])) fail();
    callbackPort = Number(args[2]);
    if (callbackPort < 1024 || callbackPort > 65535) fail();
  }
  return { execute: true, callbackPort };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseLocalSafeStopArguments(process.argv.slice(2));
    const packet = options.execute ? runLocalSafeStopInventory(options.callbackPort) : localSafeStopInventoryPlan();
    console.log(JSON.stringify(packet));
    if (options.execute && !packet.localClosureVerified) process.exitCode = 1;
  } catch { console.error(JSON.stringify({ error: "LOCAL_SAFE_STOP_INVENTORY_UNVERIFIED", privateDetailsSuppressed: true,
    noDestructiveFallback: true, ...noEffects() })); process.exitCode = 1; }
}

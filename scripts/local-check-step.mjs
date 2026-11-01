import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

/** Use the same Node executable/tsx registration already used by test runners.
 * Keep the exact entrypoint, arguments, cwd, environment and check order. Only
 * the redundant tsx CLI launcher process is removed; nothing is cached/skipped. */
export function directTypeScriptCheckStep(step, root) {
  if (typeof root !== "string" || !isAbsolute(root) || root.includes("\0")) throw new Error("LOCAL_CHECK_ROOT_INVALID");
  const base = resolve(root);
  if (step?.args?.[0] !== resolve(base, "node_modules/tsx/dist/cli.mjs")) return step;
  const entry = step.args[1], offset = typeof entry === "string" ? relative(base, entry) : "";
  if (step.cwd !== base || typeof entry !== "string" || !isAbsolute(entry) || !entry.endsWith(".ts") || !offset ||
      offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset) ||
      step.args.some(arg => typeof arg !== "string" || arg.includes("\0"))) throw new Error("LOCAL_CHECK_TS_ENTRY_INVALID");
  return { ...step, args: ["--import", "tsx", ...step.args.slice(1)] };
}

// 2026-10-29: current 90-step gate took 433s; the isolated cold gate reached
// 480s during lint after 84 successful steps (427s in completed steps). Reserve
// bounded cold-install headroom without removing/retrying any check. Ten minutes
// is one whole local-only budget, never a per-child or AWS/operator deadline.
export const LOCAL_CHECK_GATE_TIMEOUT_MS = 600_000;
export function remainingLocalGateMs(started, now) {
  if (!Number.isFinite(started) || !Number.isFinite(now) || started < 0 || now < started)
    throw new Error("LOCAL_GATE_CLOCK_INVALID");
  return Math.max(0, Math.floor(LOCAL_CHECK_GATE_TIMEOUT_MS - (now - started)));
}

/** Numeric diagnostics only: no arguments, paths, environment or child output.
 * Run the same child once; no retries, omissions or longer deadlines. */
export function runTimedLocalCheckStep(step, ports = {}) {
  if (!step || typeof step.name !== "string" || !/^[A-Za-z0-9 ()/;-]{1,160}$/.test(step.name) ||
      !Array.isArray(step.args) || !step.args.length || step.args.some(arg => typeof arg !== "string" || arg.includes("\0")) ||
      typeof step.cwd !== "string" || !step.cwd || (step.env !== undefined && (!step.env || typeof step.env !== "object"))) {
    throw new Error("LOCAL_CHECK_STEP_INVALID");
  }
  const clock = ports.now ?? (() => performance.now());
  const remainingMs = ports.timeoutMs ?? LOCAL_CHECK_GATE_TIMEOUT_MS;
  const stepLimitMs = step.timeoutMs ?? LOCAL_CHECK_GATE_TIMEOUT_MS;
  if (![remainingMs, stepLimitMs].every(value => Number.isSafeInteger(value) && value >= 1 && value <= LOCAL_CHECK_GATE_TIMEOUT_MS))
    throw new Error("LOCAL_CHECK_TIMEOUT_INVALID");
  const timeoutMs = Math.min(remainingMs, stepLimitMs);
  const spawn = ports.spawn ?? spawnSync;
  const emit = ports.emit ?? (packet => console.log(JSON.stringify(packet)));
  const started = clock();
  let result;
  try { result = spawn(process.execPath, step.args, { cwd: step.cwd, stdio: "inherit", env: step.env ?? cleanSourceChildEnvironment(process.env),
    timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true }); }
  catch { result = {}; }
  const elapsed = clock() - started;
  const validElapsed = Number.isFinite(started) && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= timeoutMs;
  const successfulExit = validElapsed && result?.status === 0 && result?.signal === null && !result?.error;
  emit({ mode: "local-check-step-timing", schemaVersion: 1, step: step.name,
    elapsedMs: validElapsed ? Math.ceil(elapsed) : null, successfulExit, rawDetailsSuppressed: true });
  return { successfulExit, exitCode: successfulExit ? 0 : Number.isInteger(result?.status) && result.status > 0 && result.status <= 255 ? result.status : 1 };
}

/** Captured logs stay private. Only ordinal indices and bounded numeric
 * timings leave the process; diagnostic completeness never proves a gate. */
export function summarizeLocalCheckTimings(output) {
  const prefix = '{"mode":"local-check-step-timing",';
  const lines = String(output ?? "").split(/\r?\n/).filter(line => line.startsWith(prefix));
  const records = []; let valid = lines.length > 0 && lines.length <= 100;
  const keys = ["elapsedMs", "mode", "rawDetailsSuppressed", "schemaVersion", "step", "successfulExit"];
  for (const line of lines.slice(0, 100)) {
    try {
      const p = JSON.parse(line);
      if (JSON.stringify(Object.keys(p).sort()) !== JSON.stringify(keys) || p.mode !== "local-check-step-timing" ||
          p.schemaVersion !== 1 || p.rawDetailsSuppressed !== true || typeof p.successfulExit !== "boolean" ||
          typeof p.step !== "string" || !/^[A-Za-z0-9 ()/;-]{1,160}$/.test(p.step) ||
          !Number.isSafeInteger(p.elapsedMs) || p.elapsedMs < 0 || p.elapsedMs > LOCAL_CHECK_GATE_TIMEOUT_MS) { valid = false; continue; }
      records.push({ index: records.length + 1, elapsedMs: p.elapsedMs, successfulExit: p.successfulExit });
    } catch { valid = false; }
  }
  return { observedRecords: lines.length, measuredSteps: records.length, recordsValid: valid,
    failedSteps: records.filter(p => !p.successfulExit).length,
    totalMeasuredStepMs: records.reduce((sum, p) => sum + p.elapsedMs, 0),
    slowestSteps: records.slice().sort((a, b) => b.elapsedMs - a.elapsedMs || a.index - b.index).slice(0, 10),
    stepNamesPrinted: false, rawDetailsSuppressed: true, successfulGateClaimed: false };
}

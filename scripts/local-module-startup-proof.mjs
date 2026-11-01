import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./clean-source-build-proof.mjs";

const TARGETS = Object.freeze(["typescript", "aws-cdk-lib", "./frontend/eslint.config.mjs"]);
const fail = () => { throw new Error("LOCAL_MODULE_STARTUP_INCOMPLETE"); };

export function startupEnvironment(source, cacheDirectory) {
  const env = cleanSourceChildEnvironment(source);
  for (const name of Object.keys(env))
    if (/^NODE_(?:COMPILE_CACHE(?:_PORTABLE)?|DISABLE_COMPILE_CACHE|V8_COVERAGE)$/i.test(name)) delete env[name];
  return { ...env, ...(cacheDirectory ? { NODE_COMPILE_CACHE: cacheDirectory } : { NODE_DISABLE_COMPILE_CACHE: "1" }) };
}

export function startupProofPlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, externalNetworkCalls: 0, subprocessesStarted: 0,
    packagesInstalled: 0, deploymentAuthorized: false, publicationPerformed: false };
}

/** Fixed local imports only. Separate fresh processes always execute the module;
 * the optional V8 cache stores compilation, never tests or prior pass results.
 * This diagnostic is not an isolated-install/full-gate or causal speedup proof. */
export function runStartupProof() {
  const base = resolve(tmpdir()), physical = realpathSync(base);
  const directory = mkdtempSync(join(base, "gmai-module-startup-"));
  const token = randomUUID(), marker = join(directory, ".owner");
  const owned = () => basename(directory).match(/^gmai-module-startup-[A-Za-z0-9]+$/) &&
    relative(base, directory) === basename(directory) && realpathSync(base) === physical &&
    !lstatSync(directory).isSymbolicLink() && realpathSync(directory) === join(physical, basename(directory)) &&
    !lstatSync(marker).isSymbolicLink() && readFileSync(marker, "utf8") === token;
  writeFileSync(marker, token, { flag: "wx" });
  try {
    const rows = [];
    for (const [index, target] of TARGETS.entries()) {
      const cache = join(directory, `cache-${index}`); mkdirSync(cache);
      const code = `require(${JSON.stringify(target)}); process.stdout.write("IMPORTED");`;
      const timings = [];
      // End with another disabled-cache process: earlier/later OS file warming
      // must not be mistaken for the effect of reusing compiled JavaScript.
      for (const mode of ["disabled", "cold", "warm", "disabled-after"]) {
        const started = performance.now();
        const result = spawnSync(process.execPath, ["-e", code], { cwd: process.cwd(),
          env: startupEnvironment(process.env, mode.startsWith("disabled") ? null : cache),
          encoding: "utf8", timeout: 12_000, maxBuffer: 100_000, windowsHide: true });
        const elapsedMs = Math.ceil(performance.now() - started);
        if (result.status !== 0 || result.signal !== null || result.error || result.stdout !== "IMPORTED" || result.stderr !== "" || elapsedMs > 12_500) fail();
        timings.push({ mode, elapsedMs });
      }
      rows.push({ targetIndex: index + 1, timings });
    }
    return { mode: "local-module-startup-observation", rows, subprocessesStarted: 12,
      awsCalls: 0, externalNetworkCalls: 0, packagesInstalled: 0, previousCacheReused: false,
      causalSpeedupClaimed: false, fullGateClaimed: false, temporaryTreeRetained: false,
      publicationPerformed: false, rawDetailsSuppressed: true };
  } finally {
    if (!owned()) fail();
    rmSync(directory, { recursive: true }); if (existsSync(directory)) fail();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(startupProofPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local") fail();
      console.log(JSON.stringify(runStartupProof()));
    }
  } catch { console.error(JSON.stringify({ error: "LOCAL_MODULE_STARTUP_INCOMPLETE", rawDetailsSuppressed: true,
    independentLocalClosureRequired: true })); process.exitCode = 1; }
}

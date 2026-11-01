import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runTimedLocalCheckStep } from "./local-check-step.mjs";

// Operational containment, not remediation of the unresolved minimatch advisory.
// Only trusted repository code/configuration may be linted. The V8 heap cap is
// not an OS memory/network/filesystem sandbox or a cap on total process RSS.
export const FRONTEND_LINT_TIMEOUT_MS = 60_000;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function frontendLintStep() {
  return {
    name: "frontend lint",
    args: ["--max-old-space-size=512", resolve(root, "frontend/node_modules/eslint/bin/eslint.js"),
      ".", "--config", resolve(root, "frontend/eslint.config.mjs"),
      "--ignore-pattern", "dist", "--ignore-pattern", ".next"],
    cwd: resolve(root, "frontend"),
    timeoutMs: FRONTEND_LINT_TIMEOUT_MS,
  };
}

export function frontendLintPlan(args = []) {
  if (!Array.isArray(args) || args.length) throw Error("FRONTEND_LINT_ARGUMENTS_REJECTED");
  return { mode: "dry-run", subprocessesStarted: 0, timeoutMs: FRONTEND_LINT_TIMEOUT_MS,
    maxOldSpaceMiB: 512, arbitraryArgumentsAccepted: false, automaticFix: false,
    advisoryRemediated: false, operatingSystemIsolationClaimed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(frontendLintPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-lint") throw Error("FRONTEND_LINT_ARGUMENTS_REJECTED");
      process.exitCode = runTimedLocalCheckStep(frontendLintStep()).exitCode;
    }
  } catch {
    console.error("FRONTEND_LINT_UNVERIFIED");
    process.exitCode = 1;
  }
}

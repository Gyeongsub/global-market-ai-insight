import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SYNTHETIC_LAB } from "../services/local-owner/src/synthetic-analysis.js";
import { runSyntheticRoleRehearsal, syntheticRestrictedBrowserRehearsalPlan } from "./synthetic-role-rehearsal-live.js";

/** Stable user entry, now exclusively the temporary model-only role lifecycle.
 * No alternate administrator-backed runtime or automatic inference fallback. */
export function syntheticLabPlan(args: readonly string[] = []) {
  if (args.length) throw Error("SYNTHETIC_ARGUMENTS_INVALID");
  return { ...syntheticRestrictedBrowserRehearsalPlan(), ...SYNTHETIC_LAB, mode: "dry-run", awsCalls: 0,
    providerCalls: 0, publicHosting: false, symbol: "QLD", dataOrigin: "synthetic",
    liveFlag: "--execute-synthetic-analysis", newAllowanceOnProcessRestart: true };
}
export async function runSyntheticLab() { return runSyntheticRoleRehearsal("restricted-browser"); }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(syntheticLabPlan()));
    else if (args.length === 1 && args[0] === "--execute-synthetic-analysis") {
      const result = await runSyntheticLab(); console.log(JSON.stringify(result));
      if (!result.completed || !result.stackAbsent || !result.roleAbsent) process.exitCode = 1;
    } else throw Error("SYNTHETIC_ARGUMENTS_INVALID");
  } catch { console.error(JSON.stringify({ error: "SYNTHETIC_LAB_UNAVAILABLE", rawDetailsSuppressed: true,
    inspectOwnedJournalBeforeRetry: true, independentClosureRequired: true })); process.exitCode = 1; }
}

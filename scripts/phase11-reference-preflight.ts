import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPhase11ReferenceApprovalPacket } from "./phase11-drill-preflight.js";

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    if (process.argv.length !== 2) throw new Error("PHASE11_REFERENCE_PREFLIGHT_NO_ARGUMENTS");
    console.log(JSON.stringify(buildPhase11ReferenceApprovalPacket()));
  } catch {
    console.error("Phase 11 reference-only local preflight failed; private details are suppressed.");
    process.exitCode = 1;
  }
}

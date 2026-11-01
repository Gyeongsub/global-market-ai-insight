import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Zero-call preparation. This command cannot deploy, enable jobs or submit a request. */
export function buildCircuitDenialPlan(args: string[] = []) {
  if (args.length !== 0) throw new Error("CIRCUIT_DENIAL_PREFLIGHT_ARGUMENTS_REJECTED");
  return {
    mode: "local-circuit-denial-preflight", awsCalls: 0, apiCalls: 0, cloudMutations: 0,
    region: "ap-northeast-1", operation: "PRICE", symbol: "QLD", locale: "ko",
    expectedHttpStatus: 503, expectedPublicCode: "CIRCUIT_OPEN",
    futureRequestLimit: { healthReads: 1, jobSubmissions: 1, retries: 0, statusPolling: 0 },
    healthPrerequisite: { status: "ok", circuit: "OPEN", jobCreationEnabled: true },
    persistedCircuitReadRequired: true, freshIdentityAndResourceOwnershipRequired: true,
    exactComputeDiffRequired: true, internalExecutionEnablementStillRequired: true,
    freshRuntimeImageScanRequired: true, exactLiveRegistryDigestProofRequired: true,
    localImageScanProvesLiveImage: false, allowUnscannedWorkerEnablement: false,
    taskAndSlotInventoryRequiredBeforeAndAfter: true,
    independentZeroJobWriteEvidenceRequired: true, internalExecutionRestoreRequired: true,
    unexpectedAcceptanceMustAbort: true, httpDenialIsCleanupEvidence: false,
    deploymentPerformed: false, internalJobsEnabled: false, requestSubmitted: false,
    readyForExecution: false, publicationPerformed: false,
  } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(buildCircuitDenialPlan(process.argv.slice(2)))); }
  catch { console.error("CIRCUIT_DENIAL_PREFLIGHT_INCOMPLETE: no AWS/API action; private details suppressed."); process.exitCode = 1; }
}

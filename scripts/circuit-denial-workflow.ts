import { randomUUID } from "node:crypto";
import { AwsIamApiClient, ApiResponseError } from "../services/operations/api-smoke/src/signed-api-client.js";
import { deterministicJobId } from "../services/controller/src/aws-job-repository.js";

export interface DenialInvariant {
  ownedResourcesVerified: boolean; budgetWithinLimit: boolean; sourceAndImageVerified: boolean;
  jobsEnabled: boolean; displayEnabled: false; circuitOpen: boolean; circuitVersion: number;
  runningTasks: number; pendingTasks: number; services: number; occupiedSlots: number;
  stableFingerprint: string;
}
export interface DenialDependencies {
  readInvariant(): Promise<DenialInvariant>;
  enableAdmission(): Promise<void>;
  restoreDisabledAdmission(): Promise<void>;
  exactJobAbsent(jobId: string): Promise<boolean>;
  assertSameOpenCircuit(version: number): Promise<void>;
  request: Pick<AwsIamApiClient,"request">;
  emergencyOwnedCleanup(jobId: string | undefined): Promise<void>;
  now?: () => number;
}
const fail=(code:string):never=>{throw new Error(`CIRCUIT_DENIAL_${code}`);};
function verifyInvariant(value:DenialInvariant,enabled:boolean,previous?:DenialInvariant) {
  if(!value.ownedResourcesVerified || !value.budgetWithinLimit || !value.sourceAndImageVerified || value.jobsEnabled!==enabled ||
    value.displayEnabled!==false || !value.circuitOpen || !Number.isSafeInteger(value.circuitVersion) || value.circuitVersion<1 ||
    [value.runningTasks,value.pendingTasks,value.services,value.occupiedSlots].some(count=>count!==0) ||
    !/^[a-f0-9]{64}$/.test(value.stableFingerprint) || previous &&
    (value.stableFingerprint!==previous.stableFingerprint || value.circuitVersion!==previous.circuitVersion)) fail("INVARIANTS_UNVERIFIED");
}

/** One bounded denial. Every ambiguous enable still restores before any success result.
 * The live adapter, not a CLI boolean, must establish source/image/ownership proof. */
export async function runCircuitDenialWorkflow(deps:DenialDependencies) {
  const now=deps.now??Date.now,started=now(); let enableAttempted=false, apiCalls=0, jobId:string|undefined;
  let initial:DenialInvariant|undefined, denial=false, failed:unknown;
  const guard=()=>{const elapsed=now()-started;if(!Number.isSafeInteger(elapsed)||elapsed<0||elapsed>=180_000)fail("ADMISSION_WINDOW_EXCEEDED");};
  try {
    guard(); initial=await deps.readInvariant(); verifyInvariant(initial,false); guard();
    enableAttempted=true; await deps.enableAdmission(); guard();
    const enabled=await deps.readInvariant(); verifyInvariant(enabled,true,initial); guard();
    apiCalls++; const health=await deps.request.request("GET","v1/health"); guard();
    if(health.status!=="ok" || health.circuit!=="OPEN" || health.jobCreationEnabled!==true ||
      Object.keys(health).sort().join(",")!=="circuit,jobCreationEnabled,status") fail("HEALTH_UNVERIFIED");
    const key=randomUUID(); jobId=deterministicJobId(key);
    if(!await deps.exactJobAbsent(jobId)) fail("BEFORE_JOB_NOT_ABSENT"); guard();
    await deps.assertSameOpenCircuit(initial.circuitVersion); guard();
    // Consume before transport, including timeout/ambiguous success. Never retry.
    apiCalls++;
    try {await deps.request.request("POST","v1/jobs",{operation:"PRICE",symbol:"QLD",locale:"ko"},{"idempotency-key":key});}
    catch(error){if(error instanceof ApiResponseError && error.httpStatus===503 && error.publicCode==="CIRCUIT_OPEN")denial=true;else fail("RESPONSE_UNVERIFIED");}
    if(!denial)fail("UNEXPECTED_ACCEPTANCE"); guard();
  } catch(error) {failed=error;}
  finally {
    // Restoration is intentionally not constrained by the shorter request window.
    // No HTTP evidence substitutes for the independent closing reads.
    try {
      if(enableAttempted)await deps.restoreDisabledAdmission();
      if(failed)await deps.emergencyOwnedCleanup(jobId);
      if(initial){const final=await deps.readInvariant();verifyInvariant(final,false,initial);}
      if(jobId && !await deps.exactJobAbsent(jobId))fail("AFTER_JOB_NOT_ABSENT");
    } catch {fail("SAFE_STOP_UNVERIFIED");}
  }
  if(failed)fail("INCOMPLETE_AFTER_VERIFIED_RESTORE");
  if(!initial || !denial || apiCalls!==2)fail("INCOMPLETE_AFTER_VERIFIED_RESTORE");
  return {mode:"bounded-live-circuit-denial",apiCalls,jobPosts:1,postRetries:0,denialResponseVerified:true,
    exactJobAbsentBeforeAndAfter:true,internalExecutionRestored:true,taskAndSlotInventoryIndependentlyVerified:true,
    circuitVersionUnchanged:true,jobsEnabled:false,displayEnabled:false,providerCallsExpected:0,modelCallsExpected:0,
    readyForPublication:false,privateIdentifiersPrinted:false};
}

import { parseControllerRuntimeConfig } from "../../controller/src/runtime-config.js";
import { ownerAdmissionAllowed } from "../../controller/src/owner-admission-window.js";

export const OWNER_ADMISSION_CHANGE_LIMITS = Object.freeze({ windowMs: 180000, freshPlanMs: 10000, enablePlans: 1, restorePlans: 1 });
const BASE_KEYS = ["JOBS_TABLE_NAME", "WORKER_CLUSTER", "WORKER_TASK_DEFINITION", "WORKER_SUBNET_IDS", "WORKER_SECURITY_GROUP_ID",
  "JOB_TIMEOUT_SECONDS", "JOB_TTL_SECONDS", "MAX_JOBS_PER_MINUTE", "MAX_ACTIVE_JOBS", "CIRCUIT_STATE", "API_AUTH_MODE",
  "ENABLE_PROVIDER_BACKED_JOBS", "ENABLE_LIVE_RESULT_DISPLAY", "PRIVATE_OWNER_USER_ARN"];
const WINDOW_KEYS = ["OWNER_JOB_WINDOW_START", "OWNER_JOB_WINDOW_END"];
const prefix = "global-market-ai-insight-dev";
export interface OwnerControllerAdmissionState {
  readonly functionArn: string;
  readonly revisionId: string;
  readonly codeSha256: string;
  /** Independently computed by a future reviewed adapter over all unrelated
   * runtime, IAM, resource and safety invariants. Never a browser assertion. */
  readonly stableConfigurationSha256: string;
  readonly state: "Active";
  readonly lastUpdateStatus: "Successful";
  readonly environment: Readonly<Record<string, string>>;
}
export interface OwnerAdmissionExpectedScope { readonly ownerUserArn: string; readonly controllerCodeSha256: string }
export type OwnerEnvironmentChange =
  | { readonly kind: "already-restored" }
  | { readonly kind: "update-environment"; readonly functionArn: string; readonly expectedRevisionId: string; readonly variables: Readonly<Record<string, string>> };
function fail(): never { throw Error("OWNER_ADMISSION_CHANGE_UNVERIFIED"); }
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sameEnvironment = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key] === b[key]);

function checkedState(input: unknown, scope: OwnerAdmissionExpectedScope, withWindow: boolean): OwnerControllerAdmissionState {
  try {
    if (!exact(input, ["functionArn", "revisionId", "codeSha256", "stableConfigurationSha256", "state", "lastUpdateStatus", "environment"]) ||
        input.state !== "Active" || input.lastUpdateStatus !== "Successful" || typeof input.functionArn !== "string" ||
        typeof input.revisionId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.revisionId) ||
        typeof input.codeSha256 !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(input.codeSha256) || input.codeSha256 !== scope.controllerCodeSha256 ||
        typeof input.stableConfigurationSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.stableConfigurationSha256) ||
        !exact(input.environment, [...BASE_KEYS, ...(withWindow ? WINDOW_KEYS : [])]) || Object.values(input.environment).some(value => typeof value !== "string")) fail();
    const match = new RegExp(`^arn:aws:lambda:ap-northeast-1:([0-9]{12}):function:${prefix}-controller$`).exec(input.functionArn);
    if (!match) fail();
    const environment = { ...(input.environment as Record<string, string>) };
    const config = parseControllerRuntimeConfig({ ...environment, AWS_REGION: "ap-northeast-1" });
    if (config.privateOwnerUserArn !== scope.ownerUserArn || config.privateOwnerUserArn === null ||
        !config.privateOwnerUserArn.startsWith(`arn:aws:iam::${match[1]}:user/`) ||
        config.jobsTableName !== `${prefix}-jobs` || config.circuitState !== "CLOSED" ||
        config.cluster !== `arn:aws:ecs:ap-northeast-1:${match[1]}:cluster/${prefix}-worker` ||
        !config.taskDefinition.startsWith(`arn:aws:ecs:ap-northeast-1:${match[1]}:task-definition/${prefix}-worker:`) ||
        withWindow !== (config.ownerAdmissionWindow !== null)) fail();
    return Object.freeze({ functionArn: input.functionArn, revisionId: input.revisionId, codeSha256: input.codeSha256,
      stableConfigurationSha256: input.stableConfigurationSha256, state: "Active", lastUpdateStatus: "Successful", environment: Object.freeze(environment) });
  } catch { return fail(); }
}

/** Pure local planning only. This module has no SDK/CLI, credential access,
 * configuration writes, circuit reset, task launch, timers or retry engine.
 * Scope/fingerprint strings are inputs, NOT independent cloud proofs. A reviewed
 * future adapter must derive them, enforce conditional revisions and reconcile
 * uncertain writes. Do not print the private environment payloads it returns. */
export function createOwnerAdmissionChangePlan(input: unknown, expected: OwnerAdmissionExpectedScope, preparedAtMs: number) {
  if (!exact(expected, ["ownerUserArn", "controllerCodeSha256"]) || !Number.isSafeInteger(preparedAtMs) || preparedAtMs < 0 ||
      preparedAtMs > 253402300799999 - OWNER_ADMISSION_CHANGE_LIMITS.windowMs) fail();
  const scope = Object.freeze({ ...expected }), baseline = checkedState(input, scope, false);
  if (baseline.environment.ENABLE_PROVIDER_BACKED_JOBS !== "false") fail();
  const window = Object.freeze({ startsAtMs: preparedAtMs, expiresAtMs: preparedAtMs + OWNER_ADMISSION_CHANGE_LIMITS.windowMs });
  const enabled = Object.freeze({ ...baseline.environment, ENABLE_PROVIDER_BACKED_JOBS: "true",
    OWNER_JOB_WINDOW_START: new Date(window.startsAtMs).toISOString(), OWNER_JOB_WINDOW_END: new Date(window.expiresAtMs).toISOString() });
  let enableConsumed = false, restoreConsumed = false;
  const unchanged = (current: OwnerControllerAdmissionState) => {
    if (current.functionArn !== baseline.functionArn || current.codeSha256 !== baseline.codeSha256 ||
        current.stableConfigurationSha256 !== baseline.stableConfigurationSha256) fail();
  };
  const payload = (current: OwnerControllerAdmissionState, variables: Readonly<Record<string, string>>): OwnerEnvironmentChange =>
    Object.freeze({ kind: "update-environment", functionArn: baseline.functionArn, expectedRevisionId: current.revisionId, variables: Object.freeze({ ...variables }) });
  return {
    window,
    prepareEnable(currentInput: unknown, nowMs: number): OwnerEnvironmentChange {
      if (enableConsumed || restoreConsumed) fail(); enableConsumed = true;
      if (!Number.isSafeInteger(nowMs) || nowMs < preparedAtMs || nowMs - preparedAtMs >= OWNER_ADMISSION_CHANGE_LIMITS.freshPlanMs ||
          !ownerAdmissionAllowed(window, nowMs)) fail();
      const current = checkedState(currentInput, scope, false); unchanged(current);
      if (current.revisionId !== baseline.revisionId || !sameEnvironment(current.environment, baseline.environment)) fail();
      return payload(current, enabled);
    },
    prepareRestore(currentInput: unknown): OwnerEnvironmentChange {
      if (restoreConsumed) fail(); restoreConsumed = true;
      // Restoration never makes a new window or requires the old one to remain
      // current. Exact baseline is already restored; only our exact window may
      // otherwise be removed. Unknown changes must not be overwritten.
      try {
        const raw = currentInput as Partial<OwnerControllerAdmissionState> | null;
        const hasWindow = raw?.environment && WINDOW_KEYS.some(key => Object.hasOwn(raw.environment!, key));
        const current = checkedState(currentInput, scope, Boolean(hasWindow)); unchanged(current);
        if (sameEnvironment(current.environment, baseline.environment)) return Object.freeze({ kind: "already-restored" });
        const normalized = { ...current.environment, ENABLE_PROVIDER_BACKED_JOBS: "true" };
        if (!sameEnvironment(normalized, enabled)) fail();
        return payload(current, baseline.environment);
      } catch { return fail(); }
    },
    snapshot: () => ({ enablePlanConsumed: enableConsumed, restorePlanConsumed: restoreConsumed, awsCalls: 0, cloudMutations: 0,
      independentlyVerified: false, executionAuthorized: false, remoteClosureVerified: false }),
  };
}

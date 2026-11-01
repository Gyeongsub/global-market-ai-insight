import { createHash } from "node:crypto";
import { parseProjectConfig, type ProjectConfig } from "./config.js";

// Pure input validation: zero CDK load, assembly, SDK client or cloud lookup.
export const MAINTENANCE_PREFIX = "global-market-ai-insight-dev";
export const MAINTENANCE_DISABLED_FLAGS = Object.freeze([
  "GMAI_ENABLE_API", "GMAI_ENABLE_INTERNAL_JOBS", "GMAI_ENABLE_OPERATIONS", "GMAI_ENABLE_ALARM_NOTIFICATIONS",
  "GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST", "GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION", "GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST",
  "GMAI_ENABLE_CUSTOM_OPERATION_METRICS", "GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST", "GMAI_PHASE11_REFERENCE_ONLY",
  "GMAI_ALLOW_UNRESERVED_ALARM_DRILL",
] as const);
export interface MaintenanceReferenceInputs { config: ProjectConfig; account: string; referenceFingerprint: string }
function fail(): never { throw new Error("MAINTENANCE_REFERENCE_SCOPE_INVALID"); }
export function validateMaintenanceReferenceConfig(value: ProjectConfig): ProjectConfig {
  const config = parseProjectConfig(value);
  if (`${config.projectName}-${config.environment}` !== MAINTENANCE_PREFIX || config.maxActiveJobs !== 2) fail();
  return config;
}
/** Consistency only: this hash is calculable without live ownership proof. */
export function maintenanceReferenceFingerprint(account: string): string {
  if (typeof account !== "string" || !/^(?!0{12}$)[0-9]{12}$/.test(account)) fail();
  return createHash("sha256").update(JSON.stringify({ version: "maintenance-references-v1", account,
    region: "ap-northeast-1", table: `${MAINTENANCE_PREFIX}-jobs`, cluster: `${MAINTENANCE_PREFIX}-worker`, slots: 2 })).digest("hex");
}
export function parseMaintenanceReferenceInputs(configInput: ProjectConfig, env: NodeJS.ProcessEnv): MaintenanceReferenceInputs {
  const config = validateMaintenanceReferenceConfig(configInput);
  if (env.GMAI_MAINTENANCE_REFERENCE_ONLY !== "true" || env.GMAI_ENABLE_MAINTENANCE_DRAFT !== "true" ||
    env.GMAI_ACKNOWLEDGE_MAINTENANCE_DRILL_COST !== "true" || MAINTENANCE_DISABLED_FLAGS.some(name => env[name] !== "false") ||
    env.CDK_DEFAULT_REGION !== config.region || !env.CDK_DEFAULT_ACCOUNT || env.GMAI_WORKER_IMAGE_DIGEST !== undefined) fail();
  const account = env.CDK_DEFAULT_ACCOUNT;
  if (env.GMAI_MAINTENANCE_REFERENCE_FINGERPRINT !== maintenanceReferenceFingerprint(account)) fail();
  return { config, account, referenceFingerprint: maintenanceReferenceFingerprint(account) };
}

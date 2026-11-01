import type { Environment } from "aws-cdk-lib/core";
import { parseProjectConfig, type ProjectConfig } from "./config.js";
import { parseDeploymentGates } from "./deployment-gates.js";
import { phase11ReferenceFingerprint } from "./phase11-reference-identity.js";

const PREFIX = "global-market-ai-insight-dev";
export interface Phase11ReferenceInputs {
  config: ProjectConfig;
  environment: Environment;
  httpApiId: string;
  referenceFingerprint: string;
  unreservedDrill?: boolean;
}

/** Pure input validation: no CDK runtime, assembly, SDK client or cloud lookup.
 * These flags select synthesis scope, not permission to deploy or close a circuit. */
export function parsePhase11ReferenceInputs(configInput: ProjectConfig, env: NodeJS.ProcessEnv): Phase11ReferenceInputs {
  const config = parseProjectConfig(configInput);
  if (env.GMAI_MAINTENANCE_REFERENCE_ONLY !== undefined && env.GMAI_MAINTENANCE_REFERENCE_ONLY !== "false") throw new Error("PHASE11_REFERENCE_SCOPE_INVALID");
  if (`${config.projectName}-${config.environment}` !== PREFIX) throw new Error("PHASE11_REFERENCE_PROJECT_INVALID");
  if (env.GMAI_PHASE11_REFERENCE_ONLY !== "true") throw new Error("PHASE11_REFERENCE_EXPLICIT_OPT_IN_REQUIRED");
  const gates = parseDeploymentGates(env);
  if (!gates.apiEnabled || !gates.operationsEnabled || !gates.customMetricsEnabled || !gates.alarmCircuitEnabled ||
      gates.internalJobsEnabled || gates.notificationsEnabled || gates.maintenanceEnabled ||
      env.GMAI_ENABLE_INTERNAL_JOBS !== "false" || env.GMAI_ENABLE_ALARM_NOTIFICATIONS !== "false" ||
      env.GMAI_ENABLE_MAINTENANCE_DRAFT !== "false") throw new Error("PHASE11_REFERENCE_SCOPE_INVALID");
  const account = env.CDK_DEFAULT_ACCOUNT;
  if (!account || !/^[0-9]{12}$/.test(account) || /^0+$/.test(account) ||
      env.CDK_DEFAULT_REGION !== config.region) throw new Error("PHASE11_REFERENCE_ENVIRONMENT_INVALID");
  const httpApiId = env.GMAI_EXISTING_HTTP_API_ID;
  if (!httpApiId || !/^[a-z0-9]{10}$/.test(httpApiId)) throw new Error("PHASE11_REFERENCE_API_ID_INVALID");
  const referenceFingerprint = env.GMAI_PHASE11_REFERENCE_FINGERPRINT;
  if (referenceFingerprint !== phase11ReferenceFingerprint(account, httpApiId)) throw new Error("PHASE11_REFERENCE_FINGERPRINT_MISMATCH");
  const unreserved = env.GMAI_ALLOW_UNRESERVED_ALARM_DRILL;
  if (unreserved !== undefined && unreserved !== "true" && unreserved !== "false") throw new Error("PHASE11_REFERENCE_CONCURRENCY_MODE_INVALID");
  return { config, environment: { account, region: config.region }, httpApiId, referenceFingerprint, unreservedDrill: unreserved === "true" };
}

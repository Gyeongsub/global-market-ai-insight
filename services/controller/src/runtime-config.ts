import { workerLaunchScope } from "./worker-launch-scope.js";
import { parsePrivateOwnerArn } from "./private-owner.js";
import { parseOwnerAdmissionWindow, type OwnerAdmissionWindow } from "./owner-admission-window.js";

export interface ControllerRuntimeConfig {
  region: string;
  jobsTableName: string;
  cluster: string;
  taskDefinition: string;
  subnetIds: string[];
  securityGroupId: string;
  jobTimeoutSeconds: number;
  jobTtlSeconds: number;
  maxJobsPerMinute: number;
  maxActiveJobs: number;
  circuitState: "CLOSED" | "OPEN";
  apiAuthMode: "AWS_IAM";
  privateOwnerUserArn: string | null;
  ownerAdmissionWindow: OwnerAdmissionWindow | null;
  enableProviderBackedJobs: boolean;
  enableLiveResultDisplay: false;
}

function required(env: NodeJS.ProcessEnv, name: string, maximum = 512): string {
  const value = env[name];
  if (!value || value.length > maximum || /[\r\n]/.test(value)) throw new Error(`Missing or invalid ${name}.`);
  return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, minimum: number, maximum: number): number {
  const value = Number(required(env, name, 12));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Missing or invalid ${name}.`);
  return value;
}

export function parseControllerRuntimeConfig(env: NodeJS.ProcessEnv): ControllerRuntimeConfig {
  const region = required(env, "AWS_REGION", 40);
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) throw new Error("Missing or invalid AWS_REGION.");
  const jobsTableName = required(env, "JOBS_TABLE_NAME", 255);
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(jobsTableName)) throw new Error("Missing or invalid JOBS_TABLE_NAME.");
  const subnetIds = required(env, "WORKER_SUBNET_IDS", 256).split(",");
  if (subnetIds.some((value) => !/^subnet-[a-f0-9]{8,17}$/.test(value)) || new Set(subnetIds).size !== subnetIds.length) {
    throw new Error("Missing or invalid WORKER_SUBNET_IDS.");
  }
  const securityGroupId = required(env, "WORKER_SECURITY_GROUP_ID", 32);
  if (!/^sg-[a-f0-9]{8,17}$/.test(securityGroupId)) throw new Error("Missing or invalid WORKER_SECURITY_GROUP_ID.");
  const circuitState = required(env, "CIRCUIT_STATE", 8);
  if (circuitState !== "CLOSED" && circuitState !== "OPEN") throw new Error("Missing or invalid CIRCUIT_STATE.");
  const apiAuthMode = required(env, "API_AUTH_MODE", 16);
  if (apiAuthMode !== "AWS_IAM") throw new Error("API_AUTH_MODE must remain AWS_IAM for internal provider jobs.");
  const providerJobs = required(env, "ENABLE_PROVIDER_BACKED_JOBS", 5);
  if (providerJobs !== "true" && providerJobs !== "false") throw new Error("ENABLE_PROVIDER_BACKED_JOBS must be true or false.");
  if (required(env, "ENABLE_LIVE_RESULT_DISPLAY", 5) !== "false") throw new Error("ENABLE_LIVE_RESULT_DISPLAY must remain false until display rights are approved.");
  const scope = workerLaunchScope(region, required(env, "WORKER_CLUSTER", 512), required(env, "WORKER_TASK_DEFINITION", 512));
  const privateOwnerUserArn = parsePrivateOwnerArn(env.PRIVATE_OWNER_USER_ARN, scope.clusterArn);
  const ownerAdmissionWindow = parseOwnerAdmissionWindow(env.OWNER_JOB_WINDOW_START, env.OWNER_JOB_WINDOW_END, privateOwnerUserArn);

  return {
    region,
    jobsTableName,
    cluster: scope.clusterArn,
    taskDefinition: scope.taskDefinitionArn,
    subnetIds,
    securityGroupId,
    jobTimeoutSeconds: integer(env, "JOB_TIMEOUT_SECONDS", 30, 300),
    jobTtlSeconds: integer(env, "JOB_TTL_SECONDS", 3_600, 14 * 86_400),
    maxJobsPerMinute: integer(env, "MAX_JOBS_PER_MINUTE", 1, 10),
    maxActiveJobs: integer(env, "MAX_ACTIVE_JOBS", 1, 5),
    circuitState,
    apiAuthMode: "AWS_IAM",
    privateOwnerUserArn,
    ownerAdmissionWindow,
    enableProviderBackedJobs: providerJobs === "true",
    enableLiveResultDisplay: false,
  };
}

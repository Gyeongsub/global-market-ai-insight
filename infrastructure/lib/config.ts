import { readFileSync } from "node:fs";

export interface ProjectConfig {
  environment: "dev";
  region: "ap-northeast-1";
  projectName: string;
  owner: string;
  /** Exact IAM user name; omitted means the AWS HTTP handler denies all callers. */
  ownerIamUserName?: string;
  bedrockModelAlias: string;
  bedrockModelId: string;
  providerApiKeyParameterName: string;
  marketDataUsageMode: "internal-development-only";
  enablePublicLiveQuotes: false;
  jobTimeoutSeconds: number;
  jobTtlDays: number;
  logRetentionDays: 7 | 14;
  maxActiveJobs: number;
  maxJobsPerMinute: number;
  bedrockMaxOutputTokens: number;
  enableNatGateway: false;
  enableAlb: false;
  enableEcsService: false;
  workerImageDigest?: string;
}

const allowedKeys = new Set([
  "environment",
  "region",
  "projectName",
  "owner",
  "ownerIamUserName",
  "bedrockModelAlias",
  "bedrockModelId",
  "providerApiKeyParameterName",
  "marketDataUsageMode",
  "enablePublicLiveQuotes",
  "jobTimeoutSeconds",
  "jobTtlDays",
  "logRetentionDays",
  "maxActiveJobs",
  "maxJobsPerMinute",
  "bedrockMaxOutputTokens",
  "enableNatGateway",
  "enableAlb",
  "enableEcsService",
  "workerImageDigest",
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Infrastructure config must be a JSON object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) throw new Error(`${field} must be a non-empty bounded string.`);
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`);
  return value as number;
}

export function validateWorkerImageDigest(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("workerImageDigest must be a sha256 digest, not a mutable tag.");
  return value;
}

export function parseProjectConfig(value: unknown): ProjectConfig {
  const input = record(value);
  for (const key of Object.keys(input)) if (!allowedKeys.has(key)) throw new Error(`Unknown infrastructure config key: ${key}`);

  if (input.environment !== "dev") throw new Error("Only the single dev environment is allowed in the first release.");
  if (input.region !== "ap-northeast-1") throw new Error("The first release is fixed to ap-northeast-1.");

  const projectName = text(input.projectName, "projectName");
  if (!/^[a-z][a-z0-9-]{2,48}$/.test(projectName)) throw new Error("projectName must be lowercase kebab-case.");

  const owner = text(input.owner, "owner");
  if (owner.includes("@") || owner.startsWith("replace-")) throw new Error("owner must be a non-sensitive tag value, not an email or placeholder.");
  if (input.ownerIamUserName !== undefined && (typeof input.ownerIamUserName !== "string" ||
      !/^[A-Za-z0-9_+=,.@-]{1,64}$/.test(input.ownerIamUserName))) {
    throw new Error("ownerIamUserName must be one exact IAM user name, not a wildcard, path or ARN.");
  }

  const bedrockModelId = text(input.bedrockModelId, "bedrockModelId");
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(bedrockModelId)) throw new Error("bedrockModelId is invalid.");

  const providerApiKeyParameterName = text(input.providerApiKeyParameterName, "providerApiKeyParameterName");
  const requiredParameterPrefix = `/${projectName}/${input.environment}/`;
  if (!providerApiKeyParameterName.startsWith(requiredParameterPrefix) || !/^\/[A-Za-z0-9_.\/-]+$/.test(providerApiKeyParameterName)) {
    throw new Error(`providerApiKeyParameterName must be a safe path under ${requiredParameterPrefix}.`);
  }
  if (input.marketDataUsageMode !== "internal-development-only") {
    throw new Error("marketDataUsageMode must remain internal-development-only until external-display rights are approved.");
  }
  if (input.enablePublicLiveQuotes !== false) {
    throw new Error("enablePublicLiveQuotes must remain false until external-display rights are approved.");
  }

  for (const guard of ["enableNatGateway", "enableAlb", "enableEcsService"] as const) {
    if (input[guard] !== false) throw new Error(`${guard} must remain false in the main dev architecture.`);
  }

  const logRetentionDays = integer(input.logRetentionDays, "logRetentionDays", 7, 14);
  if (logRetentionDays !== 7 && logRetentionDays !== 14) throw new Error("logRetentionDays must be 7 or 14.");

  const base: ProjectConfig = {
    environment: "dev",
    region: "ap-northeast-1",
    projectName,
    owner,
    ...(input.ownerIamUserName === undefined ? {} : { ownerIamUserName: input.ownerIamUserName as string }),
    bedrockModelAlias: text(input.bedrockModelAlias, "bedrockModelAlias"),
    bedrockModelId,
    providerApiKeyParameterName,
    marketDataUsageMode: "internal-development-only",
    enablePublicLiveQuotes: false,
    jobTimeoutSeconds: integer(input.jobTimeoutSeconds, "jobTimeoutSeconds", 30, 300),
    jobTtlDays: integer(input.jobTtlDays, "jobTtlDays", 1, 14),
    logRetentionDays,
    maxActiveJobs: integer(input.maxActiveJobs, "maxActiveJobs", 1, 5),
    maxJobsPerMinute: integer(input.maxJobsPerMinute, "maxJobsPerMinute", 1, 10),
    bedrockMaxOutputTokens: integer(input.bedrockMaxOutputTokens, "bedrockMaxOutputTokens", 128, 512),
    enableNatGateway: false,
    enableAlb: false,
    enableEcsService: false,
  };

  return typeof input.workerImageDigest === "string"
    ? { ...base, workerImageDigest: validateWorkerImageDigest(input.workerImageDigest) }
    : base;
}

export function loadProjectConfig(path: string): ProjectConfig {
  return parseProjectConfig(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

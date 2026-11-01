import assetCatalog from "../../../shared/asset_catalog/assets.json" with { type: "json" };
import { PublicError } from "./contracts.js";
import { ControllerRepositoryError, DynamoDbControllerJobRepository } from "./aws-job-repository.js";
import { ControllerService, type ControllerAuditSink } from "./controller-service.js";
import { EcsFargateTaskLauncher, TaskLaunchError } from "./ecs-task-launcher.js";
import { parseControllerRuntimeConfig } from "./runtime-config.js";
import { DynamoDbCircuitStore } from "../../operations/circuit_control/src/store.js";
import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";
import { AwsCallTimeoutError } from "../../../shared/time/bounded-aws-call.js";
import { isPrivateOwnerRequest } from "./private-owner.js";

export interface HttpApiEvent {
  version?: string;
  routeKey?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  pathParameters?: Record<string, string | undefined>;
  requestContext?: { requestId?: string; accountId?: string; authorizer?: unknown };
}

export interface HttpApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const MAX_BODY_BYTES = 4_096;
const PUBLIC_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function requestId(event: HttpApiEvent): string {
  const value = event.requestContext?.requestId;
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(value) ? value : "unknown";
}

function response(statusCode: number, body: unknown): HttpApiResponse {
  return { statusCode, headers: PUBLIC_HEADERS, body: JSON.stringify(body) };
}

export function publicErrorLogFields(error: PublicError, correlationId: string) {
  const safeCorrelationId = /^[A-Za-z0-9._:-]{1,100}$/.test(correlationId) ? correlationId : "unknown";
  return {
    level: "warn" as const,
    service: "controller" as const,
    code: "REQUEST_REJECTED" as const,
    publicCode: error.code,
    requestId: safeCorrelationId,
    httpStatus: error.httpStatus,
  };
}

function header(event: HttpApiEvent, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const matches = Object.entries(event.headers ?? {}).filter(([key]) => key.toLowerCase() === wanted);
  if (matches.length > 1) throw new PublicError("VALIDATION_ERROR", "Request headers are ambiguous.", 400);
  const value = matches[0]?.[1];
  return typeof value === "string" ? value : undefined;
}

function jsonBody(event: HttpApiEvent): unknown {
  const contentType = header(event, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new PublicError("VALIDATION_ERROR", "Content-Type must be application/json.", 400);
  if (typeof event.body !== "string") throw new PublicError("VALIDATION_ERROR", "Request body is required.", 400);
  let decoded: string;
  try {
    if (event.isBase64Encoded) {
      // Buffer.from silently accepts malformed base64. Reject it before parsing
      // so the request boundary has one unambiguous byte representation.
      if (event.body.length > Math.ceil(MAX_BODY_BYTES / 3) * 4 ||
          event.body.length % 4 !== 0 ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.body)) {
        throw new Error("Invalid base64");
      }
      const bytes = Buffer.from(event.body, "base64");
      if (bytes.length > MAX_BODY_BYTES || bytes.toString("base64") !== event.body) throw new Error("Non-canonical or oversized base64");
      // Preserve a BOM so JSON parsing rejects it just like an ordinary body.
      // Decoder normalization must not hide bytes from the wire-size limit.
      decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } else {
      decoded = event.body;
    }
  }
  catch {
    throw new PublicError("VALIDATION_ERROR", "Request body is invalid.", 400);
  }
  if (Buffer.byteLength(decoded, "utf8") > MAX_BODY_BYTES) throw new PublicError("VALIDATION_ERROR", "Request body is too large.", 400);
  try {
    return parseUnambiguousJson(decoded, MAX_BODY_BYTES);
  }
  catch {
    throw new PublicError("VALIDATION_ERROR", "Request body must be valid JSON.", 400);
  }
}

// The optional hook supports credential-free local fixtures. The AWS factory
// below always supplies its fail-closed owner check, including when unconfigured.
export function createHandler(service: ControllerService, authorize?: (event: HttpApiEvent) => boolean) {
  return async function handler(event: HttpApiEvent): Promise<HttpApiResponse> {
    const correlationId = requestId(event);
    try {
      if (authorize && !authorize(event)) throw new PublicError("ACCESS_DENIED", "Access is not permitted.", 403);
      switch (event.routeKey) {
        case "GET /v1/assets":
          return response(200, assetCatalog);
        case "POST /v1/jobs":
          return response(202, await service.createJob(jsonBody(event), header(event, "idempotency-key"), correlationId));
        case "GET /v1/jobs/{jobId}":
          return response(200, await service.getJob(event.pathParameters?.jobId));
        case "GET /v1/health":
          return response(200, await service.health());
        default:
          throw new PublicError("VALIDATION_ERROR", "Route not found.", 404);
      }
    }
    catch (error) {
      if (error instanceof PublicError) {
        console.warn(JSON.stringify({ timestamp: new Date().toISOString(), ...publicErrorLogFields(error, correlationId) }));
        return response(error.httpStatus, { error: { code: error.code, message: error.message, requestId: correlationId } });
      }
      const dependencyCode = error instanceof AwsCallTimeoutError ? "TIMEOUT" :
        error instanceof ControllerRepositoryError || error instanceof TaskLaunchError ? error.code : "UNEXPECTED";
      console.error(JSON.stringify({ level: "error", service: "controller", code: "REQUEST_FAILED", dependencyCode, requestId: correlationId }));
      return response(500, { error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: correlationId } });
    }
  };
}

export function buildAwsHandler(env: NodeJS.ProcessEnv = process.env) {
  const config = parseControllerRuntimeConfig(env);
  const audit: ControllerAuditSink = {
    write(event) {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: "controller", ...event }));
    },
  };
  const jobs = new DynamoDbControllerJobRepository({
    tableName: config.jobsTableName,
    region: config.region,
    timeoutSeconds: config.jobTimeoutSeconds,
    ttlSeconds: config.jobTtlSeconds,
    maxJobsPerMinute: config.maxJobsPerMinute,
    maxActiveJobs: config.maxActiveJobs,
  });
  const persistedCircuit = new DynamoDbCircuitStore(config.jobsTableName, config.region);
  const tasks = new EcsFargateTaskLauncher({
    region: config.region,
    cluster: config.cluster,
    taskDefinition: config.taskDefinition,
    subnetIds: config.subnetIds,
    securityGroupId: config.securityGroupId,
  });
  const service = new ControllerService(
    jobs,
    tasks,
    { state: async signal => config.circuitState === "OPEN" ? "OPEN" : persistedCircuit.state(signal) },
    {
      jobCreationEnabled: config.enableProviderBackedJobs,
      liveResultDisplayEnabled: config.enableLiveResultDisplay,
      admissionWindow: config.ownerAdmissionWindow,
    },
    audit,
  );
  return createHandler(service, event => isPrivateOwnerRequest(event, config.privateOwnerUserArn));
}

export const OPERATIONAL_FAILURE_SUFFIXES = [
  "TaskLaunchFailures",
  "ProviderFailures",
  "ModelFailures",
] as const;

export type OperationalFailureSuffix = (typeof OPERATIONAL_FAILURE_SUFFIXES)[number];

export const OPERATIONAL_FAILURE_METRICS = [
  { suffix: OPERATIONAL_FAILURE_SUFFIXES[0], service: "controller", field: "code", value: OPERATIONAL_FAILURE_CODES.taskLaunch },
  { suffix: OPERATIONAL_FAILURE_SUFFIXES[1], service: "worker", field: "errorCode", value: OPERATIONAL_FAILURE_CODES.provider },
  { suffix: OPERATIONAL_FAILURE_SUFFIXES[2], service: "worker", field: "errorCode", value: OPERATIONAL_FAILURE_CODES.model },
] as const;

export function classifyOperationalFailureLog(value: unknown): OperationalFailureSuffix | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  for (const definition of OPERATIONAL_FAILURE_METRICS) {
    if (event.service === definition.service && event[definition.field] === definition.value) return definition.suffix;
  }
  return null;
}
import { OPERATIONAL_FAILURE_CODES } from "../../../../shared/observability/operational-failure-codes.js";

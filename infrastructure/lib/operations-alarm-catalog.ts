import type { ProjectConfig } from "./config.js";
import { OPERATIONAL_FAILURE_SUFFIXES } from "../../services/operations/metrics/src/error-metric-catalog.js";

export const STANDARD_OPERATIONS_ALARM_SUFFIXES = [
  "ControllerErrors",
  "ControllerThrottles",
  "ApiServerErrors",
] as const;

export const CUSTOM_OPERATIONS_ALARM_SUFFIXES = OPERATIONAL_FAILURE_SUFFIXES;

export const OPERATIONS_ALARM_SUFFIXES = [
  ...STANDARD_OPERATIONS_ALARM_SUFFIXES,
  ...CUSTOM_OPERATIONS_ALARM_SUFFIXES,
] as const;

export type OperationsAlarmSuffix = (typeof OPERATIONS_ALARM_SUFFIXES)[number];

export function operationsAlarmName(
  config: Pick<ProjectConfig, "projectName" | "environment">,
  suffix: OperationsAlarmSuffix,
): string {
  return `${config.projectName}-${config.environment}-${suffix}`;
}

export function operationsAlarmNames(config: Pick<ProjectConfig, "projectName" | "environment">): string[] {
  return OPERATIONS_ALARM_SUFFIXES.map(suffix => operationsAlarmName(config, suffix));
}

const FLAG_NAMES = [
  "GMAI_ENABLE_API",
  "GMAI_ENABLE_INTERNAL_JOBS",
  "GMAI_ENABLE_OPERATIONS",
  "GMAI_ENABLE_MAINTENANCE_DRAFT",
  "GMAI_ENABLE_ALARM_NOTIFICATIONS",
  "GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST",
  "GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION",
  "GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST",
  "GMAI_ENABLE_CUSTOM_OPERATION_METRICS",
  "GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST",
] as const;

export type DeploymentFlagName = (typeof FLAG_NAMES)[number];

export interface DeploymentGates {
  apiEnabled: boolean;
  internalJobsEnabled: boolean;
  operationsEnabled: boolean;
  maintenanceEnabled: boolean;
  notificationsEnabled: boolean;
  alarmCircuitEnabled: boolean;
  customMetricsEnabled: boolean;
}

function enabled(env: NodeJS.ProcessEnv, name: DeploymentFlagName): boolean {
  const value = env[name];
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new Error(`${name} must be true, false, or absent.`);
  }
  return value === "true";
}

export function parseDeploymentGates(env: NodeJS.ProcessEnv): DeploymentGates {
  const apiEnabled = enabled(env, "GMAI_ENABLE_API");
  const internalJobsEnabled = enabled(env, "GMAI_ENABLE_INTERNAL_JOBS");
  const operationsEnabled = enabled(env, "GMAI_ENABLE_OPERATIONS");
  const maintenanceEnabled = enabled(env, "GMAI_ENABLE_MAINTENANCE_DRAFT");
  const notificationsEnabled = enabled(env, "GMAI_ENABLE_ALARM_NOTIFICATIONS");
  const notificationCostAcknowledged = enabled(env, "GMAI_ACKNOWLEDGE_ALARM_NOTIFICATION_COST");
  const alarmCircuitEnabled = enabled(env, "GMAI_ENABLE_ALARM_CIRCUIT_AUTOMATION");
  const alarmCircuitCostAcknowledged = enabled(env, "GMAI_ACKNOWLEDGE_ALARM_CIRCUIT_COST");
  const customMetricsEnabled = enabled(env, "GMAI_ENABLE_CUSTOM_OPERATION_METRICS");
  const customMetricCostAcknowledged = enabled(env, "GMAI_ACKNOWLEDGE_CUSTOM_METRIC_COST");

  if (internalJobsEnabled && !apiEnabled) throw new Error("Internal provider jobs require the explicitly enabled IAM-protected API stack.");
  if (operationsEnabled && !apiEnabled) throw new Error("Operations draft requires the explicitly enabled IAM-protected API stack.");
  if (maintenanceEnabled && !operationsEnabled) throw new Error("Maintenance draft requires the explicitly enabled operations draft.");
  if (notificationsEnabled && !operationsEnabled) throw new Error("Alarm notifications require the explicitly enabled operations draft.");
  if (notificationsEnabled && !notificationCostAcknowledged) throw new Error("Alarm notifications require a separate cost acknowledgement.");
  if (!notificationsEnabled && notificationCostAcknowledged) throw new Error("Alarm notification cost acknowledgement requires notifications to be enabled.");
  if (alarmCircuitEnabled && !operationsEnabled) throw new Error("Alarm circuit automation requires the explicitly enabled operations draft.");
  if (alarmCircuitEnabled && !alarmCircuitCostAcknowledged) throw new Error("Alarm circuit automation requires a separate cost acknowledgement.");
  if (!alarmCircuitEnabled && alarmCircuitCostAcknowledged) throw new Error("Alarm circuit cost acknowledgement requires alarm circuit automation to be enabled.");
  if (customMetricsEnabled && !operationsEnabled) throw new Error("Custom operation metrics require the explicitly enabled operations draft.");
  if (customMetricsEnabled && !customMetricCostAcknowledged) throw new Error("Custom operation metrics require a separate cost acknowledgement.");
  if (!customMetricsEnabled && customMetricCostAcknowledged) throw new Error("Custom metric cost acknowledgement requires custom operation metrics to be enabled.");

  return {
    apiEnabled,
    internalJobsEnabled,
    operationsEnabled,
    maintenanceEnabled,
    notificationsEnabled,
    alarmCircuitEnabled,
    customMetricsEnabled,
  };
}

import type { CircuitRecord } from "../../circuit_control/src/circuit.js";
import { DynamoDbCircuitStore } from "../../circuit_control/src/store.js";

const ACTOR = "cloudwatch-alarm-automation";

export interface CircuitStore {
  read(): Promise<CircuitRecord | null>;
  change(input: {
    state: "OPEN";
    reason: string;
    actor: string;
    expectedVersion: number;
    now: Date;
  }): Promise<void>;
}

export interface AlarmCircuitConfig {
  region: "ap-northeast-1";
  tableName: string;
  expectedAccountId: string;
  allowedAlarmNames: ReadonlySet<string>;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validAlarmName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{2,80}-(ControllerErrors|ControllerThrottles|ApiServerErrors|TaskLaunchFailures|ProviderFailures|ModelFailures)$/.test(value);
}

export function parseAlarmCircuitConfig(env: Record<string, string | undefined>): AlarmCircuitConfig {
  if (env.AWS_REGION !== "ap-northeast-1" || !env.JOBS_TABLE_NAME ||
      !env.EXPECTED_ACCOUNT_ID || !/^[0-9]{12}$/.test(env.EXPECTED_ACCOUNT_ID) ||
      !/^[A-Za-z0-9_.-]{3,255}$/.test(env.JOBS_TABLE_NAME)) {
    throw new Error("Invalid alarm circuit configuration.");
  }
  let names: unknown;
  try { names = JSON.parse(env.ALLOWED_ALARM_NAMES_JSON ?? ""); }
  catch { throw new Error("Invalid alarm circuit configuration."); }
  if (!Array.isArray(names) || names.length !== 6 || !names.every(validAlarmName) || new Set(names).size !== names.length) {
    throw new Error("Invalid alarm circuit configuration.");
  }
  return {
    region: env.AWS_REGION,
    tableName: env.JOBS_TABLE_NAME,
    expectedAccountId: env.EXPECTED_ACCOUNT_ID,
    allowedAlarmNames: new Set(names),
  };
}

export function parseAllowedAlarmEvent(event: unknown, config: AlarmCircuitConfig): string {
  const root = object(event);
  const detail = object(root?.detail);
  const state = object(detail?.state);
  const alarmName = detail?.alarmName;
  const expectedArn = validAlarmName(alarmName)
    ? `arn:aws:cloudwatch:${config.region}:${config.expectedAccountId}:alarm:${alarmName}`
    : "";
  if (root?.source !== "aws.cloudwatch" || root?.["detail-type"] !== "CloudWatch Alarm State Change" ||
      root?.region !== config.region || root?.account !== config.expectedAccountId ||
      !Array.isArray(root?.resources) || root.resources.length !== 1 || root.resources[0] !== expectedArn ||
      state?.value !== "ALARM" ||
      !validAlarmName(alarmName) || !config.allowedAlarmNames.has(alarmName)) {
    throw new Error("Untrusted alarm event.");
  }
  return alarmName;
}

export async function openCircuitForAlarm(input: {
  store: CircuitStore;
  alarmName: string;
  now: Date;
}): Promise<{ outcome: "opened" | "already-open" | "concurrent-open"; version: number }> {
  if (!validAlarmName(input.alarmName) || Number.isNaN(input.now.getTime())) {
    throw new Error("Invalid alarm circuit request.");
  }
  const current = await input.store.read();
  if (current?.state === "OPEN") return { outcome: "already-open", version: current.version };

  const expectedVersion = current?.version ?? 0;
  try {
    await input.store.change({
      state: "OPEN",
      reason: `alarm.${input.alarmName}`,
      actor: ACTOR,
      expectedVersion,
      now: input.now,
    });
    return { outcome: "opened", version: expectedVersion + 1 };
  } catch {
    // A concurrent writer may have opened the circuit first. Re-read rather
    // than overwriting a newer version or retrying an ambiguous mutation.
    const afterConflict = await input.store.read();
    if (afterConflict?.state === "OPEN") return { outcome: "concurrent-open", version: afterConflict.version };
    throw new Error("Alarm circuit open failed.");
  }
}

export async function handler(event: unknown): Promise<{ outcome: string; version: number }> {
  const config = parseAlarmCircuitConfig(process.env);
  const alarmName = parseAllowedAlarmEvent(event, config);
  const store = new DynamoDbCircuitStore(config.tableName, config.region);
  try {
    const result = await openCircuitForAlarm({ store, alarmName, now: new Date() });
    console.log(JSON.stringify({ event: "alarm-circuit-open", alarmName, ...result }));
    return result;
  } catch {
    console.error(JSON.stringify({ event: "alarm-circuit-open-failed", alarmName }));
    throw new Error("Alarm circuit automation failed.");
  }
}

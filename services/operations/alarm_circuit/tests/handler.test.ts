import assert from "node:assert/strict";
import test from "node:test";
import type { CircuitRecord } from "../../circuit_control/src/circuit.js";
import {
  openCircuitForAlarm,
  parseAlarmCircuitConfig,
  parseAllowedAlarmEvent,
  type CircuitStore,
} from "../src/handler.js";

const alarmName = "global-market-ai-insight-dev-ControllerErrors";
const allowedNames = [
  alarmName,
  "global-market-ai-insight-dev-ControllerThrottles",
  "global-market-ai-insight-dev-ApiServerErrors",
  "global-market-ai-insight-dev-TaskLaunchFailures",
  "global-market-ai-insight-dev-ProviderFailures",
  "global-market-ai-insight-dev-ModelFailures",
];
const account = ["123456", "789012"].join("");
const config = parseAlarmCircuitConfig({
  AWS_REGION: "ap-northeast-1",
  JOBS_TABLE_NAME: "global-market-ai-insight-dev-jobs",
  EXPECTED_ACCOUNT_ID: account,
  ALLOWED_ALARM_NAMES_JSON: JSON.stringify(allowedNames),
});
const event = {
  source: "aws.cloudwatch",
  "detail-type": "CloudWatch Alarm State Change",
  region: "ap-northeast-1",
  account,
  resources: [`arn:aws:cloudwatch:ap-northeast-1:${account}:alarm:${alarmName}`],
  detail: { alarmName, state: { value: "ALARM" } },
};
const now = new Date("2026-09-30T00:00:00Z");

function record(state: "OPEN" | "CLOSED", version: number): CircuitRecord {
  return { state, version, reason: "test", actor: "test", updatedAt: now.toISOString() };
}

test("configuration requires the exact bounded six-alarm allowlist", () => {
  assert.equal(config.allowedAlarmNames.size, 6);
  for (const bad of [
    {},
    { AWS_REGION: "us-east-1", JOBS_TABLE_NAME: "jobs", EXPECTED_ACCOUNT_ID: account, ALLOWED_ALARM_NAMES_JSON: JSON.stringify(allowedNames) },
    { AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "jobs", EXPECTED_ACCOUNT_ID: account, ALLOWED_ALARM_NAMES_JSON: "[]" },
    { AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "jobs", EXPECTED_ACCOUNT_ID: account, ALLOWED_ALARM_NAMES_JSON: "not-json" },
    { AWS_REGION: "ap-northeast-1", JOBS_TABLE_NAME: "jobs", EXPECTED_ACCOUNT_ID: "not-an-account", ALLOWED_ALARM_NAMES_JSON: JSON.stringify(allowedNames) },
  ]) assert.throws(() => parseAlarmCircuitConfig(bad), /Invalid alarm circuit configuration/);
});

test("only an exact allowlisted CloudWatch ALARM event is accepted", () => {
  assert.equal(parseAllowedAlarmEvent(event, config), alarmName);
  for (const changed of [
    { ...event, source: "custom.source" },
    { ...event, region: "us-east-1" },
    { ...event, account: ["999999", "999999"].join("") },
    { ...event, resources: [] },
    { ...event, resources: [`arn:aws:cloudwatch:ap-northeast-1:${account}:alarm:wrong`] },
    { ...event, detail: { ...event.detail, state: { value: "OK" } } },
    { ...event, detail: { ...event.detail, alarmName: "global-market-ai-insight-dev-UnknownAlarm" } },
  ]) assert.throws(() => parseAllowedAlarmEvent(changed, config), /Untrusted alarm event/);
});

test("a CLOSED circuit is opened with its observed version and a non-sensitive reason", async () => {
  const writes: Parameters<CircuitStore["change"]>[0][] = [];
  const store: CircuitStore = {
    async read() { return record("CLOSED", 7); },
    async change(input) { writes.push(input); },
  };
  assert.deepEqual(await openCircuitForAlarm({ store, alarmName, now }), { outcome: "opened", version: 8 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.state, "OPEN");
  assert.equal(writes[0]?.expectedVersion, 7);
  assert.equal(writes[0]?.actor, "cloudwatch-alarm-automation");
  assert.equal(writes[0]?.reason, `alarm.${alarmName}`);
});

test("an OPEN circuit is idempotent and never writes or closes", async () => {
  let writes = 0;
  const store: CircuitStore = {
    async read() { return record("OPEN", 8); },
    async change() { writes += 1; },
  };
  assert.deepEqual(await openCircuitForAlarm({ store, alarmName, now }), { outcome: "already-open", version: 8 });
  assert.equal(writes, 0);
});

test("a write conflict succeeds only when a fresh read proves concurrent OPEN", async () => {
  let reads = 0;
  const concurrent: CircuitStore = {
    async read() { return ++reads === 1 ? record("CLOSED", 3) : record("OPEN", 4); },
    async change() { throw new Error("conditional conflict"); },
  };
  assert.deepEqual(await openCircuitForAlarm({ store: concurrent, alarmName, now }), { outcome: "concurrent-open", version: 4 });

  reads = 0;
  const unsafe: CircuitStore = {
    async read() { reads += 1; return record("CLOSED", reads + 2); },
    async change() { throw new Error("conditional conflict"); },
  };
  await assert.rejects(openCircuitForAlarm({ store: unsafe, alarmName, now }), /Alarm circuit open failed/);
});

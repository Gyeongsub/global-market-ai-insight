import assert from "node:assert/strict";
import test from "node:test";
import { PublicError, type CreateJobRequest } from "../../../controller/src/contracts.js";
import {
  ControllerService,
  type ControllerJobRepository,
  type TaskLauncher,
} from "../../../controller/src/controller-service.js";
import type { CircuitRecord } from "../../circuit_control/src/circuit.js";
import { classifyOperationalFailureLog } from "../../metrics/src/error-metric-catalog.js";
import {
  openCircuitForAlarm,
  parseAlarmCircuitConfig,
  parseAllowedAlarmEvent,
  type CircuitStore,
} from "../src/handler.js";

const alarmName = "global-market-ai-insight-dev-ApiServerErrors";
const account = ["123456", "789012"].join("");
const config = parseAlarmCircuitConfig({
  AWS_REGION: "ap-northeast-1",
  JOBS_TABLE_NAME: "global-market-ai-insight-dev-jobs",
  EXPECTED_ACCOUNT_ID: account,
  ALLOWED_ALARM_NAMES_JSON: JSON.stringify([
    "global-market-ai-insight-dev-ControllerErrors",
    "global-market-ai-insight-dev-ControllerThrottles",
    "global-market-ai-insight-dev-ApiServerErrors",
    "global-market-ai-insight-dev-TaskLaunchFailures",
    "global-market-ai-insight-dev-ProviderFailures",
    "global-market-ai-insight-dev-ModelFailures",
  ]),
});
const alarmEvent = {
  source: "aws.cloudwatch",
  "detail-type": "CloudWatch Alarm State Change",
  region: "ap-northeast-1",
  account,
  resources: [`arn:aws:cloudwatch:ap-northeast-1:${account}:alarm:${alarmName}`],
  detail: { alarmName, state: { value: "ALARM" } },
};

test("local drill: an exact ALARM opens the circuit and blocks persistence plus task launch", async () => {
  let circuit: CircuitRecord = {
    state: "CLOSED",
    reason: "manual-reset",
    actor: "portfolio-operator",
    updatedAt: "2026-09-30T00:00:00.000Z",
    version: 9,
  };
  const store: CircuitStore = {
    async read() { return circuit; },
    async change(input) {
      if (input.expectedVersion !== circuit.version || circuit.state !== "CLOSED") throw new Error("conflict");
      circuit = {
        state: "OPEN",
        reason: input.reason,
        actor: input.actor,
        updatedAt: input.now.toISOString(),
        version: circuit.version + 1,
      };
    },
  };

  const parsedName = parseAllowedAlarmEvent(alarmEvent, config);
  assert.deepEqual(
    await openCircuitForAlarm({ store, alarmName: parsedName, now: new Date("2026-09-30T00:01:00Z") }),
    { outcome: "opened", version: 10 },
  );

  let jobWrites = 0;
  let taskLaunches = 0;
  const jobs: ControllerJobRepository = {
    async create() { jobWrites += 1; throw new Error("must not persist while open"); },
    async get() { return null; },
    async attachTaskArn() { throw new Error("must not attach while open"); },
    async markLaunchFailed(job) { return job; },
  };
  const tasks: TaskLauncher = {
    async launch() { taskLaunches += 1; throw new Error("must not launch while open"); },
  };
  const controller = new ControllerService(
    jobs,
    tasks,
    { state: async () => circuit.state },
    { jobCreationEnabled: true, liveResultDisplayEnabled: false,
      admissionWindow: { startsAtMs: Date.parse("2026-09-30T00:00:00Z"), expiresAtMs: Date.parse("2026-09-30T00:05:00Z") } },
    { write() {} },
    () => new Date("2026-09-30T00:02:00Z"),
  );
  const request: CreateJobRequest = { operation: "ANALYZE", symbol: "QLD", locale: "ko" };
  await assert.rejects(
    controller.createJob(request, "018f1c2a-b3d4-7e5f-8a90-123456789abc"),
    (error: unknown) => error instanceof PublicError && error.code === "CIRCUIT_OPEN",
  );
  assert.deepEqual(await controller.health(), { status: "ok", circuit: "OPEN", jobCreationEnabled: true });
  assert.equal(jobWrites, 0);
  assert.equal(taskLaunches, 0);

  const okEvent = { ...alarmEvent, detail: { alarmName, state: { value: "OK" } } };
  assert.throws(() => parseAllowedAlarmEvent(okEvent, config), /Untrusted alarm event/);
  assert.equal(circuit.state, "OPEN");
  assert.equal(circuit.version, 10);
});

test("local drill: every fixed operational failure signal maps to an allowlisted alarm that can restore OPEN", async () => {
  const cases = [
    [{ service: "controller", code: "TASK_LAUNCH_FAILED" }, "TaskLaunchFailures"],
    [{ service: "worker", errorCode: "PROVIDER_ERROR" }, "ProviderFailures"],
    [{ service: "worker", errorCode: "MODEL_ERROR" }, "ModelFailures"],
  ] as const;

  for (const [logEvent, suffix] of cases) {
    assert.equal(classifyOperationalFailureLog(logEvent), suffix);
    const exactAlarmName = `global-market-ai-insight-dev-${suffix}`;
    const exactEvent = {
      ...alarmEvent,
      resources: [`arn:aws:cloudwatch:ap-northeast-1:${account}:alarm:${exactAlarmName}`],
      detail: { alarmName: exactAlarmName, state: { value: "ALARM" } },
    };
    const parsedName = parseAllowedAlarmEvent(exactEvent, config);
    let circuit: CircuitRecord = {
      state: "CLOSED",
      reason: "phase11-controlled-drill",
      actor: "portfolio-operator",
      updatedAt: "2026-10-01T00:00:00.000Z",
      version: 20,
    };
    const store: CircuitStore = {
      async read() { return circuit; },
      async change(input) {
        assert.equal(input.expectedVersion, 20);
        assert.equal(input.actor, "cloudwatch-alarm-automation");
        circuit = { state: "OPEN", reason: input.reason, actor: input.actor, updatedAt: input.now.toISOString(), version: 21 };
      },
    };
    assert.deepEqual(
      await openCircuitForAlarm({ store, alarmName: parsedName, now: new Date("2026-10-01T00:01:00Z") }),
      { outcome: "opened", version: 21 },
    );
    assert.equal(circuit.state, "OPEN");
    assert.equal(circuit.reason, `alarm.${exactAlarmName}`);
  }
});

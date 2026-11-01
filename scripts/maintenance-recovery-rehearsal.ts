import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GetItemCommand, UpdateItemCommand, TransactWriteItemsCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { DescribeTasksCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { runMaintenance } from "../services/operations/sweeper/src/handler.js";
import { StaleJobSweeper } from "../services/operations/sweeper/src/stale-job-sweeper.js";
import { SlotReconciler } from "../services/operations/sweeper/src/slot-reconciler.js";
import { type ObservedTask } from "../services/operations/sweeper/src/task-identity.js";

// Fixed synthetic identities, no AWS credentials, runner, SDK client or network.
// The real sweep/reconcile implementations receive only these in-memory senders.
const TABLE = "synthetic-maintenance-jobs";
const CLUSTER = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/synthetic-maintenance";
const OWNER = `job_${"a".repeat(48)}`, REPLACEMENT = `job_${"c".repeat(48)}`;
const TASK = `${CLUSTER.replace(":cluster/", ":task/")}/${"b".repeat(32)}`;
const OTHER_TASK = `${CLUSTER.replace(":cluster/", ":task/")}/${"d".repeat(32)}`;
const CREATED = "2026-10-06T00:00:00.000Z", REPLACEMENT_CREATED = "2026-10-06T00:02:00.000Z";
const DEADLINE = "2026-10-06T00:01:00.000Z", FUTURE = "2026-10-06T00:10:00.000Z";
const NOW = new Date("2026-10-06T00:03:00.000Z");
type Item = Record<string, AttributeValue>;
type DynamoCommand = GetItemCommand | UpdateItemCommand | TransactWriteItemsCommand;
type EcsCommand = DescribeTasksCommand | StopTaskCommand;
type Command = DynamoCommand | EcsCommand;
type Summary = { sweep: { inspected: number; timedOut: number; stopRequested: number; retainedForReview: number };
  reconcile: { released: number; retained: number; empty: number } };

export const RECOVERY_SCENARIOS = Object.freeze([
  "running-stop-confirmed", "queued-stop-confirmed", "already-stopped", "slow-stop", "ambiguous-stop-response",
  "concurrent-job-version", "slot-reassigned-before-update", "slot-reassigned-before-release",
  "ambiguous-release-response", "missing-task", "wrong-task-owner", "owner-changed-after-stop",
  "read-failure", "future-deadline", "version-exhausted", "last-safe-version", "pre-aborted",
  "expired-running-evidence", "expired-stopped-evidence", "expired-timeout-ack", "expired-release-ack",
] as const);
export type RecoveryScenario = typeof RECOVERY_SCENARIOS[number];
const check: (value: unknown) => asserts value = value => { if (!value) throw new Error("MAINTENANCE_REHEARSAL_INVARIANT_FAILED"); };
const clone = <T>(value: T): T => structuredClone(value);
const originalJob = (scenario: RecoveryScenario): Item => ({
  jobId: { S: OWNER }, createdAt: { S: CREATED }, deadlineAt: { S: scenario === "future-deadline" ? FUTURE : DEADLINE },
  taskArn: { S: TASK }, status: { S: scenario === "queued-stop-confirmed" ? "QUEUED" : "RUNNING" },
  version: { N: String(scenario === "version-exhausted" ? Number.MAX_SAFE_INTEGER : scenario === "last-safe-version" ? Number.MAX_SAFE_INTEGER - 1 : 3) },
});
function task(owner: string, arn: string, status: string): ObservedTask {
  return { taskArn: arn, clusterArn: CLUSTER, startedBy: owner.slice(0, 36), lastStatus: status,
    desiredStatus: status === "STOPPED" ? "STOPPED" : "RUNNING",
    overrides: { containerOverrides: [{ name: "worker", environment: [{ name: "JOB_ID", value: owner }] }] } };
}
// This is an intentionally small condition evaluator, not a DynamoDB emulator.
// It accepts only equality conjunctions emitted by the two real operators.
function condition(item: Item | undefined, expression: string | undefined,
  names: Record<string, string> | undefined, values: Item | undefined, expected: readonly string[]): boolean {
  check(typeof expression === "string" && names && values);
  const clauses = expression.split(" AND ");
  check(clauses.length === expected.length);
  const fields: string[] = [];
  let matches = true;
  for (const clause of clauses) {
    const tokens = /^(#[A-Za-z]+) = (:[A-Za-z]+)$/.exec(clause);
    check(tokens && names[tokens[1]!] && values[tokens[2]!]);
    const field = names[tokens[1]!]!;
    fields.push(field);
    matches = matches && JSON.stringify(item?.[field]) === JSON.stringify(values[tokens[2]!]);
  }
  check(JSON.stringify(fields.sort()) === JSON.stringify([...expected].sort()));
  return matches;
}

class RecoveryMemory {
  readonly records = new Map<string, Item>();
  readonly tasks = new Map<string, ObservedTask>();
  readonly commands: string[] = [];
  boundaryViolations = 0;
  elapsedMs = 0;
  stopEffects = 0; jobUpdates = 0; releaseEffects = 0; faultInjected = false;
  constructor(readonly scenario: RecoveryScenario) {
    this.records.set("control_slot_0", { jobId: { S: "control_slot_0" }, ownerJobId: { S: OWNER }, acquiredAt: { S: CREATED } });
    this.records.set(OWNER, originalJob(scenario));
    this.tasks.set(TASK, task(OWNER, TASK, scenario === "already-stopped" ? "STOPPED" : "RUNNING"));
    if (scenario === "wrong-task-owner") this.tasks.set(TASK, task(REPLACEMENT, TASK, "RUNNING"));
    if (scenario === "missing-task") this.tasks.delete(TASK);
  }
  private record(command: Command, signal: AbortSignal) {
    check(!signal.aborted && this.commands.length < 60);
    this.commands.push(command.constructor.name);
  }
  private reassign() {
    this.records.set("control_slot_0", { jobId: { S: "control_slot_0" }, ownerJobId: { S: REPLACEMENT }, acquiredAt: { S: REPLACEMENT_CREATED } });
    this.records.set(REPLACEMENT, { jobId: { S: REPLACEMENT }, createdAt: { S: REPLACEMENT_CREATED }, deadlineAt: { S: FUTURE },
      status: { S: "RUNNING" }, version: { N: "1" }, taskArn: { S: OTHER_TASK } });
    this.tasks.set(OTHER_TASK, task(REPLACEMENT, OTHER_TASK, "RUNNING"));
  }
  async sendDynamo(command: DynamoCommand, options: { abortSignal: AbortSignal }): Promise<unknown> {
    this.record(command, options.abortSignal);
    if (command instanceof GetItemCommand) {
      check(command.input.TableName === TABLE && command.input.ConsistentRead === true);
      const key = command.input.Key;
      check(key && Object.keys(key).join() === "jobId" && ["control_slot_0", "control_slot_1", OWNER, REPLACEMENT].includes(key.jobId?.S ?? ""));
      if (this.scenario === "read-failure" && key.jobId?.S === "control_slot_0") throw new Error("PRIVATE_SYNTHETIC_SDK_DETAIL");
      const item = this.records.get(key.jobId!.S!);
      return item ? { Item: clone(item) } : {};
    }
    if (command instanceof UpdateItemCommand) {
      check(command.input.TableName === TABLE && Object.keys(command.input.Key ?? {}).join() === "jobId" && command.input.Key?.jobId?.S === OWNER);
      check(this.tasks.get(TASK)?.lastStatus === "STOPPED");
      if (!this.faultInjected && this.scenario === "concurrent-job-version") {
        this.records.get(OWNER)!.version = { N: "4" }; this.faultInjected = true;
      }
      if (!this.faultInjected && this.scenario === "slot-reassigned-before-update") { this.reassign(); this.faultInjected = true; }
      const item = this.records.get(OWNER)!;
      if (!condition(item, command.input.ConditionExpression, command.input.ExpressionAttributeNames, command.input.ExpressionAttributeValues,
        ["status", "version", "taskArn", "createdAt", "deadlineAt"])) throw new Error("PRIVATE_SYNTHETIC_CONDITION_CONFLICT");
      const values = command.input.ExpressionAttributeValues!;
      check(command.input.UpdateExpression === "SET #status = :timedOut, #updatedAt = :now, #version = :nextVersion, #errorCode = :errorCode, #errorMessage = :errorMessage");
      check(values[":timedOut"]?.S === "TIMED_OUT" && values[":now"]?.S === NOW.toISOString() &&
        values[":errorCode"]?.S === "JOB_DEADLINE_EXCEEDED" && values[":errorMessage"]?.S === "Job deadline exceeded.");
      check(Number.isSafeInteger(Number(values[":nextVersion"]?.N)) && Number(values[":nextVersion"]?.N) === Number(item.version?.N) + 1);
      for (const [field, token] of [["status", ":timedOut"], ["updatedAt", ":now"], ["version", ":nextVersion"],
        ["errorCode", ":errorCode"], ["errorMessage", ":errorMessage"]] as const) item[field] = clone(values[token]!);
      this.jobUpdates++;
      if (!this.faultInjected && this.scenario === "expired-timeout-ack") {
        this.faultInjected = true; this.elapsedMs += 20_000;
      }
      return {};
    }
    check(command instanceof TransactWriteItemsCommand);
    const entries = command.input.TransactItems;
    check(entries?.length === 2 && Object.keys(entries[0]!).join() === "ConditionCheck" && Object.keys(entries[1]!).join() === "Delete");
    const guard = entries[0]!.ConditionCheck!, removal = entries[1]!.Delete!;
    check(guard.TableName === TABLE && guard.Key?.jobId?.S === OWNER && Object.keys(guard.Key).join() === "jobId");
    check(removal.TableName === TABLE && removal.Key?.jobId?.S === "control_slot_0" && Object.keys(removal.Key).join() === "jobId");
    check(this.tasks.get(TASK)?.lastStatus === "STOPPED" && ["SUCCEEDED", "FAILED", "TIMED_OUT"].includes(this.records.get(OWNER)?.status?.S ?? ""));
    if (!this.faultInjected && this.scenario === "slot-reassigned-before-release") { this.reassign(); this.faultInjected = true; }
    // Both comparisons precede deletion. A conflict cannot have a partial effect.
    const jobMatches = condition(this.records.get(OWNER), guard.ConditionExpression, guard.ExpressionAttributeNames,
      guard.ExpressionAttributeValues, ["taskArn", "version", "status", "createdAt"]);
    const slotMatches = condition(this.records.get("control_slot_0"), removal.ConditionExpression, removal.ExpressionAttributeNames,
      removal.ExpressionAttributeValues, ["ownerJobId", "acquiredAt"]);
    if (!jobMatches || !slotMatches) throw new Error("PRIVATE_SYNTHETIC_CONDITION_CONFLICT");
    this.records.delete("control_slot_0"); this.releaseEffects++;
    if (!this.faultInjected && this.scenario === "expired-release-ack") {
      this.faultInjected = true; this.elapsedMs += 10_000;
    }
    if (!this.faultInjected && this.scenario === "ambiguous-release-response") {
      this.faultInjected = true; throw new Error("PRIVATE_SYNTHETIC_RESPONSE_LOST");
    }
    return {};
  }
  async sendEcs(command: EcsCommand, options: { abortSignal: AbortSignal }): Promise<unknown> {
    this.record(command, options.abortSignal);
    check(command.input.cluster === CLUSTER);
    if (command instanceof DescribeTasksCommand) {
      check(command.input.tasks?.length === 1 && command.input.tasks[0] === TASK);
      const observed = this.tasks.get(TASK);
      if (!this.faultInjected && (this.scenario === "expired-running-evidence" && observed?.lastStatus === "RUNNING" ||
          this.scenario === "expired-stopped-evidence" && observed?.lastStatus === "STOPPED")) {
        this.faultInjected = true; this.elapsedMs += 20_000;
      }
      return observed ? { tasks: [clone(observed)], failures: [] } : { tasks: [], failures: [{ reason: "MISSING" }] };
    }
    check(command instanceof StopTaskCommand && command.input.task === TASK && command.input.reason === "JOB_DEADLINE_EXCEEDED");
    const observed = this.tasks.get(TASK)!;
    check(observed.startedBy === OWNER.slice(0, 36) && observed.lastStatus === "RUNNING" && this.stopEffects === 0);
    observed.lastStatus = this.scenario === "slow-stop" ? "STOPPING" : "STOPPED";
    observed.desiredStatus = "STOPPED";
    this.stopEffects++;
    if (this.scenario === "owner-changed-after-stop") this.tasks.set(TASK, task(REPLACEMENT, TASK, "STOPPED"));
    if (this.scenario === "ambiguous-stop-response") throw new Error("PRIVATE_SYNTHETIC_RESPONSE_LOST");
    return {};
  }
}

export async function runRecoveryScenario(scenario: RecoveryScenario) {
  check(RECOVERY_SCENARIOS.includes(scenario));
  const memory = new RecoveryMemory(scenario);
  // The production operators intentionally catch SDK failures. A harness
  // boundary assertion must survive those catches rather than look like a
  // legitimate conservative retention result in a negative scenario.
  const monitor = async (action: () => Promise<unknown>) => {
    try { return await action(); }
    catch (error) {
      if (error instanceof Error && error.message === "MAINTENANCE_REHEARSAL_INVARIANT_FAILED") memory.boundaryViolations++;
      throw error;
    }
  };
  const dynamo = { send: (command: DynamoCommand, options: { abortSignal: AbortSignal }) => monitor(() => memory.sendDynamo(command, options)) };
  const ecs = { send: (command: EcsCommand, options: { abortSignal: AbortSignal }) => monitor(() => memory.sendEcs(command, options)) };
  const config = { region: "ap-northeast-1", tableName: TABLE, clusterArn: CLUSTER, maxActiveJobs: 2, dynamo, ecs,
    elapsedNow: () => memory.elapsedMs };
  const sweep = new StaleJobSweeper(config), reconcile = new SlotReconciler(config);
  const abort = new AbortController();
  if (scenario === "pre-aborted") abort.abort();
  const passes: Summary[] = [];
  for (let pass = 0; pass < 3; pass++) {
    if (pass === 1 && scenario === "slow-stop") memory.tasks.get(TASK)!.lastStatus = "STOPPED";
    passes.push(await runMaintenance({ run: () => sweep.sweep(NOW, abort.signal) },
      { run: () => reconcile.reconcile(abort.signal) }) as Summary);
  }
  const retained = ["missing-task", "wrong-task-owner", "owner-changed-after-stop", "read-failure", "future-deadline", "version-exhausted", "pre-aborted"].includes(scenario);
  const reassigned = ["slot-reassigned-before-update", "slot-reassigned-before-release"].includes(scenario);
  const finalSlot = memory.records.get("control_slot_0");
  check(memory.boundaryViolations === 0);
  check(memory.releaseEffects === (retained || reassigned ? 0 : 1));
  check(retained ? finalSlot?.ownerJobId?.S === OWNER : reassigned ? finalSlot?.ownerJobId?.S === REPLACEMENT : !finalSlot);
  check(memory.jobUpdates === (retained ? 0 : 1));
  check(memory.stopEffects === (retained && scenario !== "owner-changed-after-stop" || scenario === "already-stopped" ? 0 : 1));
  check(!reassigned || memory.tasks.get(OTHER_TASK)?.lastStatus === "RUNNING" && memory.records.get(REPLACEMENT)?.version?.N === "1");
  check(memory.commands.every(name => ["GetItemCommand", "UpdateItemCommand", "TransactWriteItemsCommand", "DescribeTasksCommand", "StopTaskCommand"].includes(name)));
  if (!retained && !reassigned) check(passes[2]!.sweep.inspected === 0 && passes[2]!.reconcile.empty === 2);
  if (["slow-stop", "ambiguous-stop-response", "concurrent-job-version"].includes(scenario)) {
    check(passes[0]!.sweep.timedOut === 0 && passes[0]!.reconcile.released === 0 && passes[0]!.reconcile.retained === 1);
    check(passes[1]!.sweep.timedOut === 1 && passes[1]!.sweep.stopRequested === 0 && passes[1]!.reconcile.released === 1);
  }
  if (scenario === "ambiguous-release-response") check(passes[0]!.reconcile.released === 0 && passes[0]!.reconcile.retained === 1);
  if (["expired-running-evidence", "expired-stopped-evidence"].includes(scenario)) {
    check(memory.faultInjected && passes[0]!.sweep.timedOut === 0 && passes[0]!.sweep.retainedForReview === 2 &&
      passes[0]!.reconcile.released === 0 && passes[1]!.sweep.timedOut === 1 && passes[1]!.reconcile.released === 1);
    check(passes[0]!.sweep.stopRequested === (scenario === "expired-running-evidence" ? 0 : 1));
  }
  if (scenario === "expired-timeout-ack") check(memory.faultInjected && passes[0]!.sweep.timedOut === 0 &&
    passes[0]!.sweep.retainedForReview === 2 && passes[0]!.reconcile.released === 1);
  if (scenario === "expired-release-ack") check(memory.faultInjected && passes[0]!.reconcile.released === 0 &&
    passes[0]!.reconcile.retained === 2 && passes[1]!.reconcile.empty === 2);
  if (scenario === "pre-aborted") check(memory.commands.length === 0);
  return { scenario, passes, inMemoryCommands: memory.commands.length, stopEffects: memory.stopEffects,
    conditionalJobUpdates: memory.jobUpdates, conditionalReleaseEffects: memory.releaseEffects,
    finalSlot: reassigned ? "replacement-retained" : retained ? "original-retained" : "empty",
    replacementUnaffected: true, fixedCommandBoundaryVerified: true, awsCalls: 0, liveAcceptance: false };
}

export async function runMaintenanceRecoveryRehearsal() {
  const scenarios = [];
  for (const scenario of RECOVERY_SCENARIOS) scenarios.push(await runRecoveryScenario(scenario));
  return { mode: "local-maintenance-recovery-rehearsal", scenarios, scenariosPassed: scenarios.length,
    realImplementationsExercised: ["StaleJobSweeper", "SlotReconciler", "runMaintenance"],
    syntheticStateOnly: true, awsCalls: 0, networkCalls: 0, cloudMutations: 0,
    providerCalls: 0, modelCalls: 0, ownedServersStarted: 0, sdkClientsCreated: 0,
    liveAcceptance: false, readyForDeployment: false, readyForPublication: false, privateIdentifiersPrinted: false };
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    if (process.argv.length !== 2) throw new Error("MAINTENANCE_REHEARSAL_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await runMaintenanceRecoveryRehearsal()));
  } catch {
    console.error(JSON.stringify({ error: "MAINTENANCE_REHEARSAL_FAILED", awsCalls: 0, privateIdentifiersPrinted: false }));
    process.exitCode = 1;
  }
}

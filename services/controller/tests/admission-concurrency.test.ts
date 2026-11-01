import assert from "node:assert/strict";
import test from "node:test";
import { GetItemCommand, TransactWriteItemsCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { DynamoDbControllerJobRepository, type ControllerDynamoSender } from "../src/aws-job-repository.js";
import { PublicError } from "../src/contracts.js";

type Item = Record<string, AttributeValue>;
const now = new Date("2026-09-06T00:00:00Z");
const request = { operation: "PRICE", symbol: "QLD", locale: "ko" } as const;
function key(index: number) { return `018f1c2a-b3d4-7e5f-8a90-${String(index).padStart(12, "0")}`; }
function database() {
  const items = new Map<string, Item>([["control_circuit", { state: { S: "CLOSED" }, version: { N: "1" }, reason: { S: "test" }, actor: { S: "operator" }, updatedAt: { S: now.toISOString() } }]]);
  let transactions = 0;
  let mode = "normal";
  // Semantic in-memory stand-in: evaluate every condition before committing
  // any write. This tests orchestration races, not live DynamoDB behavior.
  const client: ControllerDynamoSender = { async send(command) {
    if (command instanceof GetItemCommand) {
      const item = items.get(command.input.Key!.jobId!.S!);
      return item ? { Item: structuredClone(item) } : {};
    }
    assert.ok(command instanceof TransactWriteItemsCommand);
    transactions += 1;
    const parts = command.input.TransactItems!;
    const job = parts[0]!.Put!;
    const check = parts[1]!.ConditionCheck!;
    const slot = parts[2]!.Put!;
    const rate = parts[3]!.Update!;
    if (mode === "close-during-create") items.get("control_circuit")!.state = { S: "OPEN" };
    if (mode === "transport-failure") throw new Error("private endpoint detail");
    if (mode === "transaction-conflict") throw Object.assign(new Error("conflict"), { name: "TransactionCanceledException", CancellationReasons: [{ Code: "TransactionConflict" }] });
    const currentCircuit = items.get("control_circuit");
    const rateKey = rate.Key!.jobId!.S!;
    const count = Number(items.get(rateKey)?.windowCount?.N ?? "0");
    const failures = [
      items.has(job.Item!.jobId!.S!),
      currentCircuit?.state?.S !== "CLOSED" || currentCircuit.version?.N !== check.ExpressionAttributeValues![":version"]!.N,
      items.has(slot.Item!.jobId!.S!),
      count >= Number(rate.ExpressionAttributeValues![":limit"]!.N),
    ];
    if (failures.some(Boolean)) throw Object.assign(new Error("cancelled"), {
      name: "TransactionCanceledException", CancellationReasons: failures.map((failed) => ({ Code: failed ? "ConditionalCheckFailed" : "None" })),
    });
    items.set(job.Item!.jobId!.S!, structuredClone(job.Item!));
    items.set(slot.Item!.jobId!.S!, structuredClone(slot.Item!));
    items.set(rateKey, { windowCount: { N: String(count + 1) } });
    if (mode === "commit-response-lost") throw Object.assign(new Error("response lost"), { name: "TimeoutError" });
    return {};
  } };
  const repository = new DynamoDbControllerJobRepository({ tableName: "jobs-table", region: "ap-northeast-1", timeoutSeconds: 90, ttlSeconds: 86_400, maxJobsPerMinute: 10, maxActiveJobs: 2, client });
  return { repository, items, transactions: () => transactions, setMode(value: string) { mode = value; } };
}

test("20 simultaneous unique requests reserve at most two jobs and two slots", async () => {
  const db = database();
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => db.repository.create(request, key(i), now)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal([...db.items.keys()].filter((k) => k.startsWith("job_")).length, 2);
  assert.equal([...db.items.keys()].filter((k) => k.startsWith("control_slot_")).length, 2);
  assert.equal([...db.items.values()].find((v) => v.windowCount)?.windowCount?.N, "2");
  assert.equal(db.items.get("control_slot_0")?.expiresAt, undefined);
  // Advancing the minute does not release unresolved Fargate capacity.
  await assert.rejects(db.repository.create(request, key(30), new Date(now.getTime() + 60_000)), (e: unknown) => e instanceof PublicError && e.code === "RATE_LIMITED");
});

test("concurrent equivalent requests create one job and do not consume extra capacity", async () => {
  const db = database();
  const results = await Promise.all(Array.from({ length: 10 }, () => db.repository.create(request, key(1), now)));
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.job.jobId)).size, 1);
  assert.equal([...db.items.values()].find((v) => v.windowCount)?.windowCount?.N, "1");
  await assert.rejects(db.repository.create({ ...request, symbol: "TSLA" }, key(1), now), (e: unknown) => e instanceof PublicError && e.code === "IDEMPOTENCY_CONFLICT");
});

test("opening the circuit between read and commit leaves no job or slot", async () => {
  const db = database(); db.setMode("close-during-create");
  await assert.rejects(db.repository.create(request, key(1), now), (e: unknown) => e instanceof PublicError && e.code === "CIRCUIT_OPEN");
  assert.equal(db.items.size, 1);
});

test("unknown transport/transaction failures do not retry using another slot", async () => {
  for (const mode of ["transport-failure", "transaction-conflict"]) {
    const db = database(); db.setMode(mode);
    await assert.rejects(db.repository.create(request, key(1), now));
    assert.equal(db.transactions(), 1);
    assert.equal(db.items.size, 1);
  }
});

test("lost commit response retains capacity and replay never asks for another launch", async () => {
  const db = database(); db.setMode("commit-response-lost");
  await assert.rejects(db.repository.create(request, key(1), now));
  db.setMode("normal");
  const replay = await db.repository.create(request, key(1), now);
  assert.equal(replay.created, false);
  assert.equal([...db.items.keys()].filter((k) => k.startsWith("control_slot_")).length, 1);
});

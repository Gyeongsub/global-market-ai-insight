import assert from "node:assert/strict";
import test from "node:test";

test("late circuit read fails OPEN and late mutation acknowledgement requires independent reconciliation", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const store = new DynamoDbCircuitStore("synthetic-jobs", "ap-northeast-1", { async send() {
    calls++; context.mock.timers.tick(2000);
    return { Item: { state: { S: "CLOSED" }, version: { N: "1" }, reason: { S: "test" }, actor: { S: "test" }, updatedAt: { S: "2026-10-19T00:00:00.000Z" } } };
  } });
  assert.equal(await store.state(), "OPEN");
  await assert.rejects(store.change({ state: "OPEN", reason: "test", actor: "test", expectedVersion: 1, now: new Date("2026-10-19T00:00:00.000Z") }),
    { message: "Circuit change failed; read the current version before retrying." });
  assert.equal(calls, 2);
  const parent = new AbortController(); parent.abort();
  assert.equal(await store.state(parent.signal), "OPEN"); assert.equal(calls, 2);
});
import { GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDbCircuitStore, decodeCircuit } from "../src/store.js";

const now = new Date("2026-09-06T00:00:00Z");
const good = { state: { S: "CLOSED" }, reason: { S: "operator-reset" }, actor: { S: "operator" }, updatedAt: { S: now.toISOString() }, version: { N: "2" } };

test("missing, malformed, expired-by-TTL and unreadable circuit all block new work", async () => {
  for (const item of [undefined, {}, { ...good, version: { N: "0" } }, { ...good, expiresAt: { N: "0" } }]) {
    assert.equal(decodeCircuit(item), null);
    const store = new DynamoDbCircuitStore("jobs-table", "ap-northeast-1", { async send() { return { Item: item }; } });
    assert.equal(await store.state(), "OPEN");
  }
  const failure = new DynamoDbCircuitStore("jobs-table", "ap-northeast-1", { async send() { throw new Error("private SDK detail"); } });
  assert.equal(await failure.state(), "OPEN");
});

test("circuit is read consistently without a cached CLOSED value", async () => {
  let reads = 0;
  const store = new DynamoDbCircuitStore("jobs-table", "ap-northeast-1", { async send(command) {
    assert.ok(command instanceof GetItemCommand);
    assert.equal(command.input.ConsistentRead, true);
    return { Item: { ...good, state: { S: ++reads === 1 ? "CLOSED" : "OPEN" } } };
  } });
  assert.equal(await store.state(), "CLOSED");
  assert.equal(await store.state(), "OPEN");
});

test("operator initializes OPEN and must confirm/version-check a manual reset", async () => {
  const writes: UpdateItemCommand[] = [];
  const store = new DynamoDbCircuitStore("jobs-table", "ap-northeast-1", { async send(command) { assert.ok(command instanceof UpdateItemCommand); writes.push(command); return {}; } });
  const base = { reason: "operator-action", actor: "operator", now };
  await assert.rejects(store.change({ ...base, state: "CLOSED", expectedVersion: 0, confirmed: true }));
  await assert.rejects(store.change({ ...base, state: "CLOSED", expectedVersion: 1 }));
  assert.equal(writes.length, 0);
  await store.change({ ...base, state: "OPEN", expectedVersion: 0 });
  await store.change({ ...base, state: "CLOSED", expectedVersion: 1, confirmed: true });
  assert.equal(writes[0]?.input.ConditionExpression, "attribute_not_exists(#version)");
  assert.equal(writes[1]?.input.ExpressionAttributeValues?.[":expected"]?.N, "1");
  assert.equal(writes[1]?.input.ExpressionAttributeValues?.[":next"]?.N, "2");
  const conflict = new DynamoDbCircuitStore("jobs-table", "ap-northeast-1", { async send() { throw new Error("sensitive conflict detail"); } });
  await assert.rejects(conflict.change({ ...base, state: "OPEN", expectedVersion: 1 }), /read the current version/);
});

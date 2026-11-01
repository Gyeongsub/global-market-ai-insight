import assert from "node:assert/strict";
import test from "node:test";
import { mayCreateWork, openCircuit, resetCircuit, type CircuitRecord } from "../src/circuit.js";

const closed: CircuitRecord = { state: "CLOSED", reason: "initial", actor: "system", updatedAt: "2026-08-08T00:00:00.000Z", version: 1 };

test("opens the circuit with audit fields and blocks new work", () => {
  const opened = openCircuit({ current: closed, reason: "provider-rate-limit", actor: "operator", now: new Date("2026-08-08T01:00:00Z"), cooldownSeconds: 300 });
  assert.equal(opened.state, "OPEN");
  assert.equal(opened.expiresAt, "2026-08-08T01:05:00.000Z");
  assert.equal(mayCreateWork(opened), false);
});

test("requires explicit confirmation before reset", () => {
  const opened = openCircuit({ current: closed, reason: "manual-test", actor: "operator", now: new Date("2026-08-08T01:00:00Z") });
  assert.throws(() => resetCircuit({ current: opened, actor: "operator", now: new Date(), confirmed: false }), /explicit confirmation/);
  assert.equal(resetCircuit({ current: opened, actor: "operator", now: new Date("2026-08-08T01:10:00Z"), confirmed: true }).state, "CLOSED");
});

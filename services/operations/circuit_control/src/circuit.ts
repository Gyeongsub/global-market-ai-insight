export type CircuitState = "CLOSED" | "OPEN";

export interface CircuitRecord {
  state: CircuitState;
  reason: string;
  actor: string;
  updatedAt: string;
  expiresAt?: string;
  version: number;
}

export function openCircuit(input: { current: CircuitRecord; reason: string; actor: string; now: Date; cooldownSeconds?: number }): CircuitRecord {
  if (!input.reason.trim() || !input.actor.trim()) throw new Error("Circuit reason and actor are required.");
  return {
    state: "OPEN",
    reason: input.reason,
    actor: input.actor,
    updatedAt: input.now.toISOString(),
    ...(input.cooldownSeconds ? { expiresAt: new Date(input.now.getTime() + input.cooldownSeconds * 1_000).toISOString() } : {}),
    version: input.current.version + 1,
  };
}

export function resetCircuit(input: { current: CircuitRecord; actor: string; now: Date; confirmed: boolean }): CircuitRecord {
  if (!input.confirmed) throw new Error("Manual circuit reset requires explicit confirmation.");
  return { state: "CLOSED", reason: "manual-reset", actor: input.actor, updatedAt: input.now.toISOString(), version: input.current.version + 1 };
}

export function mayCreateWork(record: CircuitRecord): boolean {
  return record.state === "CLOSED";
}

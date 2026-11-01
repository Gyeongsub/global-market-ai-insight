import { performance } from "node:perf_hooks";
import { ElapsedBudget } from "./elapsed-budget.js";

export class AwsCallTimeoutError extends Error {
  constructor() { super("AWS call exceeded its time budget."); this.name = "TimeoutError"; }
}

/** Abort is a request to the transport, not proof it cancelled an AWS effect.
 * Only an in-budget acknowledgement may continue the caller. A timed-out write
 * may already be committed; do not retry or invent rollback from this result. */
export class AwsCallBudget extends ElapsedBudget {
  constructor(limitMs: number, elapsedNow: () => number = () => performance.now(), parent?: AbortSignal) {
    if (!Number.isSafeInteger(limitMs) || limitMs < 250 || limitMs > 15_000) throw new Error("Invalid AWS call budget.");
    super(limitMs, elapsedNow, parent, () => new AwsCallTimeoutError());
  }
}

export async function boundedAwsCall<T>(send: (signal: AbortSignal) => Promise<T>, limitMs: number,
  elapsedNow: () => number = () => performance.now(), parent?: AbortSignal): Promise<T> {
  const budget = new AwsCallBudget(limitMs, elapsedNow, parent);
  try { return await budget.call(send); } finally { budget.dispose(); }
}

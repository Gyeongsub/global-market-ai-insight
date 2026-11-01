import type { JobOperation, JobStatus } from "../types/market.js";
import type { DemoError } from "./demo-error.js";
export type { DemoError } from "./demo-error.js";

export const demoScenarios = ["success", "unavailable", "timeout", "circuit"] as const;
export type DemoScenario = typeof demoScenarios[number];
export const demoTiming = { runningMs: 650, terminalMs: 1850 } as const;
export interface DemoStep { afterMs: number; status: JobStatus; error: DemoError | null; hasInsight: boolean }
export function isDemoScenario(value: unknown): value is DemoScenario {
  return demoScenarios.some(scenario => scenario === value);
}

// Local presentation only: this plan has no transport, credentials or cloud effects.
export function planDemoJob(operation: JobOperation, scenario: DemoScenario, available: boolean): DemoStep[] {
  if ((operation !== "PRICE" && operation !== "ANALYZE") || !isDemoScenario(scenario) || typeof available !== "boolean") throw new Error("Invalid demo plan");
  if (scenario === "circuit") return [{ afterMs: 0, status: "FAILED", error: "CIRCUIT_OPEN", hasInsight: false }];
  const error = scenario === "timeout" ? "TIMED_OUT" : scenario === "unavailable" || !available ? "DATA_UNAVAILABLE" : null;
  return [
    { afterMs: 0, status: "QUEUED", error: null, hasInsight: false },
    { afterMs: demoTiming.runningMs, status: "RUNNING", error: null, hasInsight: false },
    { afterMs: demoTiming.terminalMs, status: error === "TIMED_OUT" ? "TIMED_OUT" : error ? "FAILED" : "SUCCEEDED", error, hasInsight: !error && operation === "ANALYZE" },
  ];
}

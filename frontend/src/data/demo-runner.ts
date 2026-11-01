import { planDemoJob, type DemoScenario, type DemoStep } from "./demo-job.js";
import type { JobOperation } from "../types/market.js";

export interface DemoClock {
  set(callback: () => void, delayMs: number): number;
  clear(handle: number): void;
}

// Local presentation only. Cancelling this runner never stops a cloud worker.
export function createDemoRunner(clock: DemoClock, emit: (step: DemoStep) => void) {
  let active = false;
  let generation = 0;
  const pending = new Set<number>();

  function cancel() {
    generation += 1;
    active = false;
    for (const handle of pending) clock.clear(handle);
    pending.clear();
  }

  return {
    isActive: () => active,
    cancel,
    start(operation: JobOperation, scenario: DemoScenario, available: boolean) {
      if (active) return false;
      const steps = planDemoJob(operation, scenario, available);
      cancel();
      const run = generation;
      active = true;
      for (const step of steps) {
        // Cleanup can occur during a notification; do not schedule stale work.
        if (generation !== run) break;
        const apply = () => {
          if (generation !== run) return;
          active = step.status === "QUEUED" || step.status === "RUNNING";
          emit(step);
        };
        if (step.afterMs === 0) apply();
        else {
          const handle = clock.set(() => { pending.delete(handle); apply(); }, step.afterMs);
          pending.add(handle);
        }
      }
      return true;
    },
  };
}

import type { PublicJob } from "../api/jobs.js";
import type { JobStatus } from "../types/market.js";
import type { ContractDemoStep } from "./contract-demo.js";
import type { DemoError } from "./demo-job.js";
import { localDemoJobId } from "./local-demo-job-id.js";

export interface DashboardJobState {
  readonly status: JobStatus;
  readonly hasInsight: boolean;
  readonly completed: Readonly<PublicJob> | null;
  readonly priceResult: Record<string, unknown> | null;
  readonly error: DemoError | null;
  readonly jobId: string | null;
  readonly waitingStopped: boolean;
  readonly submitting: boolean;
}
const empty: DashboardJobState = Object.freeze({ status: "IDLE", hasInsight: false, completed: null,
  priceResult: null, error: null, jobId: null, waitingStopped: false, submitting: false });
export type DashboardJobAction = { type: "reset" | "begin" | "stop-waiting" } | { type: "step"; step: ContractDemoStep };

/** UI waiting is not a remote job state or cancellation API. The runner owns
 * transport cancellation; this reducer cannot submit or stop remote work. */
export function dashboardJobReducer(state: DashboardJobState, action: DashboardJobAction): DashboardJobState {
  if (action.type === "reset") return empty;
  if (action.type === "begin") return { ...empty, priceResult: state.priceResult };
  if (action.type === "stop-waiting") {
    if (state.status !== "QUEUED" && state.status !== "RUNNING") return state;
    return { ...empty, priceResult: state.priceResult, jobId: state.jobId, waitingStopped: true };
  }
  if (action.type !== "step" || state.waitingStopped) return state;
  const { step } = action;
  const jobId = localDemoJobId(step.jobId);
  return { status: step.status, hasInsight: step.hasInsight, completed: step.job ?? null, error: step.error,
    jobId: jobId ?? (step.status === "QUEUED" ? null : state.jobId), waitingStopped: false,
    submitting: step.status === "QUEUED" && step.submitting === true,
    priceResult: step.job?.operation === "PRICE" && step.job.result ? step.job.result : state.priceResult };
}

export const initialDashboardJobState = empty;

export interface SweepCandidate {
  jobId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  deadlineAt: string;
  taskArn?: string;
}

export interface SweepDecision {
  jobId: string;
  nextStatus: "TIMED_OUT";
  stopTask: boolean;
  reason: "JOB_DEADLINE_EXCEEDED";
}

export function evaluateStaleJob(job: SweepCandidate, now: Date): SweepDecision | null {
  if (job.status !== "QUEUED" && job.status !== "RUNNING") return null;
  if (Number.isNaN(Date.parse(job.deadlineAt)) || Number.isNaN(now.getTime())) throw new Error("Invalid sweep timestamp.");
  if (Date.parse(job.deadlineAt) > now.getTime()) return null;
  return { jobId: job.jobId, nextStatus: "TIMED_OUT", stopTask: Boolean(job.taskArn), reason: "JOB_DEADLINE_EXCEEDED" };
}

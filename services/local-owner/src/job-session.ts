import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { acceptedJob, publicJob, validateJobRequest, type JobRequest, type AcceptedJob, type PublicJob } from "../../../frontend/src/api/jobs.js";
import { stableHash } from "../../controller/src/job.js";
import { ownerAdmissionAllowed, type OwnerAdmissionWindow } from "../../controller/src/owner-admission-window.js";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";
import errorSchema from "../../../shared/schemas/error.schema.json" with { type: "json" };

export const OWNER_JOB_LIMITS = Object.freeze({ posts: 1, reads: 16, lifetimeMs: 120_000, minPollMs: 4_000 });
export interface OwnerJobTransport {
  request(method: "GET" | "POST", path: string, body?: Record<string, unknown>, headers?: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>>;
}
export type OwnerJobSessionStatus = "READY" | "SUBMITTING" | "ACCEPTED" | "TERMINAL" | "UNVERIFIED" | "CLOSED";
export class OwnerJobSessionError extends Error {
  constructor(public readonly code: "NOT_READY" | "BUSY" | "POLL_TOO_EARLY" | "LIMIT_REACHED" | "UNAVAILABLE") {
    super(`OWNER_JOB_${code}`);
  }
}
const failureCodes = new Set<string>([...errorSchema.properties.error.properties.code.enum, "JOB_DEADLINE_EXCEEDED"]);

/** Unwired local preparation: no SDK, credentials, HTTP listener or automatic
 * task enablement. An injected transport is not proof of deployment, entitlement
 * or authority. A future operator must verify those and journal the exact expected
 * job before providing a real transport. The currently executable observation
 * server cannot reach this class or submit a job. */
export function createOwnerJobSession(transport: OwnerJobTransport, input: JobRequest,
  window: OwnerAdmissionWindow | null, clocks: { wall?: () => number; elapsed?: () => number } = {}) {
  validateJobRequest(input);
  const request = Object.freeze({ operation: input.operation, symbol: input.symbol, locale: input.locale });
  const scope = window === null ? null : Object.freeze({ startsAtMs: window.startsAtMs, expiresAtMs: window.expiresAtMs });
  const wall = clocks.wall ?? Date.now, elapsed = clocks.elapsed ?? (() => performance.now());
  const send = transport.request.bind(transport);
  let key: string = randomUUID();
  // Matches the controller's deterministic job identity; tests bind both sides.
  const expectedJobId = `job_${stableHash(key).slice(0, 48)}`;
  let status: OwnerJobSessionStatus = "READY", posts = 0, reads = 0, inFlight = false;
  let accepted: AcceptedJob | undefined, previous: PublicJob | undefined, nextPollAt = -Infinity;
  const budget = new ElapsedBudget(OWNER_JOB_LIMITS.lifetimeMs, elapsed, undefined, () => new OwnerJobSessionError("UNAVAILABLE"));
  const lifetime = setTimeout(() => close(posts === 0 ? "CLOSED" : "UNVERIFIED"), OWNER_JOB_LIMITS.lifetimeMs);
  function close(next: "CLOSED" | "UNVERIFIED" | "TERMINAL" = "CLOSED") {
    status = next; key = ""; accepted = undefined; previous = undefined; clearTimeout(lifetime); budget.dispose();
  }
  function active() {
    if (!budget.active()) { close(status === "CLOSED" ? "CLOSED" : "UNVERIFIED"); throw new OwnerJobSessionError("UNAVAILABLE"); }
  }
  const failClosed = () => close(status === "CLOSED" ? "CLOSED" : "UNVERIFIED");
  async function start(): Promise<Readonly<AcceptedJob>> {
    if (status !== "READY" || inFlight) throw new OwnerJobSessionError("NOT_READY");
    status = "SUBMITTING"; inFlight = true;
    try {
      active();
      if (!ownerAdmissionAllowed(scope, wall())) throw new OwnerJobSessionError("UNAVAILABLE");
      const idempotencyKey = key; key = "";
      const raw = await budget.call(signal => {
        if (!ownerAdmissionAllowed(scope, wall())) throw new OwnerJobSessionError("UNAVAILABLE");
        posts++;
        return send("POST", "v1/jobs", { ...request }, { "idempotency-key": idempotencyKey }, signal);
      });
      active();
      const value = acceptedJob(raw);
      if (value.jobId !== expectedJobId) throw new OwnerJobSessionError("UNAVAILABLE");
      accepted = Object.freeze({ ...value }); status = "ACCEPTED";
      return accepted;
    } catch { failClosed(); throw new OwnerJobSessionError("UNAVAILABLE"); }
    finally { inFlight = false; }
  }
  async function poll(): Promise<Readonly<PublicJob>> {
    if (inFlight) throw new OwnerJobSessionError("BUSY");
    if (status !== "ACCEPTED" || !accepted) throw new OwnerJobSessionError("NOT_READY");
    active();
    if (reads >= OWNER_JOB_LIMITS.reads) { close("UNVERIFIED"); throw new OwnerJobSessionError("LIMIT_REACHED"); }
    if (elapsed() < nextPollAt) throw new OwnerJobSessionError("POLL_TOO_EARLY");
    inFlight = true;
    try {
      reads++;
      const raw = await budget.call(signal => send("GET", `v1/jobs/${expectedJobId}`, undefined, {}, signal));
      active();
      const value = publicJob(raw);
      // Licensed results remain blocked in this metadata-only candidate, even
      // when the payload would otherwise pass the ordinary public schema.
      if (value.result !== undefined || value.jobId !== expectedJobId || value.operation !== request.operation ||
          value.symbol !== request.symbol || value.locale !== request.locale || value.expiresAt !== accepted.expiresAt ||
          Date.parse(value.createdAt) > Date.parse(value.updatedAt) || Date.parse(value.updatedAt) >= Date.parse(value.expiresAt) ||
          value.errorCode !== undefined && !failureCodes.has(value.errorCode) ||
          previous && (value.createdAt !== previous.createdAt || value.updatedAt < previous.updatedAt ||
            previous.status === "RUNNING" && value.status === "QUEUED")) throw new OwnerJobSessionError("UNAVAILABLE");
      const view = Object.freeze({ ...value });
      if (["SUCCEEDED", "FAILED", "TIMED_OUT"].includes(value.status)) close("TERMINAL");
      else { previous = view; nextPollAt = elapsed() + OWNER_JOB_LIMITS.minPollMs; }
      return view;
    } catch { failClosed(); throw new OwnerJobSessionError("UNAVAILABLE"); }
    finally { inFlight = false; }
  }
  return {
    start, poll, close: () => close(),
    // Operator-only recovery hint, not proof the job exists or has stopped.
    expectedJobId,
    snapshot: () => {
      const current = budget.active();
      if (!current && ["READY", "SUBMITTING", "ACCEPTED"].includes(status)) close(posts === 0 ? "CLOSED" : "UNVERIFIED");
      return { status, postAttempts: posts, statusReadAttempts: reads, inFlight, keyRetained: key !== "",
        remoteMayContinue: posts > 0, independentClosureRequired: posts > 0, timerActive: current };
    },
  };
}

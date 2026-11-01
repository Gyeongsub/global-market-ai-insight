import { MarketApiClient, MarketApiError, validateJobRequest, type JobRequest, type PublicJob } from "./jobs.js";
import errorSchema from "../../../shared/schemas/error.schema.json" with { type: "json" };

export const JOB_SESSION_TIMEOUT_MS = 90_000;
const publicCodes = new Set<string>(errorSchema.properties.error.properties.code.enum);
type Context = { readonly request: Readonly<JobRequest>; readonly jobId?: string };
export type JobSessionState =
  | { readonly status: "IDLE" }
  | (Context & { readonly status: "SUBMITTING" | "QUEUED" | "RUNNING" })
  | (Context & { readonly status: "SUCCEEDED"; readonly job: Readonly<PublicJob>; readonly resultAvailable: boolean })
  | (Context & { readonly status: "FAILED" | "TIMED_OUT"; readonly code: string; readonly remoteMayContinue: boolean })
  | (Context & { readonly status: "CANCELLED"; readonly remoteMayContinue: boolean });

/** One explicit user intent, at most one POST. It is deliberately not a reusable
 * queue/retry engine, authentication provider or remote cancellation mechanism.
 * The production dashboard remains fixture-only until its separate gates pass. */
export function createJobSession(client: MarketApiClient, observe: (state: JobSessionState) => void) {
  let state: JobSessionState = Object.freeze({ status: "IDLE" });
  let used = false, disposed = false, active = false, sent = false, timedOut = false;
  let context: Context | undefined;
  const controller = new AbortController();

  function publish(next: JobSessionState) {
    if (disposed) return;
    state = Object.freeze(next);
    // A view failure cannot restart a POST, leak an exception's prose, or turn a
    // remote result into a service failure. The current state remains readable.
    try { observe(state); } catch { /* Observer errors are not API responses. */ }
  }
  const current = () => active && !disposed && !controller.signal.aborted;

  function cancel() {
    if (!active || !context) return false;
    active = false;
    controller.abort();
    publish({ ...context, status: "CANCELLED", remoteMayContinue: sent });
    return true;
  }

  async function start(request: JobRequest, idempotencyKey?: string): Promise<boolean> {
    if (used || disposed) return false;
    // Reject invalid local intent without consuming the session or notifying a
    // view with extra/private request fields. The client's validator is shared.
    validateJobRequest(request);
    context = { request: Object.freeze({ ...request }) };
    used = true; active = true;
    const started = performance.now();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, JOB_SESSION_TIMEOUT_MS);
    try {
      publish({ ...context, status: "SUBMITTING" });
      if (!current()) return true;
      sent = true; // Conservative: failure/abort cannot prove no remote work.
      const accepted = await client.createJob(context.request, idempotencyKey, controller.signal);
      if (!current()) return true;
      context = { ...context, jobId: accepted.jobId };
      // Accepted status is only metadata; even an idempotent terminal replay
      // needs GET validation before a terminal state/result can reach the view.
      publish({ ...context, status: "QUEUED" });
      if (!current()) return true;
      const remaining = Math.floor(JOB_SESSION_TIMEOUT_MS - (performance.now() - started));
      if (!Number.isSafeInteger(remaining) || remaining < 1000 || remaining > JOB_SESSION_TIMEOUT_MS) {
        timedOut = true; controller.abort(); throw new Error("SESSION_DEADLINE");
      }
      const job = await client.pollJob(accepted, {
        signal: controller.signal, maxDurationMs: remaining,
        onStatus(status) {
          if (current() && state.status === "RUNNING" && status === "QUEUED")
            throw new MarketApiError("INVALID_RESPONSE", 502, "The job state regressed.");
          if (current() && (status === "QUEUED" || status === "RUNNING")) publish({ ...context!, status });
        },
      });
      if (!current()) return true;
      if (job.jobId !== context.jobId || job.operation !== context.request.operation ||
          job.symbol !== context.request.symbol || job.locale !== context.request.locale)
        throw new MarketApiError("INVALID_RESPONSE", 502, "The job does not match the request.");
      if (job.status === "SUCCEEDED") {
        // Results disabled by server policy remain unavailable. Never insert a
        // local fixture, translate another locale, or use another asset here.
        const result = job.result === undefined ? undefined : Object.freeze(Object.fromEntries(
          Object.entries(job.result).map(([key, value]) => [key, Array.isArray(value) ? Object.freeze([...value]) : value])));
        active = false;
        publish({ ...context, status: "SUCCEEDED", job: Object.freeze({ ...job, ...(result ? { result } : {}) }),
          resultAvailable: result !== undefined });
      } else if (job.status === "FAILED" || job.status === "TIMED_OUT") {
        active = false;
        publish({ ...context, status: job.status, code: publicCodes.has(job.errorCode ?? "") ? job.errorCode! : "REQUEST_FAILED",
          // A terminal record can precede process exit. Only independent worker
          // inspection can establish that remote execution/cost has stopped.
          remoteMayContinue: true });
      } else throw new MarketApiError("INVALID_RESPONSE", 502, "The job is not terminal.");
    } catch (error) {
      if (!active || disposed) return true;
      const timeout = timedOut || error instanceof MarketApiError && error.code === "POLL_TIMEOUT";
      const code = timeout ? "POLL_TIMEOUT" : error instanceof MarketApiError &&
        (publicCodes.has(error.code) || error.code === "INVALID_RESPONSE") ? error.code : "REQUEST_FAILED";
      active = false;
      publish({ ...context, status: timeout ? "TIMED_OUT" : "FAILED", code, remoteMayContinue: sent });
    } finally {
      active = false; clearTimeout(timer);
    }
    return true;
  }

  return {
    start, cancel, isActive: () => active, getState: () => state,
    dispose() {
      disposed = true;
      if (active && context) state = Object.freeze({ ...context, status: "CANCELLED", remoteMayContinue: sent });
      active = false; controller.abort();
    },
  };
}

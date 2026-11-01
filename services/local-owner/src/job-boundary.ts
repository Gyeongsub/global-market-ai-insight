import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { acceptedJob, publicJob } from "../../../frontend/src/api/jobs.js";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";
import { createOwnerJobSession, OWNER_JOB_LIMITS, OwnerJobSessionError } from "./job-session.js";
import { validateOwnerLocalRequest } from "./server.js";

type Session = ReturnType<typeof createOwnerJobSession>;
export type OwnerJobBoundaryRequest = Pick<IncomingMessage, "method" | "url" | "headers" | "rawHeaders">;
export interface OwnerJobBoundaryResponse { status: number; body: Readonly<Record<string, unknown>> }
export const OWNER_JOB_BOUNDARY_LIMITS = Object.freeze({ requests: 32, lifetimeMs: OWNER_JOB_LIMITS.lifetimeMs });
const routes = ["/bridge/job/start", "/bridge/job/status", "/bridge/job/close"];
const reject = (status: number, code: string): OwnerJobBoundaryResponse => ({ status, body: Object.freeze({ error: Object.freeze({ code }) }) });

/** Request-level candidate only. No listener, SDK, credential loader, config
 * enablement, browser bootstrap or automatic polling. The current observation
 * server cannot reach it. A future host must retain all existing socket/header,
 * CSP and no-store guards and supply a preflighted, recorded one-job session. */
export function createOwnerJobBoundary(session: Session, origin: string, capability: string, elapsed?: () => number) {
  if (origin !== "http://127.0.0.1:4175" || !/^[a-f0-9]{64}$/.test(capability)) throw Error("OWNER_JOB_BOUNDARY_OPTIONS_REJECTED");
  const start = session.start.bind(session), poll = session.poll.bind(session), closeSession = session.close.bind(session);
  const expectedJobId = session.expectedJobId;
  if (!/^job_[a-f0-9]{48}$/.test(expectedJobId)) throw Error("OWNER_JOB_BOUNDARY_OPTIONS_REJECTED");
  let retainedCapability = capability, closed = false, requests = 0, submitted = false, busy = false;
  const budget = new ElapsedBudget(OWNER_JOB_BOUNDARY_LIMITS.lifetimeMs, elapsed);
  const timer = setTimeout(close, OWNER_JOB_BOUNDARY_LIMITS.lifetimeMs);
  function close() {
    closed = true; retainedCapability = ""; clearTimeout(timer); budget.dispose(); closeSession();
  }
  const live = () => { if (closed || !budget.active()) { close(); return false; } return true; };
  function authorize(request: OwnerJobBoundaryRequest): string {
    if (request.method !== "POST" || !routes.includes(request.url ?? "")) throw Error();
    // Reuse the exact empty-body, Host/Origin/Fetch-Metadata/duplicate-header
    // policy. Only the three fixed routes above are remapped, never caller URLs.
    validateOwnerLocalRequest({ ...request, url: "/bridge/observation" }, origin);
    const supplied = request.headers["x-gmai-local-capability"];
    if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(retainedCapability))) throw Error();
    return request.url!;
  }
  async function handle(request: OwnerJobBoundaryRequest): Promise<OwnerJobBoundaryResponse> {
    if (++requests > OWNER_JOB_BOUNDARY_LIMITS.requests || !live()) { close(); return reject(410, "OWNER_LOCAL_CLOSED"); }
    let route: string;
    try { route = authorize(request); } catch { return reject(403, "OWNER_LOCAL_REQUEST_REJECTED"); }
    if (route === "/bridge/job/close") {
      close();
      return { status: 200, body: Object.freeze({ closed: true, remoteMayContinue: submitted, independentClosureRequired: submitted }) };
    }
    if (busy) return reject(409, "OWNER_JOB_BUSY");
    if (route === "/bridge/job/start" && submitted) return reject(409, "OWNER_JOB_NOT_READY");
    if (route === "/bridge/job/status" && !submitted) return reject(409, "OWNER_JOB_NOT_READY");
    busy = true;
    try {
      if (route === "/bridge/job/start") {
        submitted = true; // Conservative even if the underlying request never left.
        const raw = await budget.call(() => start());
        if (!live()) return reject(410, "OWNER_LOCAL_CLOSED");
        const value = acceptedJob(raw);
        if (value.jobId !== expectedJobId) throw Error();
        return { status: 202, body: Object.freeze({ ...value }) };
      }
      const raw = await budget.call(() => poll());
      if (!live()) return reject(410, "OWNER_LOCAL_CLOSED");
      const value = publicJob(raw);
      if (value.jobId !== expectedJobId || value.result !== undefined) throw Error();
      return { status: 200, body: Object.freeze({ ...value }) };
    } catch (error) {
      if (!live()) return reject(410, "OWNER_LOCAL_CLOSED");
      if (error instanceof OwnerJobSessionError && ["BUSY", "POLL_TOO_EARLY", "NOT_READY"].includes(error.code))
        return reject(409, `OWNER_JOB_${error.code}`);
      close(); return reject(503, "OWNER_JOB_UNAVAILABLE");
    } finally { busy = false; }
  }
  return { handle, close, snapshot: () => {
    live();
    return { closed, requests, capabilityRetained: retainedCapability !== "", inFlight: busy,
      submissionAttempted: submitted, remoteMayContinue: submitted, independentClosureRequired: submitted };
  } };
}

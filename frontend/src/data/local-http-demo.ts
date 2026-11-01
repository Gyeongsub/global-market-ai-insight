import { MarketApiClient, validateJobRequest, type JobRequest } from "../api/jobs.js";
import { createJobSession } from "../api/job-session.js";
import { contractDemoResult, sessionDemoStep, type ContractDemoStep } from "./contract-demo.js";
import { isDemoScenario, type DemoScenario } from "./demo-job.js";
import type { DemoClock } from "./demo-runner.js";
import { getAsset } from "./assets.js";

const LOCAL_ORIGIN = "http://127.0.0.1:4174";
export function isLocalHttpDemoLocation(value: string): boolean {
  try {
    if (typeof value !== "string" || value.length > 2048) return false;
    const url = new URL(value);
    return url.origin === "http://127.0.0.1:5173" && url.pathname === "/http-demo" &&
      !url.username && !url.password && !url.search && (!url.hash || url.hash === "#main-content");
  } catch { return false; }
}

/** Developer-only loopback fixture transport. No endpoint input, credential,
 * production feature flag, cloud fallback or silent result substitution. */
export function createLocalHttpDemoRunner(clock: DemoClock, emit: (step: ContractDemoStep) => void, nativeFetch: typeof fetch = fetch) {
  void clock;
  let session: ReturnType<typeof createJobSession> | undefined;
  function cancel() { session?.dispose(); session = undefined; }
  return {
    cancel, isActive: () => session?.isActive() ?? false,
    start(request: JobRequest, scenario: DemoScenario, available: boolean) {
      if (session?.isActive()) return false;
      validateJobRequest(request);
      if (!isDemoScenario(scenario) || typeof available !== "boolean") throw Error("LOCAL_HTTP_FIXTURE_PLAN_REJECTED");
      cancel(); const intent = Object.freeze({ ...request });
      const client = new MarketApiClient(LOCAL_ORIGIN, (input, init) => {
        const url = new URL(input);
        if (url.origin !== LOCAL_ORIGIN || url.username || url.password || url.search || url.hash ||
            !/^\/v1\/jobs(?:\/[A-Za-z0-9_-]{16,64})?$/.test(url.pathname)) throw Error("LOCAL_HTTP_FIXTURE_TARGET_REJECTED");
        const headers = new Headers(init?.headers);
        headers.set("x-local-fixture-scenario", scenario === "circuit" || scenario === "timeout" ? scenario :
          available && getAsset(intent.symbol).available ? scenario : "unavailable");
        return nativeFetch(url, { ...init, headers, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
      });
      const run = createJobSession(client, state => {
        if (state.status === "SUCCEEDED" && state.resultAvailable &&
            (!getAsset(intent.symbol).available || JSON.stringify(state.job.result) !== JSON.stringify(contractDemoResult(intent)))) {
          emit({ afterMs: 0, status: "FAILED", error: "INVALID_RESPONSE", hasInsight: false }); return;
        }
        const step = sessionDemoStep(state); if (step) emit(step);
      });
      session = run;
      void run.start(intent).catch(() => {
        if (session === run) emit({ afterMs: 0, status: "FAILED", error: "REQUEST_FAILED", hasInsight: false });
      });
      return true;
    },
  };
}

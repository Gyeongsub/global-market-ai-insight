import { MarketApiClient, validateJobRequest, type JobRequest, type PublicJob } from "../api/jobs.js";
import { createJobSession, type JobSessionState } from "../api/job-session.js";
import { createDemoRunner, type DemoClock } from "./demo-runner.js";
import { isDemoScenario, type DemoScenario, type DemoStep } from "./demo-job.js";
import { getAsset } from "./assets.js";
import { getInsight } from "./insights.js";
import { canonicalDisclaimer } from "../../../shared/schemas/disclaimer.js";
import { localDemoJobId } from "./local-demo-job-id.js";
import { demoErrorCode } from "./demo-error.js";

export type ContractDemoStep = DemoStep & { job?: Readonly<PublicJob>; jobId?: string; submitting?: boolean };
export function sessionDemoStep(state: JobSessionState): ContractDemoStep | null {
  if (state.status === "IDLE" || state.status === "CANCELLED") return null;
  const error = state.status === "FAILED" || state.status === "TIMED_OUT" ?
    state.status === "TIMED_OUT" ? "TIMED_OUT" : demoErrorCode(state.code) :
    state.status === "SUCCEEDED" && !state.resultAvailable ? "DATA_UNAVAILABLE" : null;
  const jobId = localDemoJobId(state.jobId);
  return { afterMs: 0, status: state.status === "SUBMITTING" ? "QUEUED" : state.status,
    ...(state.status === "SUBMITTING" ? { submitting: true } : {}),
    error, hasInsight: state.status === "SUCCEEDED" && state.resultAvailable && state.request.operation === "ANALYZE",
    ...(jobId ? { jobId } : {}),
    ...(state.status === "SUCCEEDED" ? { job: state.job } : {}) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

// These are deliberately OLD, labelled fixture observations, never Date.now()
// disguised as a market timestamp. Job metadata below is local simulation time.
export function contractDemoResult(request: JobRequest): Record<string, unknown> {
  const asset = getAsset(request.symbol);
  if (asset.symbol !== request.symbol || !asset.available || asset.price === null) throw new Error("FIXTURE_UNAVAILABLE");
  const dataAsOf = "2026-08-07T20:00:00.000Z";
  if (request.operation === "PRICE") return { kind: "PRICE", symbol: request.symbol, price: asset.price,
    currency: "USD", ...(asset.changePercent === null ? {} : { changePercent: asset.changePercent }),
    marketTimestamp: dataAsOf, retrievedAt: "2026-08-08T00:00:00.000Z", marketState: "CLOSED",
    freshness: "LATEST_AVAILABLE", source: "local-contract-fixture" };
  const insight = getInsight(request.symbol, request.locale);
  const items = insight.items.map(item => `${item.title}: ${item.body}`);
  const lastItem = insight.items.at(-1);
  if (!lastItem) throw new Error("FIXTURE_UNAVAILABLE");
  return { kind: "ANALYSIS", symbol: request.symbol, locale: request.locale, summary: insight.summary,
    observations: request.symbol === "QLD" ? [] : items, opportunities: [], risks: [insight.risk],
    specialConsiderations: request.symbol === "QLD" ? items : [],
    uncertainty: lastItem.body, dataAsOf,
    modelId: "local-contract-fixture-no-model-called", promptVersion: "grounded-v1",
    disclaimer: canonicalDisclaimer(request.locale) };
}

/** In-memory HTTP-shaped fixture adapter, NOT an HTTP server or proxy. The URL
 * below is only parsed by the existing client; every request is intercepted.
 * No native fetch, credentials, endpoint configuration or fallback exists. */
export function createContractDemoRunner(clock: DemoClock, emit: (step: ContractDemoStep) => void) {
  let session: ReturnType<typeof createJobSession> | undefined;
  let timeline: ReturnType<typeof createDemoRunner> | undefined;

  function cancel() {
    session?.dispose(); timeline?.cancel();
    session = undefined; timeline = undefined;
  }

  return {
    cancel, isActive: () => session?.isActive() ?? false,
    start(request: JobRequest, scenario: DemoScenario, available: boolean) {
      if (session?.isActive()) return false;
      validateJobRequest(request);
      if (!isDemoScenario(scenario) || typeof available !== "boolean") throw new Error("Invalid demo plan");
      cancel();
      const intent = Object.freeze({ ...request }), jobId = `job_${crypto.randomUUID().replaceAll("-", "")}`;
      const createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 86_400_000).toISOString();
      let stage: DemoStep = { afterMs: 0, status: "QUEUED", error: null, hasInsight: false };
      let posted = false;
      timeline = createDemoRunner(clock, step => { stage = step; });
      const runTimeline = timeline;
      const client = new MarketApiClient("https://fixture.invalid/", async (input, init) => {
        const url = new URL(input);
        if (url.origin !== "https://fixture.invalid" || url.search || url.hash || init?.signal?.aborted)
          throw new Error("FIXTURE_REQUEST_REJECTED");
        if (init?.method === "POST" && url.pathname === "/v1/jobs" && !posted) {
          posted = true;
          if (init.body !== JSON.stringify({ operation: intent.operation, symbol: intent.symbol, locale: intent.locale }))
            throw new Error("FIXTURE_REQUEST_REJECTED");
          runTimeline.start(intent.operation, scenario, available && getAsset(intent.symbol).available);
          if (scenario === "circuit") return json({ error: { code: "CIRCUIT_OPEN", message: "Local circuit fixture.", requestId: "local-fixture" } }, 503);
          return json({ jobId, status: "QUEUED", statusUrl: `/v1/jobs/${jobId}`, expiresAt }, 202);
        }
        if (init?.method !== "GET" || !posted || url.pathname !== `/v1/jobs/${jobId}`) throw new Error("FIXTURE_REQUEST_REJECTED");
        return json({ jobId, ...intent, status: stage.status, createdAt, updatedAt: new Date().toISOString(), expiresAt, schemaVersion: "1.0.0",
          ...(stage.status === "SUCCEEDED" ? { result: contractDemoResult(intent) } : {}),
          ...(stage.error ? { errorCode: stage.error, errorMessage: "Local simulated failure." } : {}),
        });
      });
      session = createJobSession(client, state => {
        const step = sessionDemoStep(state); if (step) emit(step);
      });
      void session.start(intent).catch(() => {
        try { emit({ afterMs: 0, status: "FAILED", error: "REQUEST_FAILED", hasInsight: false }); } catch { /* No private view prose. */ }
      }).finally(() => runTimeline.cancel());
      return true;
    },
  };
}

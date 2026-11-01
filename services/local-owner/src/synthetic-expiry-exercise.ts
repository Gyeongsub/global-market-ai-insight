import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { acquireSyntheticRoleLease } from "./synthetic-role-acquisition.js";
import { syntheticSessionPolicy } from "../../../shared/security/synthetic-lab-policy.js";
import { createSyntheticAnalysisSession } from "./synthetic-analysis.js";
import { createSyntheticExpiryTransport, syntheticExpiryRequestBody, syntheticExpiryFailureSummary, type ExpiryCredentials, type ExpiryEnvelope } from "./synthetic-expiry-transport.js";
import { normalizeSyntheticExpiryResponse, syntheticExpiryResponseFailureSummary } from "./synthetic-expiry-response.js";
import { reviewSyntheticDenialResponse } from "./synthetic-denial-evidence.js";
import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";
import { ElapsedBudget } from "../../../shared/time/elapsed-budget.js";

const fail = () => Error("SYNTHETIC_EXPIRY_EXERCISE_UNVERIFIED");
type Factory = (credentials: () => ExpiryCredentials) => Promise<Awaited<ReturnType<typeof createSyntheticExpiryTransport>>>;
type Input = Parameters<typeof acquireSyntheticRoleLease>[0] & {
  elapsed?: () => number; signal?: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

/** Dedicated operator experiment ONLY. The ordinary five-minute lease is closed
 * immediately after validation. One private copy is kept for one post-window
 * probe until window end +60s, never exposed to a UI or reusable provider.
 * This is not a revocation guarantee or a durable runner migration. */
export function createSyntheticExpiryExercise(input: Input, factory: Factory = createSyntheticExpiryTransport) {
  const clock = input.now ?? Date.now, elapsed = input.elapsed ?? (() => performance.now());
  const abort = new AbortController(), onAbort = () => abort.abort();
  let started = false, closed = false, attempts = 0, windowStart = 0, windowEnd = 0;
  let phase: "INITIAL" | "CONTROL" | "WAIT" | "EXPIRED" | "CLOSED" = "INITIAL";
  let lease: ReturnType<typeof acquireSyntheticRoleLease> | undefined;
  let client: Awaited<ReturnType<Factory>> | undefined, session: ReturnType<typeof createSyntheticAnalysisSession> | undefined;
  let key: ExpiryCredentials | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let wallAnchor = 0, elapsedAnchor = 0, previousWall = 0, previousElapsed = 0;
  let positiveVerified = false, expiryVerified = false, usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
  // Fixed operator-only stages; never use upstream strings as diagnostic labels.
  let checkpoint = "NOT_STARTED", cleanupFailed = false;
  let controlHttpStatus: number | null = null, postWindowHttpStatus: number | null = null;
  let transportFailure: ReturnType<typeof syntheticExpiryFailureSummary> = null;
  let normalizationFailure: ReturnType<typeof syntheticExpiryResponseFailureSummary> = null;
  let denialFailure: Extract<ReturnType<typeof reviewSyntheticDenialResponse>, { accepted: false }>['reason'] | null = null;
  const safeStatus = (status: number) => Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  function time() {
    const wall = clock(), mono = elapsed();
    if (!Number.isSafeInteger(wall) || wall < previousWall || !Number.isFinite(mono) || mono < previousElapsed ||
        Math.abs((wall - wallAnchor) - (mono - elapsedAnchor)) > 5000 || abort.signal.aborted || closed ||
        mono - elapsedAnchor >= 450000 || windowEnd && wall >= windowEnd + 60000) throw fail();
    previousWall = wall; previousElapsed = mono; return wall;
  }
  function close() {
    if (closed) return;
    closed = true; phase = "CLOSED"; abort.abort(); if (timer) clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
    if (key) { key.accessKeyId = ""; key.secretAccessKey = ""; key.sessionToken = ""; } key = undefined;
    let failed = false;
    for (const fn of [() => session?.close(), () => lease?.close(), () => client?.destroy()]) {
      try { fn(); } catch { failed = true; }
    }
    if (failed) { cleanupFailed = true; throw fail(); }
  }
  function credentials() {
    const now = time();
    if (!key || !(phase === "CONTROL" && now < windowEnd || phase === "EXPIRED" && now >= windowEnd + 10000)) throw fail();
    return key;
  }
  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>) {
    time(); const budget = new ElapsedBudget(20000, elapsed, abort.signal, fail);
    try { const result = await budget.call(operation); time(); return result; }
    finally { budget.dispose(); }
  }
  function responseTime(response: ExpiryEnvelope, dispatchedAt: number, afterWindow: boolean) {
    const receivedAt = time(), server = Date.parse(response.serverDate);
    if (!Number.isFinite(server) || new Date(server).toUTCString() !== response.serverDate ||
        server < dispatchedAt - 5000 || server > receivedAt + 5000 ||
        afterWindow && server < windowEnd || !afterWindow && (server < windowStart - 1000 || receivedAt >= windowEnd)) throw fail();
  }
  async function run() {
    if (started || closed) throw fail(); started = true;
    try {
      checkpoint = "INITIAL_CLOCK";
      wallAnchor = previousWall = clock(); elapsedAnchor = previousElapsed = elapsed();
      if (!Number.isSafeInteger(wallAnchor) || wallAnchor < 0 || !Number.isFinite(elapsedAnchor) || elapsedAnchor < 0) throw fail();
      input.signal?.addEventListener("abort", onAbort, { once: true }); if (input.signal?.aborted) abort.abort();
      timer = setTimeout(() => abort.abort(), 450000);
      checkpoint = "REQUEST_BUILD";
      time(); const expectedBody = await bounded(() => syntheticExpiryRequestBody());
      let assumptions = 0;
      checkpoint = "ROLE_ACQUISITION";
      lease = acquireSyntheticRoleLease({ ...input, now: time, call(operation, args) {
        if (operation === "assume-role") {
          if (++assumptions !== 1) throw fail();
          const raw = args[args.indexOf("--policy") + 1];
          const policy = JSON.parse(raw ?? "null");
          const start = policy?.Statement?.find((v: any) => v.Sid === "DenyBeforeWindow")?.Condition?.DateLessThan?.["aws:CurrentTime"];
          if (raw !== JSON.stringify(syntheticSessionPolicy(start))) throw fail();
          windowStart = Date.parse(start); windowEnd = windowStart + 300000;
        }
        return input.call(operation, args);
      } });
      const borrowed = lease.getCredentials();
      key = { accessKeyId: borrowed.accessKeyId, secretAccessKey: borrowed.secretAccessKey, sessionToken: borrowed.sessionToken };
      lease.close();
      checkpoint = "TRANSPORT_BUILD";
      phase = "CONTROL"; client = await bounded(async () => {
        const created = await factory(credentials);
        if (closed || abort.signal.aborted) { created.destroy(); throw fail(); }
        return created;
      });
      session = createSyntheticAnalysisSession({ async converse(request, options) {
        try {
          checkpoint = "CONTROL_ADMISSION";
          const { modelId: _model, ...payload } = request;
          if (JSON.stringify(payload) !== expectedBody || attempts !== 0 || phase !== "CONTROL") throw fail();
          const dispatchedAt = time(); credentials(); attempts++;
          checkpoint = "CONTROL_REQUEST";
          const response = await bounded(signal => client!.send(AbortSignal.any([signal, options.abortSignal])));
          controlHttpStatus = safeStatus(response.status); checkpoint = "CONTROL_SERVER_TIME";
          responseTime(response, dispatchedAt, false);
          checkpoint = "CONTROL_HTTP";
          if (response.status !== 200 || response.errorType !== undefined) throw fail();
          checkpoint = "CONTROL_JSON";
          const parsed = parseUnambiguousJson(response.body, 16384);
          checkpoint = "CONTROL_NORMALIZATION";
          const normalized = normalizeSyntheticExpiryResponse(parsed);
          checkpoint = "CONTROL_RESULT";
          return normalized;
        } catch (error) {
          transportFailure = syntheticExpiryFailureSummary(error);
          normalizationFailure = syntheticExpiryResponseFailureSummary(error);
          throw error;
        }
      } }, { lifetimeMs: Math.max(1, windowEnd - time()) });
      const control = await session.start("en"); time();
      if (control.state !== "SUCCEEDED" || control.attempts !== 1 || !control.result || !control.usage || attempts !== 1) throw fail();
      usage = { ...control.usage }; positiveVerified = true; session.close();
      phase = "WAIT"; checkpoint = "WAIT_WINDOW";
      const wait = input.wait ?? ((ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }));
      let waits = 0;
      while (time() < windowEnd + 10000) {
        if (++waits > 32) throw fail();
        const ms = Math.min(10000, windowEnd + 10000 - time());
        await bounded(signal => wait(ms, signal));
      }
      phase = "EXPIRED"; credentials(); const dispatchedAt = time(); attempts++;
      checkpoint = "POST_WINDOW_REQUEST";
      let response: ExpiryEnvelope;
      try { response = await bounded(signal => client!.send(signal)); }
      catch (error) { transportFailure = syntheticExpiryFailureSummary(error); throw error; }
      postWindowHttpStatus = safeStatus(response.status); checkpoint = "POST_WINDOW_SERVER_TIME";
      responseTime(response, dispatchedAt, true);
      checkpoint = "POST_WINDOW_DENIAL";
      const denial = reviewSyntheticDenialResponse("expired-window", response);
      if (!denial.accepted) { denialFailure = denial.reason; throw fail(); }
      expiryVerified = true; checkpoint = "VERIFIED";
      return { assumptionVerified: true as const, credentialLeaseClosed: true as const, inferenceCalls: 2 as const,
        serverSideExpiryVerified: true as const, positiveControlVerified: true, usage, providerCalls: 0,
        rawDetailsSuppressed: true, allCredentialsRevoked: false };
    } catch { throw fail(); }
    finally { close(); }
  }
  return { run, close, snapshot: () => ({ started, closed, modelRequestAttempts: attempts,
    diagnostics: { checkpoint, controlHttpStatus, postWindowHttpStatus, transportFailure: transportFailure ? { ...transportFailure } : null, normalizationFailure, denialFailure, cleanupFailed },
    positiveControlVerified: positiveVerified, serverSideExpiryVerified: expiryVerified,
    credentialsRetained: key !== undefined, ...(usage ? { controlUsage: { ...usage } } : {}) }) };
}

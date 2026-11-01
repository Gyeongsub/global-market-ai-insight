import { acquireSyntheticRoleLease } from "../services/local-owner/src/synthetic-role-acquisition.js";
import { startRestrictedSyntheticLab } from "../services/local-owner/src/restricted-synthetic-lab.js";

type Json = Record<string, any>;
type Lab = Awaited<ReturnType<typeof startRestrictedSyntheticLab>>;
const fail = () => Error("SYNTHETIC_RESTRICTED_BROWSER_UNVERIFIED");

/** One restricted lease and local UI lifetime only. No automatic model call.
 * The surrounding role lifecycle always removes its owned temporary stack.
 * A clean lifecycle with zero/one attempts is not a claim of a valid analysis
 * or human/browser acceptance; that requires separate observed evidence. */
export async function exerciseRestrictedSyntheticBrowser(input: {
  identity: Json; nonce: string; roleCall: Parameters<typeof acquireSyntheticRoleLease>[0]["call"];
  now?: () => number; signal: AbortSignal; ready: (origin: string) => void;
  record: (state: Json) => void; start?: typeof startRestrictedSyntheticLab;
}) {
  let lease: ReturnType<typeof acquireSyntheticRoleLease> | undefined, app: Lab | undefined;
  let assumptionVerified = false, credentialLeaseClosed = false, primaryError = false, cleanupError = false, journalError = false;
  let attempts: number | null = 0, finalSnapshot: ReturnType<Lab["snapshot"]> | undefined;
  let closing: Promise<void> | undefined, watchdog: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
  let stopped!: () => void;
  const stopFinished = new Promise<void>(resolve => { stopped = resolve; });
  function observe() {
    if (!app || attempts === null) return;
    try {
      finalSnapshot = app.snapshot(); const n = finalSnapshot.modelAttempts;
      if (!Number.isSafeInteger(n) || n < 0 || n > 1 || attempts !== null && n < attempts) throw fail();
      attempts = n;
    } catch { attempts = null; primaryError = true; }
  }
  function record(stage: string) {
    observe();
    try { input.record({ stage, assumptionVerified, credentialLeaseClosed, primaryError, cleanupError, journalError,
      modelRequestAttempts: attempts, browser: finalSnapshot, providerCalls: 0, browserResultAcceptanceRequired: true }); }
    catch { journalError = true; }
  }
  function close() {
    if (closing) return closing;
    closing = (async () => {
      try { await app?.close(); } catch { cleanupError = true; }
      try {
        lease?.close(); credentialLeaseClosed = !!lease && lease.remainingMs() === 0;
        if (lease && !credentialLeaseClosed) cleanupError = true;
      } catch { cleanupError = true; }
      observe(); stopped();
    })();
    return closing;
  }
  const stop = () => { void close(); };
  try {
    if (input.signal.aborted) throw fail();
    lease = acquireSyntheticRoleLease({ identity: input.identity, nonce: input.nonce, call: input.roleCall, now: input.now });
    assumptionVerified = true;
    app = await (input.start ?? startRestrictedSyntheticLab)(lease);
    void app.finished.catch(() => {});
    const origin = new URL(app.origin);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || !/^[0-9]+$/.test(origin.port) ||
        Number(origin.port) < 1 || Number(origin.port) > 65535 || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash) throw fail();
    // Cancellation may have happened during startup. Never expose a new UI
    // after the stop instruction, and do not give the lease another five minutes.
    if (input.signal.aborted) throw fail();
    input.signal.addEventListener("abort", stop, { once: true });
    const remaining = lease.remainingMs();
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || remaining > 300000) throw fail();
    watchdog = setTimeout(stop, remaining);
    record("browser-ready");
    if (journalError || attempts !== 0) throw fail();
    input.ready(app.origin);
    heartbeat = setInterval(() => { record("browser-active"); if (journalError || attempts === null) stop(); }, 15000);
    await Promise.race([app.finished, stopFinished]);
  } catch { primaryError = true; }
  finally {
    if (watchdog) clearTimeout(watchdog); if (heartbeat) clearInterval(heartbeat);
    input.signal.removeEventListener("abort", stop);
    await close(); record("browser-finished");
  }
  const listenerClosed = !!finalSnapshot && finalSnapshot.closed === true && finalSnapshot.listening === false &&
    finalSnapshot.capabilityRetained === false && finalSnapshot.resultRetained === false;
  return { mode: "restricted-synthetic-browser-exercise", completed: assumptionVerified && credentialLeaseClosed && listenerClosed &&
    !primaryError && !cleanupError && !journalError && attempts !== null,
    assumptionVerified, credentialLeaseClosed, listenerClosed, primaryError, cleanupError, journalError,
    modelRequestAttempts: attempts, providerCalls: 0, automaticModelCalls: 0,
    browserResultAcceptanceRequired: true, targetCleanupOwnedByParent: true };
}

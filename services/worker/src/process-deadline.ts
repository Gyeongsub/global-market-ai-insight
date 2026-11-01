export const WORKER_PROCESS_CEILING_MS = 300_000;

/** Last-resort protection for a responsive Node process with retained I/O.
 * It cannot preempt blocked JavaScript or prove remote cancellation/rollback.
 * The production entrypoint never disposes this on mere promise completion. */
export function armWorkerProcessDeadline(report: () => void, options: {
  limitMs?: number;
  terminate?: (code: 1) => void;
} = {}): () => void {
  const limit = options.limitMs ?? WORKER_PROCESS_CEILING_MS;
  const terminate = options.terminate ?? ((code: 1) => process.exit(code));
  if (typeof report !== "function" || typeof terminate !== "function" ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > WORKER_PROCESS_CEILING_MS) throw new Error("Invalid worker process deadline.");
  let closed = false;
  const timer = setTimeout(() => {
    if (closed) return;
    closed = true;
    try { report(); } catch { /* Best-effort fixed logging must never postpone termination. */ }
    finally { terminate(1); }
  }, limit);
  // Healthy one-shot jobs exit naturally; the guard must not create idle cost.
  timer.unref();
  return () => { closed = true; clearTimeout(timer); };
}

import { performance } from "node:perf_hooks";

/** One invocation-local budget, independent of wall-clock job timestamps.
 * Late transport completion is ambiguous, never permission for another call.
 * Aborting cannot undo a request already accepted by AWS. */
export class MaintenanceCallBudget {
  private readonly abort = new AbortController();
  private readonly started: number;
  private previous: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly onParentAbort = () => this.abort.abort();

  constructor(private readonly limitMs: 10_000 | 20_000, private readonly parent?: AbortSignal,
    private readonly elapsedNow: () => number = () => performance.now()) {
    if (limitMs !== 10_000 && limitMs !== 20_000) throw new Error("Invalid maintenance call budget.");
    this.started = this.previous = elapsedNow();
    this.timer = setTimeout(() => this.abort.abort(), limitMs);
    parent?.addEventListener("abort", this.onParentAbort, { once: true });
    if (parent?.aborted) this.abort.abort();
  }

  active(): boolean {
    if (this.abort.signal.aborted) return false;
    const current = this.elapsedNow();
    if (!Number.isFinite(this.started) || this.started < 0 || !Number.isFinite(current) ||
        current < this.previous || current - this.started >= this.limitMs) this.abort.abort();
    this.previous = current;
    return !this.abort.signal.aborted;
  }

  private assertActive(): void {
    if (!this.active()) throw new Error("Maintenance call budget exhausted.");
  }

  async call<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertActive();
    let onAbort = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Maintenance call budget exhausted."));
      this.abort.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      // Race observes late rejection too; an uncooperative sender cannot hold
      // this invocation open after cancellation or revive its continuation.
      const pending = Promise.resolve().then(() => {
        this.assertActive();
        return send(this.abort.signal);
      });
      const result = await Promise.race([pending, cancelled]);
      this.assertActive();
      return result;
    } finally { this.abort.signal.removeEventListener("abort", onAbort); }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.parent?.removeEventListener("abort", this.onParentAbort);
    this.abort.abort();
  }
}

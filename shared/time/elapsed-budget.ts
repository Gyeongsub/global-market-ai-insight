import { performance } from "node:perf_hooks";

export class ElapsedBudgetTimeoutError extends Error {
  constructor() { super("Operation exceeded its time budget."); this.name = "TimeoutError"; }
}

/** Bounds acknowledgement, not the lifetime of remote work. A late transport
 * still owns any sockets/effects it accepted; cancellation is never rollback. */
export class ElapsedBudget {
  private readonly controller = new AbortController();
  private readonly started: number;
  private previous: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly onParentAbort = () => this.controller.abort();

  constructor(private readonly limitMs: number, private readonly elapsedNow: () => number = () => performance.now(),
    private readonly parent?: AbortSignal, private readonly timeoutError: () => Error = () => new ElapsedBudgetTimeoutError()) {
    if (!Number.isSafeInteger(limitMs) || limitMs < 1 || limitMs > 300_000) throw new Error("Invalid elapsed budget.");
    try { this.started = this.previous = elapsedNow(); } catch { throw timeoutError(); }
    if (!Number.isFinite(this.started) || this.started < 0) throw timeoutError();
    this.timer = setTimeout(() => this.controller.abort(), limitMs);
    parent?.addEventListener("abort", this.onParentAbort, { once: true });
    if (parent?.aborted) this.controller.abort();
  }

  active(): boolean {
    if (this.controller.signal.aborted) return false;
    let current: number;
    try { current = this.elapsedNow(); } catch { this.controller.abort(); return false; }
    if (!Number.isFinite(current) || current < this.previous || current - this.started >= this.limitMs) this.controller.abort();
    this.previous = current;
    return !this.controller.signal.aborted;
  }

  private assertActive(): void { if (!this.active()) throw this.timeoutError(); }

  async call<T>(send: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertActive();
    let onAbort = () => {};
    const expired = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(this.timeoutError());
      this.controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const pending = Promise.resolve().then(() => { this.assertActive(); return send(this.controller.signal); });
      const result = await Promise.race([pending, expired]);
      this.assertActive();
      return result;
    } catch (error) {
      if (!this.active()) throw this.timeoutError();
      throw error;
    } finally { this.controller.signal.removeEventListener("abort", onAbort); }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.parent?.removeEventListener("abort", this.onParentAbort);
    this.controller.abort();
  }
}

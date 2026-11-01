import { createRestrictedSyntheticRuntime } from "./restricted-synthetic-runtime.js";
import { startSyntheticAnalysisServer } from "./synthetic-server.js";

type Lease = Parameters<typeof createRestrictedSyntheticRuntime>[0];
type Runtime = ReturnType<typeof createRestrictedSyntheticRuntime>;
type Server = Awaited<ReturnType<typeof startSyntheticAnalysisServer>>;
type Ports = {
  runtime: (lease: Lease) => Runtime;
  listen: (session: Runtime["session"]) => Promise<Server>;
};

/** Restricted server composition, not an administrator fallback.
 * The caller must acquire an already-validated restricted lease after its
 * source/identity/cloud gates. Starting a listener does not invoke the model.
 * Explicit stop and automatic server end share the same complete cleanup. */
export async function startRestrictedSyntheticLab(lease: Lease, ports: Partial<Ports> = {}) {
  let runtime: Runtime | undefined, app: Server | undefined, closing: Promise<void> | undefined;
  function close(): Promise<void> {
    if (closing) return closing;
    closing = (async () => {
      let failed = false;
      try { await app?.close(); } catch { failed = true; }
      try { runtime?.close(); } catch { failed = true; }
      // Still clear the lease if runtime creation/cleanup failed unexpectedly.
      try { lease.close(); } catch { failed = true; }
      if (failed) throw Error("SYNTHETIC_RESTRICTED_LAB_CLOSE_UNVERIFIED");
    })();
    return closing;
  }
  try {
    runtime = (ports.runtime ?? createRestrictedSyntheticRuntime)(lease);
    app = await (ports.listen ?? startSyntheticAnalysisServer)(runtime.session);
    const origin = new URL(app.origin);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" ||
        !/^\d+$/.test(origin.port) || Number(origin.port) < 1 || Number(origin.port) > 65535 ||
        origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
      throw Error();
    const finished = app.finished.then(close, async () => {
      await close(); throw Error("SYNTHETIC_RESTRICTED_LAB_END_UNVERIFIED");
    });
    // Observe immediately so early automatic termination cannot leak an
    // unhandled rejection. The original promise still rejects for the caller.
    void finished.catch(() => {});
    return { origin: app.origin, finished, close, snapshot: () => app!.snapshot() };
  } catch {
    try { await close(); } catch { /* report sanitized failure, never claim close */ }
    throw Error("SYNTHETIC_RESTRICTED_LAB_START_REJECTED");
  }
}

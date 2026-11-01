/** Only the supported child supplies Vite preview. The factory/clock seams are
 * for offline lifecycle tests, not configurable command-line endpoints. */
export async function runLocalSearchPreview(createPreview, io = process, clock = { set: setTimeout, clear: clearTimeout }, report = value => console.log(JSON.stringify(value))) {
  let app, timer, stopping = false, closing;
  const handlers = {
    data: bytes => { if (["", "stop"].includes(bytes.toString().trim())) void stop(); },
    end: () => { void stop(); }, signal: () => { void stop(); },
  };
  function detach() {
    clock.clear(timer); io.stdin.removeListener("data", handlers.data); io.stdin.removeListener("end", handlers.end);
    io.removeListener("SIGINT", handlers.signal); io.removeListener("SIGTERM", handlers.signal); io.stdin.destroy();
  }
  function stop() {
    stopping = true;
    if (closing || !app) return closing;
    closing = (async () => {
      let verified = false;
      try { await app.close(); verified = app.httpServer.listening === false; } catch { /* Do not print private errors. */ }
      if (!verified) io.exitCode = 1;
      detach(); report({ mode: "local-search-preview-closed", closureVerified: verified, awsCalls: 0, rawDetailsSuppressed: true });
    })();
    return closing;
  }
  io.stdin.on("data", handlers.data); io.stdin.on("end", handlers.end);
  io.on("SIGINT", handlers.signal); io.on("SIGTERM", handlers.signal);
  // Starts before preview setup; a stalled child is additionally bounded by its supervisor.
  timer = clock.set(() => { void stop(); }, 300000);
  try {
    app = await createPreview({ host: "127.0.0.1", port: 4173 });
    const address = app.httpServer.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1" || address.port !== 4173 || !app.httpServer.listening)
      throw Error("LOCAL_SEARCH_PREVIEW_BIND_INVALID");
    if (stopping) { await stop(); return null; }
    report({ mode: "local-search-preview-ready", origin: "http://127.0.0.1:4173", lifetimeMs: 300000,
      awsCalls: 0, automaticModelCalls: 0, fixturesOnly: true, stop: "Enter, stop, or automatic expiry" });
    return { stop };
  } catch {
    io.exitCode = 1;
    if (app) await stop(); else detach();
    report({ mode: "local-search-preview-incomplete", rawDetailsSuppressed: true });
    return null;
  }
}

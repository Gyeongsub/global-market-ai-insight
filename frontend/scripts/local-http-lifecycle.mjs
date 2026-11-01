/** Fixed development-server lifecycle. The factory seam is for unit tests;
 * the supported child always supplies Vite createServer with guarded config. */
export async function runLocalHttpDevelopment(createServer, io = process) {
  let app, timer, closing;
  const stop = () => {
    if (closing) return closing;
    closing = (async () => {
      clearTimeout(timer);
      try { await app?.close(); }
      catch { console.error("LOCAL_HTTP_DEMO_DEV_CLOSE_INCOMPLETE"); io.exitCode = 1; }
      finally { io.stdin.destroy(); }
      console.log(JSON.stringify({ mode: "local-http-demo-dev-closed" }));
    })();
    return closing;
  };
  try {
    app = await createServer();
    await app.listen();
    timer = setTimeout(() => { void stop(); }, 300_000);
    io.stdin.on("data", bytes => { if (bytes.toString().trim() === "stop") void stop(); });
    io.stdin.on("end", () => { void stop(); });
    io.on("SIGINT", () => { void stop(); }); io.on("SIGTERM", () => { void stop(); });
    console.log(JSON.stringify({ mode: "local-http-demo-dev-ready", url: "http://127.0.0.1:5173/http-demo", awsCalls: 0 }));
    return { stop };
  } catch {
    // Vite may already have opened watchers before listen rejects (for example
    // a strict-port collision). Close that owned instance as well as stdin.
    await stop(); console.error("LOCAL_HTTP_DEMO_DEV_INCOMPLETE"); io.exitCode = 1;
    return null;
  }
}

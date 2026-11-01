import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";
import { frontendCompilerChildEnvironment } from "../frontend/scripts/compiler-environment.mjs";

export function localHttpDemoPlan(args = []) {
  if (args.length) throw Error("LOCAL_HTTP_DEMO_ARGUMENTS_REJECTED");
  return { mode: "dry-run", subprocessesStarted: 0, awsCalls: 0, serverStarted: false,
    frontendOrigin: "http://127.0.0.1:5173", apiOrigin: "http://127.0.0.1:4174", route: "/http-demo",
    lifetimeMs: 300000, credentialsPassed: false, arbitraryArgumentsAccepted: false,
    productionBuildConnected: false, publicationPerformed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localHttpDemoPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-http-demo") throw Error("LOCAL_HTTP_DEMO_ARGUMENTS_REJECTED");
      // Refuse compiler overrides BEFORE starting either owned child.
      const devEnvironment = frontendCompilerChildEnvironment(), apiEnvironment = cleanSourceChildEnvironment(process.env);
      const devCode = `import {createServer} from 'vite';import {runLocalHttpDevelopment} from './scripts/local-http-lifecycle.mjs';
await runLocalHttpDevelopment(createServer);`;
      const children = new Set(); let failed = false, stopping = false, timer;
      const stop = () => { if (stopping) return; stopping = true; for (const child of children) child.stdin.end("stop\n"); };
      const finish = (child, code, signal) => {
        if (!children.delete(child)) return;
        if (code !== 0 || signal !== null) { failed = true; stop(); }
        if (children.size === 0) { clearTimeout(timer); process.stdin.destroy(); process.exitCode = failed ? 1 : 0;
          console.log(JSON.stringify({ mode: "local-http-demo-closed", allChildrenExited: true, awsCalls: 0 })); }
      };
      const launch = (args, cwd, env) => {
        const child = spawn(process.execPath, args, { cwd, env, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
        children.add(child); child.stdin.on("error", () => {});
        child.once("error", () => finish(child, 1, null)); child.once("exit", (code, signal) => finish(child, code, signal));
      };
      launch([resolve("scripts/local-fixture-api.mjs"), "--execute-local-fixture-api"], process.cwd(), apiEnvironment);
      launch(["--input-type=module", "-e", devCode], resolve("frontend"), devEnvironment);
      timer = setTimeout(() => { failed = true; for (const child of children) child.kill(); }, 330_000);
      process.stdin.on("data", bytes => { if (bytes.toString().trim() === "stop") stop(); }); process.stdin.on("end", stop);
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
    }
  } catch { console.error("LOCAL_HTTP_DEMO_INCOMPLETE"); process.exitCode = 1; }
}

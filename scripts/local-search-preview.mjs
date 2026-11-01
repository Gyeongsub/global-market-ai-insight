import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { frontendCompilerChildEnvironment } from "../frontend/scripts/compiler-environment.mjs";

export function localSearchPreviewPlan(args = []) {
  if (args.length) throw Error("LOCAL_SEARCH_PREVIEW_ARGUMENTS_REJECTED");
  return { mode: "dry-run", origin: "http://127.0.0.1:4173", lifetimeMs: 300000, hardProcessDeadlineMs: 330000,
    subprocessesStarted: 0, serverStarted: false, awsCalls: 0, externalNetworkCalls: 0,
    credentialsPassed: false, automaticModelCalls: 0, buildRequired: true, publicationPerformed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localSearchPreviewPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-search-preview") throw Error("LOCAL_SEARCH_PREVIEW_ARGUMENTS_REJECTED");
      const env = frontendCompilerChildEnvironment();
      const code = `import {preview} from 'vite';import {runLocalSearchPreview} from './scripts/local-search-lifecycle.mjs';
await runLocalSearchPreview(async()=>preview({preview:{host:'127.0.0.1',port:4173,strictPort:true,open:false}}));`;
      const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
        cwd: resolve("frontend"), env, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
      let finished = false, stopping = false;
      const stop = () => { if (stopping) return; stopping = true; child.stdin.end("stop\n"); };
      const data = bytes => { if (["", "stop"].includes(bytes.toString().trim())) stop(); };
      child.stdin.on("error", () => {});
      const timer = setTimeout(() => { child.kill(); }, 330000);
      const finish = (code, signal) => {
        if (finished) return; finished = true; clearTimeout(timer);
        process.stdin.removeListener("data", data); process.stdin.removeListener("end", stop);
        process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); process.stdin.destroy();
        const cleanExit = code === 0 && signal === null;
        process.exitCode = cleanExit ? 0 : 1;
        console.log(JSON.stringify({ mode: "local-search-preview-supervisor-closed", childExited: true,
          childSuccessful: cleanExit, awsCalls: 0, independentInventoryRequired: true }));
      };
      process.stdin.on("data", data); process.stdin.on("end", stop);
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      child.once("error", () => finish(1, null)); child.once("exit", finish);
    }
  } catch { console.error("LOCAL_SEARCH_PREVIEW_INCOMPLETE"); process.exitCode = 1; }
}

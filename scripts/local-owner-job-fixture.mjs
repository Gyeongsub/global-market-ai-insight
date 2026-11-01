import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

export function localOwnerJobFixturePlan(args = []) {
  if (args.length) throw Error("LOCAL_OWNER_JOB_FIXTURE_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, serversStarted: 0, lifetimeMs: 120000, origin: "http://127.0.0.1:4175",
    source: "local-test-fixture", request: { operation: "PRICE", symbol: "QLD", locale: "en" }, syntheticPostsMax: 1 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localOwnerJobFixturePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-fixture") throw Error("LOCAL_OWNER_JOB_FIXTURE_ARGUMENTS_REJECTED");
      const code = `import {startOwnerJobPreview} from './services/local-owner/src/job-preview.ts';
const app=await startOwnerJobPreview({operation:'PRICE',symbol:'QLD',locale:'en'});
const stop=()=>{void app.close();}; process.stdin.once('data',stop);process.stdin.once('end',stop);process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({mode:'local-owner-job-fixture-ready',origin:app.origin,awsCalls:0}));
try{await app.finished;}finally{await app.close();process.stdin.pause();console.log(JSON.stringify({mode:'local-owner-job-fixture-closed',...app.snapshot()}));}`;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code],
        { cwd: process.cwd(), env: cleanSourceChildEnvironment(process.env), stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
      const stop = () => { if (!child.stdin.destroyed) child.stdin.end("stop\n"); };
      const timer = setTimeout(() => child.kill(), 150000);
      child.stdin.on("error", () => {}); child.once("error", () => { process.exitCode = 1; });
      process.stdin.once("data", stop); process.stdin.once("end", stop); process.once("SIGINT", stop); process.once("SIGTERM", stop);
      child.once("close", (code, signal) => { clearTimeout(timer); process.stdin.pause(); process.exitCode = code === 0 && signal === null ? 0 : 1; });
    }
  } catch { console.error("LOCAL_OWNER_JOB_FIXTURE_INCOMPLETE"); process.exitCode = 1; }
}

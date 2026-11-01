import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

export function localFixtureApiPlan(args = []) {
  if (args.length) throw Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, networkCalls: 0, subprocessesStarted: 0, serverStarted: false,
    executionMode: "loopback-fixtures-only", bindHost: "127.0.0.1", port: 4174, lifetimeMs: 300000,
    maxRequests: 512, maxJobs: 32, maxActiveJobs: 1, credentialsPassed: false, upstreamConfigAccepted: false,
    dashboardConnected: false, productionChanged: false, publicationPerformed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localFixtureApiPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-fixture-api") throw Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
      assertNodeSecurityBaseline();
      const moduleUrl = pathToFileURL(resolve("services/local-demo/src/fixture-api.ts")).href;
      const code = `import {startLocalFixtureApi} from ${JSON.stringify(moduleUrl)}; try {const app=await startLocalFixtureApi();
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await app.close();console.log(JSON.stringify({mode:'local-fixture-api-closed',...app.snapshot()}));process.stdin.destroy();};
process.stdin.on('data',b=>{if(b.toString().trim()==='stop')void stop();});process.stdin.on('end',()=>void stop());process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
const watch=setInterval(()=>{if(app.snapshot().closed){clearInterval(watch);process.stdin.destroy();console.log(JSON.stringify({mode:'local-fixture-api-closed',...app.snapshot()}));}},1000);watch.unref();
console.log(JSON.stringify({mode:'local-fixture-api-ready',origin:app.origin,fixturesOnly:true,awsCalls:0,lifetimeMs:300000}));
}catch{console.error('LOCAL_FIXTURE_START_INCOMPLETE');process.exitCode=1;}`;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
        cwd: process.cwd(), env: cleanSourceChildEnvironment(process.env), stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
      const timer = setTimeout(() => child.kill(), 330_000);
      child.stdin.on("error", () => { /* Exit and independent inventory settle closure, not a stale stdin write. */ });
      let stopping = false;
      const stop = () => { if (stopping) return; stopping = true; child.stdin.end("stop\n"); };
      process.stdin.on("data", bytes => { if (bytes.toString().trim() === "stop") stop(); });
      process.stdin.on("end", stop); process.on("SIGINT", stop); process.on("SIGTERM", stop);
      child.once("error", () => { clearTimeout(timer); console.error("LOCAL_FIXTURE_START_INCOMPLETE"); process.stdin.destroy(); process.exitCode = 1; });
      child.once("exit", (code, signal) => { clearTimeout(timer); process.stdin.destroy(); process.exitCode = code === 0 && signal === null ? 0 : 1; });
    }
  } catch { console.error("LOCAL_FIXTURE_START_INCOMPLETE"); process.exitCode = 1; }
}

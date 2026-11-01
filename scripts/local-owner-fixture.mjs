import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

export function localOwnerFixturePlan(args = []) {
  if (args.length) throw Error("LOCAL_OWNER_FIXTURE_ARGUMENTS_REJECTED");
  return { mode: "dry-run", awsCalls: 0, serversStarted: 0, lifetimeMs: 300000, origin: "http://127.0.0.1:4175", source: "local-test-fixture" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(localOwnerFixturePlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-local-fixture") throw Error("LOCAL_OWNER_FIXTURE_ARGUMENTS_REJECTED");
      const code = `import catalog from './shared/asset_catalog/assets.json' with {type:'json'};
import {startOwnerObservationServer} from './services/local-owner/src/server.ts';
const app=await startOwnerObservationServer({source:'local-test-fixture',observedAt:new Date().toISOString(),catalog,health:{status:'ok',circuit:'OPEN',jobCreationEnabled:false}});
const stop=()=>{void app.close();}; process.stdin.once('data',stop);process.stdin.once('end',stop);process.once('SIGINT',stop);process.once('SIGTERM',stop);
console.log(JSON.stringify({mode:'local-owner-fixture-ready',origin:app.origin,awsCalls:0}));
try{await app.finished;}finally{await app.close();process.stdin.pause();console.log(JSON.stringify({mode:'local-owner-fixture-closed',...app.snapshot(),awsCalls:0}));}`;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", code],
        { cwd: process.cwd(), env: cleanSourceChildEnvironment(process.env), stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
      const stop = () => { if (!child.stdin.destroyed) child.stdin.end("stop\n"); };
      const timer = setTimeout(() => child.kill(), 330000);
      child.stdin.on("error", () => {});
      process.stdin.once("data", stop); process.stdin.once("end", stop); process.once("SIGINT", stop); process.once("SIGTERM", stop);
      child.once("error", () => { process.exitCode = 1; });
      child.once("close", (code, signal) => { clearTimeout(timer); process.stdin.pause(); process.exitCode = code === 0 && signal === null ? 0 : 1; });
    }
  } catch { console.error("LOCAL_OWNER_FIXTURE_INCOMPLETE"); process.exitCode = 1; }
}

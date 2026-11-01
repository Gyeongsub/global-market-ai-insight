import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { frontendCompilerChildEnvironment } from "./compiler-environment.mjs";

const fail=()=>{throw Error("FRONTEND_VITE_COMMAND_REJECTED");};
export function frontendViteCommandPlan(args=[]) {
  if(args.length)fail();
  return {mode:"dry-run",awsCalls:0,subprocessesStarted:0,serverStarted:false,
    allowedCommands:["dev","preview"],arbitraryArgumentsAccepted:false};
}
export function runFrontendViteCommand(command) {
  if(!["dev","preview"].includes(command))fail();
  const env=frontendCompilerChildEnvironment(),root=dirname(dirname(fileURLToPath(import.meta.url)));
  const cli=join(root,"node_modules/vite/bin/vite.js");
  // Same fixed loopback/strict-port config. No caller URL, host, path or args.
  const result=spawnSync(process.execPath,[cli,...(command==="preview"?["preview"]:[])],{
    cwd:root,env,stdio:"inherit",windowsHide:true});
  return result.status===0&&result.signal===null&&!result.error?0:
    Number.isInteger(result.status)&&result.status>0&&result.status<=255?result.status:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{const args=process.argv.slice(2);if(!args.length)console.log(JSON.stringify(frontendViteCommandPlan()));
    else{if(args.length!==1)fail();process.exitCode=runFrontendViteCommand(args[0]);}}
  catch{console.error(JSON.stringify({error:"FRONTEND_VITE_COMMAND_REJECTED",rawDetailsSuppressed:true}));process.exitCode=1;}
}

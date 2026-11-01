import bootAssert from "node:assert/strict";
import {spawnSync as bootSpawnSync} from "node:child_process";
import {performance as bootPerformance} from "node:perf_hooks";

const BOOT_JOB="01LOCALBOOT0000000000000000";
const BOOT_NEGATIVE_NAMES=["missing-job","unsafe-job","short-job","missing-env","unknown-env","missing-fixture","malformed-fixture",
  "missing-region","wrong-region","missing-table","unsupported-symbol","unsupported-locale"];
const bootFail=()=>{throw new Error("WORKER_ENTRYPOINT_FIXTURE_INCOMPLETE");};
const bootBaseEnvironment=()=>({NODE_ENV:"production",NODE_DISABLE_COMPILE_CACHE:"1",AWS_EC2_METADATA_DISABLED:"true",
  AWS_MAX_ATTEMPTS:"1",AWS_IGNORE_CONFIGURED_ENDPOINT_URLS:"true"});
function bootQuote(operation,locale){return {operation,symbol:"QLD",locale,quote:{symbol:"QLD",price:100,currency:"USD",
  marketTimestamp:"2026-10-17T20:00:00.000Z",retrievedAt:"2026-10-18T00:00:00.000Z",marketState:"CLOSED",freshness:"LATEST_AVAILABLE",
  source:"synthetic-entrypoint-fixture",change:1,changePercent:1}};}

/** Inert fixed synthetic cases: no caller environment, path, provider or key. */
export function workerEntrypointCases(){
  const rows=[];
  for(const locale of ["en","ja","ko"])for(const operation of ["PRICE","ANALYZE"]){
    rows.push({name:`${locale}-${operation}`,exit:0,operation,environment:{...bootBaseEnvironment(),APP_ENV:"local",JOB_ID:BOOT_JOB,
      LOCAL_JOB_FIXTURE_JSON:JSON.stringify(bootQuote(operation,locale))},logEnvironment:"local",logJob:true});
  }
  for(const name of BOOT_NEGATIVE_NAMES){
    const environment={...bootBaseEnvironment(),APP_ENV:"local",JOB_ID:BOOT_JOB,LOCAL_JOB_FIXTURE_JSON:JSON.stringify(bootQuote("PRICE","en"))};
    let logEnvironment="local",logJob=true;
    if(name==="missing-job"){delete environment.JOB_ID;logJob=false;}
    if(name==="unsafe-job"){environment.JOB_ID="unsafe\nPRIVATE_BOOT_ID";logJob=false;}
    if(name==="short-job"){environment.JOB_ID="short";logJob=false;}
    if(name==="missing-env"){delete environment.APP_ENV;logEnvironment="unknown";}
    if(name==="unknown-env"){environment.APP_ENV="PRIVATE_BOOT_ENV";logEnvironment="unknown";}
    if(name==="missing-fixture")delete environment.LOCAL_JOB_FIXTURE_JSON;
    if(name==="malformed-fixture")environment.LOCAL_JOB_FIXTURE_JSON="PRIVATE_BOOT_BODY";
    if(["missing-region","wrong-region","missing-table"].includes(name)){
      environment.APP_ENV="aws";logEnvironment="aws";delete environment.LOCAL_JOB_FIXTURE_JSON;
      if(name==="wrong-region")environment.AWS_REGION="PRIVATE_BOOT_REGION";
      if(name==="missing-table")environment.AWS_REGION="ap-northeast-1";
    }
    if(name==="unsupported-symbol")environment.LOCAL_JOB_FIXTURE_JSON=JSON.stringify({...bootQuote("PRICE","en"),symbol:"PRIVATE_BOOT_SYMBOL"});
    if(name==="unsupported-locale")environment.LOCAL_JOB_FIXTURE_JSON=JSON.stringify({...bootQuote("PRICE","en"),locale:"PRIVATE_BOOT_LOCALE"});
    rows.push({name,exit:1,environment,logEnvironment,logJob});
  }
  return rows;
}

export function verifyWorkerEntrypointOutcome(result,row){
  try {
    if(result?.status!==row.exit||result.signal!==null||result.error||typeof result.stdout!=="string"||result.stdout.length>16384||
      result.stderr!==""||/PRIVATE_BOOT_|synthetic-entrypoint-fixture|"(?:summary|disclaimer|message|quote)"/.test(result.stdout))bootFail();
    const lines=result.stdout.trim().split(/\r?\n/);if(lines.length!==2)bootFail();
    const logs=lines.map(line=>JSON.parse(line));
    for(const [index,log] of logs.entries()){
      const extra=index===1?(row.exit===0?["operation","durationMs"]:["errorCode"]):[];
      const keys=["timestamp","level","service","environment","status",...(row.logJob?["jobId"]:[]),...extra];
      if(!log||typeof log!=="object"||Array.isArray(log)||Object.keys(log).sort().join(",")!==keys.sort().join(",")||
        typeof log.timestamp!=="string"||new Date(log.timestamp).toISOString()!==log.timestamp||log.service!=="worker"||log.environment!==row.logEnvironment||
        log.level!==(index===1&&row.exit!==0?"error":"info")||log.status!==(index===0?"STARTING":row.exit===0?"SUCCEEDED":"FAILED")||
        (row.logJob&&log.jobId!==BOOT_JOB))bootFail();
    }
    if(row.exit===0){if(logs[1].operation!==row.operation||!Number.isSafeInteger(logs[1].durationMs)||logs[1].durationMs<0||logs[1].durationMs>5000)bootFail();}
    else if(logs[1].errorCode!=="WORKER_CONFIGURATION_ERROR")bootFail();
    return {exitedAsExpected:true,logsSanitized:true};
  } catch {bootFail();}
}

/** Injected ports allow negative tests without Linux, Docker or subprocesses.
 * The real zero-argument wrapper below always uses fixed Node/image paths. */
export function runWorkerEntrypointSequence(spawn,now){
  if(typeof spawn!=="function"||typeof now!=="function")bootFail();
  const started=now();if(!Number.isFinite(started)||started<0)bootFail();
  let children=0,normalCases=0,negativeCases=0;
  for(const row of workerEntrypointCases()){
    const before=now(),left=Math.floor(25_000-(before-started));
    if(!Number.isFinite(before)||before<started||left<1)bootFail();
    const result=spawn("/nodejs/bin/node",["/app/main.mjs"],{cwd:"/app",env:row.environment,encoding:"utf8",windowsHide:true,
      timeout:Math.min(5000,left),killSignal:"SIGKILL",maxBuffer:16384});children++;
    verifyWorkerEntrypointOutcome(result,row);
    const after=now();if(!Number.isFinite(after)||after<before||after-started>=25_000)bootFail();
    if(row.exit===0)normalCases++;else negativeCases++;
  }
  bootAssert.equal(children,18);bootAssert.equal(normalCases,6);bootAssert.equal(negativeCases,12);
  return {schemaVersion:1,mode:"offline-worker-entrypoint-fixture",normalCases,negativeCases,totalCases:children,childProcessesStarted:children,
    maxConcurrentChildren:1,childTimeoutMs:5000,sequenceBudgetMs:25000,allChildrenExited:true,processOutputsSanitized:true,
    credentialFieldsPassed:false,awsCalls:0,realProviderRequests:0,realModelRequests:0};
}

export function runWorkerEntrypointScenarios(){
  bootAssert.equal(process.platform,"linux");bootAssert.equal(process.arch,"x64");bootAssert.equal(process.execPath,"/nodejs/bin/node");
  bootAssert.equal(process.getuid(),65532);bootAssert.equal(process.getgid(),65532);bootAssert.match(process.versions.node,/^22\./);
  return runWorkerEntrypointSequence(bootSpawnSync,()=>bootPerformance.now());
}

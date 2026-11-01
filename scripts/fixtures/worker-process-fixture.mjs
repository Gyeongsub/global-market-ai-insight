import {spawnSync as guardSpawn} from "node:child_process";

const guardFail=()=>{throw new Error("WORKER_PROCESS_FIXTURE_INCOMPLETE");};
export function runWorkerProcessDeadlineSequence(spawn,now){
  const started=now();if(!Number.isFinite(started)||started<0)guardFail();
  let children=0;
  for(const kind of ["natural","retained-io","report-throws"]){
    const before=now(),left=Math.floor(10000-(before-started));
    if(!Number.isFinite(before)||before<started||left<1)guardFail();
    const report=kind==="report-throws"?'()=>{throw Error("PRIVATE_WATCHDOG_REASON")}':'()=>process.stdout.write("CAPPED")';
    const program='import{armWorkerProcessDeadline as arm,WORKER_PROCESS_CEILING_MS as cap}from"/app/main.mjs";if(cap!==300000)process.exit(2);'+
      `arm(${report},{limitMs:100});`+(kind==="natural"?'process.stdout.write("NATURAL");':'setInterval(()=>{},1000);');
    const r=spawn("/nodejs/bin/node",["--input-type=module","--eval",program],{cwd:"/app",env:{NODE_ENV:"production",NODE_DISABLE_COMPILE_CACHE:"1",AWS_EC2_METADATA_DISABLED:"true"},
      encoding:"utf8",windowsHide:true,timeout:Math.min(3000,left),killSignal:"SIGKILL",maxBuffer:1024});children++;
    if(r.status!==(kind==="natural"?0:1)||r.signal!==null||r.error||r.stderr!==""||r.stdout!==(kind==="natural"?"NATURAL":kind==="retained-io"?"CAPPED":""))guardFail();
    const after=now();if(!Number.isFinite(after)||after<before||after-started>=10000)guardFail();
  }
  return {schemaVersion:1,mode:"offline-worker-process-deadline-fixture",totalCases:children,naturalExitCases:1,retainedIoCases:2,
    maxConcurrentChildren:1,childTimeoutMs:3000,sequenceBudgetMs:10000,productionCeilingMs:300000,syntheticCeilingMs:100,
    allChildrenExited:true,privateOutputReturned:false,credentialsPassed:false,awsCalls:0,realProviderRequests:0,realModelRequests:0};
}
export function runWorkerProcessDeadlineScenarios(){
  if(process.platform!=="linux"||process.arch!=="x64"||process.execPath!=="/nodejs/bin/node"||process.getuid()!==65532||process.getgid()!==65532||!/^22\./.test(process.versions.node))guardFail();
  return runWorkerProcessDeadlineSequence(guardSpawn,()=>performance.now());
}

/** Served as a separate CSP-approved script. No DOM HTML parsing, persistence,
 * AWS credentials or implicit paid calls. Timers are not proof of remote stop. */
export const SYNTHETIC_CLIENT_JS = String.raw`
const el=id=>document.getElementById(id), selector=el("language"), pending=new Set();
let cap=document.querySelector('meta[name="lab-capability"]').content;
document.querySelector('meta[name="lab-capability"]').remove();
const boot=performance.now();
let previous=boot, deadline=boot+300000, expiry, last=null, busy=false, ended=false, closing=false, consumed=false, message="ready";
const localized=()=>texts[selector.value]||texts.en;
function render(){
  const t=localized(); document.documentElement.lang=selector.value; document.title=t.title;
  for(const [id,key] of [["title","title"],["language-label","language"],["input-title","input"],["explanation","explanation"],["boundary","boundary"],["cost","cost"],["synthetic-warning","warning"],["run","run"],["refresh","refresh"],["close","close"],["result-title","result"],["notice","notice"]]) el(id).textContent=t[key];
  el("run").disabled=ended||closing||busy||consumed||!last||last.state!=="READY";
  el("refresh").disabled=ended||closing||busy;el("close").disabled=ended||closing;
  selector.disabled=closing||busy||(!ended&&!!last&&last.state!=="READY");
  el("status").textContent=t[message];el("analysis").replaceChildren();el("result").hidden=true;el("usage").textContent="";
  if(!ended&&!closing&&last&&last.result){
    el("result").hidden=false;
    for(const value of [last.result.summary,...last.result.observations,...last.result.opportunities,...last.result.risks,...last.result.specialConsiderations,last.result.uncertainty,last.result.disclaimer]){
      const p=document.createElement("p");p.textContent=value;el("analysis").append(p);
    }
    el("usage").textContent=last.modelId+" · "+last.region+" · "+t.completedTime+": "+last.completedAt+" · "+t.inputTokens+" "+last.usage.inputTokens+" / "+t.outputTokens+" "+last.usage.outputTokens+" · "+t.attempts+" "+last.attempts;
  }
}
function abortPending(){for(const controller of pending)controller.abort();pending.clear();}
function clearView(reason){ended=true;closing=false;busy=false;cap="";last=null;message=reason;clearTimeout(expiry);abortPending();render();}
function active(){
  if(ended)return false;
  const now=performance.now();
  if(!Number.isFinite(now)||now<previous||now>=deadline){clearView("expired");return false;}
  previous=now;return true;
}
function arm(){clearTimeout(expiry);expiry=setTimeout(()=>{if(active())arm();},Math.max(1,deadline-performance.now()));}
const object=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function validated(value){
  if(!object(value)||!Object.keys(value).every(k=>["state","attempts","locale","dataOrigin","quote","region","modelId","remainingMs","result","usage","completedAt"].includes(k))||
     !["READY","RUNNING","SUCCEEDED","FAILED","CLOSED"].includes(value.state)||![0,1].includes(value.attempts)||!["en","ja","ko"].includes(value.locale)||
     value.dataOrigin!=="synthetic"||value.region!=="ap-northeast-1"||value.modelId!=="amazon.nova-lite-v1:0"||!Number.isSafeInteger(value.remainingMs)||value.remainingMs<0||value.remainingMs>300000)throw Error("INVALID");
  if(value.state==="READY"&&value.attempts!==0)throw Error("INVALID");
  if(value.state!=="SUCCEEDED"){
    if(value.result!==undefined||value.usage!==undefined||value.completedAt!==undefined)throw Error("INVALID");return value;
  }
  const r=value.result,u=value.usage;
  if(value.attempts!==1||!object(r)||!object(u)||r.kind!=="ANALYSIS"||r.symbol!=="QLD"||r.locale!==value.locale||r.modelId!==value.modelId||
     r.dataAsOf!=="2026-01-01T00:00:00.000Z"||r.promptVersion!=="grounded-v1"||
     typeof value.completedAt!=="string"||value.completedAt.length>30||!Number.isFinite(Date.parse(value.completedAt))||
     !Object.keys(u).every(k=>["inputTokens","outputTokens","totalTokens"].includes(k))||
     ![u.inputTokens,u.outputTokens,u.totalTokens].every(n=>Number.isSafeInteger(n)&&n>=0)||u.inputTokens>1500||u.outputTokens>512||u.totalTokens!==u.inputTokens+u.outputTokens)throw Error("INVALID");
  for(const k of ["summary","uncertainty","disclaimer"])if(typeof r[k]!=="string"||r[k].length<1||r[k].length>600)throw Error("INVALID");
  for(const k of ["observations","opportunities","risks","specialConsiderations"])if(!Array.isArray(r[k])||r[k].length>6||r[k].some(s=>typeof s!=="string"||s.length>600))throw Error("INVALID");
  return value;
}
async function request(path){
  const controller=new AbortController();pending.add(controller);let timer;
  try{
    return await Promise.race([
      (async()=>{const response=await fetch(path,{method:"POST",credentials:"omit",cache:"no-store",headers:{"x-gmai-local-capability":cap},signal:controller.signal});if(!response.ok)throw Error("UNAVAILABLE");return response.json();})(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("TIMEOUT"));},25000);})
    ]);
  }finally{clearTimeout(timer);pending.delete(controller);}
}
function accept(value,requestStarted){
  if(!active()||closing)return;
  const v=validated(value);
  // Use send-time, not receive-time: slow responses never renew the deadline.
  deadline=Math.min(deadline,requestStarted+v.remainingMs);
  if(v.state==="CLOSED"){clearView("closed");return;}
  if(!active())return;
  last=v;consumed=consumed||v.state!=="READY"||v.attempts>0;
  if(v.state!=="READY")selector.value=v.locale;
  message=({READY:"ready",RUNNING:"pending",SUCCEEDED:"succeeded",FAILED:"failed"})[v.state];arm();
}
async function refresh(){
  if(!active()||closing||busy)return;
  const started=performance.now();busy=true;render();
  try{accept(await request("/bridge/status"),started);}catch{if(!ended&&!closing)clearView("offline");}finally{busy=false;render();}
}
el("run").onclick=async()=>{
  if(!active()||closing||busy||consumed||!last||last.state!=="READY")return;
  const started=performance.now();consumed=true;busy=true;message="pending";render();
  try{accept(await request("/bridge/start/"+selector.value),started);}catch{if(!ended&&!closing){last=null;message="failed";}}finally{busy=false;render();}
};
el("close").onclick=async()=>{
  if(!active()||closing)return;
  closing=true;consumed=true;last=null;message="closing";abortPending();render();
  try{const reply=await request("/bridge/close");if(!ended)clearView(object(reply)&&Object.keys(reply).length===1&&reply.closed===true?"closed":"unconfirmed");}
  catch{if(!ended)clearView("unconfirmed");}
};
el("refresh").onclick=refresh;selector.onchange=()=>{if(!ended)active();render();};
window.addEventListener("pagehide",()=>clearView("viewCleared"));
window.addEventListener("pageshow",event=>{if(event.persisted)clearView("viewCleared");else active();});
window.addEventListener("focus",()=>active());document.addEventListener("visibilitychange",()=>active());
render();if(active()){arm();void refresh();}
`;

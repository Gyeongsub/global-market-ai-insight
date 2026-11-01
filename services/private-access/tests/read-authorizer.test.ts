import assert from "node:assert/strict";
import {test} from "node:test";
import {createOwnerReadAuthorizer} from "../src/read-authorizer.js";
const scope={account:"000000000000",apiId:"a123456789",ownerArn:"arn:aws:iam::000000000000:user/test-owner"};
const event=(path="/private/v1/health")=>({version:"2.0",type:"REQUEST",routeKey:`GET ${path}`,rawPath:path,rawQueryString:"",
  routeArn:`arn:aws:execute-api:ap-northeast-1:${scope.account}:${scope.apiId}/$default/GET${path}`,
  cookies:[`__Host-gmai-session=${Buffer.alloc(32,1).toString("base64url")}`],headers:{"sec-fetch-site":"same-origin"},
  requestContext:{accountId:scope.account,apiId:scope.apiId,stage:"$default",domainName:`${scope.apiId}.execute-api.ap-northeast-1.amazonaws.com`,routeKey:`GET ${path}`,http:{method:"GET",path}}});
const accepted={ownerVerified:true as const,expiresAt:1792910300,remainingRequests:63};
test("valid owner-read event delegates cookie verification and returns no bearer value",async()=>{
  let calls=0;const handler=createOwnerReadAuthorizer({authorize:async(cookie,request)=>{calls++;assert.equal(typeof cookie,"string");assert.equal(request.path,"/private/v1/health");return accepted}},scope);
  const result=await handler(event());assert.equal(result.isAuthorized,true);assert.equal(calls,1);
  assert.equal(JSON.stringify(result).includes("__Host-gmai-session"),false);assert.equal(result.context?.sessionMode,"read-only");
});
test("wrong gateway, route, method, version and ambiguous authentication never query a session",async()=>{
  let calls=0;const handler=createOwnerReadAuthorizer({authorize:async()=>{calls++;return accepted}},scope);
  for(const mutate of [(v:any)=>{v.version="1.0"},(v:any)=>{v.type="TOKEN"},(v:any)=>{v.requestContext.apiId="foreign"},
    (v:any)=>{v.requestContext.accountId="111111111111"},(v:any)=>{v.requestContext.domainName="foreign.example.com"},(v:any)=>{v.requestContext.stage="prod"},
    (v:any)=>{v.requestContext.authorizer={iam:{userArn:scope.ownerArn}}},(v:any)=>{v.requestContext.http.method="POST"},(v:any)=>{v.rawQueryString="token=PRIVATE_SENTINEL"},
    (v:any)=>{v.body="PRIVATE_SENTINEL"},(v:any)=>{v.headers.Authorization="PRIVATE_SENTINEL"},(v:any)=>{v.headers.Cookie=v.cookies[0]},
    (v:any)=>{v.headers["Sec-Fetch-Site"]="same-origin"},(v:any)=>{v.cookies.push("foreign=x; hidden=y")},(v:any)=>{v.routeArn+="other"},
    (v:any)=>{v.routeKey="GET /v1/health"},(v:any)=>{v.requestContext.routeKey="GET /v1/health"},(v:any)=>{v.requestContext.http.path="/private/v1/assets"}]){
    const v=event();mutate(v);assert.deepEqual(await handler(v),{isAuthorized:false});
  }
  for(const value of [null,{},event("/v1/health"),event("/private/v1/health/"),event("/private/v1/jobs"),event("/private/v1/%68ealth")])
    assert.deepEqual(await handler(value),{isAuthorized:false});
  assert.equal(calls,0);
});
test("catalog and exact job GET routes remain read-only; session failures have fixed denial",async()=>{
  const handler=createOwnerReadAuthorizer({authorize:async()=>accepted},scope);
  assert.equal((await handler(event("/private/v1/assets"))).isAuthorized,true);
  const job=event(`/private/v1/jobs/job_${"a".repeat(48)}`);job.routeKey=job.requestContext.routeKey="GET /private/v1/jobs/{jobId}";
  assert.equal((await handler(job)).isAuthorized,true);
  const failure=createOwnerReadAuthorizer({authorize:async()=>{throw Error("PRIVATE_SENTINEL")}},scope);
  assert.deepEqual(await failure(event()),{isAuthorized:false});
  const original={...scope},safe=createOwnerReadAuthorizer({authorize:async()=>accepted},original);original.ownerArn+="other";
  assert.equal((await safe(event())).context?.ownerArn,scope.ownerArn);
});

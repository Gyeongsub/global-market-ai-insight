import {OwnerSessionDenied,type OwnerSessionService,type BrowserRequest} from "./owner-session.js";
import {ownerGatewayScope,ownerGatewayRequest,gatewayCookieHeader,type OwnerGatewayScope} from "./gateway-request.js";
type ReadSession=Pick<OwnerSessionService,"authorize">;
function deny():never{throw new OwnerSessionDenied();}

/** Local-only REQUEST/v2 authorizer candidate. Nothing installs this function,
 * replaces AWS_IAM or widens the deployed controller's IAM-only owner guard. */
export function createOwnerReadAuthorizer(session:ReadSession,scope:OwnerGatewayScope){
  const snapshot=ownerGatewayScope(scope);
  return async(event:unknown)=>{
    try{
      const {value:e,path,routeKey,headers:normalized}=ownerGatewayRequest(event,snapshot,"authorizer");
      const route=path.match(/^\/private\/v1\/(assets|health|jobs\/job_[a-f0-9]{48})$/);
      if(!route||routeKey!==(path.includes("/jobs/")?"GET /private/v1/jobs/{jobId}":`GET ${path}`))deny();
      const request:BrowserRequest={method:"GET",path};
      if(normalized.origin!==undefined)request.origin=normalized.origin;
      if(normalized["sec-fetch-site"]!==undefined)request.fetchSite=normalized["sec-fetch-site"];
      const verified=await session.authorize(gatewayCookieHeader(e.cookies),request);
      if(verified.ownerVerified!==true||!Number.isSafeInteger(verified.expiresAt)||!Number.isSafeInteger(verified.remainingRequests)||verified.remainingRequests<0||verified.remainingRequests>63)deny();
      return{isAuthorized:true,context:{ownerArn:snapshot.ownerArn,sessionExpiresAt:verified.expiresAt,sessionMode:"read-only"}};
    }catch{return{isAuthorized:false};}
  };
}

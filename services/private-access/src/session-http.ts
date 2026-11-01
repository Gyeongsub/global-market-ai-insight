import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";
import { OwnerSessionDenied, OWNER_SESSION_CLEAR_COOKIE, ownerSessionCookie, readOwnerSessionCookie, accessHash,
  type OwnerSessionService, type BrowserRequest } from "./owner-session.js";
import { ownerGatewayScope, ownerGatewayRequest, gatewayCookieHeader, jsonRecord, type OwnerGatewayScope } from "./gateway-request.js";

type BrowserSession = Pick<OwnerSessionService, "redeem" | "logout">;
export interface SessionHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: false;
  cookies?: string[];
}
function deny(): never { throw new OwnerSessionDenied(); }
const HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache",
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
});
function response(statusCode: number, body: unknown, cookie?: string): SessionHttpResponse {
  return { statusCode, headers: { ...HEADERS }, body: JSON.stringify(body), isBase64Encoded: false,
    ...(cookie === undefined ? {} : { cookies: [cookie] }) };
}

/** Local candidate only. No exported deployed handler, issuer, network client,
 * credentials or fallback. No operation can create a job or launch a worker. */
export function createOwnerSessionHttpHandler(session: BrowserSession, scope: OwnerGatewayScope) {
  const snapshot = ownerGatewayScope(scope);
  return async (event: unknown): Promise<SessionHttpResponse> => {
    try {
      const { value, path, routeKey, headers } = ownerGatewayRequest(event, snapshot, "session");
      if (!["/private/session/redeem", "/private/session/logout"].includes(path) || routeKey !== `POST ${path}` ||
          value.pathParameters !== undefined || value.stageVariables !== undefined || headers["sec-fetch-site"] !== "same-origin" ||
          typeof headers.origin !== "string") deny();
      const request: BrowserRequest = { method: "POST", path, origin: headers.origin, fetchSite: headers["sec-fetch-site"] };
      if (path === "/private/session/redeem") {
        if (headers["content-type"] !== "application/json" || typeof value.body !== "string") deny();
        const body = jsonRecord(parseUnambiguousJson(value.body, 128));
        if (!body || Object.keys(body).join(",") !== "ticket") deny();
        accessHash(body.ticket); // Validate the opaque ticket before the service port.
        const result = await session.redeem(body.ticket, request);
        if (!Number.isSafeInteger(result.expiresAt) || result.expiresAt < 1 || result.expiresAt > 253402300799 ||
            typeof result.setCookie !== "string") deny();
        const token = readOwnerSessionCookie(result.setCookie.split(";")[0]);
        if (result.setCookie !== ownerSessionCookie(token)) deny();
        return response(200, { status: "authenticated", expiresAt: result.expiresAt }, result.setCookie);
      }
      if (value.body !== undefined && value.body !== "" ||
          headers["content-type"] !== undefined && headers["content-type"] !== "application/json") deny();
      const result = await session.logout(gatewayCookieHeader(value.cookies), request);
      if (result.setCookie !== OWNER_SESSION_CLEAR_COOKIE) deny();
      return response(200, { status: "signed-out" }, result.setCookie);
    } catch {
      // No raw parser/provider text, identifier, ticket or bearer in errors.
      // A failed/ambiguous revocation never returns a successful clear-cookie.
      return response(401, { error: { code: "ACCESS_DENIED", message: "Private session request denied." } });
    }
  };
}

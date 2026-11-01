import { OwnerSessionDenied } from "./owner-session.js";
import { parsePrivateOwnerArn } from "../../controller/src/private-owner.js";

export type JsonRecord = Record<string, unknown>;
export interface OwnerGatewayScope { account: string; apiId: string; ownerArn: string }
export const jsonRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
function deny(): never { throw new OwnerSessionDenied(); }

export function ownerGatewayScope(scope: OwnerGatewayScope): Readonly<OwnerGatewayScope> {
  try {
    if (!scope || Object.keys(scope).sort().join(",") !== "account,apiId,ownerArn" ||
        typeof scope.account !== "string" || typeof scope.apiId !== "string" ||
        !/^[0-9]{12}$/.test(scope.account) || !/^[a-z0-9]{10}$/.test(scope.apiId) ||
        parsePrivateOwnerArn(scope.ownerArn, `arn:aws:ecs:ap-northeast-1:${scope.account}:cluster/private-practice`) !== scope.ownerArn) deny();
    return Object.freeze({ ...scope });
  } catch { return deny(); }
}

/** Validate only the current candidate's fixed gateway. This trusts context
 * supplied by API Gateway, not arbitrary direct Lambda callers. No handler or
 * resource policy installs this boundary; a future deployment must bind both. */
export function ownerGatewayRequest(event: unknown, scope: Readonly<OwnerGatewayScope>, mode: "authorizer" | "session") {
  const value = jsonRecord(event), context = jsonRecord(value?.requestContext), http = jsonRecord(context?.http);
  const rawHeaders = jsonRecord(value?.headers);
  if (!value || !context || !http || !rawHeaders || value.version !== "2.0" ||
      context.accountId !== scope.account || context.apiId !== scope.apiId || context.stage !== "$default" ||
      context.domainName !== `${scope.apiId}.execute-api.ap-northeast-1.amazonaws.com` || context.authorizer !== undefined ||
      typeof value.rawPath !== "string" || value.rawPath.length > 128 || http.path !== value.rawPath ||
      typeof value.routeKey !== "string" || context.routeKey !== value.routeKey || value.rawQueryString !== "" ||
      value.queryStringParameters !== undefined) deny();
  if (mode === "authorizer") {
    if (value.type !== "REQUEST" || http.method !== "GET" || value.body !== undefined ||
        value.routeArn !== `arn:aws:execute-api:ap-northeast-1:${scope.account}:${scope.apiId}/$default/GET${value.rawPath}`) deny();
  } else if (value.type !== undefined || value.routeArn !== undefined || http.method !== "POST" || value.isBase64Encoded !== false) deny();

  const headers: Record<string, string> = {};
  let headerBytes = 0;
  if (Object.keys(rawHeaders).length > 64) deny();
  for (const [name, entry] of Object.entries(rawHeaders)) {
    const lower = name.toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(lower) || Object.hasOwn(headers, lower) || typeof entry !== "string" ||
        entry.length > 8192 || /[\r\n\0]/.test(entry)) deny();
    headerBytes += Buffer.byteLength(name + entry, "utf8");
    if (headerBytes > 8192) deny();
    headers[lower] = entry;
  }
  // API Gateway v2 separates cookies. Do not merge a second authentication
  // representation or accept a signed AWS credential in this browser path.
  if (headers.cookie !== undefined || headers.authorization !== undefined || headers["x-amz-security-token"] !== undefined) deny();
  return { value, path: value.rawPath, routeKey: value.routeKey, headers };
}

export function gatewayCookieHeader(value: unknown): string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8 ||
      value.some(entry => typeof entry !== "string" || entry.length > 8192 || /[;,\r\n\0]/.test(entry))) deny();
  const cookie = value.join("; ");
  if (Buffer.byteLength(cookie, "utf8") > 8192) deny();
  return cookie;
}

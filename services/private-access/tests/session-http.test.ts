import assert from "node:assert/strict";
import { test } from "node:test";
import { createOwnerSessionHttpHandler } from "../src/session-http.js";
import { ownerSessionCookie, OWNER_SESSION_CLEAR_COOKIE } from "../src/owner-session.js";

const scope = { account: "000000000000", apiId: "a123456789", ownerArn: "arn:aws:iam::000000000000:user/test-owner" };
const origin = "https://practice.example.com", ticket = Buffer.alloc(32, 1).toString("base64url");
const token = Buffer.alloc(32, 2).toString("base64url"), cookie = ownerSessionCookie(token);
function event(action: "redeem" | "logout" = "redeem"): any {
  const path = `/private/session/${action}`;
  return { version: "2.0", rawPath: path, routeKey: `POST ${path}`, rawQueryString: "", isBase64Encoded: false,
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
    ...(action === "redeem" ? { body: JSON.stringify({ ticket }) } : { cookies: [cookie.split(";")[0]] }),
    requestContext: { accountId: scope.account, apiId: scope.apiId, stage: "$default", routeKey: `POST ${path}`,
      domainName: `${scope.apiId}.execute-api.ap-northeast-1.amazonaws.com`, http: { method: "POST", path } } };
}
const result = () => ({ setCookie: cookie, expiresAt: 1792910300 });
function fixture() {
  const calls: string[] = [];
  const handler = createOwnerSessionHttpHandler({
    async redeem(received, request) { calls.push("redeem"); assert.equal(received, ticket); assert.equal(request.origin, origin); return result(); },
    async logout(received, request) { calls.push("logout"); assert.equal(received, cookie.split(";")[0]); assert.equal(request.origin, origin); return { setCookie: OWNER_SESSION_CLEAR_COOKIE }; },
  }, scope);
  return { handler, calls };
}

test("redeem returns bearer only as a scoped HttpOnly cookie, never JSON or a cacheable/CORS response", async () => {
  const f = fixture(), response = await f.handler(event());
  assert.equal(response.statusCode, 200); assert.equal(response.isBase64Encoded, false);
  assert.deepEqual(response.cookies, [cookie]);
  assert.deepEqual(JSON.parse(response.body), { status: "authenticated", expiresAt: 1792910300 });
  assert.equal(response.body.includes(token), false); assert.equal(response.body.includes(ticket), false);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.ok(!Object.keys(response.headers).some(name => name.startsWith("access-control-")));
  assert.deepEqual(f.calls, ["redeem"]);
  response.headers["cache-control"] = "public";
  assert.equal((await f.handler(event())).headers["cache-control"], "no-store");
});

test("logout acknowledges only the exact session clear cookie, without reflecting input", async () => {
  const f = fixture(), response = await f.handler(event("logout"));
  assert.equal(response.statusCode, 200); assert.deepEqual(response.cookies, [OWNER_SESSION_CLEAR_COOKIE]);
  assert.deepEqual(JSON.parse(response.body), { status: "signed-out" }); assert.deepEqual(f.calls, ["logout"]);
});

test("malformed, duplicate, oversized and noncanonical ticket bodies are rejected before service effects", async () => {
  const f = fixture();
  for (const body of ["", "{}", "[]", "null", JSON.stringify({ ticket, extra: "PRIVATE_SENTINEL" }),
    `{"ticket":"${ticket}","t\\u0069cket":"${ticket}"}`, JSON.stringify({ ticket: "a".repeat(42) }),
    JSON.stringify({ ticket: { private: "PRIVATE_SENTINEL" } }), " ".repeat(129), `\ufeff${JSON.stringify({ ticket })}`]) {
    const v = event(); v.body = body;
    const response = await f.handler(v); assert.equal(response.statusCode, 401); assert.equal(response.cookies, undefined);
    assert.equal(JSON.stringify(response).includes("PRIVATE_SENTINEL"), false);
  }
  assert.equal(f.calls.length, 0);
});

test("wrong gateway, method, route, cross-site metadata and mixed credentials never reach service", async () => {
  const f = fixture();
  for (const change of [(v: any) => { v.requestContext.apiId = "foreign"; }, (v: any) => { v.requestContext.accountId = "111111111111"; },
    (v: any) => { v.requestContext.stage = "prod"; }, (v: any) => { v.requestContext.http.method = "GET"; },
    (v: any) => { v.rawPath += "/"; }, (v: any) => { v.routeKey = "POST /v1/jobs"; },
    (v: any) => { v.rawQueryString = "ticket=PRIVATE_SENTINEL"; }, (v: any) => { v.queryStringParameters = {}; },
    (v: any) => { v.pathParameters = {}; }, (v: any) => { v.stageVariables = {}; },
    (v: any) => { v.headers["sec-fetch-site"] = "same-site"; }, (v: any) => { delete v.headers.origin; },
    (v: any) => { v.headers.authorization = "PRIVATE_SENTINEL"; }, (v: any) => { v.headers["x-amz-security-token"] = "PRIVATE_SENTINEL"; },
    (v: any) => { v.headers.Cookie = cookie; }, (v: any) => { v.headers.Origin = origin; },
    (v: any) => { v.headers["content-type"] = "text/plain"; }, (v: any) => { v.headers.extra = "a".repeat(8192); },
    (v: any) => { v.headers.extra = "private\r\nheader"; }, (v: any) => { v.isBase64Encoded = true; },
    (v: any) => { v.type = "REQUEST"; }, (v: any) => { v.requestContext.authorizer = {}; }]) {
    const v = event(); change(v); const response = await f.handler(v);
    assert.equal(response.statusCode, 401); assert.equal(response.cookies, undefined);
  }
  assert.equal(f.calls.length, 0);
});

test("ambiguous logout cookies and nonempty body cannot revoke a session", async () => {
  const f = fixture();
  for (const change of [(v: any) => { delete v.cookies; }, (v: any) => { v.cookies = []; },
    (v: any) => { v.cookies = ["first=x; second=y"]; }, (v: any) => { v.cookies = ["first=x,second=y"]; },
    (v: any) => { v.body = "{}"; }, (v: any) => { v.headers["content-type"] = "text/plain"; }]) {
    const v = event("logout"); change(v); assert.equal((await f.handler(v)).statusCode, 401);
  }
  assert.equal(f.calls.length, 0);
});

test("dependency failures and malformed cookie acknowledgements return sanitized denial without clearing", async () => {
  for (const returned of [{ ...result(), setCookie: cookie + "; Domain=example.com" }, { ...result(), setCookie: "PRIVATE_SENTINEL" },
    { ...result(), expiresAt: NaN }, { ...result(), expiresAt: -1 }]) {
    const handler = createOwnerSessionHttpHandler({ redeem: async () => returned, logout: async () => { throw Error("PRIVATE_SENTINEL"); } }, scope);
    for (const v of [event(), event("logout")]) {
      const response = await handler(v); assert.equal(response.statusCode, 401); assert.equal(response.cookies, undefined);
      assert.equal(JSON.stringify(response).includes("PRIVATE_SENTINEL"), false);
    }
  }
  const handler = createOwnerSessionHttpHandler({ redeem: async () => { throw Error("PRIVATE_SENTINEL"); }, logout: async () => ({ setCookie: cookie }) }, scope);
  assert.equal((await handler(event())).statusCode, 401); assert.equal((await handler(event("logout"))).statusCode, 401);
});

test("constructor rejects invalid owner scope with fixed errors and no service invocation", () => {
  const session = { redeem: async () => result(), logout: async () => ({ setCookie: OWNER_SESSION_CLEAR_COOKIE }) };
  for (const invalid of [null, {}, { ...scope, account: 111111111111 }, { ...scope, apiId: "wrong" },
    { ...scope, ownerArn: "PRIVATE_SENTINEL" }, { ...scope, ownerArn: "arn:aws:iam::111111111111:user/test-owner" }, { ...scope, extra: true }])
    assert.throws(() => createOwnerSessionHttpHandler(session, invalid as any), { message: "OWNER_SESSION_DENIED" });
});

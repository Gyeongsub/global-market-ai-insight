import assert from "node:assert/strict";
import { test } from "node:test";
import { GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { OwnerSessionService } from "../src/owner-session.js";
import { DynamoOwnerSessionStore, type SessionDynamoSender } from "../src/session-store.js";
import { createOwnerReadAuthorizer } from "../src/read-authorizer.js";
import { createOwnerSessionHttpHandler } from "../src/session-http.js";

const account = "000000000000", apiId = "a123456789";
const ownerArn = `arn:aws:iam::${account}:user/test-owner`;
const origin = "https://practice.example.com";
const cluster = `arn:aws:ecs:ap-northeast-1:${account}:cluster/private-practice`;
const bootstrapEvent = () => ({ version: "2.0", routeKey: "POST /v1/private-session", rawPath: "/v1/private-session",
  requestContext: { accountId: account, authorizer: { iam: { accountId: account, userArn: ownerArn } } } });
const browserEvent = (cookie: string) => ({ version: "2.0", type: "REQUEST", routeKey: "GET /private/v1/health",
  rawPath: "/private/v1/health", rawQueryString: "", cookies: [cookie], headers: { "sec-fetch-site": "same-origin" },
  routeArn: `arn:aws:execute-api:ap-northeast-1:${account}:${apiId}/$default/GET/private/v1/health`,
  requestContext: { accountId: account, apiId, stage: "$default", routeKey: "GET /private/v1/health",
    domainName: `${apiId}.execute-api.ap-northeast-1.amazonaws.com`, http: { method: "GET", path: "/private/v1/health" } } });
function sessionEvent(action: "redeem" | "logout", value: string) {
  const path = `/private/session/${action}`;
  return { version: "2.0", rawPath: path, routeKey: `POST ${path}`, rawQueryString: "", isBase64Encoded: false,
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" },
    ...(action === "redeem" ? { body: JSON.stringify({ ticket: value }) } : { cookies: [value] }),
    requestContext: { accountId: account, apiId, stage: "$default", routeKey: `POST ${path}`,
      domainName: `${apiId}.execute-api.ap-northeast-1.amazonaws.com`, http: { method: "POST", path } } };
}

/** Scripted SDK acknowledgements, not a DynamoDB emulator or live acceptance.
 * Actual core, adapter, plans and gateway boundary are composed. The fake keeps
 * only the specific ticket/session Item returned by the generated plans. */
function fixture() {
  let now = 1792910000;
  let ticketItem: Record<string, any> | undefined, sessionItem: Record<string, any> | undefined;
  const calls: string[] = [];
  const sender: SessionDynamoSender = { async send(command, options) {
    assert.equal(options.abortSignal.aborted, false);
    calls.push(command.constructor.name);
    if (command instanceof TransactWriteItemsCommand) {
      const items = command.input.TransactItems!;
      if (items.length === 2) {
        assert.equal(ticketItem, undefined);
        ticketItem = structuredClone(items[1]!.Put!.Item!);
      } else {
        assert.equal(items.length, 3);
        assert.ok(ticketItem);
        assert.equal(items[0]!.Delete!.Key!.jobId!.S, ticketItem.jobId.S);
        assert.equal(items[0]!.Delete!.ExpressionAttributeValues![":expires"]!.N, ticketItem.expiresAt.N);
        assert.equal(sessionItem, undefined);
        sessionItem = structuredClone(items[2]!.Put!.Item!);
        ticketItem = undefined;
      }
      return {};
    }
    if (command instanceof GetItemCommand) return ticketItem ? { Item: structuredClone(ticketItem) } : {};
    if (command instanceof UpdateItemCommand) {
      if (!sessionItem || Number(sessionItem.expiresAt.N) <= now || Number(sessionItem.uses.N) >= 64)
        throw Error("PRIVATE_STORAGE_SENTINEL");
      assert.equal(command.input.Key!.jobId!.S, sessionItem.jobId.S);
      sessionItem.uses.N = String(Number(sessionItem.uses.N) + 1);
      return { Attributes: structuredClone(sessionItem) };
    }
    assert.ok(command instanceof DeleteItemCommand);
    if (sessionItem) assert.equal(command.input.Key!.jobId!.S, sessionItem.jobId.S);
    sessionItem = undefined;
    return {};
  } };
  const store = new DynamoOwnerSessionStore(sender, ownerArn, origin);
  const service = new OwnerSessionService(store, ownerArn, cluster, origin, () => now);
  const authorize = createOwnerReadAuthorizer(service, { account, apiId, ownerArn });
  const http = createOwnerSessionHttpHandler(service, { account, apiId, ownerArn });
  const open = async () => {
    const ticket = await service.issue(bootstrapEvent());
    const redeemed = await http(sessionEvent("redeem", ticket.ticket));
    assert.equal(redeemed.statusCode, 200);
    return { ticket: ticket.ticket, cookie: redeemed.cookies![0]!.split(";")[0]! };
  };
  return { service, authorize, http, open, calls, advance: (seconds: number) => { now += seconds; },
    persisted: () => JSON.stringify({ ticketItem, sessionItem }) };
}

test("composed owner issue / redemption / gateway read / logout never persists bearer secrets", async () => {
  const f = fixture(), issued = await f.open();
  assert.equal(f.persisted().includes(issued.ticket), false);
  assert.equal(f.persisted().includes(issued.cookie.split("=")[1]!), false);
  assert.deepEqual(await f.authorize(browserEvent(issued.cookie)), { isAuthorized: true,
    context: { ownerArn, sessionExpiresAt: 1792910300, sessionMode: "read-only" } });
  assert.equal((await f.http(sessionEvent("logout", issued.cookie))).statusCode, 200);
  assert.deepEqual(await f.authorize(browserEvent(issued.cookie)), { isAuthorized: false });
  assert.deepEqual(f.calls, ["TransactWriteItemsCommand", "GetItemCommand", "TransactWriteItemsCommand",
    "UpdateItemCommand", "DeleteItemCommand", "UpdateItemCommand"]);
  assert.equal(f.persisted(), "{}");
});

test("composed boundary denies untrusted requests before SDK calls and reused ticket cannot create another session", async () => {
  const f = fixture(), issued = await f.open(), before = f.calls.length;
  const crossSite = browserEvent(issued.cookie); crossSite.headers["sec-fetch-site"] = "cross-site";
  assert.deepEqual(await f.authorize(crossSite), { isAuthorized: false });
  const foreign = browserEvent(issued.cookie); foreign.requestContext.accountId = "111111111111";
  assert.deepEqual(await f.authorize(foreign), { isAuthorized: false });
  for (const action of ["redeem", "logout"] as const) {
    const wrongOrigin = sessionEvent(action, action === "redeem" ? issued.ticket : issued.cookie);
    wrongOrigin.headers.origin = "https://foreign.example.com";
    assert.equal((await f.http(wrongOrigin)).statusCode, 401);
  }
  assert.equal(f.calls.length, before);
  await assert.rejects(() => f.service.redeem(issued.ticket, { method: "POST", path: "/private/session/redeem", origin, fetchSite: "same-origin" }),
    { message: "OWNER_SESSION_DENIED" });
  assert.deepEqual(f.calls.slice(before), ["GetItemCommand"]);
});

test("composed authorizer counts every admission without a cache and denies after the bounded allowance", async () => {
  const f = fixture(), issued = await f.open();
  for (let n = 0; n < 64; n++) assert.equal((await f.authorize(browserEvent(issued.cookie))).isAuthorized, true);
  assert.deepEqual(await f.authorize(browserEvent(issued.cookie)), { isAuthorized: false });
  assert.equal(f.calls.filter(c => c === "UpdateItemCommand").length, 65);
  assert.equal(JSON.parse(f.persisted()).sessionItem.uses.N, "64");
});

test("composed expiry denies retained TTL records and never refreshes or creates a replacement session", async () => {
  const f = fixture(), issued = await f.open(), before = f.calls.length;
  f.advance(300);
  assert.deepEqual(await f.authorize(browserEvent(issued.cookie)), { isAuthorized: false });
  assert.deepEqual(f.calls.slice(before), ["UpdateItemCommand"]);
  assert.ok(JSON.parse(f.persisted()).sessionItem);
});

test("malformed logout cannot clear a live session; a subsequent valid logout does", async () => {
  const f = fixture(), issued = await f.open(), before = f.calls.length;
  const malformed = { ...sessionEvent("logout", issued.cookie), cookies: [issued.cookie, issued.cookie] };
  const rejected = await f.http(malformed);
  assert.equal(rejected.statusCode, 401); assert.equal(rejected.cookies, undefined);
  assert.equal(f.calls.length, before);
  assert.equal((await f.authorize(browserEvent(issued.cookie))).isAuthorized, true);
  assert.equal((await f.http(sessionEvent("logout", issued.cookie))).statusCode, 200);
  assert.deepEqual(await f.authorize(browserEvent(issued.cookie)), { isAuthorized: false });
});

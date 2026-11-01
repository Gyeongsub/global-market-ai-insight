import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { createConnection } from "node:net";
import catalog from "../../../shared/asset_catalog/assets.json" with { type: "json" };
import { captureOwnerObservation, validateOwnerObservation, OWNER_OBSERVATION_HEALTH, OWNER_OBSERVATION_MAX_AGE_MS } from "../src/observation.js";
import { startOwnerObservationServer, validateOwnerLocalRequest, LOCAL_OWNER_LIMITS } from "../src/server.js";
import { ownerPage, OWNER_PAGE_JS } from "../src/page.js";

const fixture = () => ({ source: "local-test-fixture" as const, observedAt: new Date().toISOString(), catalog: structuredClone(catalog), health: { ...OWNER_OBSERVATION_HEALTH } });
const navigation = { "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
function http(origin: string, path = "/", method = "GET", headers: Record<string, string> = navigation) {
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request(origin + path, { method, headers, timeout: 2000 }, response => {
      let body = ""; response.setEncoding("utf8"); response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body, headers: response.headers }));
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(Error("TEST_HTTP_TIMEOUT"))); req.end();
  });
}
const apiHeaders = (origin: string, capability: string) => ({ origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty", "x-gmai-local-capability": capability, "content-length": "0" });

test("capture performs exactly two fixed GETs, copies catalog and does not leak transport details", async () => {
  const calls: string[] = [];
  const result = await captureOwnerObservation({ async request(method, path) {
    calls.push(`${method} ${path}`); return path === "v1/assets" ? structuredClone(catalog) : { ...OWNER_OBSERVATION_HEALTH };
  } }, "local-test-fixture");
  assert.deepEqual(calls, ["GET v1/assets", "GET v1/health"]);
  assert.deepEqual(validateOwnerObservation(result), result);
  assert.notEqual(result.catalog, catalog);
});

test("capture fails closed on missing/extra catalog or unsafe health; no upstream prose", async () => {
  for (const bad of [{ ...catalog, private: "PRIVATE_SENTINEL" }, { ...catalog, assets: [] }]) {
    let calls = 0;
    await assert.rejects(captureOwnerObservation({ async request() { calls++; return bad; } }, "aws-owner-read-only"), /^Error: OWNER_OBSERVATION_UNAVAILABLE$/);
    assert.equal(calls, 1);
  }
  for (const health of [{ ...OWNER_OBSERVATION_HEALTH, circuit: "CLOSED" }, { ...OWNER_OBSERVATION_HEALTH, jobCreationEnabled: true }, { ...OWNER_OBSERVATION_HEALTH, arn: "PRIVATE_SENTINEL" }]) {
    await assert.rejects(captureOwnerObservation({ async request(_method, path) { return path === "v1/assets" ? catalog : health; } }, "aws-owner-read-only"));
  }
  await assert.rejects(captureOwnerObservation({ async request() { throw Error("PRIVATE_SENTINEL"); } }, "aws-owner-read-only"), /^Error: OWNER_OBSERVATION_UNAVAILABLE$/);
});

test("snapshot rejects stale/future/invalid timestamp and all extra fields before listening", async () => {
  const current = fixture(), now = Date.parse(current.observedAt);
  for (const at of [now - OWNER_OBSERVATION_MAX_AGE_MS - 1, now + 1]) assert.throws(() => validateOwnerObservation({ ...current, observedAt: new Date(at).toISOString() }, now));
  assert.deepEqual(validateOwnerObservation(current, now + 90000), current);
  assert.deepEqual(validateOwnerObservation(current, now + OWNER_OBSERVATION_MAX_AGE_MS), current);
  assert.throws(() => validateOwnerObservation({ ...current, observedAt: "bad" }));
  assert.throws(() => validateOwnerObservation({ ...current, endpoint: "PRIVATE_SENTINEL" } as never));
  for (const port of [80, 443, 4174, NaN, Infinity]) await assert.rejects(startOwnerObservationServer(current, port));
  for (const ms of [0, 300001, NaN]) await assert.rejects(startOwnerObservationServer(current, 0, ms));
});

test("strict request guards reject rebinding, cross-site bootstrap, duplicate/framing/credential headers", () => {
  const origin = "http://127.0.0.1:4175";
  const req = () => ({ method: "GET", url: "/", headers: { host: "127.0.0.1:4175", ...navigation } as Record<string, string>, rawHeaders: ["Host", "127.0.0.1:4175"] });
  assert.equal(validateOwnerLocalRequest(req(), origin), "/");
  for (const [key, value] of [["host", "localhost:4175"], ["origin", "https://evil.invalid"], ["sec-fetch-site", "cross-site"], ["sec-fetch-site", "same-site"],
    ["sec-fetch-dest", "iframe"], ["authorization", "PRIVATE_SENTINEL"], ["cookie", "PRIVATE_SENTINEL"], ["x-amz-security-token", "PRIVATE_SENTINEL"],
    ["content-length", "1"], ["content-length", "00"], ["transfer-encoding", "chunked"], ["expect", "100-continue"]]) {
    const valueReq = req(); valueReq.headers[key!] = value!; assert.throws(() => validateOwnerLocalRequest(valueReq, origin));
  }
  const duplicate = req(); duplicate.rawHeaders.push("HOST", "127.0.0.1:4175"); assert.throws(() => validateOwnerLocalRequest(duplicate, origin));
  for (const url of ["/?token=x", "/%2e%2e/.aws/config", "/.git/config", "//", "/v1/jobs"]) assert.throws(() => validateOwnerLocalRequest({ ...req(), url }, origin));
});

test("real loopback requires capability and same origin; refreshes never call AWS", async () => {
  const input = fixture(), app = await startOwnerObservationServer(input, 0);
  try {
    input.catalog.assets[0]!.displayName = "PRIVATE_SENTINEL";
    const page = await http(app.origin);
    assert.equal(page.status, 200); assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(page.headers["access-control-allow-origin"], undefined);
    assert.match(String(page.headers["content-security-policy"]), /frame-ancestors 'none'/);
    const capability = /name="local-capability" content="([a-f0-9]{64})"/.exec(page.body)![1]!;
    assert.equal((await http(app.origin, "/bridge/observation", "POST", apiHeaders(app.origin, "0".repeat(64)))).status, 403);
    assert.equal((await http(app.origin, "/bridge/observation", "POST", { ...apiHeaders(app.origin, capability), origin: "https://evil.invalid" })).status, 403);
    assert.equal((await http(app.origin, "/bridge/observation", "GET", apiHeaders(app.origin, capability))).status, 403);
    for (let i = 0; i < 3; i++) {
      const response = await http(app.origin, "/bridge/observation", "POST", apiHeaders(app.origin, capability));
      assert.equal(response.status, 200); assert.doesNotMatch(response.body, /PRIVATE_SENTINEL|accessKeyId|secretAccessKey|sessionToken|endpoint/);
      assert.deepEqual(JSON.parse(response.body).catalog, catalog); assert.equal(app.snapshot().awsCallsFromHttp, 0);
    }
    const denied = await http(app.origin, "/", "GET", { ...navigation, "sec-fetch-site": "cross-site" });
    assert.equal(denied.status, 403); assert.match(denied.body, /Continue to the local owner check/);
    assert.doesNotMatch(denied.body, /local-capability|observedAt|catalog|<script/);
    const frame = await http(app.origin, "/", "GET", { ...navigation, "sec-fetch-site": "cross-site", "sec-fetch-dest": "iframe" });
    assert.equal(frame.status, 403); assert.doesNotMatch(frame.body, /<a /);
    assert.equal((await http(app.origin, "/v1/jobs", "POST", apiHeaders(app.origin, capability))).status, 403);
  } finally { await app.close(); }
  assert.deepEqual({ ...app.snapshot(), requests: 0 }, { requests: 0, closed: true, listening: false, observationRetained: false, capabilityRetained: false, awsCallsFromHttp: 0, jobCalls: 0 });
  await app.close();
});

test("fixed JS/CSS need same-origin metadata and cannot serve files or secrets", async () => {
  const app = await startOwnerObservationServer(fixture(), 0);
  try {
    for (const [path, dest] of [["/owner.js", "script"], ["/owner.css", "style"]]) {
      assert.equal((await http(app.origin, path, "GET", { "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "sec-fetch-dest": dest! })).status, 200);
      assert.equal((await http(app.origin, path, "GET", { "sec-fetch-site": "cross-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": dest! })).status, 403);
    }
    for (const path of ["/.aws/credentials", "/../package.json", "/favicon.ico", "/owner.js?x=1"]) assert.equal((await http(app.origin, path)).status, 403);
  } finally { await app.close(); }
});

test("expiry and request budget close listener and discard observation/capability", async () => {
  const short = await startOwnerObservationServer(fixture(), 0, 15);
  try { await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(short.snapshot().closed, true); assert.equal(short.snapshot().listening, false); }
  finally { await short.close(); }
  const app = await startOwnerObservationServer(fixture(), 0);
  try {
    for (let i = 0; i < LOCAL_OWNER_LIMITS.requests; i++) await http(app.origin, "/missing");
    await http(app.origin).catch(() => undefined);
    assert.equal(app.snapshot().closed, true); assert.equal(app.snapshot().capabilityRetained, false);
  } finally { await app.close(); }
});

test("page has no inline executable, token URL, storage, cookie, remote asset or job submission", () => {
  const html = ownerPage("1".repeat(64));
  assert.throws(() => ownerPage('<script>PRIVATE_SENTINEL</script>'));
  assert.match(html, /Read-only catalog and safety snapshot/);
  assert.doesNotMatch(html, /<script[^>]*>[^<]+<\/script>|https?:\/\//);
  assert.doesNotMatch(OWNER_PAGE_JS, /localStorage|sessionStorage|document\.cookie|innerHTML|v1\/jobs|console\./);
  assert.match(OWNER_PAGE_JS, /meta\?\.remove/); assert.match(OWNER_PAGE_JS, /pagehide/); assert.match(OWNER_PAGE_JS, /event.persisted/);
});

test("closure destroys an incomplete HTTP socket instead of waiting for a slow client", async () => {
  const app = await startOwnerObservationServer(fixture(), 0);
  const socket = createConnection({ host: "127.0.0.1", port: Number(new URL(app.origin).port) });
  socket.on("error", () => {});
  try {
    await new Promise<void>(resolve => socket.once("connect", resolve));
    socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n");
    const closed = new Promise<void>(resolve => socket.once("close", () => resolve()));
    await app.close(); await closed;
    assert.equal(app.snapshot().listening, false); assert.equal(app.snapshot().capabilityRetained, false);
  } finally { socket.destroy(); await app.close(); }
});

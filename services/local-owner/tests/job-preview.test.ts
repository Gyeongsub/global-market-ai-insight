import assert from "node:assert/strict";
import test from "node:test";
import { request } from "node:http";
import { startOwnerJobPreview } from "../src/job-preview.js";
import { ownerJobPreviewPage, OWNER_JOB_PREVIEW_JS, OWNER_JOB_COPY } from "../src/job-page.js";

const intent = { operation: "PRICE", symbol: "QLD", locale: "en" } as const;
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
const auth = (origin: string, capability: string) => ({ origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
  "x-gmai-local-capability": capability, "content-length": "0" });

test("real HTTP synthetic preview: bootstrap guards, pinned start, reload no duplicate and local close", async () => {
  const app = await startOwnerJobPreview(intent, 0);
  try {
    const denied = await http(app.origin, "/", "GET", { ...navigation, "sec-fetch-site": "cross-site" });
    assert.equal(denied.status, 403); assert.doesNotMatch(denied.body, /local-capability|local-preview/);
    const page = await http(app.origin);
    assert.equal(page.status, 200); assert.match(page.body, /LOCAL TEST FIXTURE/);
    assert.equal(page.headers["cache-control"], "no-store"); assert.equal(page.headers["access-control-allow-origin"], undefined);
    assert.match(String(page.headers["content-security-policy"]), /frame-ancestors 'none'/);
    const capability = /name="local-capability" content="([a-f0-9]{64})"/.exec(page.body)![1]!;
    for (const [key, value] of [["origin", "https://evil.invalid"], ["host", "localhost:4175"], ["x-gmai-local-capability", "0".repeat(64)], ["content-length", "1"]])
      assert.equal((await http(app.origin, "/bridge/job/start", "POST", { ...auth(app.origin, capability), [key!]: value! })).status, 403);
    assert.equal(app.snapshot().syntheticPosts, 0);
    assert.equal((await http(app.origin, "/bridge/job/start", "POST", auth(app.origin, capability))).status, 202);
    assert.equal((await http(app.origin, "/bridge/job/start", "POST", auth(app.origin, capability))).status, 409);
    const refreshed = await http(app.origin); assert.match(refreshed.body, /"state":"ACCEPTED"/); assert.equal(app.snapshot().syntheticPosts, 1);
    const polled = await http(app.origin, "/bridge/job/status", "POST", auth(app.origin, capability));
    assert.equal(polled.status, 200); assert.equal(JSON.parse(polled.body).status, "RUNNING");
    assert.doesNotMatch(polled.body, /result|price|summary|taskArn|secret/);
    assert.equal((await http(app.origin, "/bridge/job/status", "POST", auth(app.origin, capability))).status, 409);
    assert.equal((await http(app.origin, "/bridge/job/close", "POST", auth(app.origin, capability))).status, 200);
    await app.finished;
    assert.equal(app.snapshot().closed, true); assert.equal(app.snapshot().keyRetained, false);
    assert.equal(app.snapshot().capabilityRetained, false); assert.equal(app.snapshot().listening, false);
    assert.equal(app.snapshot().awsCalls, 0); assert.equal(app.snapshot().syntheticPosts, 1);
  } finally { await app.close(); }
});

test("preview serves only fixed guarded assets, never arbitrary paths or a job API proxy", async () => {
  const app = await startOwnerJobPreview(intent, 0);
  try {
    for (const [path, dest] of [["/job.js", "script"], ["/job.css", "style"]]) {
      const headers = { "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "sec-fetch-dest": dest! };
      assert.equal((await http(app.origin, path, "GET", headers)).status, 200);
      assert.equal((await http(app.origin, path, "GET", { ...headers, "sec-fetch-site": "cross-site" })).status, 403);
    }
    for (const path of ["/.aws/credentials", "/v1/jobs", "/job.js?x=1", "/bridge/job/status?jobId=other", "/bridge/observation"])
      assert.equal((await http(app.origin, path)).status, 403);
    assert.equal(app.snapshot().syntheticPosts, 0);
  } finally { await app.close(); }
});

test("short preview expires with keys discarded and never admits runtime endpoint/credential parameters", async () => {
  for (const port of [80, 443, 4174]) await assert.rejects(startOwnerJobPreview(intent, port));
  for (const lifetime of [0, 120001, Infinity]) await assert.rejects(startOwnerJobPreview(intent, 0, lifetime));
  await assert.rejects(startOwnerJobPreview({ ...intent, endpoint: "PRIVATE_SENTINEL" } as never, 0));
  const app = await startOwnerJobPreview(intent, 0, 15);
  try { await app.finished; assert.equal(app.snapshot().closed, true); assert.equal(app.snapshot().keyRetained, false); }
  finally { await app.close(); }
});

test("fixed preview UI is localized, clearly synthetic, no storage or automatic background poll", () => {
  for (const locale of ["en", "ja", "ko"] as const) assert.deepEqual(Object.keys(OWNER_JOB_COPY[locale]).sort(), Object.keys(OWNER_JOB_COPY.en).sort());
  const html = ownerJobPreviewPage("1".repeat(64), intent, "READY", 120000);
  assert.match(html, /LOCAL TEST FIXTURE/); assert.match(html, /label id="language-label" for="language"/);
  assert.doesNotMatch(html, /<script[^>]*>[^<]+<\/script>|https?:\/\//);
  assert.doesNotMatch(OWNER_JOB_PREVIEW_JS, /localStorage|sessionStorage|document\.cookie|innerHTML|setInterval|console\.|https?:\/\//);
  assert.throws(() => ownerJobPreviewPage("bad", intent, "READY", 120000));
  assert.throws(() => ownerJobPreviewPage("1".repeat(64), intent, "READY", 120001));
});

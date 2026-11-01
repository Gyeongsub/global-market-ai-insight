import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertLocalPublicAssetBoundary, rejectPrivateLocalRequests, runtimeNoticesPlugin, serveRuntimeNotices } from "../scripts/runtime-notices-plugin.mjs";
import { collectFrontendAttribution } from "../../scripts/frontend-helper-attribution.mjs";

function response() {
  return { headers: {}, body: undefined, statusCode: undefined,
    setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
}
const text = "LICENSE\nCopyright Synthetic Authors\n";

test("development notices serve exact precomputed UTF-8 text with protective headers and no cache", () => {
  const result = response();
  serveRuntimeNotices({ url: "/THIRD_PARTY_NOTICES.txt?ignored=PRIVATE_QUERY", method: "GET" }, result,
    () => assert.fail("Matched route must not fall through to SPA HTML."), text);
  assert.equal(result.statusCode, 200); assert.equal(result.body, text);
  assert.equal(result.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(result.headers["Content-Length"], String(Buffer.byteLength(text)));
  assert.equal(result.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(result.headers["Content-Security-Policy"], /default-src 'none'/);
  assert.equal(JSON.stringify(result).includes("PRIVATE_QUERY"), false);
});

test("HEAD retains the same byte length but no body; non-read methods have no mutation path", () => {
  for (const method of ["HEAD", "POST", "PUT", "DELETE", "PATCH", undefined]) {
    const result = response();
    serveRuntimeNotices({ url: "/THIRD_PARTY_NOTICES.txt", method }, result, () => assert.fail(), text);
    assert.equal(result.body, undefined);
    assert.equal(result.statusCode, method === "HEAD" ? 200 : 405);
    if (method !== "HEAD") assert.equal(result.headers.Allow, "GET, HEAD");
  }
});

test("other and traversal-shaped routes never access arbitrary files through the notice middleware", () => {
  for (const url of ["/", "/PRIVATE_FILE", "/../THIRD_PARTY_NOTICES.txt", "/%54HIRD_PARTY_NOTICES.txt", undefined]) {
    const result = response(); let nextCalls = 0;
    serveRuntimeNotices({ url, method: "GET" }, result, () => { nextCalls += 1; }, text);
    assert.equal(nextCalls, 1); assert.deepEqual(result.headers, {}); assert.equal(result.body, undefined);
  }
});

test("the dev-only plugin prepares current locked notices once and exposes only the fixed route", async () => {
  const plugin = runtimeNoticesPlugin(); const handlers = [];
  assert.equal(plugin.apply, "serve");
  await plugin.configureServer({ config: { server: { host: "127.0.0.1" } }, middlewares: { use(handler) { handlers.push(handler); } } });
  assert.equal(handlers.length, 2);
  const result = response(); handlers[1]({ url: "/THIRD_PARTY_NOTICES.txt", method: "GET" }, result, () => assert.fail());
  assert.match(result.body, /react@19\.2\.8/); assert.match(result.body, /scheduler@0\.27\.0/);
  assert.match(result.body, /build-helper producer vite@8\.2\.4/);
  assert.match(result.body, /build-helper producer rolldown@1\.2\.14/);
  assert.match(result.body, /--- THIRD-PARTY-LICENSE ---/);
  assert.doesNotMatch(result.body, /arn:aws:|TWELVE_DATA_API_KEY|AWS_SESSION_TOKEN/);
});

test("network-wide binding and unavailable documents fail startup without exposing source paths", async () => {
  const plugin = runtimeNoticesPlugin(fileURLToPath(new URL("../public/", import.meta.url)));
  for (const host of [true, "0.0.0.0", "::", undefined]) await assert.rejects(plugin.configureServer({ config: { server: { host } } }), /loopback-only/);
  await assert.rejects(plugin.configureServer({ config: { server: { host: "127.0.0.1" } } }), error => {
    assert.equal(error.message, "Local runtime notices are incomplete; review the pinned package documents."); return true;
  });
});

test("preview notice middleware requires current audited artifact bytes and keeps loopback-only binding", async () => {
  const handlers = [], plugin = runtimeNoticesPlugin();
  await plugin.configurePreviewServer({ config: { preview: { host: "127.0.0.1" } }, middlewares: { use(handler) { handlers.push(handler); } } });
  const result = response(); handlers[1]({ url: "/THIRD_PARTY_NOTICES.txt", method: "GET" }, result, () => assert.fail());
  const expected = await collectFrontendAttribution(fileURLToPath(new URL("../../", import.meta.url)));
  assert.equal(result.statusCode, 200); assert.equal(result.body, expected.text);
  assert.equal(Buffer.byteLength(result.body), expected.report.artifactBytes);
  assert.equal(result.headers["Content-Type"], "text/plain; charset=utf-8");
  await assert.rejects(plugin.configurePreviewServer({ config: { preview: { host: "0.0.0.0" } } }), /loopback-only/);
});

test("private paths are rejected before public assets or missing-file SPA fallback, without reflecting input", () => {
  for (const path of ["/.env", "/.env.local", "/.npmrc", "/.yarnrc.yml", "/.aws/PRIVATE", "/.git/config",
    "/%2eaws/PRIVATE", "/@fs/C:/source/WORK/PRIVATE.txt", "/outputs/result", "/cdk.out/template",
    "/.codex/PRIVATE", "/.agents/PRIVATE", "/PUBLIC/file.CER", "/nested/file.der", "/state.tfstate.backup", "/a/../src/a.ts", "/work%5cPRIVATE"]) {
    const result = response();
    rejectPrivateLocalRequests({ url: `${path}?ignored=PRIVATE_QUERY` }, result, () => assert.fail("Private path must not fall through."));
    assert.equal(result.statusCode, 403); assert.equal(result.body, undefined);
    assert.equal(result.headers["Content-Length"], "0"); assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  }
});

test("malformed, oversized and multiply encoded local requests fail closed", () => {
  for (const url of [undefined, "https://example.invalid/", "/%", "/%00", "/%252eaws/PRIVATE", "/" + "x".repeat(8192)]) {
    const result = response(); rejectPrivateLocalRequests({ url }, result, () => assert.fail());
    assert.equal(result.statusCode, 400); assert.equal(result.body, undefined);
  }
});

test("frontend entry, modules, dependency paths and notices remain reachable through the early guard", () => {
  for (const url of ["/", "/src/main.tsx", "/og.png", "/THIRD_PARTY_NOTICES.txt", "/@vite/client",
    "/@fs/C:/synthetic/node_modules/.pnpm/react@19.2.8/node_modules/react/index.js", "/assets/index-abcdefgh.js",
    "/src/main.tsx?ignored=%252eaws", "/%EB%A1%9C%EC%BB%AC/src.tsx"]) {
    const result = response(); let calls = 0;
    rejectPrivateLocalRequests({ url }, result, () => { calls += 1; });
    assert.equal(calls, 1); assert.deepEqual(result.headers, {});
  }
});

function publicFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-public-boundary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "frontend", "public");
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "og.png"), "synthetic-only");
  return { root, directory };
}

test("public assets require the exact reviewed regular-file allowlist, not merely fs.deny", t => {
  const fixture = publicFixture(t); assert.doesNotThrow(() => assertLocalPublicAssetBoundary(fixture.root));
  for (const name of [".env.local", "private.json", "nested"]) {
    writeFileSync(join(fixture.directory, name), "synthetic-only");
    assert.throws(() => assertLocalPublicAssetBoundary(fixture.root), /public assets require review/);
    rmSync(join(fixture.directory, name));
  }
  rmSync(join(fixture.directory, "og.png"));
  assert.throws(() => assertLocalPublicAssetBoundary(fixture.root), /public assets require review/);
});

test("public-directory redirects are refused without reading the external target", t => {
  const fixture = publicFixture(t);
  rmSync(fixture.directory, { recursive: true });
  const outside = mkdtempSync(join(tmpdir(), "gmai-public-boundary-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "og.png"), "synthetic-only");
  symlinkSync(outside, fixture.directory, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => assertLocalPublicAssetBoundary(fixture.root), /public assets require review/);
});

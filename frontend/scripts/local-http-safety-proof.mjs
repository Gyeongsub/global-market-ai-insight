import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";
import { auditCurrentRelease } from "./release-audit.mjs";
import { FIXTURE_PREVIEW_HEADERS } from "../../shared/fixture-response-policy.mjs";

const FRONTEND = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = fileURLToPath(new URL("../../", import.meta.url));
const SENTINEL = "SYNTHETIC_LOCAL_HTTP_BOUNDARY_ONLY";

export function localRequestOptions(port, path, method = "GET", headers = {}) {
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, "Invalid local port.");
  assert.ok(typeof path === "string" && path.startsWith("/") && !path.startsWith("//")
    && path.length <= 8192 && Array.from(path).every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) < 127), "Invalid local request path.");
  assert.ok(["GET", "HEAD", "POST"].includes(method), "Unreviewed local method.");
  assert.ok(Object.keys(headers).every(key => ["Origin", "Host"].includes(key))
    && Object.values(headers).every(value => typeof value === "string" && value.length <= 200 && !/[\r\n]/.test(value)), "Unreviewed local headers.");
  return { hostname: "127.0.0.1", port, path, method, agent: false, headers: { Connection: "close", ...headers } };
}

function readLocal(port, path, method, headers) {
  const options = localRequestOptions(port, path, method, headers);
  return new Promise((resolveResponse, reject) => {
    const req = request(options, response => {
      const chunks = []; let bytes = 0;
      response.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > 2_000_000) { req.destroy(new Error("Local response exceeds the reviewed bound.")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolveResponse({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error("Local response deadline exceeded.")));
    req.on("error", reject); req.end();
  });
}

export async function closeOwnedLocalServer(server, deadlineMs = 5000) {
  assert.ok(Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 5000, "Unbounded local shutdown deadline.");
  let timer;
  try {
    await Promise.race([server.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Local shutdown deadline exceeded.")), deadlineMs); })]);
    assert.equal(server.httpServer?.listening, false, "Local server must be closed before proof completion.");
  } finally { clearTimeout(timer); }
}

export async function runLocalHttpSafetyProof() {
  const inventory = await auditCurrentRelease(join(FRONTEND, "dist"), SOURCE);
  const notices = inventory.files.find(file => file.key === "THIRD_PARTY_NOTICES.txt");
  const work = join(FRONTEND, "work");
  mkdirSync(work, { recursive: true });
  assert.ok(lstatSync(work).isDirectory() && !lstatSync(work).isSymbolicLink()
    && realpathSync(work) === resolve(work), "Local proof output must be a physical directory.");
  const temporary = mkdtempSync(join(work, "local-http-proof-"));
  const sentinel = join(temporary, "sentinel.txt");
  const owned = [], settled = new Set(); let requests = 0, closed = false;
  try {
    writeFileSync(sentinel, SENTINEL, { flag: "wx" });
    for (const mode of ["development", "preview"]) {
      const config = { root: FRONTEND, configFile: join(FRONTEND, "vite.config.ts"), logLevel: "silent" };
      const server = mode === "development" ? await createServer(config) : await preview(config);
      owned.push(server);
      if (mode === "development") await server.listen();
      const address = server.httpServer?.address();
      assert.ok(address && typeof address === "object" && address.address === "127.0.0.1", "Server must listen only on IPv4 loopback.");
      async function read(path, method = "GET", headers = {}) {
        requests += 1; assert.ok(requests <= 40, "Local HTTP request budget exceeded.");
        return readLocal(address.port, path, method, headers);
      }
      const html = await read("/");
      assert.equal(html.status, 200); assert.match(html.body.toString("utf8"), /Global Market AI Insight/);
      if(mode==="preview")for(const [key,value] of Object.entries(FIXTURE_PREVIEW_HEADERS))assert.equal(html.headers[key.toLowerCase()],value);
      const notice = await read("/THIRD_PARTY_NOTICES.txt");
      assert.equal(notice.status, 200); assert.equal(notice.body.length, notices.bytes);
      assert.equal(createHash("sha256").update(notice.body).digest("hex"), notices.sha256);
      assert.equal(notice.headers["content-type"], "text/plain; charset=utf-8");
      assert.equal(notice.headers["cache-control"], "no-store"); assert.equal(notice.headers["x-content-type-options"], "nosniff");
      assert.match(notice.headers["content-security-policy"], /default-src 'none'/);
      const head = await read("/THIRD_PARTY_NOTICES.txt", "HEAD");
      assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(Number(head.headers["content-length"]), notices.bytes);
      const post = await read("/THIRD_PARTY_NOTICES.txt", "POST");
      assert.equal(post.status, 405); assert.equal(post.body.length, 0);
      for (const path of ["/" + relative(FRONTEND, sentinel).split(sep).join("/"),
        "/@fs/" + encodeURI(sentinel.split(sep).join("/")), "/.npmrc", "/.aws/PRIVATE_MISSING"]) {
        const result = await read(path); assert.equal(result.status, 403); assert.equal(result.body.length, 0);
      }
      assert.equal((await read("/%252eaws/PRIVATE_MISSING")).status, 400);
      assert.equal((await read("/", "GET", { Origin: "https://example.invalid" })).headers["access-control-allow-origin"], undefined);
      assert.equal((await read("/", "GET", { Host: "untrusted.example.invalid" })).status, 403);
      for (const file of inventory.files) {
        const result=await read("/"+file.key,"HEAD");assert.equal(result.status,200);
        // The notice route intentionally has its own stricter sandbox policy.
        if(mode==="preview"&&file.key!=="THIRD_PARTY_NOTICES.txt")for(const [key,value] of Object.entries(FIXTURE_PREVIEW_HEADERS))
          assert.equal(result.headers[key.toLowerCase()],value);
      }
      if (mode === "development") {
        const outside = "/@fs/" + encodeURI(join(SOURCE, "docs", "architecture.md").split(sep).join("/"));
        assert.equal((await read(outside)).status, 403);
      }
      await closeOwnedLocalServer(server); settled.add(server);
    }
    closed = true;
  } finally {
    let cleanupIncomplete = false;
    // A failed listen can still own watchers/socket handles. Close every owned
    // server, not only servers whose HTTP socket reached the listening state.
    for (const server of owned) if (!settled.has(server)) {
      try { await closeOwnedLocalServer(server); } catch { cleanupIncomplete = true; }
    }
    const rel = relative(work, temporary);
    assert.ok(/^local-http-proof-[A-Za-z0-9]+$/.test(rel) && !lstatSync(temporary).isSymbolicLink()
      && realpathSync(temporary) === resolve(work, rel), "Refusing unverified local proof cleanup.");
    rmSync(temporary, { recursive: true, force: true });
    assert.equal(cleanupIncomplete, false, "Local server cleanup was incomplete.");
  }
  return { mode: "local-http-safety-proof", awsCalls: 0, externalNetworkCalls: 0, loopbackHttpRequests: requests,
    developmentAndPreviewPassed: true, exactNoticeBytesMatched: true, privateSentinelReturned: false,
    fixturePreviewSecurityHeadersMatched:true,developmentHmrPolicyUnchanged:true,remoteTlsOrHostingVerified:false,
    serversClosed: closed, temporaryFixtureRetained: false, publicationPerformed: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("Unreviewed local proof arguments.");
    console.log(JSON.stringify(await runLocalHttpSafetyProof()));
  } catch {
    console.error(JSON.stringify({ mode: "local-http-safety-proof", error: "LOCAL_HTTP_PROOF_INCOMPLETE", publicationPerformed: false }));
    // This dedicated proof child owns all its listeners; exiting also closes
    // them if a third-party close promise failed. No other process is targeted.
    process.exit(1);
  }
}

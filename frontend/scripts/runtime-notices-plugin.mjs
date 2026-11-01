import { fileURLToPath } from "node:url";
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ATTRIBUTION_FILE } from "../../scripts/runtime-attribution.mjs";
import { collectFrontendAttribution } from "../../scripts/frontend-helper-attribution.mjs";
import { auditCurrentRelease } from "./release-audit.mjs";

/** Early rejection also covers public-directory paths and nonexistent-file SPA fallbacks. */
export function rejectPrivateLocalRequests(request, response, next) {
  let path;
  try {
    if (typeof request.url !== "string" || request.url.length > 8192 || !request.url.startsWith("/")) throw new Error();
    path = decodeURIComponent(request.url.split("?")[0]).replaceAll("\\", "/");
    if (path.includes("%") || Array.from(path).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error();
  } catch {
    response.statusCode = 400;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Length", "0");
    response.end(); return;
  }
  const privatePath = path.toLowerCase().split("/").some(part =>
    [".", "..", ".aws", ".codex", ".agents", ".git", ".npmrc", ".yarnrc.yml", "outputs", "work", "cdk.out"].includes(part)
    || /^\.env(?:\.|$)/.test(part) || /\.(?:crt|pem|key|p12|pfx|cer|der)$/.test(part) || /\.tfstate(?:\.|$)/.test(part));
  if (!privatePath) { next(); return; }
  response.statusCode = 403;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Length", "0");
  response.end();
}

/** Vite's fs.deny does not filter public assets: require the reviewed fixed asset only. */
export function assertLocalPublicAssetBoundary(root) {
  try {
    const directory = join(root, "frontend", "public");
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    const entries = readdirSync(directory);
    if (entries.length !== 1 || entries[0] !== "og.png") throw new Error();
    const image = lstatSync(join(directory, "og.png"));
    if (!image.isFile() || image.isSymbolicLink()) throw new Error();
  } catch { throw new Error("Local public assets require review before serving."); }
}

/** A single precomputed plain-text route; never reads a request-supplied path. */
export function serveRuntimeNotices(request, response, next, text) {
  if (request.url?.split("?")[0] !== `/${ATTRIBUTION_FILE}`) { next(); return; }
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; sandbox");
  response.setHeader("Referrer-Policy", "no-referrer");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.setHeader("Content-Length", "0");
    response.end(); return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Length", String(Buffer.byteLength(text)));
  response.end(request.method === "HEAD" ? undefined : text);
}

/** Development-only, loopback-only. Builds write notices to dist separately. */
export function runtimeNoticesPlugin(root = fileURLToPath(new URL("../../", import.meta.url))) {
  async function prepare(server, mode) {
    if (server.config[mode].host !== "127.0.0.1") throw new Error("Local notice server must remain loopback-only.");
    let candidate;
    try {
      assertLocalPublicAssetBoundary(root);
      candidate = await collectFrontendAttribution(root);
      // A preview serves reviewed build bytes, never a replacement generated to
      // conceal missing/stale dist notices. The helper below emits identical bytes.
      if (mode === "preview") await auditCurrentRelease(fileURLToPath(new URL("../dist/", import.meta.url)), root);
    }
    catch { throw new Error("Local runtime notices are incomplete; review the pinned package documents."); }
    server.middlewares.use(rejectPrivateLocalRequests);
    server.middlewares.use((request, response, next) => serveRuntimeNotices(request, response, next, candidate.text));
  }
  return {
    name: "local-runtime-notices", apply: "serve",
    configureServer(server) { return prepare(server, "server"); },
    configurePreviewServer(server) { return prepare(server, "preview"); },
  };
}

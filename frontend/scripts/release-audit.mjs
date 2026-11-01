import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeSocialImage } from "./sanitize-social-image.mjs";
import { credentialFindingNames } from "../../scripts/credential-patterns.mjs";
import { ATTRIBUTION_FILE, validateRuntimeAttributionText } from "../../scripts/runtime-attribution.mjs";
import { collectFrontendAttribution } from "../../scripts/frontend-helper-attribution.mjs";

/** Strict current fixture-build allowlist; adding a new asset type needs review. */
export function auditRelease(directory) {
  const root = resolve(directory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Release root must be a real directory.");
  const entries = [];
  function visit(dir, prefix = "") {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      const key = prefix + name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("Release contains a symbolic link.");
      if (stat.isDirectory()) {
        if (key !== "assets") throw new Error("Release contains an unexpected directory.");
        visit(path, "assets/");
        continue;
      }
      const hashed = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(key);
      if (!stat.isFile() || (!hashed && key !== "index.html" && key !== "og.png" && key !== ATTRIBUTION_FILE)) {
        throw new Error("Release contains an unexpected file; source/config/maps must not be uploaded.");
      }
      if (stat.size > 5_000_000 || stat.size === 0) throw new Error("Release file exceeds the reviewed size boundary.");
      const bytes = readFileSync(path);
      if (key === "og.png") {
        const inspected = sanitizeSocialImage(bytes);
        if (inspected.removedBytes !== 0) throw new Error("Release social image still contains embedded metadata.");
      } else {
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
        catch { throw new Error("Release text has invalid UTF-8 encoding."); }
        if (key === ATTRIBUTION_FILE) validateRuntimeAttributionText(text);
        if (credentialFindingNames(text).length > 0) {
          throw new Error("Release contains a high-confidence credential pattern.");
        }
        if (/sourceMappingURL=|\.execute-api\.[a-z0-9-]+\.amazonaws\.com|arn:aws[a-z-]*:|TWELVE_DATA_API_KEY|\b[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/.test(text)) {
          throw new Error("Fixture release contains an internal endpoint, identifier or source map.");
        }
        if (/\b[A-Z]:\\{1,2}Users\\{1,2}[^\\\s]+|\/(?:Users|home)\/[^/\s]+\//i.test(text)) {
          throw new Error("Fixture release contains a personal-computer path.");
        }
      }
      entries.push({ key, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
        cacheControl: hashed ? "public,max-age=31536000,immutable" : "no-cache,max-age=0,must-revalidate" });
    }
  }
  visit(root);
  for (const required of ["index.html", "og.png", ATTRIBUTION_FILE]) {
    if (!entries.some(entry => entry.key === required)) throw new Error("Release is missing a required entry file.");
  }
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  // A missing quote must not bypass the external-asset review. The generated
  // HTML uses quoted attributes, so reject unquoted src/href altogether.
  const referenceAttributes = [...html.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)];
  if (referenceAttributes.some(match => match[3] !== undefined)) {
    throw new Error("Release has an unquoted asset reference.");
  }
  const references = referenceAttributes.map(match => match[1] ?? match[2]);
  if (!references.some(ref => ref.endsWith(".js")) || !references.some(ref => ref.endsWith(".css"))) {
    throw new Error("Release must reference built JavaScript and CSS.");
  }
  for (const ref of references) {
    if (!ref.startsWith("/") || !entries.some(entry => `/${entry.key}` === ref)) {
      throw new Error("Release references an external or missing asset.");
    }
  }
  if (/<script\b(?![^>]*\bsrc=)[^>]*>|<style\b|\son[a-z]+\s*=/i.test(html)) {
    throw new Error("Release HTML contains inline executable content incompatible with CSP.");
  }
  return { mode: "local-audit", awsCalls: 0, uploaded: false, files: entries.sort((a, b) => a.key.localeCompare(b.key)) };
}

/** Current artifacts must match the current pinned package documents byte-for-byte. */
export async function auditCurrentRelease(directory, sourceRoot = fileURLToPath(new URL("../../", import.meta.url))) {
  const inventory = auditRelease(directory);
  const expected = await collectFrontendAttribution(sourceRoot);
  const actual = inventory.files.find(file => file.key === ATTRIBUTION_FILE);
  if (actual?.sha256 !== expected.report.artifactSha256 || actual.bytes !== expected.report.artifactBytes) {
    throw new Error("Current release notices do not match the pinned runtime documents.");
  }
  return { ...inventory, runtimeAttribution: { scope: "frontend", lockfileSha256: expected.report.lockfileSha256,
    runtimePackages: expected.report.runtimePackages, sourceLicenseBytesMatched: true,
    buildHelperProducerPackages: expected.report.buildHelperProducers.producerPackages,
    buildHelperDocumentBytesMatched: true, generatedHelperSourceReviewRequired: true,
    exactBundledModuleCoverageVerified: false, legalReviewApproved: false, readyForPublication: false } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No caller-supplied destination, credentials or upload operation exists here.
  try {
    if (process.argv.length !== 2) throw new Error("RELEASE_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await auditCurrentRelease(fileURLToPath(new URL("../dist", import.meta.url))), null, 2));
  } catch {
    console.error(JSON.stringify({ mode: "local-audit", error: "RELEASE_AUDIT_INCOMPLETE", uploaded: false }));
    process.exitCode = 1;
  }
}

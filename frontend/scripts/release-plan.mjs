import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditCurrentRelease, auditRelease } from "./release-audit.mjs";
import { ATTRIBUTION_FILE } from "../../scripts/runtime-attribution.mjs";

const ASSET_KEY = /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/;
const IMMUTABLE = "public,max-age=31536000,immutable";
const REVALIDATE = "no-cache,max-age=0,must-revalidate";

function validateManifest(value) {
  if (value?.mode !== "local-audit" || value.awsCalls !== 0 || value.uploaded !== false ||
      !Array.isArray(value.files) || value.files.length < 5 || value.files.length > 50) {
    throw new Error("Previous release manifest is not a reviewed local audit.");
  }
  const seen = new Set();
  for (const file of value.files) {
    const key = file?.key;
    if (typeof key !== "string" || !(ASSET_KEY.test(key) || key === "index.html" || key === "og.png" || key === ATTRIBUTION_FILE) ||
        seen.has(key) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 5_000_000 ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        file.cacheControl !== (ASSET_KEY.test(key) ? IMMUTABLE : REVALIDATE)) {
      throw new Error("Previous release manifest contains an invalid file record.");
    }
    seen.add(key);
  }
  if (!seen.has("index.html") || !seen.has("og.png") || !seen.has(ATTRIBUTION_FILE) ||
      ![...seen].some(key => key.endsWith(".js")) || ![...seen].some(key => key.endsWith(".css"))) {
    throw new Error("Previous release manifest is missing required files.");
  }
  return value.files;
}

/** A local proposal only: no S3/CloudFront client, destination or mutation. */
export function makeReleasePlan(current, previous = null, previousBundleDirectory = null) {
  const currentFiles = validateManifest(current);
  const previousFiles = previous === null ? [] : validateManifest(previous);
  if (previousBundleDirectory !== null && previous === null) {
    throw new Error("A previous bundle requires its reviewed manifest.");
  }
  let localArchiveVerified = false;
  if (previousBundleDirectory !== null) {
    const archiveFiles = validateManifest(auditRelease(previousBundleDirectory));
    const archived = new Map(archiveFiles.map(file => [file.key, file]));
    if (archived.size !== previousFiles.length || previousFiles.some(file => {
      const copy = archived.get(file.key);
      return !copy || copy.bytes !== file.bytes || copy.sha256 !== file.sha256 || copy.cacheControl !== file.cacheControl;
    })) {
      throw new Error("Previous bundle bytes do not match the reviewed manifest.");
    }
    localArchiveVerified = true;
  }
  const old = new Map(previousFiles.map(file => [file.key, file]));
  for (const file of currentFiles) {
    const former = old.get(file.key);
    if (former && ASSET_KEY.test(file.key) && former.sha256 !== file.sha256) {
      throw new Error("An immutable asset key changed content; rebuild with a new hash.");
    }
  }
  const changed = currentFiles.filter(file => old.get(file.key)?.sha256 !== file.sha256);
  const assets = changed.filter(file => ASSET_KEY.test(file.key));
  const media = changed.filter(file => file.key === "og.png");
  const notices = changed.filter(file => file.key === ATTRIBUTION_FILE);
  const html = changed.filter(file => file.key === "index.html");
  return {
    mode: "local-plan",
    awsCalls: 0,
    uploaded: false,
    deletionPlanned: false,
    // The stable HTML is published last, after its referenced immutable assets.
    stages: [
      { name: "immutable-assets", files: assets },
      { name: "stable-social-image", files: media },
      { name: "stable-runtime-notices", files: notices },
      { name: "html-last", files: html },
    ],
    verifyBeforeHtml: currentFiles.filter(file => file.key !== "index.html"),
    verifyAfterHtml: currentFiles,
    retainOldAssets: previousFiles.filter(file => ASSET_KEY.test(file.key) && !currentFiles.some(now => now.key === file.key)).map(file => file.key),
    rollback: previous === null ? { available: false } : {
      available: false,
      localArchiveVerified,
      reason: localArchiveVerified
        ? "Local previous bundle bytes match, but fresh remote object verification and approved rollback steps are still required."
        : "An archived previous bundle and fresh remote object verification are required; the manifest alone cannot restore bytes.",
      previousKeys: previousFiles.map(file => file.key),
    },
    invalidation: { requested: false, paths: [] },
    noticesContentTypeRequired: "text/plain; charset=utf-8",
    approvalsStillRequired: ["AWS identity and region", "live cost and TLS decision", "exact deployment/upload scope", "post-upload checks"],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--previous-manifest") &&
      (args.length !== 4 || args[0] !== "--previous-manifest" || args[2] !== "--previous-bundle")) {
    throw new Error("Usage: release-plan.mjs [--previous-manifest <local-audit-json> [--previous-bundle <archived-dist-dir>]]");
  }
  const previous = args.length >= 2 ? JSON.parse(readFileSync(resolve(args[1]), "utf8")) : null;
  console.log(JSON.stringify(makeReleasePlan(await auditCurrentRelease(fileURLToPath(new URL("../dist", import.meta.url))), previous,
    args.length === 4 ? resolve(args[3]) : null), null, 2));
}

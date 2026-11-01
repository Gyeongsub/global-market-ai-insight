import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { credentialFindingNames } from "./credential-patterns.mjs";
import { quotedInspectionVariants } from "./quoted-inspection.mjs";
import { cleanSourceChildEnvironment } from "./local-proof-environment.mjs";

const TEXT_EXTENSIONS = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".mts", ".cts", ".patch", ".ps1", ".sh", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const TEXT_FILENAMES = new Set([".dockerignore", ".env.example", ".gitignore", "dockerfile", "license"]);
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf", ".mp4"]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunkTypes(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const types = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length || end < offset) return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    types.push(type);
    offset = end;
    if (type === "IEND") return offset === bytes.length ? types : null;
  }
  return null;
}

/** Returns categories only; never returns matching credentials or email values. */
export function inspectPublicationCandidate(path, bytes) {
  const normalized = path.replaceAll("\\", "/").toLowerCase();
  const filename = normalized.split("/").at(-1) ?? "";
  const extension = extname(normalized);
  const findings = [];
  if (filename === ".env" || filename.startsWith(".env.") && filename !== ".env.example" ||
      [".pem", ".key", ".p12", ".pfx", ".tfstate"].includes(extension) || /\.tfstate(?:\..*)?$/i.test(filename) ||
      ["id_rsa", "id_ed25519", "credentials", "cdk.context.json"].includes(filename)) {
    findings.push("sensitive-file-name-review");
  }
  if (normalized.split("/").some(part => [".aws", ".codex", ".agents"].includes(part))) findings.push("credential-or-assistant-private-state-review");
  if (normalized.split("/").some(part => [".tmp", ".pnpm-store", "dist", "bundle", "cdk.out", "outputs", "work", "node_modules", ".terraform"].includes(part)) ||
      filename.endsWith(".map")) findings.push("generated-or-private-path-review");
  // A workflow can run automatically and consume minutes or credentials after
  // publication even when its YAML contains no literal secret value.
  if (normalized.startsWith(".github/workflows/")) findings.push("automation-workflow-cost-review");
  if (extension === ".png") {
    const types = pngChunkTypes(bytes);
    if (!types) findings.push("image-invalid-or-unreviewed");
    else if (types.some(type => !["IHDR", "PLTE", "IDAT", "IEND", "tRNS"].includes(type))) findings.push("image-embedded-metadata-review");
  } else if (BINARY_EXTENSIONS.has(extension)) {
    findings.push("binary-rights-and-metadata-review");
  } else if ((TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(filename)) && bytes.length <= 2_000_000) {
    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (content.includes("\0")) throw new Error("Ambiguous text");
    } catch { findings.push("unreviewed-text-encoding"); return findings; }
    let variants;
    try { variants = quotedInspectionVariants(content); }
    catch { findings.push("unreviewed-text-normalization"); return findings; }
    if (credentialFindingNames(content).length > 0) findings.push("credential-pattern");
    if (variants.some(value => /\barn:aws(?:-[a-z-]+)?:[a-z0-9-]+:[a-z0-9-]*:[0-9]{12}:/i.test(value) ||
        /\b[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com\b/i.test(value) ||
        /\b[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\b/i.test(value))) findings.push("cloud-identifier-review");
    const decodedPathTexts = variants.map(value => value.replace(/\\\//g, "/").replace(/\\\\/g, "\\"));
    if (decodedPathTexts.some(value => /[A-Z]:[\\/]Users[\\/][^\\/\s"']+|\/(?:Users|home)\/[^/\s"']+\//i.test(value))) findings.push("personal-computer-path");
    if (variants.some(value => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value))) findings.push("email-string-review");
  } else if (bytes.length > 2_000_000) {
    findings.push("large-or-unrecognized-file-review");
  } else {
    findings.push("unrecognized-file-type-review");
  }
  return findings;
}

function scanPublication(root, captureManifest = false) {
  const base = resolve(root);
  const physicalBase = realpathSync(base);
  if (captureManifest && (physicalBase !== base || lstatSync(base).isSymbolicLink())) throw new Error("PUBLICATION_SNAPSHOT_SCOPE_INVALID");
  const listed = spawnSync("git", ["-c", `safe.directory=${base}`, "-c", "core.fsmonitor=false",
    "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: base, encoding: "buffer", timeout: 10_000, maxBuffer: 2_000_000, windowsHide: true,
    env: { ...cleanSourceChildEnvironment(process.env), GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" },
  });
  if (listed.status !== 0 || !Buffer.isBuffer(listed.stdout)) throw new Error("Could not list local Git publication candidates.");
  const names = [...new Set(listed.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
  if (names.length === 0 || names.length > 10_000) throw new Error("Publication candidate count requires manual review.");
  const findings = [];
  const manifest = []; let totalBytes = 0;
  for (const name of names) {
    const path = resolve(base, name);
    const rel = relative(base, path);
    if (isAbsolute(rel) || rel.startsWith("..") || rel.startsWith(sep) || !rel || /(^|[\\/])\.git([\\/]|$)/.test(rel)) {
      throw new Error("Unsafe publication candidate path.");
    }
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "EACCES") throw error;
      findings.push({ file: name, category: error.code === "ENOENT" ? "missing-candidate-review" : "unreadable-candidate-review" });
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      findings.push({ file: name, category: "non-regular-file-review" });
      continue;
    }
    // A tracked file can sit under a parent directory replaced by a junction.
    // Check the physical target before reading even one byte of its contents.
    let physicalPath;
    try {
      physicalPath = realpathSync(path);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "EACCES") throw error;
      findings.push({ file: name, category: "unreadable-candidate-review" });
      continue;
    }
    const physicalRel = relative(physicalBase, physicalPath);
    if (!physicalRel || isAbsolute(physicalRel) || physicalRel.startsWith("..") || physicalRel.startsWith(sep)) {
      findings.push({ file: name, category: "outside-repository-path-review" });
      continue;
    }
    if (stat.size > 10_000_000) {
      findings.push({ file: name, category: "oversized-file-review" });
      continue;
    }
    const bytes = readFileSync(path);
    const categories = inspectPublicationCandidate(name, bytes);
    for (const category of categories) findings.push({ file: name, category });
    if (captureManifest) {
      totalBytes += bytes.length;
      const after = lstatSync(path);
      if (names.length > 2000 || totalBytes > 64_000_000 || /[\x00-\x1f\x7f]/.test(name) ||
          bytes.length !== stat.size || after.size !== stat.size || !after.isFile() ||
          after.isSymbolicLink() || realpathSync(path) !== physicalPath) throw new Error("PUBLICATION_SNAPSHOT_UNSTABLE");
      manifest.push({ file: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), categories });
    }
  }
  if (captureManifest && manifest.length !== names.length) throw new Error("PUBLICATION_SNAPSHOT_INCOMPLETE");
  return {
    mode: "local-publication-preflight", networkCalls: 0, pushPerformed: false,
    candidateFiles: names.length, findings,
    // Content rights, history, screenshots, user consent and platform settings
    // cannot be approved by a regex or a clean local scan.
    readyForPublication: false,
    manualReviewRequired: true,
    ...(captureManifest ? { manifest, totalBytes } : {}),
  };
}

export const auditPublication = root => scanPublication(root);
// This inventory never removes findings or authorizes publication. Two reads
// detect ordinary edits; they are not an atomic filesystem snapshot or signature.
export function capturePublicationManifest(root) {
  const first = scanPublication(root, true), second = scanPublication(root, true);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("PUBLICATION_SNAPSHOT_UNSTABLE");
  return first;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error("PUBLICATION_ARGUMENTS_INVALID");
    const result = auditPublication(process.cwd());
    console.log(JSON.stringify(result, null, 2));
    if (result.findings.length > 0) process.exitCode = 2;
  } catch {
    console.error(JSON.stringify({ mode: "local-publication-preflight", error: "PUBLICATION_REVIEW_INCOMPLETE", pushPerformed: false, readyForPublication: false }));
    process.exitCode = 1;
  }
}

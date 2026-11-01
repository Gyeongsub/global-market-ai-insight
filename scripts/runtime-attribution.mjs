import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { credentialFindingNames } from "./credential-patterns.mjs";

export const ATTRIBUTION_FILE = "THIRD_PARTY_NOTICES.txt";
const HEADER = "Global Market AI Insight - third-party runtime notices\n";
const LICENSE_NAME = /^(?:LICEN[CS]E|COPYING|COPYRIGHT|NOTICE)(?:[._-][A-Za-z0-9._-]{1,48})?$/i;
const HASH = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const plainVersion = value => typeof value === "string" ? value.split("(")[0] : null;

function inside(root, path) {
  const offset = relative(root, path);
  return offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`);
}

export function validateRuntimeAttributionText(text, scope = "frontend") {
  if (!["backend", "frontend"].includes(scope) || typeof text !== "string" || Buffer.byteLength(text) > 4_000_000 ||
      !text.startsWith(HEADER) || !text.includes(`\nScope: ${scope}\nLock SHA-256: `) ||
      !/\nLock SHA-256: [a-f0-9]{64}\n/.test(text) || !/\n===== [^\n]+ =====\n/.test(text) ||
      credentialFindingNames(text).length || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
    throw new Error("ATTRIBUTION_ARTIFACT_INVALID");
  }
}

/** Only the just-built frontend distribution is writable; no configurable destination. */
export function writeFrontendAttribution(root, attribution) {
  const physicalRoot = realpathSync(root);
  const frontend = join(physicalRoot, "frontend");
  const dist = join(frontend, "dist");
  for (const directory of [frontend, dist]) {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) {
      throw new Error("ATTRIBUTION_OUTPUT_SCOPE_INVALID");
    }
  }
  const report = attribution?.report;
  validateRuntimeAttributionText(attribution?.text);
  if (report?.scope !== "frontend" || report?.awsCalls !== 0 || report?.networkCalls !== 0 || report?.uploaded !== false ||
      report?.artifactSha256 !== HASH(attribution.text) || report?.artifactBytes !== Buffer.byteLength(attribution.text)) {
    throw new Error("ATTRIBUTION_ARTIFACT_INVALID");
  }
  // Vite emptyOutDir creates a fresh distribution. Refuse an existing entry rather
  // than overwrite a possibly user-edited file or follow a redirected link.
  writeFileSync(join(dist, ATTRIBUTION_FILE), attribution.text, { encoding: "utf8", flag: "wx" });
  return { runtimePackages: report.runtimePackages, bytes: report.artifactBytes, sha256: report.artifactSha256 };
}

/** Preserve full upstream texts, including copyright. Do not strip email attribution. */
export function readRuntimeNoticeDocuments(directory, store, additionalNames = []) {
  if (!Array.isArray(additionalNames) || (additionalNames.length !== 0 &&
      (additionalNames.length !== 1 || additionalNames[0] !== "THIRD-PARTY-LICENSE"))) {
    throw new Error("ATTRIBUTION_DOCUMENT_PATH_INVALID");
  }
  const physical = realpathSync(directory);
  if (!inside(store, physical) || lstatSync(directory).isSymbolicLink()) throw new Error("ATTRIBUTION_PACKAGE_SCOPE_INVALID");
  const entries = readdirSync(physical, { withFileTypes: true });
  if (entries.length > 1000) throw new Error("ATTRIBUTION_DOCUMENT_LIMIT_EXCEEDED");
  const selected = entries.filter(entry => LICENSE_NAME.test(entry.name) || additionalNames.includes(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!selected.length || selected.length > 16 || !selected.some(entry => /^(?:LICEN[CS]E|COPYING)(?:[._-]|$)/i.test(entry.name))) {
    throw new Error("ATTRIBUTION_LICENSE_DOCUMENT_MISSING");
  }
  return selected.map(entry => {
    const path = join(physical, entry.name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size < 1 || stat.size > 500_000) {
      throw new Error("ATTRIBUTION_DOCUMENT_PATH_INVALID");
    }
    const bytes = readFileSync(path);
    if (bytes.length !== stat.size) throw new Error("ATTRIBUTION_DOCUMENT_CHANGED");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new Error("ATTRIBUTION_DOCUMENT_ENCODING_INVALID"); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) || credentialFindingNames(text).length ||
        /\b[A-Z]:[\\/]Users[\\/]|\/(?:Users|home)\/[^/\s]+\//i.test(text)) throw new Error("ATTRIBUTION_DOCUMENT_REVIEW_REQUIRED");
    return { name: entry.name, bytes: bytes.length, sha256: HASH(bytes), text };
  });
}

/** A locked dependency superset, not proof of exact emitted modules or legal approval. */
export async function collectRuntimeAttribution(root = process.cwd(), scope = "backend", suppliedLock = null) {
  if (!["backend", "frontend"].includes(scope)) throw new Error("ATTRIBUTION_SCOPE_INVALID");
  const physicalRoot = realpathSync(root);
  const store = realpathSync(join(root, "node_modules", ".pnpm"));
  if (!inside(physicalRoot, store)) throw new Error("ATTRIBUTION_STORE_SCOPE_INVALID");
  const importer = scope === "frontend" ? "frontend" : ".";
  const proof = suppliedLock === null ? readLocalDependencyLock(root) : suppliedLock;
  const { lock, lockfileSha256 } = proof;
  if (!object(lock) || !["9.0", 9].includes(lock.lockfileVersion) || !object(lock.packages) || !object(lock.importers) ||
      !object(lock.snapshots) || !/^[a-f0-9]{64}$/.test(lockfileSha256)) throw new Error("ATTRIBUTION_LOCK_INVALID");
  const graph = await collectProductionPackageGraph(root, importer);
  if (graph.length > 200) throw new Error("ATTRIBUTION_GRAPH_LIMIT_EXCEEDED");
  const declared = JSON.parse(readFileSync(join(physicalRoot, importer, "package.json"), "utf8")).dependencies;
  const pinned = lock.importers[importer]?.dependencies;
  if (!object(declared) || !object(pinned) || Object.keys(declared).sort().join("\n") !== Object.keys(pinned).sort().join("\n") ||
      Object.entries(declared).some(([name, specifier]) => specifier !== pinned[name]?.specifier ||
        !graph.some(pkg => pkg.name === name && pkg.version === plainVersion(pinned[name]?.version)))) {
    throw new Error("ATTRIBUTION_IMPORTER_MISMATCH");
  }
  const packages = [];
  const blocks = [HEADER, `Scope: ${scope}\nLock SHA-256: ${lockfileSha256}\n`,
    "Conservative declared runtime dependency set; not legal or publication approval.\n"];
  let bytesRead = 0;
  for (const pkg of graph) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!Object.hasOwn(lock.packages, key)) throw new Error("ATTRIBUTION_PACKAGE_NOT_LOCKED");
    const snapshots = Object.entries(lock.snapshots).filter(([name]) => plainVersion(name) === key);
    if (!snapshots.some(([, value]) => object(value) && pkg.dependencies.every(child =>
      plainVersion(value.dependencies?.[child.name]) === child.version))) throw new Error("ATTRIBUTION_DEPENDENCY_MISMATCH");
    const documents = readRuntimeNoticeDocuments(pkg.directory, store);
    bytesRead += documents.reduce((total, doc) => total + doc.bytes, 0);
    if (bytesRead > 4_000_000) throw new Error("ATTRIBUTION_DOCUMENT_LIMIT_EXCEEDED");
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license,
      documents: documents.map(({ text: _text, ...doc }) => doc) });
    blocks.push(`\n===== ${key} (${pkg.license}) =====\n`);
    for (const doc of documents) blocks.push(`\n--- ${doc.name} ---\n`, doc.text, "\n");
  }
  const text = blocks.join("");
  return { text, report: { mode: "local-runtime-attribution", scope, awsCalls: 0, networkCalls: 0, uploaded: false,
    lockfileSha256, runtimePackages: packages.length, packages, artifactBytes: Buffer.byteLength(text), artifactSha256: HASH(text),
    sourceLicenseBytesPreserved: true, noticeTextReviewRequired: true, exactBundledModuleCoverageVerified: false,
    containerOsLicensesIncluded: false, developmentGraphIncluded: false, freshInstallVerified: false, readyForPublication: false } };
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--scope" || !["backend", "frontend"].includes(args[1])) throw new Error("ATTRIBUTION_ARGUMENTS_INVALID");
    console.log(JSON.stringify((await collectRuntimeAttribution(process.cwd(), args[1])).report, null, 2));
  } catch {
    console.error(JSON.stringify({ error: "RUNTIME_ATTRIBUTION_INCOMPLETE", uploaded: false, readyForPublication: false }));
    process.exitCode = 1;
  }
}

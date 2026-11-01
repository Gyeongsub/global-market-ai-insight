import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SIMPLE_REVIEWED_LICENSES = new Set(["0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0", "ISC", "MIT"]);
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const identity = value => {
  const at = value.lastIndexOf("@");
  const name = value.slice(0, at);
  const version = value.slice(at + 1);
  if (at < 1 || !NAME.test(name) || !VERSION.test(version)) throw new Error("LOCK_IDENTITY_INVALID");
  return { name, version };
};
const license = value => typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9 .()+:/-]+$/.test(value) ? value : null;

/** Metadata inventory only: a license expression is not a legal or publication approval. */
export function evaluateDependencyLicenseInventory(lock, manifests) {
  if (!object(lock) || !["9.0", 9].includes(lock.lockfileVersion) || !object(lock.packages) || !object(lock.importers) ||
      !Array.isArray(manifests) || manifests.length > 4000) throw new Error("LOCK_METADATA_INVALID");
  const keys = Object.keys(lock.packages).sort();
  if (!keys.length || keys.length > 1000) throw new Error("LOCK_METADATA_INVALID");
  keys.forEach(identity);
  const installed = new Map();
  for (const manifest of manifests) {
    if (!object(manifest) || typeof manifest.name !== "string" || !NAME.test(manifest.name) ||
        typeof manifest.version !== "string" || !VERSION.test(manifest.version)) throw new Error("PACKAGE_METADATA_INVALID");
    const key = `${manifest.name}@${manifest.version}`;
    const candidates = installed.get(key) ?? [];
    candidates.push(license(manifest.license));
    installed.set(key, candidates);
  }
  const rows = keys.map(key => {
    const candidates = installed.get(key) ?? [];
    const expressions = [...new Set(candidates)];
    const expression = expressions.length === 1 ? expressions[0] : null;
    return { ...identity(key), licenseExpression: expression,
      state: candidates.length === 0 ? "missing-installed-metadata" : expression === null ? "missing-or-conflicting-license" : "metadata-available" };
  });
  const directRuntime = new Set();
  for (const importer of Object.values(lock.importers)) {
    if (!object(importer) || (importer.dependencies !== undefined && !object(importer.dependencies))) throw new Error("IMPORTER_METADATA_INVALID");
    for (const [name, dependency] of Object.entries(importer.dependencies ?? {})) {
      if (!NAME.test(name) || !object(dependency) || typeof dependency.version !== "string") throw new Error("IMPORTER_METADATA_INVALID");
      const version = dependency.version.split("(")[0];
      if (!VERSION.test(version) || !Object.hasOwn(lock.packages, `${name}@${version}`)) throw new Error("IMPORTER_METADATA_INVALID");
      directRuntime.add(`${name}@${version}`);
    }
  }
  const available = rows.filter(row => row.state === "metadata-available");
  const expressions = [...new Set(available.map(row => row.licenseExpression))].sort();
  return {
    mode: "local-lock-aligned-license-metadata-inventory", awsCalls: 0, networkCalls: 0, lifecycleScriptsRun: 0,
    lockPackageIdentities: rows.length, metadataAvailable: available.length,
    metadataMissingOrConflicting: rows.length - available.length,
    lockMetadataComplete: available.length === rows.length,
    licenseExpressionCounts: Object.fromEntries(expressions.map(expression => [expression, available.filter(row => row.licenseExpression === expression).length])),
    manualExpressionReview: expressions.filter(expression => !SIMPLE_REVIEWED_LICENSES.has(expression)),
    directRuntime: rows.filter(row => directRuntime.has(`${row.name}@${row.version}`)),
    unresolved: rows.filter(row => row.state !== "metadata-available").map(({ name, version, state }) => ({ name, version, state })),
    freshInstallVerified: false, advisoryCheckPerformed: false, imageScanPerformed: false, readyForPublication: false,
  };
}

function boundedRegularFile(path, boundary) {
  const physical = realpathSync(path);
  const offset = relative(boundary, physical);
  if (!offset || offset === ".." || isAbsolute(offset) || offset.startsWith(`..${sep}`) ||
      !lstatSync(path).isFile() || lstatSync(path).size > 2_000_000) throw new Error("LOCAL_METADATA_PATH_INVALID");
  return readFileSync(path, "utf8");
}

/** Root-level documents only. Hash presence is not a legal interpretation. */
export function inspectInstalledLicenseDocuments(directory, storeBoundary) {
  const physicalDirectory = realpathSync(directory);
  const offset = relative(storeBoundary, physicalDirectory);
  if (!offset || offset === ".." || isAbsolute(offset) || offset.startsWith(`..${sep}`) || lstatSync(directory).isSymbolicLink()) {
    throw new Error("LOCAL_LICENSE_DOCUMENT_SCOPE_INVALID");
  }
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.length > 1000) throw new Error("LOCAL_LICENSE_DOCUMENT_LIMIT_EXCEEDED");
  const selected = entries.filter(entry => /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[._-][A-Za-z0-9._-]{1,48})?$/i.test(entry.name));
  if (selected.length > 16) throw new Error("LOCAL_LICENSE_DOCUMENT_LIMIT_EXCEEDED");
  const documents = [];
  const issueCategories = [];
  for (const entry of selected) {
    if (entry.isDirectory()) { issueCategories.push("license-directory-not-inspected"); continue; }
    const path = join(directory, entry.name);
    const details = lstatSync(path);
    if (!details.isFile() || details.isSymbolicLink() || realpathSync(path) !== join(physicalDirectory, entry.name)) {
      issueCategories.push("non-regular-license-document-not-inspected"); continue;
    }
    if (details.size === 0 || details.size > 500_000) { issueCategories.push("empty-or-oversized-license-document-not-inspected"); continue; }
    const bytes = readFileSync(path);
    if (bytes.length !== details.size) throw new Error("LICENSE_DOCUMENT_CHANGED_DURING_READ");
    documents.push({ kind: /^NOTICE/i.test(entry.name) ? "notice" : "license", bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  documents.sort((a, b) => a.kind.localeCompare(b.kind) || a.sha256.localeCompare(b.sha256));
  return { documents, issueCategories: [...new Set(issueCategories)].sort() };
}

export function evaluateLicenseDocumentInventory(lock, manifests) {
  // Reuse strict name/version and lock validation; only lock-aligned rows enter this report.
  const metadata = evaluateDependencyLicenseInventory(lock, manifests);
  const byKey = new Map();
  for (const manifest of manifests) {
    const proof = manifest.licenseDocumentProof;
    if (proof === undefined) continue;
    if (!object(proof) || !Array.isArray(proof.documents) || proof.documents.length > 16 || !Array.isArray(proof.issueCategories)
        || proof.issueCategories.length > 3 || proof.issueCategories.some(item => !["license-directory-not-inspected",
          "non-regular-license-document-not-inspected", "empty-or-oversized-license-document-not-inspected"].includes(item))) {
      throw new Error("LICENSE_DOCUMENT_PROOF_INVALID");
    }
    for (const document of proof.documents) {
      if (!object(document) || Object.keys(document).sort().join(",") !== "bytes,kind,sha256" || !["license", "notice"].includes(document.kind)
          || !Number.isSafeInteger(document.bytes) || document.bytes < 1 || document.bytes > 500_000
          || typeof document.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(document.sha256)) throw new Error("LICENSE_DOCUMENT_PROOF_INVALID");
    }
    const key = `${manifest.name}@${manifest.version}`;
    const proofs = byKey.get(key) ?? [];
    proofs.push(proof);
    byKey.set(key, proofs);
  }
  const rows = Object.keys(lock.packages).sort().map(key => {
    const proofs = byKey.get(key) ?? [];
    const variants = new Set(proofs.map(proof => JSON.stringify(proof.documents)));
    const proof = proofs[0];
    const issues = [...new Set(proofs.flatMap(item => item.issueCategories))].sort();
    const consistent = proofs.length > 0 && variants.size === 1 && issues.length === 0;
    return { ...identity(key), state: proofs.length === 0 ? "document-proof-unavailable" : consistent ? "root-document-inventory-available" : "document-review-required",
      licenseFilePresent: consistent && proof.documents.some(item => item.kind === "license"),
      noticeFilePresent: consistent && proof.documents.some(item => item.kind === "notice"),
      documentHashes: consistent ? proof.documents : [], issueCategories: issues };
  });
  return { scope: "root-level regular license/notice files only", lockedIdentities: metadata.lockPackageIdentities,
    packageRootsInspected: rows.filter(row => row.state !== "document-proof-unavailable").length,
    packagesWithLicenseFile: rows.filter(row => row.licenseFilePresent).length,
    packagesWithNoticeFile: rows.filter(row => row.noticeFilePresent).length,
    packagesWithoutVerifiedLicenseFile: rows.filter(row => !row.licenseFilePresent).length,
    incompleteOrConflictingRoots: rows.filter(row => row.state !== "root-document-inventory-available").length,
    declaredLicenseTextValidated: false, distributedNoticesComplete: false, legalReviewComplete: false,
    // Absence of NOTICE is not by itself an unmet legal obligation.
    noticeAbsenceTreatedAsLegalViolation: false, readyForPublication: false,
    directRuntime: rows.filter(row => metadata.directRuntime.some(item => item.name === row.name && item.version === row.version)),
    manualDocumentReview: rows.filter(row => !row.licenseFilePresent).map(({ name, version, state, issueCategories }) => ({ name, version, state, issueCategories })) };
}

export function readLocalDependencyLock(root = process.cwd()) {
  const physicalRoot = realpathSync(root);
  const store = realpathSync(join(root, "node_modules", ".pnpm"));
  const storeOffset = relative(physicalRoot, store);
  if (!storeOffset || storeOffset === ".." || isAbsolute(storeOffset) || storeOffset.startsWith(`..${sep}`)) throw new Error("LOCAL_STORE_SCOPE_INVALID");
  const lockPath = join(root, "pnpm-lock.yaml");
  const lockText = boundedRegularFile(lockPath, physicalRoot);
  // Reuse the locally installed, pinned YAML reader. No package installation or CLI is needed.
  const parserPath = join(store, "node_modules", "js-yaml", "package.json");
  const parserMetadata = JSON.parse(boundedRegularFile(parserPath, store));
  if (parserMetadata.name !== "js-yaml" || parserMetadata.version !== "4.3.2" || parserMetadata.license !== "MIT") throw new Error("LOCAL_LOCK_READER_UNREVIEWED");
  const require = createRequire(pathToFileURL(parserPath));
  const yaml = require("js-yaml");
  const lock = yaml.load(lockText, { schema: yaml.JSON_SCHEMA });
  if (!object(lock) || !["9.0", 9].includes(lock.lockfileVersion) || !object(lock.packages) || !object(lock.importers)) {
    throw new Error("LOCK_METADATA_INVALID");
  }
  return { lock, lockText, lockfileSha256: createHash("sha256").update(lockText).digest("hex") };
}

export function collectDependencyLicenseInventory(root = process.cwd()) {
  const physicalRoot = realpathSync(root);
  const store = realpathSync(join(root, "node_modules", ".pnpm"));
  const lockPath = join(root, "pnpm-lock.yaml");
  const { lock, lockText, lockfileSha256 } = readLocalDependencyLock(root);
  const manifests = [];
  const entries = readdirSync(store, { withFileTypes: true });
  if (entries.length > 1000) throw new Error("LOCAL_STORE_LIMIT_EXCEEDED");
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === "node_modules") continue;
    const packageRoot = join(store, entry.name, "node_modules");
    for (const candidate of readdirSync(packageRoot, { withFileTypes: true })) {
      if (!candidate.isDirectory() || candidate.isSymbolicLink() || candidate.name === ".bin") continue;
      const parents = candidate.name.startsWith("@")
        ? readdirSync(join(packageRoot, candidate.name), { withFileTypes: true }).filter(child => child.isDirectory() && !child.isSymbolicLink()).map(child => join(packageRoot, candidate.name, child.name))
        : [join(packageRoot, candidate.name)];
      for (const directory of parents) {
        const manifest = JSON.parse(boundedRegularFile(join(directory, "package.json"), store));
        manifests.push({ name: manifest.name, version: manifest.version, license: manifest.license,
          licenseDocumentProof: inspectInstalledLicenseDocuments(directory, store) });
        if (manifests.length > 4000) throw new Error("LOCAL_STORE_LIMIT_EXCEEDED");
      }
    }
  }
  const result = evaluateDependencyLicenseInventory(lock, manifests);
  if (boundedRegularFile(lockPath, physicalRoot) !== lockText) throw new Error("LOCK_CHANGED_DURING_INVENTORY");
  return { ...result, documentInventory: evaluateLicenseDocumentInventory(lock, manifests),
    lockfileSha256, localYamlReaderVersion: "4.3.2" };
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    if (process.argv.length !== 2) throw new Error("INVENTORY_ARGUMENTS_INVALID");
    console.log(JSON.stringify(collectDependencyLicenseInventory(), null, 2));
  } catch {
    console.error(JSON.stringify({ mode: "local-lock-aligned-license-metadata-inventory", error: "LICENSE_INVENTORY_INCOMPLETE", readyForPublication: false }));
    process.exitCode = 1;
  }
}

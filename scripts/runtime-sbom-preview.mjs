import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";

const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const LICENSES = new Set(["0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0", "ISC", "MIT"]);
const PREVIEWS = new WeakMap();
const SOURCES = new WeakMap();
const SCHEMA_BYTES = new WeakMap();
const ROOT_REF = "gmai:declared-runtime";
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = () => { throw new Error("RUNTIME_SBOM_PREVIEW_INCOMPLETE"); };
const identity = row => `${row.name}@${row.version}`;
const reference = row => `npm:${identity(row)}`;
const plainVersion = value => typeof value === "string" ? value.split("(")[0] : null;
function validIdentity(row) {
  return object(row) && typeof row.name === "string" && row.name.length <= 200 && NAME.test(row.name) &&
    typeof row.version === "string" && row.version.length <= 80 && VERSION.test(row.version);
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function normalizeGraph(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200) fail();
  const normalized = rows.map(row => {
    if (!validIdentity(row) || !LICENSES.has(row.license) || !Array.isArray(row.dependencies) || row.dependencies.length > 200 ||
        row.dependencies.some(child => !validIdentity(child))) fail();
    const dependencies = row.dependencies.map(child => ({ name: child.name, version: child.version }))
      .sort((a, b) => identity(a).localeCompare(identity(b)));
    if (new Set(dependencies.map(identity)).size !== dependencies.length) fail();
    // No raw manifests, contacts, repository URLs, local paths or notices enter the BOM.
    return { name: row.name, version: row.version, license: row.license, dependencies };
  }).sort((a, b) => identity(a).localeCompare(identity(b)));
  if (new Set(normalized.map(identity)).size !== normalized.length) fail();
  return normalized;
}
export function runtimeSbomPreviewPlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, networkCalls: 0, filesWritten: 0, installedGraphReads: 0,
    historicalSbomRead: false, historicalSbomModified: false, uploaded: false, readyForPublication: false };
}
/** Whole manifest bytes, not a dependency-only projection. No contents leave
 * memory. Framing prevents different input partitions sharing a fingerprint. */
export function runtimeSbomSourceFingerprint(lockfileSha256, manifests) {
  if (!/^[a-f0-9]{64}$/.test(lockfileSha256 ?? "") || !object(manifests) ||
      Object.keys(manifests).sort().join(",") !== ".,frontend") fail();
  const digest = createHash("sha256");
  for (const [label, text] of [["lock", lockfileSha256], ...[".", "frontend"].map(key => [key, manifests[key]])]) {
    if (typeof text !== "string" || Buffer.byteLength(text) < 1 || Buffer.byteLength(text) > 100_000) fail();
    digest.update(`${label.length}:${label}:${Buffer.byteLength(text)}:`); digest.update(text);
  }
  return digest.digest("hex");
}
function readRuntimeSource(root) {
  const base = resolve(root);
  if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink() || realpathSync(base) !== base) fail();
  const proof = readLocalDependencyLock(base), manifests = {}, parsed = {};
  for (const importer of [".", "frontend"]) {
    const directory = join(base, importer), path = join(directory, "package.json");
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) fail();
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size < 1 || stat.size > 100_000) fail();
    const bytes = readFileSync(path);
    if (bytes.length !== stat.size || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) fail();
    // Retain a BOM in the decoded text: strict JSON parsing rejects it rather
    // than hiding three changed bytes from the whole-manifest fingerprint.
    manifests[importer] = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    parsed[importer] = JSON.parse(manifests[importer]);
    const manifest = parsed[importer], pinned = proof.lock.importers[importer]?.dependencies;
    if (!object(manifest) || !object(manifest.dependencies) || !object(pinned) ||
        Object.keys(manifest.dependencies).sort().join(",") !== Object.keys(pinned).sort().join(",") ||
        Object.entries(manifest.dependencies).some(([name, value]) => value !== pinned[name]?.specifier)) fail();
    if (importer === "." && (manifest.name !== "global-market-ai-insight" || manifest.version !== "0.1.0")) fail();
  }
  return { base, proof, fingerprint: runtimeSbomSourceFingerprint(proof.lockfileSha256, manifests) };
}
/** A declared runtime dependency superset, NOT an image or complete legal SBOM. */
export function buildRuntimeSbomPreview(proof, graphs) {
  const lock = proof?.lock;
  if (!/^[a-f0-9]{64}$/.test(proof?.lockfileSha256 ?? "") || !object(lock) || !["9.0", 9].includes(lock.lockfileVersion) ||
      !object(lock.packages) || !object(lock.importers) || !object(lock.snapshots) || !object(graphs) ||
      Object.keys(graphs).sort().join(",") !== ".,frontend") fail();
  const packages = new Map(), roots = new Set();
  for (const importer of [".", "frontend"]) {
    const rows = normalizeGraph(graphs[importer]), known = new Map(rows.map(row => [identity(row), row]));
    const declared = lock.importers[importer]?.dependencies;
    if (!object(declared) || Object.keys(declared).length < 1 || Object.keys(declared).length > 30) fail();
    const localRoots = Object.entries(declared).map(([name, pin]) => {
      const version = plainVersion(pin?.version), row = known.get(`${name}@${version}`);
      if (!row || pin?.specifier !== version) fail();
      roots.add(reference(row)); return identity(row);
    });
    for (const row of rows) {
      const key = identity(row), resolution = lock.packages[key]?.resolution;
      if (!object(resolution) || Object.keys(resolution).join(",") !== "integrity" ||
          !/^sha512-[A-Za-z0-9+/]{86}==$/.test(resolution.integrity ?? "") ||
          row.dependencies.some(child => !known.has(identity(child)))) fail();
      const snapshots = Object.entries(lock.snapshots).filter(([name]) => plainVersion(name) === key);
      const peers = lock.packages[key].peerDependencies ?? {};
      if (!object(peers)) fail();
      const matches = snapshots.filter(([, snapshot]) => object(snapshot) && object(snapshot.dependencies ?? {}) &&
        Object.keys(snapshot.dependencies ?? {}).length <= 200 &&
        row.dependencies.every(child => plainVersion(snapshot.dependencies?.[child.name]) === child.version) &&
        Object.entries(snapshot.dependencies ?? {}).every(([name, version]) => {
          const child = row.dependencies.find(child => child.name === name);
          return child ? plainVersion(version) === child.version : Object.hasOwn(peers, name) && known.has(`${name}@${plainVersion(version)}`);
        })).map(([, snapshot]) => Object.entries(snapshot.dependencies ?? {}).map(([name, version]) => ({ name, version: plainVersion(version) }))
          .sort((a, b) => identity(a).localeCompare(identity(b))));
      // A peer must be declared AND already present at the exact resolved lock
      // identity. Conflicting peer snapshots or absent packages remain blocked.
      if (!matches.length || new Set(matches.map(value => JSON.stringify(value))).size !== 1) fail();
      row.dependencies = matches[0];
      if (packages.has(key) && JSON.stringify(packages.get(key)) !== JSON.stringify(row)) fail();
      packages.set(key, row);
    }
    const reached = new Set();
    const visit = key => { if (reached.has(key)) return; reached.add(key); known.get(key).dependencies.forEach(child => visit(identity(child))); };
    localRoots.forEach(visit);
    if (reached.size !== rows.length) fail();
  }
  const rows = [...packages.values()].sort((a, b) => identity(a).localeCompare(identity(b)));
  const bom = {
    bomFormat: "CycloneDX", specVersion: "1.6", version: 1,
    metadata: { component: { type: "application", "bom-ref": ROOT_REF, name: "global-market-ai-insight", version: "0.1.0" } },
    components: rows.map(row => ({ type: "library", "bom-ref": reference(row), name: row.name, version: row.version,
      licenses: [{ license: { id: row.license } }] })),
    dependencies: [{ ref: ROOT_REF, dependsOn: [...roots].sort() }, ...rows.map(row => ({ ref: reference(row), dependsOn: row.dependencies.map(reference).sort() }))],
  };
  const bytes = JSON.stringify(bom, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 500_000) fail();
  const preview = freeze({ bom, report: { mode: "local-runtime-sbom-review-preview", awsCalls: 0, networkCalls: 0,
    lockfileSha256: proof.lockfileSha256, backendPackages: graphs["."].length, frontendPackages: graphs.frontend.length,
    components: rows.length, dependencyEdges: bom.dependencies.reduce((total, row) => total + row.dependsOn.length, 0),
    artifactSha256: hash(bytes), artifactBytes: Buffer.byteLength(bytes), filesWritten: 0,
    historicalSbomRead: false, historicalSbomModified: false, contactsOrPrivatePathsIncluded: false,
    runtimeManifestsStable: false, runtimeSourceMetadataSha256: null,
    declaredRuntimeSupersetOnly: true, exactEmittedModulesVerified: false, imageOrOsCoverageVerified: false,
    resolvedDeclaredPeerEdgesIncluded: true, optionalOrUninstalledGraphCoverageVerified: false,
    developmentGraphIncluded: false, licenseDeclarationsOnly: true, licenseDocumentsIncluded: false,
    fullCycloneDxSchemaValidated: false, licenseObligationsVerified: false, uploaded: false, readyForPublication: false } });
  PREVIEWS.set(preview, bytes);
  return preview;
}
export async function collectRuntimeSbomPreview(root = process.cwd()) {
  const before = readRuntimeSource(root), { proof } = before, graphs = {};
  for (const importer of [".", "frontend"]) {
    graphs[importer] = await collectProductionPackageGraph(root, importer);
  }
  const draft = buildRuntimeSbomPreview(proof, graphs);
  for (const importer of [".", "frontend"]) if (JSON.stringify(normalizeGraph(await collectProductionPackageGraph(root, importer))) !==
    JSON.stringify(normalizeGraph(graphs[importer]))) fail();
  const after = readRuntimeSource(root);
  if (after.base !== before.base || after.fingerprint !== before.fingerprint) fail();
  const preview = freeze({ bom: draft.bom, report: { ...draft.report,
    runtimeManifestsStable: true, runtimeSourceMetadataSha256: before.fingerprint } });
  PREVIEWS.set(preview, PREVIEWS.get(draft)); SOURCES.set(preview, before);
  return preview;
}
/** Only an immutable producer-branded preview may enter ignored owned outputs. */
export function writeRuntimeSbomPreview(root, preview) {
  const bytes = PREVIEWS.get(preview);
  if (typeof bytes !== "string" || hash(bytes) !== preview.report.artifactSha256) fail();
  const base = resolve(root);
  const source = SOURCES.get(preview);
  if (source && (base !== source.base || readRuntimeSource(base).fingerprint !== source.fingerprint)) fail();
  if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink() || realpathSync(base) !== base ||
      !/^outputs\/$/m.test(readFileSync(join(base, ".gitignore"), "utf8"))) fail();
  let directory = base;
  for (const name of ["outputs", "sbom-previews"]) {
    directory = join(directory, name);
    if (!existsSync(directory)) mkdirSync(directory);
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) fail();
  }
  const previewId = randomUUID(), path = join(directory, `${previewId}.cdx.json`);
  writeFileSync(path, bytes, { flag: "wx" });
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path || readFileSync(path, "utf8") !== bytes) fail();
  return { ...preview.report, filesWritten: 1, previewId, outputIndependentlyRead: true };
}

const SCHEMAS = Object.freeze([
  Object.freeze({ file: "bom-1.6.schema.json", id: "http://cyclonedx.org/schema/bom-1.6.schema.json", maximum: 500_000 }),
  Object.freeze({ file: "spdx.schema.json", id: "http://cyclonedx.org/schema/spdx.schema.json", maximum: 100_000 }),
  Object.freeze({ file: "jsf-0.82.schema.json", id: "http://cyclonedx.org/schema/jsf-0.82.schema.json", maximum: 100_000 }),
]);
// Actual publisher bytes checked 2026-10-14. The mutable URL is a transport,
// never permission to trust a changed schema. Updating these pins is a review.
export const REVIEWED_RUNTIME_SCHEMA_DIGESTS = freeze([
  { file: "bom-1.6.schema.json", bytes: 262666, sha256: "18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d" },
  { file: "spdx.schema.json", bytes: 63418, sha256: "4b345e2329f209f34e960ae2a8e7cb46a166907e6a45e94978565925dc47b359" },
  { file: "jsf-0.82.schema.json", bytes: 8058, sha256: "8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae" },
]);
export function reviewedRuntimeSchemaDigestsMatch(records) {
  return Array.isArray(records) && records.length === REVIEWED_RUNTIME_SCHEMA_DIGESTS.length &&
    records.every((row, index) => object(row) && Object.keys(row).sort().join(",") === "bytes,file,sha256" &&
      Object.entries(REVIEWED_RUNTIME_SCHEMA_DIGESTS[index]).every(([key, value]) => row[key] === value));
}
function pinnedSchemaBytes(assets) {
  return assets.every(asset => SCHEMA_BYTES.has(asset)) && reviewedRuntimeSchemaDigestsMatch(assets.map(asset => SCHEMA_BYTES.get(asset)));
}
export function runtimeSbomSchemaPlan(args = []) {
  if (args.length) fail();
  return { ...runtimeSbomPreviewPlan(), operation: "fixed-public-schema-structural-review", publicSchemaReadsMax: 3,
    downloadBytesMax: 700_000, deadlineMs: 60_000, formatAssertionsEnabled: false, fullSchemaValidationClaimed: false,
    reviewedSchemaContentPinRequired: true, schemaPinReviewDate: "2026-10-14", publisherSignatureClaimed: false,
    generatedSubsetRejectsFormatFields: true, generalFormatConformanceClaimed: false,
    packagesInstalled: 0, schemaFilesWritten: 0, readyForPublication: false };
}
function validateSchemaAsset(asset, expected) {
  if (!object(asset) || asset.file !== expected.file || !object(asset.schema) || asset.schema.$id !== expected.id ||
      asset.schema.$schema !== "http://json-schema.org/draft-07/schema#" || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? "") ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > expected.maximum) fail();
  const pending = [{ value: asset.schema, depth: 0 }]; let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop();
    if (++count > 50_000 || depth > 80) fail();
    if (value && typeof value === "object") {
      if (typeof value.$ref === "string" && !value.$ref.startsWith("#") &&
          !["spdx.schema.json", "jsf-0.82.schema.json#/definitions/signature"].includes(value.$ref)) fail();
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
    }
  }
}
/** Synchronous supplied-schema structure check; no automatic external resolver. */
export function validateRuntimeSbomStructure(preview, assets, Ajv) {
  if (!PREVIEWS.has(preview) || !Array.isArray(assets) || assets.length !== 3 || typeof Ajv !== "function") fail();
  assets.forEach((asset, i) => validateSchemaAsset(asset, SCHEMAS[i]));
  try {
    // Draft-07 formats are not asserted by this scoped structural check. Keep
    // this limitation explicit rather than calling it complete CDX validation.
    const validator = new Ajv({ allErrors: false, logger: false, format: false, validateSchema: true });
    validator.addSchema(assets[1].schema); validator.addSchema(assets[2].schema);
    const validate = validator.compile(assets[0].schema);
    if (validate(preview.bom) !== true) fail();
  } catch { fail(); }
  return { structuralSchemaValid: true, formatAssertionsEnabled: false, fullSchemaValidationClaimed: false,
    reviewedSchemaBytesMatched: pinnedSchemaBytes(assets), schemaPublisherSignatureVerified: false,
    externalSchemaReferencesPreloaded: true, autoExternalResolverUsed: false,
    artifactSha256: preview.report.artifactSha256,
    schemaSources: assets.map(({ file, sha256, bytes }) => ({ file, sha256, bytes })),
    publisherSignatureVerified: false, licenseObligationsVerified: false, readyForPublication: false };
}
/** The generated privacy subset has no timestamps, contacts or URI fields.
 * Reject ANY encountered format value rather than silently skipping format or
 * pretending to implement complete IRI/IDN/RFC semantics with a loose regex.
 * This is deliberately stricter than the standard, not a generic CDX validator. */
export function validateRuntimeSbomRestrictedFormats(preview, assets, Ajv) {
  if (!PREVIEWS.has(preview) || !Array.isArray(assets) || assets.length !== 3 || typeof Ajv !== "function") fail();
  assets.forEach((asset, i) => validateSchemaAsset(asset, SCHEMAS[i]));
  const formats = new Set(["date-time", "idn-email", "iri-reference", "uri"]);
  for (const asset of assets) {
    const pending = [asset.schema];
    while (pending.length) {
      const node = pending.pop();
      if (node && typeof node === "object") {
        // A properties/definitions dictionary may itself have a property
        // named "format" whose value is a schema, not a format keyword.
        // Non-string keyword values still fail the real meta-schema check.
        if (typeof node.format === "string" && !formats.has(node.format)) fail();
        pending.push(...Object.values(node));
      }
    }
  }
  let encountered = 0;
  try {
    const validator = new Ajv({ allErrors: false, logger: false, format: "full", validateSchema: true });
    // Validate publisher schemas using normal meta-schema URI rules BEFORE
    // replacing runtime-data format handlers with the reject-only subset.
    for (const asset of assets) validator.addSchema(asset.schema);
    for (const name of formats) validator.addFormat(name, () => { encountered++; return false; });
    const validate = validator.getSchema(SCHEMAS[0].id);
    if (typeof validate !== "function" || validate(preview.bom) !== true || encountered !== 0) fail();
  } catch { fail(); }
  return { generatedSubsetSchemaValid: true, formatAssertionsEnabled: true,
    encounteredFormatValues: 0, formatValuesRejectedByDesign: true, generalFormatConformanceClaimed: false,
    fullSchemaValidationClaimed: false, reviewedSchemaBytesMatched: pinnedSchemaBytes(assets),
    autoExternalResolverUsed: false, artifactSha256: preview.report.artifactSha256,
    publisherSignatureVerified: false, licenseObligationsVerified: false, readyForPublication: false };
}
export async function fetchRuntimeSbomSchemaAssets(fetcher = fetch) {
  const started = Date.now(), assets = [];
  for (const expected of SCHEMAS) {
    if (Date.now() - started >= 60_000) fail();
    const url = `https://raw.githubusercontent.com/CycloneDX/specification/master/schema/${expected.file}`;
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(Math.min(20_000, 60_000 - (Date.now() - started))),
      headers: { Accept: "application/json" } });
    const reject = async () => { try { await response.body?.cancel(); } catch { /* No raw transport failure escapes. */ } fail(); };
    if (response.status !== 200 || response.url !== url || !response.body) await reject();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > expected.maximum)) await reject();
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > expected.maximum || Date.now() - started >= 60_000) fail();
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks), asset = { file: expected.file, bytes: bytes.length, sha256: hash(bytes),
      schema: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
    validateSchemaAsset(asset, expected); freeze(asset);
    SCHEMA_BYTES.set(asset, freeze({ file: asset.file, bytes: asset.bytes, sha256: asset.sha256 })); assets.push(asset);
  }
  return assets;
}
/** Producer-branded actual downloaded bytes only. Caller-supplied hashes,
 * cloned objects or valid-but-changed schemas cannot satisfy these pins. */
export async function fetchReviewedRuntimeSbomSchemaAssets(fetcher = fetch) {
  const assets = await fetchRuntimeSbomSchemaAssets(fetcher);
  if (!pinnedSchemaBytes(assets)) fail();
  return Object.freeze(assets);
}
export async function executeRuntimeSbomSchemaPreview(root = process.cwd()) {
  const preview = await collectRuntimeSbomPreview(root), proof = readLocalDependencyLock(root);
  if (proof.lockfileSha256 !== preview.report.lockfileSha256) fail();
  const store = realpathSync(join(root, "node_modules", ".pnpm"));
  const path = realpathSync(join(store, "node_modules", "ajv", "package.json")), stat = lstatSync(path);
  if (!path.startsWith(store + (process.platform === "win32" ? "\\" : "/")) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 100_000) fail();
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  if (metadata.name !== "ajv" || metadata.version !== "6.15.0" || metadata.license !== "MIT" ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(proof.lock.packages["ajv@6.15.0"]?.resolution?.integrity ?? "")) fail();
  const assets = await fetchReviewedRuntimeSbomSchemaAssets(), Ajv = createRequire(path)("ajv");
  const schemaValidation = validateRuntimeSbomStructure(preview, assets, Ajv);
  const restrictedFormatValidation = validateRuntimeSbomRestrictedFormats(preview, assets, Ajv);
  const current = await collectRuntimeSbomPreview(root);
  if (current.report.lockfileSha256 !== proof.lockfileSha256 ||
      current.report.runtimeSourceMetadataSha256 !== preview.report.runtimeSourceMetadataSha256 ||
      current.report.artifactSha256 !== preview.report.artifactSha256 || schemaValidation.reviewedSchemaBytesMatched !== true ||
      restrictedFormatValidation.reviewedSchemaBytesMatched !== true) fail();
  return { ...writeRuntimeSbomPreview(root, preview), networkCalls: 3, publicSchemaReads: 3, schemaFilesWritten: 0,
    packagesInstalled: 0, validator: { name: "ajv", version: "6.15.0", locallyInstalled: true }, schemaValidation, restrictedFormatValidation };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(runtimeSbomPreviewPlan()));
    else if (args.length === 1 && args[0] === "--plan-public-schema") console.log(JSON.stringify(runtimeSbomSchemaPlan()));
    else if (args.length === 1 && args[0] === "--execute-public-schema-preview") console.log(JSON.stringify(await executeRuntimeSbomSchemaPreview()));
    else {
      if (args.length !== 1 || !["--check-local", "--execute-local-preview"].includes(args[0])) fail();
      const preview = await collectRuntimeSbomPreview();
      console.log(JSON.stringify(args[0] === "--check-local" ? preview.report : writeRuntimeSbomPreview(process.cwd(), preview)));
    }
  } catch { console.error(JSON.stringify({ error: "RUNTIME_SBOM_PREVIEW_INCOMPLETE", rawDetailsSuppressed: true,
    uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}

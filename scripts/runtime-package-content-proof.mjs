import { createHash } from "node:crypto";
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { collectRuntimeSbomPreview } from "./runtime-sbom-preview.mjs";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { inspectPinnedPackageArchive } from "./pinned-package-archive.mjs";

// Lint-only Zod refresh; all reviewed runtime identities/integrities are unchanged.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
const REVIEWED_LOCK = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
const REVIEWED_BOM = "b222ba76dfe7af7eca19529836f47417b249685e044db48263fcb20e4991aec2";
const fail = () => { throw new Error("RUNTIME_PACKAGE_CONTENT_PROOF_INCOMPLETE"); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const id = row => `${row.name}@${row.version}`;
const inside = (base, path) => { const r = relative(base, path); return !!r && !isAbsolute(r) && r !== ".." && !r.startsWith(`..${sep}`); };
const statIdentity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
const SNAPSHOTS = new WeakMap();

export function runtimePackageContentPlan(args = []) {
  if (args.length) fail();
  return { mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0, requestedArchiveReadsMax: 37,
    filesWritten: 0, packagesInstalled: 0, subprocessesStarted: 0, uploaded: false,
    registrySignatureVerificationPerformed: false, legalApproval: false, readyForPublication: false };
}

/** Windows-safe observed publisher path subset. Never extract or resolve a
 * remote absolute/drive/device/ADS/traversal/ambiguous case alias. */
export function validateRuntimeArchiveFileRecords(records) {
  if (!Array.isArray(records) || !records.length || records.length > 5000) fail();
  const names = new Set(); let bytes = 0;
  for (const row of records) {
    if (!row || Object.keys(row).sort().join(",") !== "bytes,path,sha256" || typeof row.path !== "string" ||
        row.path.length > 4096 || !/^[A-Za-z0-9._@+/-]+$/.test(row.path) || row.path.startsWith("/") ||
        row.path.split("/").some(part => !part || [".", ".."].includes(part) || part.endsWith(".") ||
          /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) ||
        names.has(row.path.toLowerCase()) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > 5_000_000 ||
        !/^[a-f0-9]{64}$/.test(row.sha256 ?? "")) fail();
    names.add(row.path.toLowerCase()); bytes += row.bytes;
  }
  if (bytes > 30_000_000 || !records.some(row => row.path === "package.json")) fail();
  return { files: records.length, bytes };
}

function inventory(directory) {
  const base = resolve(directory);
  if (!lstatSync(base).isDirectory() || lstatSync(base).isSymbolicLink() || realpathSync(base) !== base) fail();
  const files = new Map(); let entries = 0;
  function walk(path, depth) {
    if (depth > 40) fail();
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (++entries > 20000) fail();
      const file = join(path, item.name), stat = lstatSync(file, { bigint: true });
      if (stat.isSymbolicLink() || realpathSync(file) !== file || !inside(base, file)) fail();
      if (stat.isDirectory()) walk(file, depth + 1);
      else if (stat.isFile()) {
        const name = relative(base, file).split(sep).join("/");
        files.set(name, { size: Number(stat.size), identity: statIdentity(stat) });
      } else fail();
    }
  }
  walk(base, 0);
  if (files.size < 1 || files.size > 5000) fail();
  return files;
}

export function captureRuntimeInstallationSnapshot(directory) {
  const base = resolve(directory), files = inventory(base);
  const report = Object.freeze({ filesObserved: files.size, rawPathsOrFileIdsIncluded: false });
  SNAPSHOTS.set(report, { base, files }); return report;
}
export function verifyRuntimeInstallationSnapshot(directory, report) {
  const before = SNAPSHOTS.get(report);
  if (!before || resolve(directory) !== before.base) fail();
  const after = inventory(before.base);
  if (after.size !== before.files.size || [...before.files].some(([name, stat]) => JSON.stringify(after.get(name)) !== JSON.stringify(stat))) fail();
  return { metadataStable: true, filesObserved: after.size };
}

/** Read only exact publisher files AFTER complete local name-set equality.
 * Extra private files are not opened; no package code is imported/executed. */
export function compareInstalledRuntimePackage(directory, records) {
  const base = resolve(directory), totals = validateRuntimeArchiveFileRecords(records), before = inventory(base);
  if (before.size !== records.length || records.some(row => !before.has(row.path))) fail();
  for (const row of records) {
    if (before.get(row.path).size !== row.bytes) fail();
    const file = join(base, ...row.path.split("/")), stat = lstatSync(file, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(file) !== file || statIdentity(stat) !== before.get(row.path).identity) fail();
    const handle = openSync(file, "r");
    try {
      if (statIdentity(fstatSync(handle, { bigint: true })) !== before.get(row.path).identity) fail();
      const bytes = readFileSync(handle);
      if (bytes.length !== row.bytes || hash(bytes) !== row.sha256 ||
          statIdentity(fstatSync(handle, { bigint: true })) !== before.get(row.path).identity) fail();
    } finally { closeSync(handle); }
  }
  const after = inventory(base);
  if (after.size !== before.size || [...before].some(([name, stat]) => JSON.stringify(after.get(name)) !== JSON.stringify(stat))) fail();
  return { filesMatched: totals.files, bytesMatched: totals.bytes, exactLocalFileSetMatched: true,
    linksFollowed: false, packagesModified: false, packageCodeExecuted: false };
}

async function source(root) {
  const lock = readLocalDependencyLock(root);
  if (lock.lockfileSha256 !== REVIEWED_LOCK) fail();
  const preview = await collectRuntimeSbomPreview(root);
  if (preview.report.artifactSha256 !== REVIEWED_BOM || preview.report.components !== 37 || !preview.report.runtimeManifestsStable) fail();
  const graphs = [...await collectProductionPackageGraph(root), ...await collectProductionPackageGraph(root, "frontend")];
  const targets = preview.bom.components.map(component => {
    const rows = graphs.filter(row => id(row) === id(component));
    if (rows.length !== 1) fail();
    const row = rows[0], directory = realpathSync(row.directory), base = realpathSync(join(root, "node_modules/.pnpm"));
    if (!inside(base, directory)) fail();
    return { name: component.name, version: component.version, license: component.licenses[0].license.id,
      integrity: lock.lock.packages[id(component)].resolution.integrity, directory };
  });
  return { targets, fingerprint: preview.report.runtimeSourceMetadataSha256 };
}

async function archiveBytes(target, fetcher, signal, budget) {
  const url = `https://registry.npmjs.org/${target.name}/-/${target.name.split("/").at(-1)}-${target.version}.tgz`;
  const response = await fetcher(url, { redirect: "error", signal, credentials: "omit", referrerPolicy: "no-referrer",
    headers: { Accept: "application/octet-stream" } });
  const reader = response.body?.getReader();
  try {
    const declared = response.headers.get("content-length");
    if (response.status !== 200 || !reader || response.url && response.url !== url ||
        declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 5_000_000)) fail();
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; budget.compressed += value.byteLength;
      if (size > 5_000_000 || budget.compressed > 50_000_000) fail(); chunks.push(Buffer.from(value));
    }
    if (!size) fail(); return Buffer.concat(chunks);
  } finally { await reader?.cancel(); }
}

export async function collectRuntimePackageContentProof(root = process.cwd(), fetcher = fetch) {
  const before = await source(root), start = performance.now(), signal = AbortSignal.timeout(120000);
  let snapshots;
  const budget = { compressed: 0, expanded: 0, files: 0 }; let requests = 0; const results = [];
  for (const target of before.targets) {
    if (++requests > 37 || performance.now() - start >= 120000) fail();
    const compressed = await archiveBytes(target, fetcher, AbortSignal.any([signal, AbortSignal.timeout(20000)]), budget);
    const parsed = inspectPinnedPackageArchive(target, compressed, target.integrity, "reviewed-runtime");
    budget.expanded += parsed.expandedBytes; budget.files += parsed.filesInspected;
    if (budget.expanded > 100_000_000 || budget.files > 25000) fail();
    // Bracket all installed comparisons, but reject invalid public responses
    // before walking the whole installation or reading any package code byte.
    snapshots ??= before.targets.map(row => captureRuntimeInstallationSnapshot(row.directory));
    const matched = compareInstalledRuntimePackage(target.directory, parsed.regularFiles);
    results.push({ name: target.name, version: target.version, tarballSha256: parsed.tarballSha256,
      lockedIntegrityMatched: true, ...matched });
  }
  const after = await source(root);
  if (before.fingerprint !== after.fingerprint || JSON.stringify(before.targets) !== JSON.stringify(after.targets) ||
      performance.now() - start >= 120000) fail();
  after.targets.forEach((target, index) => verifyRuntimeInstallationSnapshot(target.directory, snapshots[index]));
  if (performance.now() - start >= 120000) fail();
  return { mode: "reviewed-runtime-package-content-proof", lockfileSha256: REVIEWED_LOCK, runtimeBomSha256: REVIEWED_BOM,
    sourceMetadataSha256: before.fingerprint, sourceUnchanged: true, publicRegistryRequests: requests, networkPhaseDeadlineMs: 120000,
    compressedBytes: budget.compressed, expandedBytes: budget.expanded, regularFilesMatched: budget.files,
    packagesMatched: results.length, installedRuntimeMetadataStable: true, immutableSnapshotClaimed: false,
    results, awsCalls: 0, filesWritten: 0, packagesInstalled: 0,
    archiveExtracted: false, packageCodeExecuted: false, uploaded: false, installedFilesRepaired: false,
    registrySignatureVerificationPerformed: false, publisherSourceOriginVerified: false,
    developmentOrImageGraphCovered: false, legalApproval: false, readyForPublication: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length) console.log(JSON.stringify(runtimePackageContentPlan()));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-archives") fail();
      console.log(JSON.stringify(await collectRuntimePackageContentProof()));
    }
  } catch { console.error(JSON.stringify({ error: "RUNTIME_PACKAGE_CONTENT_PROOF_INCOMPLETE", rawDetailsSuppressed: true,
    installedFilesRepaired: false, uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}

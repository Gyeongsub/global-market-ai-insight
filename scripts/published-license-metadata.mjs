import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectDependencyLicenseInventory, readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { ADVISORY_REVIEWED_LOCK_SHA256, buildLockedAdvisoryTargets } from "./registry-advisory-proof.mjs";

export const MISSING_PUBLIC_LICENSE_READ_LIMIT = 64;
const fail = () => { throw new Error("PUBLISHED_LICENSE_METADATA_INCOMPLETE"); };
const hash = value => createHash("sha256").update(value).digest("hex");
const identityKey = row => `${row.name}@${row.version}`;
const expression = value => typeof value === "string" && value.length > 0 && value.length <= 128 &&
  /^[A-Za-z0-9 .()+_-]+$/.test(value) && !["__proto__", "constructor", "prototype"].includes(value) ? value : null;

/** Never substitute publisher metadata for a conflicting installed declaration. */
export function selectMissingLicenseTargets(lock, inventory) {
  const locked = buildLockedAdvisoryTargets(lock).rows, keys = new Set(locked.map(identityKey));
  if (inventory?.mode !== "local-lock-aligned-license-metadata-inventory" || inventory?.awsCalls !== 0 || inventory?.networkCalls !== 0 ||
      inventory?.lockPackageIdentities !== locked.length || !Number.isInteger(inventory?.metadataAvailable) ||
      inventory.metadataAvailable < 0 || inventory.metadataAvailable > locked.length || !Array.isArray(inventory?.unresolved) ||
      inventory.unresolved.length !== locked.length - inventory.metadataAvailable || inventory.unresolved.length > MISSING_PUBLIC_LICENSE_READ_LIMIT ||
      inventory?.metadataMissingOrConflicting !== inventory.unresolved.length ||
      inventory?.lockMetadataComplete !== (inventory.metadataAvailable === locked.length) ||
      inventory?.readyForPublication !== false || !inventory?.licenseExpressionCounts ||
      Array.isArray(inventory.licenseExpressionCounts) ||
      Object.entries(inventory.licenseExpressionCounts).some(([license, count]) => !expression(license) || !Number.isInteger(count) || count < 1) ||
      Object.values(inventory.licenseExpressionCounts).reduce((total, count) => total + count, 0) !== inventory.metadataAvailable) fail();
  const seen = new Set();
  const targets = inventory.unresolved.map(row => {
    if (!row || typeof row.name !== "string" || typeof row.version !== "string") fail();
    const key = identityKey(row);
    if (!keys.has(key) || seen.has(key) || row.state !== "missing-installed-metadata") fail();
    seen.add(key);
    return { name: row.name, version: row.version, integrity: lock.packages[key].resolution.integrity };
  });
  return targets.sort((a, b) => identityKey(a).localeCompare(identityKey(b)));
}

/** Public declaration and lock integrity only, not an extracted archive/source license. */
export function verifyPublishedLicenseMetadata(target, metadata, rawBytes) {
  const name = target?.name, version = target?.version;
  if (typeof name !== "string" || name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) ||
      typeof version !== "string" || version.length > 48 || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(target.integrity ?? "") || !Buffer.isBuffer(rawBytes) ||
      rawBytes.length < 1 || rawBytes.length > 100_000 || metadata?.name !== name || metadata?.version !== version ||
      metadata?.dist?.integrity !== target.integrity || !expression(metadata.license) ||
      metadata?.dist?.tarball !== `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`) fail();
  // A caller cannot bind a sanitized object to different raw publisher bytes.
  const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
  if (decoded?.name !== metadata.name || decoded?.version !== metadata.version || decoded?.license !== metadata.license ||
      decoded?.dist?.integrity !== metadata.dist.integrity || decoded?.dist?.tarball !== metadata.dist.tarball) fail();
  return { name, version, licenseExpression: metadata.license, declaredIntegrityMatchesLock: true,
    publicMetadataBytes: rawBytes.length, publicMetadataSha256: hash(rawBytes),
    installedPackagePresent: false, archiveOrNoticeBytesVerified: false, legalApproval: false, readyForPublication: false };
}

function mergeSummary(inventory, targets, declarations) {
  if (declarations.length !== targets.length || new Set(declarations.map(identityKey)).size !== declarations.length ||
      declarations.some(row => !targets.some(target => identityKey(row) === identityKey(target)))) fail();
  const counts = Object.assign(Object.create(null), inventory.licenseExpressionCounts);
  if (Object.entries(counts).some(([license, count]) => !expression(license) || !Number.isInteger(count) || count < 1) ||
      Object.values(counts).reduce((total, value) => total + value, 0) !== inventory.metadataAvailable) fail();
  for (const row of declarations) counts[row.licenseExpression] = (counts[row.licenseExpression] ?? 0) + 1;
  return { localInstalledDeclarations: inventory.metadataAvailable, publishedMissingDeclarations: declarations.length,
    lockPackageIdentities: inventory.lockPackageIdentities, mixedSourceMetadataComplete: inventory.metadataAvailable + declarations.length === inventory.lockPackageIdentities,
    licenseExpressionCounts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    localInventoryUnknownsNotOverwritten: true, installedMetadataComplete: inventory.lockMetadataComplete,
    installedPackagesChanged: false, completeLegalProvenanceVerified: false, fullDevelopmentNoticeCoverageVerified: false,
    otherPlatformBinaryOrSourceInspected: false, readyForPublication: false };
}

/** No request-supplied target, private-registry fallback, tarball download or code execution. */
export async function collectPublishedMissingLicenseMetadata(root = process.cwd(), fetcher = fetch) {
  try {
    const { lock, lockfileSha256 } = readLocalDependencyLock(root);
    if (lockfileSha256 !== ADVISORY_REVIEWED_LOCK_SHA256) fail();
    const inventory = collectDependencyLicenseInventory(root);
    if (inventory.lockfileSha256 !== lockfileSha256) fail();
    const targets = selectMissingLicenseTargets(lock, inventory), declarations = [];
    const started = performance.now();
    for (const target of targets) {
      if (performance.now() - started >= 240_000) fail();
      const url = `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`;
      const response = await fetcher(url, { redirect: "error", credentials: "omit",
        signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(20_000, 240_000 - (performance.now() - started))))),
        headers: { Accept: "application/json" } });
      const declared = response.headers.get("content-length");
      if (response.status !== 200 || !response.body || (response.url && response.url !== url) ||
          (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 100_000))) {
        await response.body?.cancel(); fail();
      }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.byteLength; if (size > 100_000 || performance.now() - started >= 240_000) fail(); chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel(); }
      const bytes = Buffer.concat(chunks), metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      declarations.push(verifyPublishedLicenseMetadata(target, metadata, bytes));
    }
    if (readLocalDependencyLock(root).lockfileSha256 !== lockfileSha256) fail();
    return { mode: "missing-public-license-metadata-proof", awsCalls: 0, publicRegistryRequests: declarations.length,
      lockfileSha256, onlyReviewedPublicCoordinatesRequested: true, privateProjectMetadataSent: false,
      filesWritten: 0, packagesInstalled: 0, archiveDownloads: 0, downloadedPackageCodeExecuted: false, uploaded: false,
      ...mergeSummary(inventory, targets, declarations), declarations };
  } catch { fail(); }
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0,
      missingMetadataReadsMax: MISSING_PUBLIC_LICENSE_READ_LIMIT, changedLockRequiresCoordinateReview: true,
      installedLicenseConflictFallbackAllowed: false, packagesInstalled: 0, archiveDownloads: 0, uploaded: false, readyForPublication: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-metadata") fail();
      console.log(JSON.stringify(await collectPublishedMissingLicenseMetadata()));
    }
  } catch { console.error(JSON.stringify({ error: "PUBLISHED_LICENSE_METADATA_INCOMPLETE", declarationStatus: "unknown",
    rawDetailsSuppressed: true, uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}

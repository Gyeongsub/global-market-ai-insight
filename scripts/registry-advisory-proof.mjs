import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalDependencyLock } from "./dependency-license-inventory.mjs";
import { collectProductionPackageGraph } from "./check-production-licenses.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

// Publication review already inspected these public-registry-only coordinates.
// A changed lockfile must be reviewed BEFORE disclosing a new package list.
// 2026-10-24: only reviewed Zod 4.4.3 -> 4.6.6 lint dependency changed;
// 392 public identities, all shared integrities and production graph retained.
// 2026-11-01: minimatch local backport; public coordinate body and declared
// runtime BOM hashes are unchanged. This binding is not new network consent.
export const ADVISORY_REVIEWED_LOCK_SHA256 = "9739b078cbca97d4e7d4b40f4c2b81a88a946faa843ee546ac5a0cbf5c0cfba2";
export const ADVISORY_PUBLIC_ENDPOINT = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const severities = ["info", "low", "moderate", "high", "critical"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("REGISTRY_ADVISORY_PROOF_INCOMPLETE"); };
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
function inside(root, path) {
  const offset = relative(root, path);
  return offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`);
}

/** Pure fixture-testable validation; not a network request or arbitrary registry selector. */
export function buildLockedAdvisoryTargets(lock) {
  if (!object(lock) || ![9, "9.0"].includes(lock.lockfileVersion) || !object(lock.packages)) fail();
  const entries = Object.entries(lock.packages);
  if (!entries.length || entries.length > 1000) fail();
  const rows = [], payload = Object.create(null);
  for (const [key, item] of entries) {
    const split = key.lastIndexOf("@"), name = key.slice(0, split), version = key.slice(split + 1);
    if (split <= 0 || !packageName.test(name) || name.length > 214 || !exactVersion.test(version) || version.length > 48 ||
        !object(item?.resolution) || Object.keys(item.resolution).join(",") !== "integrity" ||
        !/^sha512-[A-Za-z0-9+/]{86}==$/.test(item.resolution.integrity ?? "")) fail();
    rows.push({ name, version }); (payload[name] ??= []).push(version);
  }
  rows.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  const ordered = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)).map(([name, versions]) =>
    [name, versions.sort()]));
  const body = JSON.stringify(ordered);
  if (Buffer.byteLength(body) > 100_000) fail();
  return { rows, payload: ordered, body, coordinatesSha256: hash(body) };
}

function localSemver(root) {
  const physical = realpathSync(root), store = realpathSync(join(physical, "node_modules", ".pnpm"));
  if (!inside(physical, store)) fail();
  const path = join(store, "node_modules", "semver", "package.json"), canonical = realpathSync(path), stat = lstatSync(path);
  if (!inside(store, canonical) || !stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 100_000) fail();
  const metadata = JSON.parse(readFileSync(path, "utf8"));
  if (metadata.name !== "semver" || metadata.version !== "6.3.1" || metadata.license !== "ISC") fail();
  const semver = createRequire(pathToFileURL(canonical))("semver");
  return { valid: version => semver.valid(version) === version, validRange: range => semver.validRange(range) !== null,
    satisfies: (version, range) => semver.satisfies(version, range, { includePrerelease: true }) };
}

/** No raw advisory title/body, private paths or package-tree metadata escape. */
export function evaluateRegistryAdvisories(targets, response, runtimeRows, semver) {
  if (!Array.isArray(targets?.rows) || targets.rows.length < 1 || targets.rows.length > 1000 || !object(targets.payload) ||
      !object(response) || Object.keys(response).length > targets.rows.length || !Array.isArray(runtimeRows) || runtimeRows.length > 200 ||
      typeof semver?.valid !== "function" || typeof semver?.validRange !== "function" || typeof semver?.satisfies !== "function") fail();
  const known = new Set();
  for (const row of targets.rows) {
    if (!packageName.test(row?.name ?? "") || !exactVersion.test(row?.version ?? "") || !semver.valid(row.version) ||
        !Array.isArray(targets.payload[row.name]) || !targets.payload[row.name].includes(row.version)) fail();
    const key = `${row.name}@${row.version}`; if (known.has(key)) fail(); known.add(key);
  }
  const grouped = Object.create(null);
  for (const row of targets.rows) (grouped[row.name] ??= []).push(row.version);
  if (Object.keys(targets.payload).sort().join("\n") !== Object.keys(grouped).sort().join("\n") ||
      Object.entries(grouped).some(([name, versions]) => !Array.isArray(targets.payload[name]) ||
        JSON.stringify([...versions].sort()) !== JSON.stringify([...targets.payload[name]].sort()))) fail();
  const runtime = new Set();
  for (const row of runtimeRows) {
    const key = `${row?.name}@${row?.version}`; if (!known.has(key)) fail(); runtime.add(key);
  }
  const counts = Object.fromEntries(severities.map(severity => [severity, 0]));
  const runtimeCounts = { ...counts }, affected = new Set(), runtimeAffected = new Set(), seen = new Set(), findings = [];
  let returnedAdvisories = 0;
  for (const [name, advisories] of Object.entries(response)) {
    if (!Object.hasOwn(targets.payload, name) || !Array.isArray(advisories) || advisories.length > 1000) fail();
    for (const advisory of advisories) {
      // The current bulk endpoint binds the package via the map key; some
      // registry records omit a duplicate name field. A supplied name must agree.
      if (!object(advisory) || (advisory.name !== undefined && advisory.name !== name) ||
          !Number.isSafeInteger(advisory.id) || advisory.id < 1 ||
          !severities.includes(advisory.severity) || typeof advisory.vulnerable_versions !== "string" ||
          advisory.vulnerable_versions.length < 1 || advisory.vulnerable_versions.length > 256 ||
          !/^[0-9A-Za-z*~^<>=|.+\- \t]+$/.test(advisory.vulnerable_versions) || !semver.validRange(advisory.vulnerable_versions) ||
          typeof advisory.url !== "string" || !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(advisory.url) ||
          seen.has(advisory.id) || returnedAdvisories >= 2000) fail();
      seen.add(advisory.id); returnedAdvisories++;
      const matches = targets.rows.filter(row => row.name === name && semver.satisfies(row.version, advisory.vulnerable_versions));
      if (!matches.length) continue;
      counts[advisory.severity]++;
      const runtimeMatches = matches.filter(row => runtime.has(`${row.name}@${row.version}`));
      if (runtimeMatches.length) runtimeCounts[advisory.severity]++;
      for (const row of matches) affected.add(`${row.name}@${row.version}`);
      for (const row of runtimeMatches) runtimeAffected.add(`${row.name}@${row.version}`);
      findings.push({ package: name, advisoryId: advisory.id, url: advisory.url, severity: advisory.severity,
        affectedVersions: matches.map(row => row.version).sort(), declaredRuntimeVersions: runtimeMatches.map(row => row.version).sort() });
    }
  }
  return { advisoryStatus: "verified-registry-snapshot", lockedIdentities: known.size, declaredRuntimeIdentities: runtime.size,
    returnedAdvisories, matchingAdvisories: findings.length, severityCounts: counts, declaredRuntimeSeverityCounts: runtimeCounts,
    affectedLockedIdentities: affected.size, affectedDeclaredRuntimeIdentities: runtimeAffected.size,
    findings: findings.sort((a, b) => a.advisoryId - b.advisoryId), metavulnerabilityPropagationComputed: false,
    prereleaseRangeEvaluation: "conservative-include", matchesAreNotNpmAuditCliTotals: true,
    remediationAutomaticallyApplied: false, containerImageScanned: false, futureSafetyGuaranteed: false, readyForPublication: false };
}

/** Fixed public query. Never fallback to a request that includes a private package tree. */
export async function collectRegistryAdvisoryProof(root = process.cwd(), fetcher = fetch) {
  try {
    assertNodeSecurityBaseline();
    const { lock, lockfileSha256 } = readLocalDependencyLock(root);
    if (lockfileSha256 !== ADVISORY_REVIEWED_LOCK_SHA256) fail();
    const targets = buildLockedAdvisoryTargets(lock), semver = localSemver(root);
    if (!targets.rows.every(row => semver.valid(row.version))) fail();
    const runtime = [...await collectProductionPackageGraph(root, "."), ...await collectProductionPackageGraph(root, "frontend")];
    const response = await fetcher(ADVISORY_PUBLIC_ENDPOINT, { method: "POST", body: targets.body, redirect: "error",
      credentials: "omit", signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json", "Content-Type": "application/json" } });
    const declared = response.headers.get("content-length");
    if (response.status !== 200 || !response.body || (response.url && response.url !== ADVISORY_PUBLIC_ENDPOINT) ||
        (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 2_000_000))) {
      await response.body?.cancel(); fail();
    }
    const reader = response.body.getReader(), chunks = []; let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength; if (bytes > 2_000_000) fail(); chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    if (!bytes) fail();
    const raw = Buffer.concat(chunks);
    const report = evaluateRegistryAdvisories(targets, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)), runtime, semver);
    // A user edit during the query must not be represented as a current clean result.
    if (readLocalDependencyLock(root).lockfileSha256 !== lockfileSha256) fail();
    return { mode: "public-locked-dependency-advisory-proof", awsCalls: 0, publicRegistryRequests: 1,
      lockfileSha256, coordinatesSha256: targets.coordinatesSha256, registryResponseSha256: hash(raw),
      observedAtUtc: new Date().toISOString(), onlyReviewedPublicCoordinatesSent: true, privateProjectMetadataSent: false,
      filesWritten: 0, packagesInstalled: 0, packageLifecycleScriptsRun: false, uploaded: false, ...report };
  } catch { fail(); }
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", awsCalls: 0, publicRegistryRequests: 0,
      requestedRegistryQueriesMax: 1, reviewedLockfileSha256: ADVISORY_REVIEWED_LOCK_SHA256,
      changedLockRequiresCoordinateReview: true, privateMetadataFallbackAllowed: false, filesWritten: 0,
      packagesInstalled: 0, uploaded: false, readyForPublication: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-query") fail();
      const report = await collectRegistryAdvisoryProof(); console.log(JSON.stringify(report));
      if (report.matchingAdvisories > 0) process.exitCode = 2;
    }
  } catch { console.error(JSON.stringify({ error: "REGISTRY_ADVISORY_PROOF_INCOMPLETE", advisoryStatus: "unknown",
    rawDetailsSuppressed: true, uploaded: false, readyForPublication: false })); process.exitCode = 1; }
}

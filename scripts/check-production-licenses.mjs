import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "ISC",
  "MIT",
]);

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function inside(base, path) {
  const offset = relative(base, path);
  return offset !== "" && offset !== ".." && !isAbsolute(offset) && !offset.startsWith(`..${sep}`);
}

/** Internal paths stay in memory; CLI reports must never serialize this graph. */
export async function collectProductionPackageGraph(root = process.cwd(), importer = ".") {
  if (![".", "frontend"].includes(importer)) throw new Error("PRODUCTION_IMPORTER_INVALID");
  const physicalRoot = await realpath(root);
  const importerRoot = await realpath(join(root, importer));
  if (importerRoot !== physicalRoot && !inside(physicalRoot, importerRoot)) throw new Error("PRODUCTION_ROOT_INVALID");
  const store = await realpath(join(root, "node_modules", ".pnpm"));
  if (!inside(physicalRoot, store)) throw new Error("PRODUCTION_STORE_SCOPE_INVALID");
  const visited = new Map();
  const results = [];

  async function visit(directory, expectedName, depth = 0) {
    const canonical = await realpath(directory);
    if (canonical !== importerRoot && !inside(store, canonical)) throw new Error("PRODUCTION_PACKAGE_SCOPE_INVALID");
    if (depth > 100 || visited.size > 1000) throw new Error("PRODUCTION_GRAPH_LIMIT_EXCEEDED");
    if (visited.has(canonical)) {
      if (visited.get(canonical) !== expectedName) throw new Error("PRODUCTION_IDENTITY_MISMATCH");
      return;
    }
    const path = join(canonical, "package.json");
    const details = await lstat(path);
    if (!details.isFile() || details.isSymbolicLink() || details.size > 2_000_000 || await realpath(path) !== path) {
      throw new Error("PRODUCTION_MANIFEST_PATH_INVALID");
    }
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (!object(manifest) || (manifest.dependencies !== undefined && !object(manifest.dependencies))) throw new Error("PRODUCTION_METADATA_INVALID");
    let row;
    if (expectedName !== null) {
      if (manifest.name !== expectedName || !PACKAGE_NAME.test(manifest.name) || typeof manifest.version !== "string" ||
          !VERSION.test(manifest.version) || typeof manifest.license !== "string" || !allowedLicenses.has(manifest.license)) {
        throw new Error("PRODUCTION_LICENSE_OR_IDENTITY_UNREVIEWED");
      }
      row = { name: manifest.name, version: manifest.version, license: manifest.license, directory: canonical, dependencies: [] };
      results.push(row);
    } else if (canonical !== importerRoot) throw new Error("PRODUCTION_ROOT_INVALID");
    visited.set(canonical, expectedName);

    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      if (!PACKAGE_NAME.test(dependency)) throw new Error("PRODUCTION_DEPENDENCY_NAME_INVALID");
      const segments = dependency.split("/");
      let current = canonical;
      let located;
      while (current === importerRoot || current === store || inside(store, current)) {
        try { located = await realpath(join(current, "node_modules", ...segments)); break; }
        catch (error) { if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error; }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
      if (!located) throw new Error("PRODUCTION_DEPENDENCY_MISSING");
      await visit(located, dependency, depth + 1);
      if (row) {
        const child = results.find(entry => entry.directory === located);
        if (!child) throw new Error("PRODUCTION_IDENTITY_MISMATCH");
        row.dependencies.push({ name: child.name, version: child.version });
      }
    }
  }

  await visit(importerRoot, null);
  if (!results.length) throw new Error("PRODUCTION_GRAPH_EMPTY");
  results.sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  return results;
}

/** Current local backend graph only: no network, install, frontend or legal approval. */
export async function collectProductionLicenseReport(root = process.cwd()) {
  const results = await collectProductionPackageGraph(root);
  const counts = Object.fromEntries([...new Set(results.map(({ license }) => license))].sort().map(license => [
    license, results.filter(entry => entry.license === license).length,
  ]));
  return { mode: "local-backend-production-license-gate", networkCalls: 0, awsCalls: 0, productionPackages: results.length,
    licenseCounts: counts, frontendGraphIncluded: false, freshInstallVerified: false, readyForPublication: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw new Error("PRODUCTION_LICENSE_ARGUMENTS_INVALID");
    console.log(JSON.stringify(await collectProductionLicenseReport(), null, 2));
  } catch {
    console.error(JSON.stringify({ error: "PRODUCTION_LICENSES_INCOMPLETE", readyForPublication: false }));
    process.exitCode = 1;
  }
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectProductionLicenseReport } from "../check-production-licenses.mjs";

function fixture(t, metadata = { name: "runtime", version: "1.0.0", license: "MIT" }) {
  const root = mkdtempSync(join(tmpdir(), "gmai-license-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = join(root, "node_modules", ".pnpm");
  const pkg = join(store, "runtime@1.0.0", "node_modules", "runtime");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { runtime: "1.0.0" } }));
  writeFileSync(join(pkg, "package.json"), JSON.stringify(metadata));
  try { symlinkSync(pkg, join(root, "node_modules", "runtime"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") { t.skip("Directory links require OS permission."); return null; } throw error; }
  return { root, pkg, store };
}

test("production graph is scoped, count-only and never grants frontend, install or publication approval", async t => {
  const value = fixture(t); if (!value) return;
  const result = await collectProductionLicenseReport(value.root);
  assert.equal(result.productionPackages, 1);
  assert.deepEqual(result.licenseCounts, { MIT: 1 });
  assert.equal(result.networkCalls, 0);
  assert.equal(result.awsCalls, 0);
  assert.equal(result.frontendGraphIncluded, false);
  assert.equal(result.readyForPublication, false);
  assert.equal(JSON.stringify(result).includes(value.root), false);
});

test("mismatched identity, unreviewed license and malformed dependency graph fail closed", async t => {
  for (const metadata of [{ name: "other", version: "1.0.0", license: "MIT" },
    { name: "runtime", version: "1.0.0", license: "PRIVATE_LICENSE_VALUE" },
    { name: "runtime", version: "1.0.0", license: "MIT", dependencies: [] }]) {
    const value = fixture(t, metadata); if (!value) return;
    await assert.rejects(collectProductionLicenseReport(value.root));
  }
});

test("a dependency redirected outside the physical store is refused before reading its manifest", async t => {
  const value = fixture(t); if (!value) return;
  const outside = mkdtempSync(join(tmpdir(), "gmai-license-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(join(value.root, "node_modules", "runtime"));
  symlinkSync(outside, join(value.root, "node_modules", "runtime"), process.platform === "win32" ? "junction" : "dir");
  // Deliberately no package.json: scope rejection must precede any attempted read.
  await assert.rejects(collectProductionLicenseReport(value.root), /PRODUCTION_PACKAGE_SCOPE_INVALID/);
});

test("path-shaped dependency names cannot traverse to unrelated package metadata", async t => {
  const value = fixture(t); if (!value) return;
  writeFileSync(join(value.root, "package.json"), JSON.stringify({ dependencies: { "../private": "1.0.0" } }));
  await assert.rejects(collectProductionLicenseReport(value.root), /PRODUCTION_DEPENDENCY_NAME_INVALID/);
});

test("missing or oversized manifests remain incomplete instead of clean", async t => {
  const value = fixture(t); if (!value) return;
  writeFileSync(join(value.pkg, "package.json"), " ".repeat(2_000_001));
  await assert.rejects(collectProductionLicenseReport(value.root), /PRODUCTION_MANIFEST_PATH_INVALID/);
  rmSync(join(value.pkg, "package.json"));
  await assert.rejects(collectProductionLicenseReport(value.root));
});

test("CLI suppresses private metadata, package paths and raw filesystem failures", t => {
  const value = fixture(t, { name: "runtime", version: "1.0.0", license: "PRIVATE_LICENSE_VALUE" }); if (!value) return;
  const result = spawnSync(process.execPath, [resolve("scripts/check-production-licenses.mjs")],
    { cwd: value.root, encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { error: "PRODUCTION_LICENSES_INCOMPLETE", readyForPublication: false });
  assert.equal(result.stderr.includes("PRIVATE_LICENSE_VALUE"), false);
  assert.equal(result.stderr.includes(value.root), false);
});

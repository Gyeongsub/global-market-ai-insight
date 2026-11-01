import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectRuntimeAttribution, readRuntimeNoticeDocuments, validateRuntimeAttributionText, writeFrontendAttribution } from "../runtime-attribution.mjs";

const digest = text => createHash("sha256").update(text).digest("hex");
const licenseText = "MIT License\r\nCopyright (c) Synthetic Authors\r\nPermission notice remains intact.\r\n";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-runtime-notices-"));
  const physicalRoot = realpathSync(root);
  t.after(() => {
    assert.equal(realpathSync(root), physicalRoot);
    rmSync(root, { recursive: true, force: true });
  });
  const store = join(root, "node_modules", ".pnpm");
  const modules = join(root, "frontend", "node_modules");
  mkdirSync(modules, { recursive: true });
  const versions = { react: "19.2.8", "react-dom": "19.2.8", scheduler: "0.27.0" };
  const paths = {};
  for (const [name, version] of Object.entries(versions)) {
    const path = join(store, `${name}@${version}`, "node_modules", name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "package.json"), JSON.stringify({ name, version, license: "MIT",
      ...(name === "react-dom" ? { dependencies: { scheduler: "^0.27.0" } } : {}) }));
    writeFileSync(join(path, "LICENSE"), licenseText);
    paths[name] = path;
  }
  const type = process.platform === "win32" ? "junction" : "dir";
  try {
    for (const name of ["react", "react-dom"]) symlinkSync(paths[name], join(modules, name), type);
    symlinkSync(paths.scheduler, join(store, "react-dom@19.2.8", "node_modules", "scheduler"), type);
  } catch (error) { if (error.code === "EPERM") { t.skip("Directory links require OS support."); return null; } throw error; }
  writeFileSync(join(root, "frontend", "package.json"), JSON.stringify({ dependencies: { react: "19.2.8", "react-dom": "19.2.8" } }));
  mkdirSync(join(root, "frontend", "dist"));
  const lock = { lockfileVersion: "9.0", packages: Object.fromEntries(Object.entries(versions).map(([name, version]) => [`${name}@${version}`, {}])),
    importers: { frontend: { dependencies: { react: { specifier: "19.2.8", version: "19.2.8" },
      "react-dom": { specifier: "19.2.8", version: "19.2.8(react@19.2.8)" } } } },
    snapshots: { "react@19.2.8": {}, "react-dom@19.2.8(react@19.2.8)": { dependencies: { scheduler: "0.27.0" } }, "scheduler@0.27.0": {} } };
  return { root, store: realpathSync(store), paths, lock: { lock, lockfileSha256: "a".repeat(64) } };
}

test("frontend attribution preserves exact upstream text and resolves the locked scheduler dependency", async t => {
  const f = fixture(t); if (!f) return;
  writeFileSync(join(f.paths.react, "NOTICE.txt"), "Synthetic NOTICE\r\nMust not disappear.\r\n");
  writeFileSync(join(f.paths.react, "COPYRIGHT"), "Copyright Synthetic Authors\n");
  const { text, report } = await collectRuntimeAttribution(f.root, "frontend", f.lock);
  assert.equal(report.runtimePackages, 3);
  assert.equal(text.split(licenseText).length - 1, 3);
  assert.ok(text.includes("Synthetic NOTICE\r\nMust not disappear.\r\n"));
  assert.ok(text.includes("Copyright Synthetic Authors\n"));
  assert.equal(report.packages[0].documents.find(doc => doc.name === "LICENSE").sha256, digest(licenseText));
  assert.equal(JSON.stringify(report).includes(f.root), false);
  assert.equal(JSON.stringify(report).includes("Synthetic Authors"), false);
  for (const flag of ["uploaded", "exactBundledModuleCoverageVerified", "containerOsLicensesIncluded", "developmentGraphIncluded", "freshInstallVerified", "readyForPublication"]) assert.equal(report[flag], false);
  assert.equal(report.awsCalls, 0);
  assert.equal(report.networkCalls, 0);
  validateRuntimeAttributionText(text);
});

test("missing package documents cannot be replaced by another package's generic license", async t => {
  const f = fixture(t); if (!f) return;
  rmSync(join(f.paths.scheduler, "LICENSE"));
  await assert.rejects(collectRuntimeAttribution(f.root, "frontend", f.lock), /LICENSE_DOCUMENT_MISSING/);
});

test("lock, direct declarations and transitive installed versions must agree", async t => {
  for (const change of [
    f => { delete f.lock.lock.packages["scheduler@0.27.0"]; },
    f => { f.lock.lock.importers.frontend.dependencies.react.specifier = "^19.2.8"; },
    f => { f.lock.lock.snapshots["react-dom@19.2.8(react@19.2.8)"].dependencies.scheduler = "0.26.0"; },
    f => { f.lock.lockfileSha256 = "PRIVATE_INVALID_VALUE"; },
  ]) {
    const f = fixture(t); if (!f) return; change(f);
    await assert.rejects(collectRuntimeAttribution(f.root, "frontend", f.lock), /ATTRIBUTION_/);
  }
});

test("unreviewed licenses remain blocked rather than assigned a permissive text", async t => {
  const f = fixture(t); if (!f) return;
  writeFileSync(join(f.paths.scheduler, "package.json"), JSON.stringify({ name: "scheduler", version: "0.27.0", license: "MPL-2.0" }));
  await assert.rejects(collectRuntimeAttribution(f.root, "frontend", f.lock), /PRODUCTION_LICENSE_OR_IDENTITY_UNREVIEWED/);
});

test("notice directories, empty documents, invalid UTF-8 and credential-shaped texts fail closed", t => {
  const f = fixture(t); if (!f) return;
  const path = join(f.paths.react, "LICENSE");
  for (const bytes of [Buffer.alloc(0), Buffer.from([0xc0, 0xaf]), Buffer.from("LICENSE\x00TEXT"), Buffer.from("AK" + "IA" + "Z".repeat(16))]) {
    writeFileSync(path, bytes);
    assert.throws(() => readRuntimeNoticeDocuments(f.paths.react, f.store), /ATTRIBUTION_DOCUMENT_/);
  }
  rmSync(path); mkdirSync(path);
  assert.throws(() => readRuntimeNoticeDocuments(f.paths.react, f.store), /ATTRIBUTION_DOCUMENT_PATH_INVALID/);
});

test("license document links and unrelated physical stores are rejected before read", t => {
  const f = fixture(t); if (!f) return;
  assert.throws(() => readRuntimeNoticeDocuments(f.root, f.store), /ATTRIBUTION_PACKAGE_SCOPE_INVALID/);
  const path = join(f.paths.react, "LICENSE");
  rmSync(path);
  writeFileSync(join(f.root, "private.txt"), "NOT_A_LICENSE");
  try { symlinkSync(join(f.root, "private.txt"), path); }
  catch (error) { if (error.code === "EPERM") { t.skip("File links require OS support."); return; } throw error; }
  assert.throws(() => readRuntimeNoticeDocuments(f.paths.react, f.store), /ATTRIBUTION_DOCUMENT_PATH_INVALID/);
});

test("a package directory junction outside the physical store is rejected before documents are read", t => {
  const f = fixture(t); if (!f) return;
  const outside = join(f.root, "outside-package"); mkdirSync(outside);
  writeFileSync(join(outside, "LICENSE"), "PRIVATE_OUTSIDE_CONTENT");
  const link = join(f.store, "redirected-package");
  symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => readRuntimeNoticeDocuments(link, f.store), /ATTRIBUTION_PACKAGE_SCOPE_INVALID/);
});

test("only a fresh local distribution receives notices, with no overwrite or upload", async t => {
  const f = fixture(t); if (!f) return;
  const candidate = await collectRuntimeAttribution(f.root, "frontend", f.lock);
  const output = writeFrontendAttribution(f.root, candidate);
  assert.equal(output.sha256, digest(candidate.text));
  assert.equal(readFileSync(join(f.root, "frontend", "dist", "THIRD_PARTY_NOTICES.txt"), "utf8"), candidate.text);
  assert.throws(() => writeFrontendAttribution(f.root, candidate), error => error.code === "EEXIST");
  assert.throws(() => writeFrontendAttribution(f.root, { ...candidate, text: candidate.text + "CHANGED" }), /ARTIFACT_INVALID/);
});

test("a redirected frontend distribution cannot receive artifact writes", async t => {
  const f = fixture(t); if (!f) return;
  const candidate = await collectRuntimeAttribution(f.root, "frontend", f.lock);
  const dist = join(f.root, "frontend", "dist");
  const alternative = join(f.root, "alternative"); mkdirSync(alternative); rmSync(dist, { recursive: true });
  symlinkSync(alternative, dist, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => writeFrontendAttribution(f.root, candidate), /OUTPUT_SCOPE_INVALID/);
});

test("attribution CLI refuses destination and upload arguments without revealing any value", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/runtime-attribution.mjs"), "--upload", "PRIVATE_DESTINATION"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { error: "RUNTIME_ATTRIBUTION_INCOMPLETE", uploaded: false, readyForPublication: false });
  assert.equal(result.stderr.includes("PRIVATE_DESTINATION"), false);
});

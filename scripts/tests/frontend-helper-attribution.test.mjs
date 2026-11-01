import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { FRONTEND_HELPER_PRODUCERS, collectFrontendAttribution, collectFrontendHelperProducers,
  verifyHelperProducerDocuments } from "../frontend-helper-attribution.mjs";
import { readRuntimeNoticeDocuments } from "../runtime-attribution.mjs";

const root = resolve("."), requireFrontend = createRequire(join(root, "frontend", "package.json"));
const vite = requireFrontend.resolve("vite/package.json");
const sources = [vite, createRequire(vite).resolve("rolldown/package.json")];
const hash = text => createHash("sha256").update(text).digest("hex");
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "gmai-helper-attribution-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const frontend = join(directory, "frontend"), store = join(directory, "node_modules", ".pnpm");
  mkdirSync(join(frontend, "node_modules"), { recursive: true });
  copyFileSync(join(root, "frontend", "package.json"), join(frontend, "package.json"));
  copyFileSync(join(root, "pnpm-lock.yaml"), join(directory, "pnpm-lock.yaml"));
  // The lock reader must also be isolated inside this fixture's physical store.
  const parser = join(store, "js-yaml@4.3.2", "node_modules", "js-yaml");
  cpSync(realpathSync(join(root, "node_modules", ".pnpm", "node_modules", "js-yaml")), parser, { recursive: true });
  mkdirSync(join(store, "node_modules"), { recursive: true });
  symlinkSync(parser, join(store, "node_modules", "js-yaml"), process.platform === "win32" ? "junction" : "dir");
  const directories = FRONTEND_HELPER_PRODUCERS.map((target, index) => {
    const path = join(store, `${target.name}@${target.version}`, "node_modules", target.name);
    mkdirSync(path, { recursive: true }); copyFileSync(sources[index], join(path, "package.json"));
    for (const doc of target.documents) copyFileSync(join(dirname(sources[index]), doc.name), join(path, doc.name));
    return path;
  });
  symlinkSync(directories[0], join(frontend, "node_modules", "vite"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(directories[1], join(dirname(directories[0]), "rolldown"), process.platform === "win32" ? "junction" : "dir");
  return { root: directory, frontend, store: realpathSync(store), directories };
}

test("two pinned producers preserve three whole upstream documents without exposing local paths or granting rights", async () => {
  const local = collectFrontendHelperProducers(root), candidate = await collectFrontendAttribution(root);
  assert.equal(local.report.producerPackages, 2); assert.equal(candidate.report.runtimePackages, 3);
  assert.equal(local.report.producers.flatMap(row => row.documents).length, 3);
  for (const flag of ["exactGeneratedHelperSourceOriginVerified", "completeLegalProvenanceVerified", "uploaded", "readyForPublication"])
    assert.equal(local.report[flag], false);
  assert.equal(local.report.nativeCompilerOriginReviewRequired, true);
  assert.equal(candidate.report.artifactSha256, hash(candidate.text));
  assert.equal(candidate.report.artifactBytes, Buffer.byteLength(candidate.text));
  for (const [index, target] of FRONTEND_HELPER_PRODUCERS.entries()) for (const doc of target.documents) {
    const source = readFileSync(join(dirname(sources[index]), doc.name), "utf8");
    assert.ok(candidate.text.includes(source)); assert.equal(hash(source), doc.sha256);
  }
  assert.equal(JSON.stringify(local.report).includes(root), false);
  assert.equal(JSON.stringify(local.report).includes("Permission is hereby granted"), false);
});

test("the exact local importer, manifest, dependency snapshot and documents must all match", t => {
  const f = fixture(t); assert.doesNotThrow(() => collectFrontendHelperProducers(f.root));
  const path = join(f.directories[0], "package.json"), original = readFileSync(path);
  for (const change of [{ version: "8.2.2" }, { license: "UNKNOWN_PRIVATE_LICENSE" },
    { repository: { url: "PRIVATE_REPOSITORY" } }, { name: "PRIVATE_NAME" }]) {
    writeFileSync(path, JSON.stringify({ ...JSON.parse(original), ...change }));
    assert.throws(() => collectFrontendHelperProducers(f.root), /^Error: FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE$/);
  }
  writeFileSync(path, original);
  const importer = join(f.frontend, "package.json"), declared = JSON.parse(readFileSync(importer, "utf8"));
  declared.devDependencies.vite = "^8.2.4"; writeFileSync(importer, JSON.stringify(declared));
  assert.throws(() => collectFrontendHelperProducers(f.root), /FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE/);
});

test("altered, truncated, extra and missing producer notices cannot silently replace the reviewed byte set", t => {
  const f = fixture(t), file = join(f.directories[1], "THIRD-PARTY-LICENSE"), original = readFileSync(file);
  for (const bytes of [Buffer.from("PRIVATE_REPLACEMENT"), original.subarray(0, original.length - 1),
    Buffer.concat([original, Buffer.from("\n")])]) {
    writeFileSync(file, bytes);
    assert.throws(() => collectFrontendHelperProducers(f.root), /^Error: FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE$/);
  }
  writeFileSync(file, original); writeFileSync(join(f.directories[1], "NOTICE"), "EXTRA_UNREVIEWED_NOTICE");
  assert.throws(() => collectFrontendHelperProducers(f.root), /FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE/);
  rmSync(join(f.directories[1], "NOTICE")); rmSync(file);
  assert.throws(() => collectFrontendHelperProducers(f.root), /FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE/);
});

test("document selection cannot be expanded into request-selected filesystem access", t => {
  const f = fixture(t), target = FRONTEND_HELPER_PRODUCERS[1];
  const docs = readRuntimeNoticeDocuments(f.directories[1], f.store, ["THIRD-PARTY-LICENSE"]);
  assert.doesNotThrow(() => verifyHelperProducerDocuments(target, docs));
  for (const selected of [["../PRIVATE_FILE"], ["package.json"], ["THIRD-PARTY-LICENSE", "PRIVATE_FILE"], "PRIVATE_FILE"])
    assert.throws(() => readRuntimeNoticeDocuments(f.directories[1], f.store, selected), /ATTRIBUTION_DOCUMENT_PATH_INVALID/);
  for (const selected of [docs.slice(1), [...docs, docs[0]], docs.map(doc => ({ ...doc, text: "PRIVATE_TEXT" }))])
    assert.throws(() => verifyHelperProducerDocuments(target, selected), /FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE/);
  assert.throws(() => verifyHelperProducerDocuments({ ...target }, docs), /FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE/);
});

test("a redirected document or frontend directory fails before reading an external target", t => {
  const f = fixture(t), outside = mkdtempSync(join(tmpdir(), "gmai-helper-attribution-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "PRIVATE_VALUE"), "PRIVATE_VALUE");
  const doc = join(f.directories[1], "THIRD-PARTY-LICENSE"); rmSync(doc);
  symlinkSync(outside, doc, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => collectFrontendHelperProducers(f.root), /^Error: FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE$/);
  rmSync(f.frontend, { recursive: true });
  symlinkSync(outside, f.frontend, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => collectFrontendHelperProducers(f.root), /^Error: FRONTEND_HELPER_ATTRIBUTION_INCOMPLETE$/);
});

test("helper notice CLI cannot upload, change a destination or reflect supplied private strings", () => {
  const result = spawnSync(process.execPath, ["scripts/frontend-helper-attribution.mjs", "--upload", "PRIVATE_DESTINATION"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr.includes("PRIVATE_DESTINATION"), false);
  const error = JSON.parse(result.stderr); assert.equal(error.awsCalls, 0); assert.equal(error.networkCalls, 0);
  assert.equal(error.readyForPublication, false);
});

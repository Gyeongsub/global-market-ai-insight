import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runtimeModuleMetadataPlugin, summarizeEmittedModules, summarizeGeneratedHelpers, verifyWrittenModuleChunks } from "../scripts/runtime-module-metadata-plugin.mjs";
import { collectFrontendHelperProducers } from "../../scripts/frontend-helper-attribution.mjs";

const root = resolve("synthetic-bundle-root"), frontend = resolve(root, "frontend"), directory = resolve(root, "store", "react");
const packages = [{ name: "react", version: "19.2.8", license: "MIT", directory }];
function chunk(modules, code = "SYNTHETIC_SOURCE_CODE_ONLY") {
  return { type: "chunk", fileName: "assets/index-abcdefgh.js", code, modules: Object.fromEntries(modules.map(id => [id, {}])) };
}

test("emitted metadata binds chunk hashes and pinned package counts without revealing source or paths", () => {
  const item = chunk([resolve(frontend, "src", "main.tsx"), resolve(directory, "index.js"), String.fromCharCode(0) + "synthetic-helper"]);
  const result = summarizeEmittedModules({ entry: item }, frontend, packages);
  assert.equal(result.modules, 3);
  assert.deepEqual(result.categories, { frontendSource: 1, sharedContractSource: 0, lockedRuntimePackage: 1, virtualGenerated: 1, unclassified: 0 });
  assert.deepEqual(result.runtimePackages, [{ name: "react", version: "19.2.8", license: "MIT", modules: 1 }]);
  assert.equal(result.chunks[0].sha256, createHash("sha256").update(item.code).digest("hex"));
  for (const value of [root, directory, item.code, "synthetic-helper"]) assert.equal(JSON.stringify(result).includes(value), false);
  assert.equal(result.completeAttributionVerified, false); assert.equal(result.generatedHelperReviewRequired, true);
});

test("foreign sources and frontend node_modules cannot masquerade as first-party source", () => {
  const item = chunk([resolve(frontend, "node_modules", "unreviewed", "index.js"), resolve(root, "outside", "index.js"), "relative/unknown.js"]);
  const result = summarizeEmittedModules({ entry: item }, frontend, packages);
  assert.equal(result.categories.unclassified, 3); assert.equal(result.categories.frontendSource, 0);
  assert.equal(result.unclassifiedModuleReviewRequired, true); assert.equal(result.legalReviewApproved, false);
});

test("only the six explicit shared browser-contract sources receive first-party categorization", () => {
  const names = ["strict-json.ts", "result-validation.ts", "disclaimer.ts", "error.schema.json", "price-result.schema.json", "analysis-result.schema.json"];
  const known = names.map(name => resolve(root, "shared", "schemas", name));
  const unknown = [resolve(root, "shared", "schemas", "unreviewed.ts"), resolve(root, "shared", "node_modules", "foreign.js"),
    resolve(root, "outside", "shared", "schemas", "strict-json.ts")];
  const result = summarizeEmittedModules({ entry: chunk([...known, ...unknown]) }, frontend, packages);
  assert.equal(result.categories.sharedContractSource, 6); assert.equal(result.categories.unclassified, 3);
  assert.equal(result.unclassifiedModuleReviewRequired, true); assert.equal(result.completeAttributionVerified, false);
  assert.equal(result.legalReviewApproved, false); assert.equal(result.publicationPerformed, false);
  for (const value of [...known, ...unknown]) assert.equal(JSON.stringify(result).includes(value), false);
});

test("duplicate module IDs across chunks count once and invalid output metadata fails generically", () => {
  const id = resolve(directory, "index.js"), item = chunk([id]);
  assert.equal(summarizeEmittedModules({ first: item, second: { ...item, fileName: "assets/second-abcdefgh.js" } }, frontend, packages).modules, 1);
  for (const value of [{}, { entry: { ...item, fileName: "../PRIVATE_OUTPUT.js" } }, { entry: { ...item, modules: null } },
    { entry: { ...item, code: "" } }, { entry: { ...item, modules: {} } }]) {
    assert.throws(() => summarizeEmittedModules(value, frontend, packages), error => {
      assert.equal(error.message, "EMITTED_MODULE_METADATA_INCOMPLETE"); return true;
    });
  }
});

test("module metadata plugin is build-only and the declared graph is still pinned before it runs", async () => {
  const plugin = runtimeModuleMetadataPlugin(); assert.equal(plugin.apply, "build"); assert.equal(plugin.enforce, "post");
  await plugin.buildStart();
});

test("unreviewed package identities and documents fail generically, never reflecting invalid values", async () => {
  const item = chunk([resolve(directory, "index.js")]);
  for (const change of [{ name: "INVALID_PRIVATE_NAME" }, { version: "INVALID_PRIVATE_VERSION" }, { license: "INVALID_PRIVATE_LICENSE" }])
    assert.throws(() => summarizeEmittedModules({ entry: item }, frontend, [{ ...packages[0], ...change }]), /^Error: EMITTED_MODULE_METADATA_INCOMPLETE$/);
  const plugin = runtimeModuleMetadataPlugin(resolve(root, "absent"));
  await assert.rejects(plugin.buildStart(), /^Error: EMITTED_MODULE_METADATA_INCOMPLETE$/);
});

function writtenFixture(t) {
  const path = mkdtempSync(join(tmpdir(), "gmai-written-module-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const assets = join(path, "frontend", "dist", "assets"); mkdirSync(assets, { recursive: true });
  const file = join(assets, "index-abcdefgh.js"), code = "SYNTHETIC_CHUNK_ONLY";
  writeFileSync(file, code);
  return { root: path, assets, file, row: { key: "assets/index-abcdefgh.js", bytes: Buffer.byteLength(code), sha256: createHash("sha256").update(code).digest("hex") } };
}

test("chunk metadata must match the freshly written bytes and cannot select arbitrary files", t => {
  const fixture = writtenFixture(t); assert.doesNotThrow(() => verifyWrittenModuleChunks(fixture.root, [fixture.row]));
  for (const change of [{ key: "../PRIVATE_FILE" }, { bytes: 0 }, { bytes: fixture.row.bytes + 1 }, { sha256: "0".repeat(64) }])
    assert.throws(() => verifyWrittenModuleChunks(fixture.root, [{ ...fixture.row, ...change }]), /^Error: WRITTEN_MODULE_BYTES_INCOMPLETE$/);
  writeFileSync(fixture.file, "CHANGED_CHUNK_ONLY");
  assert.throws(() => verifyWrittenModuleChunks(fixture.root, [fixture.row]), /WRITTEN_MODULE_BYTES_INCOMPLETE/);
});

test("a redirected artifact directory cannot supply bytes from outside the current distribution", t => {
  const fixture = writtenFixture(t), outside = mkdtempSync(join(tmpdir(), "gmai-written-module-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(fixture.assets, { recursive: true });
  symlinkSync(outside, fixture.assets, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => verifyWrittenModuleChunks(fixture.root, [fixture.row]), /WRITTEN_MODULE_BYTES_INCOMPLETE/);
});

const producerReport = collectFrontendHelperProducers().report;
const runtimeId = "\0rolldown/runtime.js", polyfillId = "\0vite/modulepreload-polyfill.js";
function generatedBundle() {
  const runtime = "SYNTHETIC_PRIVATE_RUNTIME", polyfill = "SYNTHETIC_PRIVATE_POLYFILL";
  return { entry: { ...chunk([]), modules: {
    [runtimeId]: { code: runtime, renderedLength: runtime.length },
    [polyfillId]: { code: polyfill, renderedLength: polyfill.length },
  } } };
}
const generatedInfo = id => ({ code: id === polyfillId ? "SYNTHETIC_PRIVATE_SOURCE" : null });

test("two generated-helper byte records distinguish missing original source from observed rendered metadata", () => {
  const result = summarizeGeneratedHelpers(generatedBundle(), generatedInfo, producerReport);
  assert.equal(result.helpers.length, 2); assert.equal(result.producers.length, 2);
  const runtime = result.helpers.find(row => row.helper === "rolldown-runtime");
  assert.equal(runtime.sourceMetadataPresent, false); assert.equal(runtime.sourceBytes, null); assert.equal(runtime.sourceSha256, null);
  assert.equal(runtime.renderedSha256, createHash("sha256").update("SYNTHETIC_PRIVATE_RUNTIME").digest("hex"));
  const polyfill = result.helpers.find(row => row.helper === "vite-modulepreload-polyfill");
  assert.equal(polyfill.sourceMetadataPresent, true); assert.equal(polyfill.sourceBytes, Buffer.byteLength("SYNTHETIC_PRIVATE_SOURCE"));
  for (const flag of ["exactGeneratedSourceOriginVerified", "installedProducerCodeBytesVerified", "completeLegalProvenanceVerified",
    "sourceCodePrinted", "absoluteModuleIdsPrinted", "uploaded", "readyForPublication"]) assert.equal(result[flag], false);
  assert.equal(result.nativeCompilerOriginReviewRequired, true);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes("\u0000"), false);
});

test("unknown or missing virtual helpers and absent polyfill source cannot pass a reviewed helper gate", () => {
  const extra = generatedBundle(); extra.entry.modules["\0PRIVATE_UNKNOWN_GENERATOR"] = { code: "PRIVATE_CODE", renderedLength: 12 };
  const missing = generatedBundle(); delete missing.entry.modules[runtimeId];
  for (const bundle of [extra, missing, {}]) assert.throws(() => summarizeGeneratedHelpers(bundle, generatedInfo, producerReport),
    /^Error: GENERATED_HELPER_METADATA_INCOMPLETE$/);
  assert.throws(() => summarizeGeneratedHelpers(generatedBundle(), () => ({ code: null }), producerReport), /GENERATED_HELPER_METADATA_INCOMPLETE/);
});

test("invalid chunk/helper metadata and excessive module bytes fail without reflecting supplied code or paths", () => {
  for (const change of [{ code: "" }, { code: null }, { renderedLength: 1 }, { code: "x".repeat(20_001), renderedLength: 20_001 }]) {
    const bundle = generatedBundle(); Object.assign(bundle.entry.modules[runtimeId], change);
    assert.throws(() => summarizeGeneratedHelpers(bundle, generatedInfo, producerReport), /^Error: GENERATED_HELPER_METADATA_INCOMPLETE$/);
  }
  const bundle = generatedBundle(); bundle.entry.fileName = "../PRIVATE_OUTPUT.js";
  assert.throws(() => summarizeGeneratedHelpers(bundle, generatedInfo, producerReport), /GENERATED_HELPER_METADATA_INCOMPLETE/);
  for (const info of [() => ({ code: 1 }), () => ({ code: "" }), () => ({ code: "x".repeat(20_001) })])
    assert.throws(() => summarizeGeneratedHelpers(generatedBundle(), info, producerReport), /GENERATED_HELPER_METADATA_INCOMPLETE/);
});

test("helper copies across chunks must retain identical rendered and source byte hashes", () => {
  const bundle = generatedBundle(); bundle.second = { ...generatedBundle().entry, fileName: "assets/second-abcdefgh.js" };
  const result = summarizeGeneratedHelpers(bundle, generatedInfo, producerReport);
  assert.equal(result.helpers.length, 2); assert.equal(result.helpers[0].containingChunks.length, 2);
  bundle.second.modules[runtimeId].code = "CHANGED_PRIVATE_RUNTIME";
  bundle.second.modules[runtimeId].renderedLength = bundle.second.modules[runtimeId].code.length;
  assert.throws(() => summarizeGeneratedHelpers(bundle, generatedInfo, producerReport), /GENERATED_HELPER_METADATA_INCOMPLETE/);
  const unchanged = generatedBundle(); unchanged.second = { ...generatedBundle().entry, fileName: "assets/second-abcdefgh.js" };
  let calls = 0;
  assert.throws(() => summarizeGeneratedHelpers(unchanged, id => ({ code: id === polyfillId ? `PRIVATE_${calls++}` : null }), producerReport),
    /GENERATED_HELPER_METADATA_INCOMPLETE/);
});

test("producer identity/document pins reject foreign metadata and do not serialize arbitrary attached fields", () => {
  for (const change of [{ awsCalls: 1 }, { networkCalls: 1 }, { producerPackages: 3 }, { readyForPublication: true },
    { lockfileSha256: "PRIVATE_LOCK" }, { producers: [] }])
    assert.throws(() => summarizeGeneratedHelpers(generatedBundle(), generatedInfo, { ...producerReport, ...change }), /GENERATED_HELPER_METADATA_INCOMPLETE/);
  for (const field of ["name", "version", "manifestSha256"]) {
    const altered = structuredClone(producerReport); altered.producers[0][field] = "PRIVATE_METADATA";
    assert.throws(() => summarizeGeneratedHelpers(generatedBundle(), generatedInfo, altered), /^Error: GENERATED_HELPER_METADATA_INCOMPLETE$/);
  }
  const report = structuredClone(producerReport); report.producers[0].directory = "PRIVATE_DIRECTORY";
  report.producers[0].documents[0].text = "PRIVATE_TEXT"; report.producers[0].documents[0].sourcePath = "PRIVATE_SOURCE_PATH";
  assert.equal(JSON.stringify(summarizeGeneratedHelpers(generatedBundle(), generatedInfo, report)).includes("PRIVATE_"), false);
});

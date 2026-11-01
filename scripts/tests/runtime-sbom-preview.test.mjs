import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { buildRuntimeSbomPreview, runtimeSbomPreviewPlan, writeRuntimeSbomPreview,
  runtimeSbomSchemaPlan, validateRuntimeSbomStructure, fetchRuntimeSbomSchemaAssets,
  runtimeSbomSourceFingerprint, collectRuntimeSbomPreview, fetchReviewedRuntimeSbomSchemaAssets,
  REVIEWED_RUNTIME_SCHEMA_DIGESTS, reviewedRuntimeSchemaDigestsMatch, validateRuntimeSbomRestrictedFormats } from "../runtime-sbom-preview.mjs";

function fixture() {
  const graphs = {
    ".": [{ name: "@example/server", version: "1.2.3", license: "Apache-2.0", directory: "PRIVATE_SENTINEL",
      author: { email: "PRIVATE_SENTINEL" }, dependencies: [{ name: "shared-helper", version: "2.0.0" }] },
      { name: "shared-helper", version: "2.0.0", license: "MIT", dependencies: [] }],
    frontend: [{ name: "example-client", version: "3.4.5", license: "MIT", dependencies: [{ name: "shared-helper", version: "2.0.0" }] },
      { name: "shared-helper", version: "2.0.0", license: "MIT", dependencies: [] }],
  };
  const keys = ["@example/server@1.2.3", "shared-helper@2.0.0", "example-client@3.4.5"];
  return { graphs, proof: { lockfileSha256: "a".repeat(64), lock: { lockfileVersion: "9.0",
    packages: Object.fromEntries(keys.map(key => [key, { resolution: { integrity: `sha512-${"A".repeat(86)}==` } }])),
    importers: { ".": { dependencies: { "@example/server": { specifier: "1.2.3", version: "1.2.3" } } },
      frontend: { dependencies: { "example-client": { specifier: "3.4.5", version: "3.4.5" } } } },
    snapshots: { "@example/server@1.2.3": { dependencies: { "shared-helper": "2.0.0" } },
      "example-client@3.4.5": { dependencies: { "shared-helper": "2.0.0" } }, "shared-helper@2.0.0": {} } } } };
}
const preview = () => { const f = fixture(); return buildRuntimeSbomPreview(f.proof, f.graphs); };
const schemaAssets = () => ["bom-1.6.schema.json", "spdx.schema.json", "jsf-0.82.schema.json"].map(file => ({
  file, bytes: 100, sha256: "b".repeat(64), schema: { $id: `http://cyclonedx.org/schema/${file}`,
    $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
}));
class FixtureAjv {
  constructor(options) { assert.equal(options.format, false); assert.equal(options.validateSchema, true); }
  addSchema(schema) { assert.ok(schema.$id.startsWith("http://cyclonedx.org/schema/")); }
  compile(schema) { assert.ok(schema.$id.endsWith("bom-1.6.schema.json")); return bom => bom.bomFormat === "CycloneDX"; }
}
const RealAjv = createRequire(import.meta.url)("../../node_modules/.pnpm/node_modules/ajv");

test("restricted generated-subset validation uses the real local validator without disabling formats", () => {
  const p = preview(), r = validateRuntimeSbomRestrictedFormats(p, schemaAssets(), RealAjv);
  assert.equal(r.generatedSubsetSchemaValid, true); assert.equal(r.formatAssertionsEnabled, true);
  assert.equal(r.encounteredFormatValues, 0); assert.equal(r.formatValuesRejectedByDesign, true);
  assert.equal(r.generalFormatConformanceClaimed, false); assert.equal(r.fullSchemaValidationClaimed, false);
  assert.equal(r.reviewedSchemaBytesMatched, false); assert.equal(r.readyForPublication, false);
  assert.equal(r.autoExternalResolverUsed, false); assert.equal(r.artifactSha256, p.report.artifactSha256);
});

test("any format-bearing generated value is refused, including apparently valid URI/date/contact values", () => {
  for (const format of ["uri", "iri-reference", "date-time", "idn-email"]) {
    const assets = schemaAssets(); assets[0].schema.properties = { bomFormat: { type: "string", format } };
    assert.throws(() => validateRuntimeSbomRestrictedFormats(preview(), assets, RealAjv), /^Error: RUNTIME_SBOM_PREVIEW_INCOMPLETE$/);
  }
  // An alternative branch cannot hide a rejected format traversal.
  const assets = schemaAssets(); assets[0].schema.anyOf = [
    { properties: { bomFormat: { type: "string", format: "uri" } } }, { type: "object" },
  ];
  assert.throws(() => validateRuntimeSbomRestrictedFormats(preview(), assets, RealAjv));
});

test("unknown format names, malformed schemas and cloned artifacts cannot claim restricted format coverage", () => {
  for (const mutate of [a => { a[0].schema.properties = { bomFormat: { type: "string", format: "PRIVATE_SENTINEL" } }; },
    a => { a[0].schema.type = "PRIVATE_SENTINEL"; }, a => { a[0].schema.required = ["PRIVATE_SENTINEL"]; }]) {
    const assets = schemaAssets(); mutate(assets);
    assert.throws(() => validateRuntimeSbomRestrictedFormats(preview(), assets, RealAjv), error =>
      error.message === "RUNTIME_SBOM_PREVIEW_INCOMPLETE" && !error.message.includes("PRIVATE_SENTINEL"));
  }
  assert.throws(() => validateRuntimeSbomRestrictedFormats(structuredClone(preview()), schemaAssets(), RealAjv));
});

test("a schema property named format is not mistaken for a format keyword, while invalid keyword types fail", () => {
  const assets = schemaAssets(); assets[0].schema.properties = { format: { type: "string" } };
  assert.equal(validateRuntimeSbomRestrictedFormats(preview(), assets, RealAjv).generatedSubsetSchemaValid, true);
  assets[0].schema.format = { type: "string" };
  assert.throws(() => validateRuntimeSbomRestrictedFormats(preview(), assets, RealAjv));
});

test("public schema route defaults to no network and keeps scope, byte and time ceilings explicit", () => {
  const p = runtimeSbomSchemaPlan(); assert.equal(p.networkCalls, 0); assert.equal(p.publicSchemaReadsMax, 3);
  assert.equal(p.downloadBytesMax, 700000); assert.equal(p.deadlineMs, 60000); assert.equal(p.schemaFilesWritten, 0);
  assert.equal(p.formatAssertionsEnabled, false); assert.equal(p.fullSchemaValidationClaimed, false);
  assert.equal(p.readyForPublication, false); assert.throws(() => runtimeSbomSchemaPlan(["--execute"]));
  assert.equal(p.reviewedSchemaContentPinRequired, true); assert.equal(p.publisherSignatureClaimed, false);
});

test("structural validation uses only supplied fixed schemas and never claims formats, rights or publication", () => {
  const p = preview(), r = validateRuntimeSbomStructure(p, schemaAssets(), FixtureAjv);
  assert.equal(r.structuralSchemaValid, true); assert.equal(r.formatAssertionsEnabled, false);
  assert.equal(r.fullSchemaValidationClaimed, false); assert.equal(r.autoExternalResolverUsed, false);
  assert.equal(r.artifactSha256, p.report.artifactSha256); assert.equal(r.schemaSources.length, 3);
  assert.equal(r.publisherSignatureVerified, false); assert.equal(r.licenseObligationsVerified, false);
  assert.equal(r.reviewedSchemaBytesMatched, false); assert.equal(r.schemaPublisherSignatureVerified, false);
  assert.equal(r.readyForPublication, false); assert.equal(JSON.stringify(r).includes("PRIVATE_SENTINEL"), false);
  assert.throws(() => validateRuntimeSbomStructure(structuredClone(p), schemaAssets(), FixtureAjv));
});

test("reviewed digest comparison is ordered, exact, immutable and excludes attacker-supplied metadata", () => {
  const records = structuredClone(REVIEWED_RUNTIME_SCHEMA_DIGESTS);
  assert.equal(reviewedRuntimeSchemaDigestsMatch(records), true);
  assert.equal(Object.isFrozen(REVIEWED_RUNTIME_SCHEMA_DIGESTS), true);
  for (const row of REVIEWED_RUNTIME_SCHEMA_DIGESTS) assert.equal(Object.isFrozen(row), true);
  for (const mutate of [a => a.reverse(), a => a.pop(), a => { a[0].bytes++; },
    a => { a[0].sha256 = "a".repeat(64); }, a => { a[0].file = "PRIVATE_SENTINEL"; },
    a => { a[0].extra = "PRIVATE_SENTINEL"; }]) {
    const a = structuredClone(records); mutate(a); assert.equal(reviewedRuntimeSchemaDigestsMatch(a), false);
  }
  for (const value of [null, {}, [null, null, null]]) assert.equal(reviewedRuntimeSchemaDigestsMatch(value), false);
});

test("valid but changed public schema bytes cannot satisfy the reviewed-content route", async () => {
  let calls = 0;
  await assert.rejects(fetchReviewedRuntimeSbomSchemaAssets(async url => {
    const response = new Response(JSON.stringify(schemaAssets()[calls++].schema));
    return { status: 200, url, headers: response.headers, body: response.body };
  }), /^Error: RUNTIME_SBOM_PREVIEW_INCOMPLETE$/);
  assert.equal(calls, 3); // Fixed bounded reads, never a retry or a fourth source.
  const forged = schemaAssets().map((asset, i) => ({ ...asset, ...REVIEWED_RUNTIME_SCHEMA_DIGESTS[i] }));
  assert.equal(validateRuntimeSbomStructure(preview(), forged, FixtureAjv).reviewedSchemaBytesMatched, false);
});

test("framed source metadata fingerprints cover both complete manifests and the exact lock", () => {
  const manifests = { ".": '{"dependencies":{},"description":"PRIVATE_SENTINEL"}', frontend: '{"dependencies":{}}' };
  const digest = runtimeSbomSourceFingerprint("a".repeat(64), manifests);
  assert.match(digest, /^[a-f0-9]{64}$/); assert.equal(digest.includes("PRIVATE_SENTINEL"), false);
  assert.equal(runtimeSbomSourceFingerprint("a".repeat(64), { frontend: manifests.frontend, ".": manifests["."] }), digest);
  assert.notEqual(runtimeSbomSourceFingerprint("b".repeat(64), manifests), digest);
  for (const key of [".", "frontend"]) assert.notEqual(runtimeSbomSourceFingerprint("a".repeat(64), { ...manifests, [key]: manifests[key] + " " }), digest);
  for (const value of [null, {}, { ".": "a", frontend: "b", other: "PRIVATE_SENTINEL" },
    { ".": "a", frontend: "" }, { ".": "a", frontend: "x".repeat(100001) }])
    assert.throws(() => runtimeSbomSourceFingerprint("a".repeat(64), value));
});

// Isolated JSON-as-YAML reader is a test double, not evidence of real parser
// provenance. All dependency directories and links are inside this owned root.
function sourceFixture(t) {
  const { graphs, proof } = fixture(), root = mkdtempSync(join(tmpdir(), "gmai-sbom-preview-test-"));
  t.after(() => rmSync(root, { recursive: true }));
  const store = join(root, "node_modules", ".pnpm"), parser = join(store, "node_modules", "js-yaml");
  mkdirSync(parser, { recursive: true });
  writeFileSync(join(parser, "package.json"), JSON.stringify({ name: "js-yaml", version: "4.3.2", license: "MIT", main: "index.cjs" }));
  writeFileSync(join(parser, "index.cjs"), "module.exports={JSON_SCHEMA:{},load:JSON.parse};\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), JSON.stringify(proof.lock));
  writeFileSync(join(root, ".gitignore"), "outputs/\n");
  for (const importer of [".", "frontend"]) {
    const directory = join(root, importer); mkdirSync(directory, { recursive: true });
    const dependencies = Object.fromEntries(Object.entries(proof.lock.importers[importer].dependencies).map(([name, pin]) => [name, pin.specifier]));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: importer === "." ? "global-market-ai-insight" : "fixture-client", version: "0.1.0", dependencies }));
  }
  for (const row of [...graphs["."], graphs.frontend[0]]) {
    const directory = join(store, `${row.name.replaceAll("/", "+")}@${row.version}`, "node_modules", row.name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name: row.name, version: row.version, license: row.license,
      dependencies: Object.fromEntries(row.dependencies.map(child => [child.name, child.version])) }));
    const links = row.name === "shared-helper" ? [join(store, "node_modules", row.name)] :
      [join(root, row.name === "example-client" ? "frontend" : ".", "node_modules", row.name)];
    for (const link of links) { mkdirSync(join(link, ".."), { recursive: true }); symlinkSync(directory, link, process.platform === "win32" ? "junction" : "dir"); }
  }
  return root;
}

test("real local collection binds both manifests and verifies them before a new ignored write", async t => {
  const root = sourceFixture(t), p = await collectRuntimeSbomPreview(root);
  assert.equal(p.report.runtimeManifestsStable, true); assert.match(p.report.runtimeSourceMetadataSha256, /^[a-f0-9]{64}$/);
  assert.equal(p.report.components, 3); assert.equal(p.report.networkCalls, 0);
  assert.equal(JSON.stringify(p).includes(root), false);
  assert.equal(writeRuntimeSbomPreview(root, p).outputIndependentlyRead, true);
  assert.equal(preview().report.runtimeManifestsStable, false);
});

test("manifest changes during async traversal fail even when the runtime dependency graph is unchanged", async t => {
  for (const importer of [".", "frontend"]) {
    const root = sourceFixture(t), path = join(root, importer, "package.json"), original = readFileSync(path, "utf8");
    const pending = collectRuntimeSbomPreview(root);
    queueMicrotask(() => writeFileSync(path, original + "\n"));
    await assert.rejects(pending, /^Error: RUNTIME_SBOM_PREVIEW_INCOMPLETE$/);
    assert.equal(existsSync(join(root, "outputs")), false);
  }
});

test("manifest or lock changes after collection fail before output directories are created", async t => {
  for (const relative of ["package.json", "frontend/package.json", "pnpm-lock.yaml"]) {
    const root = sourceFixture(t), p = await collectRuntimeSbomPreview(root), path = join(root, relative);
    writeFileSync(path, readFileSync(path, "utf8") + "\n");
    assert.throws(() => writeRuntimeSbomPreview(root, p));
    assert.equal(existsSync(join(root, "outputs")), false);
  }
});

test("source-bound previews cannot be written to a different project even with identical inputs", async t => {
  const root = sourceFixture(t), other = sourceFixture(t), p = await collectRuntimeSbomPreview(root);
  assert.throws(() => writeRuntimeSbomPreview(other, p));
  assert.equal(existsSync(join(other, "outputs")), false);
});

test("UTF-8 BOM changes are not silently stripped from manifest stability checks", async t => {
  for (const importer of [".", "frontend"]) {
    const root = sourceFixture(t), p = await collectRuntimeSbomPreview(root), path = join(root, importer, "package.json");
    writeFileSync(path, "\uFEFF" + readFileSync(path, "utf8"));
    assert.throws(() => writeRuntimeSbomPreview(root, p));
    await assert.rejects(collectRuntimeSbomPreview(root));
    assert.equal(existsSync(join(root, "outputs")), false);
  }
});

test("foreign refs, changed IDs, incomplete assets and schema failures cannot authorize a preview", () => {
  for (const mutate of [a => { a.pop(); }, a => { a.reverse(); }, a => { a[0].schema.$id = "PRIVATE_SENTINEL"; },
    a => { a[0].schema.properties = { private: { $ref: "https://example.invalid/private" } }; },
    a => { a[0].bytes = 500001; }, a => { a[0].sha256 = "PRIVATE_SENTINEL"; },
    a => { a[0].schema.$schema = "http://json-schema.org/draft-04/schema#"; }]) {
    const a = schemaAssets(); mutate(a); assert.throws(() => validateRuntimeSbomStructure(preview(), a, FixtureAjv));
  }
  for (const Ajv of [class { constructor() { throw new Error("PRIVATE_SENTINEL"); } },
    class extends FixtureAjv { compile() { return () => false; } }]) {
    assert.throws(() => validateRuntimeSbomStructure(preview(), schemaAssets(), Ajv), error =>
      error.message === "RUNTIME_SBOM_PREVIEW_INCOMPLETE" && !error.message.includes("PRIVATE_SENTINEL"));
  }
});

test("schema downloads are fixed public GET-like reads with no credentials, redirects or private payload", async () => {
  const calls = [], assets = schemaAssets();
  const result = await fetchRuntimeSbomSchemaAssets(async (url, options) => {
    calls.push({ url, options }); const source = assets[calls.length - 1];
    const response = new Response(JSON.stringify(source.schema));
    return { status: 200, url, headers: response.headers, body: response.body };
  });
  assert.equal(calls.length, 3); assert.equal(result.length, 3);
  assert.equal(Object.isFrozen(result[0]), true); assert.equal(Object.isFrozen(result[0].schema), true);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith("https://raw.githubusercontent.com/CycloneDX/specification/master/schema/"));
    assert.equal(options.redirect, "error"); assert.deepEqual(options.headers, { Accept: "application/json" });
    assert.equal(options.body, undefined); assert.equal(options.credentials, undefined);
  }
});

test("early rejected responses are cancelled rather than leaving a download body active", async () => {
  for (const kind of ["status", "redirect", "length"]) {
    let cancelled = 0;
    await assert.rejects(fetchRuntimeSbomSchemaAssets(async url => ({
      status: kind === "status" ? 403 : 200, url: kind === "redirect" ? "https://example.invalid/private" : url,
      headers: new Headers(kind === "length" ? { "content-length": "500001" } : {}),
      body: new ReadableStream({ cancel() { cancelled++; } }),
    })));
    assert.equal(cancelled, 1);
  }
});

test("failed, redirected, oversized or malformed public schemas fail without retries or file writes", async () => {
  for (const mutate of [r => { r.status = 403; }, r => { r.url = "https://example.invalid/private"; },
    r => { r.headers = new Headers({ "content-length": "500001" }); },
    r => { r.body = new Response("not-json").body; }, r => { r.body = null; }]) {
    let calls = 0;
    await assert.rejects(fetchRuntimeSbomSchemaAssets(async url => {
      calls++; const response = new Response(JSON.stringify(schemaAssets()[0].schema));
      const r = { status: 200, url, headers: response.headers, body: response.body }; mutate(r); return r;
    }));
    assert.equal(calls, 1);
  }
});

test("SBOM plan has zero reads, writes, external requests and publication", () => {
  const p = runtimeSbomPreviewPlan();
  for (const key of ["awsCalls", "networkCalls", "filesWritten", "installedGraphReads"]) assert.equal(p[key], 0);
  assert.equal(p.historicalSbomRead, false); assert.equal(p.historicalSbomModified, false);
  assert.equal(p.uploaded, false); assert.equal(p.readyForPublication, false);
  for (const args of [["--execute"], ["--push"], ["--output", "PRIVATE_SENTINEL"]]) assert.throws(() => runtimeSbomPreviewPlan(args));
});

test("preview deduplicates two runtime roots and links only exact known components", () => {
  const p = preview(); assert.equal(p.report.backendPackages, 2); assert.equal(p.report.frontendPackages, 2);
  assert.equal(p.report.components, 3); assert.equal(p.report.dependencyEdges, 4);
  assert.equal(p.bom.bomFormat, "CycloneDX"); assert.equal(p.bom.specVersion, "1.6");
  const known = new Set([p.bom.metadata.component["bom-ref"], ...p.bom.components.map(c => c["bom-ref"])]);
  assert.equal(known.size, 4); assert.equal(p.bom.dependencies.length, 4);
  for (const row of p.bom.dependencies) { assert.ok(known.has(row.ref)); assert.ok(row.dependsOn.every(key => known.has(key))); }
  assert.equal(p.report.exactEmittedModulesVerified, false); assert.equal(p.report.imageOrOsCoverageVerified, false);
  assert.equal(p.report.licenseDocumentsIncluded, false); assert.equal(p.report.fullCycloneDxSchemaValidated, false);
  assert.equal(p.report.licenseObligationsVerified, false); assert.equal(p.report.readyForPublication, false);
});

test("explicit allowlisted serialization omits contacts, URLs, descriptions, raw documents and private paths", () => {
  const f = fixture();
  for (const row of [...f.graphs["."], ...f.graphs.frontend]) Object.assign(row, {
    email: "PRIVATE_SENTINEL", repository: "PRIVATE_SENTINEL", description: "PRIVATE_SENTINEL",
    rawNotice: "PRIVATE_SENTINEL", absolutePath: "PRIVATE_SENTINEL", privateField: "PRIVATE_SENTINEL",
  });
  const p = buildRuntimeSbomPreview(f.proof, f.graphs);
  assert.equal(JSON.stringify(p).includes("PRIVATE_SENTINEL"), false);
  for (const component of p.bom.components) assert.deepEqual(Object.keys(component), ["type", "bom-ref", "name", "version", "licenses"]);
  assert.deepEqual(Object.keys(p.bom.metadata), ["component"]);
});

test("output is deterministic despite traversal order and source objects cannot mutate the artifact", () => {
  const f = fixture(), a = buildRuntimeSbomPreview(f.proof, f.graphs);
  f.graphs["."].reverse(); f.graphs.frontend.reverse();
  const b = buildRuntimeSbomPreview(f.proof, f.graphs); assert.deepEqual(a, b);
  f.graphs["."][0].license = "PRIVATE_SENTINEL";
  assert.equal(JSON.stringify(a).includes("PRIVATE_SENTINEL"), false);
  assert.throws(() => { a.bom.components[0].name = "PRIVATE_SENTINEL"; });
  assert.throws(() => { a.bom.metadata.authors = ["PRIVATE_SENTINEL"]; });
});

test("changed, absent, non-registry or unpinned identities cannot form a preview", () => {
  for (const mutate of [f => { f.proof.lockfileSha256 = "PRIVATE_SENTINEL"; }, f => { delete f.proof.lock.packages["shared-helper@2.0.0"]; },
    f => { f.proof.lock.packages["shared-helper@2.0.0"].resolution.tarball = "PRIVATE_SENTINEL"; },
    f => { f.proof.lock.packages["shared-helper@2.0.0"].resolution.integrity = "PRIVATE_SENTINEL"; },
    f => { f.proof.lock.importers["."].dependencies["@example/server"].specifier = "^1.2.3"; },
    f => { f.proof.lock.snapshots["@example/server@1.2.3"].dependencies["shared-helper"] = "9.0.0"; }]) {
    const f = fixture(); mutate(f); assert.throws(() => buildRuntimeSbomPreview(f.proof, f.graphs));
  }
});

test("declared peer edges are included only for an exact already present resolved identity", () => {
  const f = fixture();
  f.graphs.frontend.push(structuredClone(f.graphs["."][0]));
  f.proof.lock.packages["example-client@3.4.5"].peerDependencies = { "@example/server": "^1.2.3" };
  f.proof.lock.snapshots["example-client@3.4.5"].dependencies["@example/server"] = "1.2.3";
  const p = buildRuntimeSbomPreview(f.proof, f.graphs);
  assert.equal(p.report.resolvedDeclaredPeerEdgesIncluded, true);
  assert.equal(p.report.optionalOrUninstalledGraphCoverageVerified, false);
  assert.ok(p.bom.dependencies.find(row => row.ref === "npm:example-client@3.4.5").dependsOn.includes("npm:@example/server@1.2.3"));
  delete f.proof.lock.packages["example-client@3.4.5"].peerDependencies;
  assert.throws(() => buildRuntimeSbomPreview(f.proof, f.graphs));
  f.proof.lock.packages["example-client@3.4.5"].peerDependencies = { "@example/server": "^1.2.3" };
  f.proof.lock.snapshots["example-client@3.4.5"].dependencies["@example/server"] = "9.0.0";
  assert.throws(() => buildRuntimeSbomPreview(f.proof, f.graphs));
});

test("duplicates, dangling or unreachable dependencies, inconsistent copies and unexpected licenses fail closed", () => {
  for (const mutate of [f => { f.graphs["."].push(f.graphs["."][0]); },
    f => { f.graphs["."][0].dependencies.push(f.graphs["."][0].dependencies[0]); },
    f => { f.graphs["."][0].dependencies[0].version = "9.0.0"; },
    f => { f.graphs.frontend[1].license = "ISC"; }, f => { f.graphs["."][0].license = "MPL-2.0"; },
    f => { f.graphs["."].push({ name: "unreachable", version: "1.0.0", license: "MIT", dependencies: [] });
      f.proof.lock.packages["unreachable@1.0.0"] = f.proof.lock.packages["shared-helper@2.0.0"]; f.proof.lock.snapshots["unreachable@1.0.0"] = {}; },
    f => { f.graphs["."][0].name = "PRIVATE SENTINEL"; }, f => { f.graphs.frontend[0].version = "PRIVATE_SENTINEL"; }]) {
    const f = fixture(); mutate(f); assert.throws(() => buildRuntimeSbomPreview(f.proof, f.graphs));
  }
});

test("unbranded or cloned packets cannot write arbitrary content or even create output directories", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-sbom-preview-test-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    for (const value of [null, {}, { bom: { secret: "PRIVATE_SENTINEL" }, report: {} }, structuredClone(preview())])
      assert.throws(() => writeRuntimeSbomPreview(root, value));
    assert.deepEqual(readdirSync(root), [".gitignore"]);
  } finally { rmSync(root, { recursive: true }); }
});

test("owned ignored output writes exact new files, rereads them and preserves existing artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-sbom-preview-test-"));
  try {
    writeFileSync(join(root, ".gitignore"), "outputs/\n"); const p = preview();
    const a = writeRuntimeSbomPreview(root, p), b = writeRuntimeSbomPreview(root, p);
    assert.notEqual(a.previewId, b.previewId); assert.equal(a.filesWritten, 1); assert.equal(a.outputIndependentlyRead, true);
    const directory = join(root, "outputs", "sbom-previews"); assert.equal(readdirSync(directory).length, 2);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, `${a.previewId}.cdx.json`), "utf8")), p.bom);
    assert.equal(a.uploaded, false); assert.equal(a.readyForPublication, false);
  } finally { rmSync(root, { recursive: true }); }
});

test("unignored or linked output roots cannot redirect a preview write", () => {
  const root = mkdtempSync(join(tmpdir(), "gmai-sbom-preview-test-"));
  const other = mkdtempSync(join(tmpdir(), "gmai-sbom-preview-test-"));
  try {
    writeFileSync(join(root, ".gitignore"), "other/\n"); assert.throws(() => writeRuntimeSbomPreview(root, preview()));
    writeFileSync(join(root, ".gitignore"), "outputs/\n");
    symlinkSync(other, join(root, "outputs"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => writeRuntimeSbomPreview(root, preview())); assert.deepEqual(readdirSync(other), []);
  } finally { rmSync(root, { recursive: true }); rmSync(other, { recursive: true }); }
});

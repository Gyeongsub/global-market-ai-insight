import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { cleanSourceChildEnvironment } from "../clean-source-build-proof.mjs";
import { readLocalDependencyLock } from "../dependency-license-inventory.mjs";
import { ADVISORY_PUBLIC_ENDPOINT, ADVISORY_REVIEWED_LOCK_SHA256, buildLockedAdvisoryTargets,
  collectRegistryAdvisoryProof, evaluateRegistryAdvisories } from "../registry-advisory-proof.mjs";

const root = resolve("."), integrity = "sha512-" + "a".repeat(86) + "==";
const semver = createRequire(resolve("node_modules/.pnpm/node_modules/semver/package.json"))("semver");
const range = { valid: version => semver.valid(version) === version, validRange: value => semver.validRange(value) !== null,
  satisfies: (version, value) => semver.satisfies(version, value, { includePrerelease: true }) };
const lock = entries => ({ lockfileVersion: "9.0", packages: Object.fromEntries(entries.map(key => [key, { resolution: { integrity } }])) });
const targets = () => buildLockedAdvisoryTargets(lock(["source-map-js@1.2.1", "source-map-js@1.2.2", "source-map-js@1.2.3-beta.2", "@synthetic/runtime@1.0.0"]));
const advisory = (changes = {}) => ({ id: 123, severity: "high", vulnerable_versions: ">=1.0.0 <1.2.2",
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc", title: "PRIVATE_SERVER_TITLE", ...changes });
const evaluate = response => evaluateRegistryAdvisories(targets(), response, [{ name: "@synthetic/runtime", version: "1.0.0" }], range);

test("coordinate body includes only exact public-package versions, never workspace names, source or importers", () => {
  const candidate = buildLockedAdvisoryTargets({ ...lock(["@synthetic/public@1.0.0", "public@1.2.3-beta.2", "public@1.2.4"]),
    importers: { PRIVATE_WORKSPACE_NAME: { dependencies: { PRIVATE: "SECRET" } } } });
  assert.equal(candidate.rows.length, 3); assert.deepEqual(candidate.payload.public, ["1.2.3-beta.2", "1.2.4"]);
  assert.equal(JSON.stringify(candidate).includes("PRIVATE"), false); assert.equal(candidate.body.includes("SECRET"), false);
  assert.match(candidate.coordinatesSha256, /^[a-f0-9]{64}$/);
});

test("unsupported dependency resolutions and ambiguous version strings cannot be sent to the registry", () => {
  for (const bad of [null, {}, lock([]), lock(["private@file:../PRIVATE"]), lock(["private@^1.2.3"]),
    lock(["private@1.2.3+UNREVIEWED"]), lock(["../PRIVATE@1.2.3"]), lock(["public@1.2.3"])] ) {
    if (bad?.packages?.["public@1.2.3"]) bad.packages["public@1.2.3"].resolution.tarball = "https://private.invalid/";
    assert.throws(() => buildLockedAdvisoryTargets(bad), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
  }
  const large = lock(Array.from({ length: 1001 }, (_, i) => `public@1.2.${i}`));
  assert.throws(() => buildLockedAdvisoryTargets(large), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
});

test("valid keyed advisories distinguish affected identities from declared runtime and omit arbitrary server fields", () => {
  const report = evaluate({ "source-map-js": [advisory()] });
  assert.equal(report.lockedIdentities, 4); assert.equal(report.declaredRuntimeIdentities, 1);
  assert.equal(report.matchingAdvisories, 1); assert.equal(report.severityCounts.high, 1);
  assert.equal(report.affectedLockedIdentities, 1); assert.equal(report.affectedDeclaredRuntimeIdentities, 0);
  assert.deepEqual(report.findings[0].affectedVersions, ["1.2.1"]);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SERVER_TITLE"), false);
  assert.equal(report.metavulnerabilityPropagationComputed, false); assert.equal(report.matchesAreNotNpmAuditCliTotals, true);
  assert.equal(report.futureSafetyGuaranteed, false); assert.equal(report.readyForPublication, false);
});

test("empty verified responses and nonmatching records remain dated snapshots, not image scans or future guarantees", () => {
  const clean = evaluate({}); assert.equal(clean.matchingAdvisories, 0); assert.equal(clean.returnedAdvisories, 0);
  assert.equal(clean.advisoryStatus, "verified-registry-snapshot"); assert.equal(clean.containerImageScanned, false);
  const fixed = evaluate({ "source-map-js": [advisory({ vulnerable_versions: "<1.0.0" })] });
  assert.equal(fixed.returnedAdvisories, 1); assert.equal(fixed.matchingAdvisories, 0);
});

test("the October 31 minimatch range keeps both development matches without a reachability waiver", () => {
  const targets = buildLockedAdvisoryTargets(lock(["minimatch@3.1.5", "minimatch@10.2.6", "@synthetic/runtime@1.0.0"]));
  const report = evaluateRegistryAdvisories(targets, { minimatch: [{ id: 1244012,
    severity: "moderate", vulnerable_versions: "<11.0.1",
    url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }] },
  [{ name: "@synthetic/runtime", version: "1.0.0" }], range);
  assert.equal(report.matchingAdvisories, 1);
  assert.equal(report.severityCounts.moderate, 1);
  assert.equal(report.affectedLockedIdentities, 2);
  assert.equal(report.affectedDeclaredRuntimeIdentities, 0);
  assert.deepEqual(report.findings[0].affectedVersions, ["10.2.6", "3.1.5"]);
  assert.equal(report.remediationAutomaticallyApplied, false);
  assert.equal(report.readyForPublication, false);
});

test("runtime matches and prerelease coordinates are evaluated conservatively rather than silently skipped", () => {
  const report = evaluateRegistryAdvisories(targets(), { "source-map-js": [advisory({ vulnerable_versions: ">=1.2.0 <1.2.4" })] },
    [{ name: "source-map-js", version: "1.2.1" }], range);
  assert.equal(report.affectedLockedIdentities, 3); assert.equal(report.affectedDeclaredRuntimeIdentities, 1);
  assert.equal(report.declaredRuntimeSeverityCounts.high, 1); assert.equal(report.prereleaseRangeEvaluation, "conservative-include");
});

test("supplied package-name disagreement, unknown packages, malformed severity/ranges/URLs and duplicate records fail closed", () => {
  for (const changes of [{ name: "PRIVATE_NAME" }, { id: -1 }, { id: 1.5 }, { severity: "PRIVATE_SEVERITY" },
    { vulnerable_versions: "" }, { vulnerable_versions: "PRIVATE_VALUE" }, { vulnerable_versions: "x".repeat(257) },
    { vulnerable_versions: "file:PRIVATE" }, { url: "http://github.com/advisories/GHSA-aaaa-bbbb-cccc" },
    { url: "https://private.invalid/" }, { url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc?private=1" }])
    assert.throws(() => evaluate({ "source-map-js": [advisory(changes)] }), /^Error: REGISTRY_ADVISORY_PROOF_INCOMPLETE$/);
  assert.doesNotThrow(() => evaluate({ "source-map-js": [advisory({ name: "source-map-js" })] }));
  for (const invalid of [null, [], new Date(), { PRIVATE_PACKAGE: [] }, { "source-map-js": {} },
    { "source-map-js": [advisory(), advisory()] }]) assert.throws(() => evaluate(invalid), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
});

test("row/payload disagreement, extra disclosure coordinates and unbound runtime rows cannot yield a clean snapshot", () => {
  for (const mutate of [t => { t.rows.push(t.rows[0]); }, t => { t.payload.PRIVATE_COORDINATE = ["1.0.0"]; },
    t => { t.payload["source-map-js"].push("9.9.9"); }, t => { t.rows[0].version = "01.2.3"; }]) {
    const candidate = targets(); mutate(candidate);
    assert.throws(() => evaluateRegistryAdvisories(candidate, {}, [], range), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
  }
  assert.throws(() => evaluateRegistryAdvisories(targets(), {}, [{ name: "PRIVATE_RUNTIME", version: "1.0.0" }], range), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
});

test("actual reviewed lock retains all 392 identities including the two prereleases and pinned security repairs", () => {
  const proof = readLocalDependencyLock(root); assert.equal(proof.lockfileSha256, ADVISORY_REVIEWED_LOCK_SHA256);
  const all = buildLockedAdvisoryTargets(proof.lock); assert.equal(all.rows.length, 392);
  assert.equal(all.rows.filter(row => row.version.includes("-")).length, 2);
  assert.deepEqual(all.payload["source-map-js"], ["1.2.2"]);
  assert.deepEqual(all.payload.vite,["8.2.4"]);
  assert.deepEqual(all.payload.rolldown,["1.2.14"]);
  assert.deepEqual(all.payload.zod,["4.6.6"]);
  assert.equal(proof.lock.overrides["zod@4.4.3"], "4.6.6");
});

test("collector sends one credential-free fixed query, does not disclose paths/project metadata and reports response-byte binding", async () => {
  let calls = 0;
  const report = await collectRegistryAdvisoryProof(root, async (url, options) => {
    calls++; assert.equal(url, ADVISORY_PUBLIC_ENDPOINT); assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(options.headers).sort(), ["Accept", "Content-Type"]);
    const body = JSON.parse(options.body); assert.deepEqual(body["source-map-js"], ["1.2.2"]);
    assert.equal(Object.values(body).flat().length, 392);
    for (const forbidden of [root, "global-market-ai-insight", "AWS_PROFILE", "importers", "dependencies"]) assert.equal(options.body.includes(forbidden), false);
    return new Response("{}");
  });
  assert.equal(calls, 1); assert.equal(report.publicRegistryRequests, 1); assert.equal(report.declaredRuntimeIdentities, 37);
  assert.equal(report.privateProjectMetadataSent, false); assert.equal(report.onlyReviewedPublicCoordinatesSent, true);
  assert.match(report.registryResponseSha256, /^[a-f0-9]{64}$/); assert.match(report.observedAtUtc, /^\d{4}-\d{2}-\d{2}T/);
  for (const field of ["packagesInstalled", "filesWritten", "awsCalls"]) assert.equal(report[field], 0);
  assert.equal(report.packageLifecycleScriptsRun, false); assert.equal(report.uploaded, false);
});

test("changed lock or unreviewed private coordinates stop before network access", async t => {
  const fixture = mkdtempSync(join(tmpdir(), "gmai-advisory-proof-")); t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const parserSource = realpathSync(join(root, "node_modules", ".pnpm", "node_modules", "js-yaml"));
  const destination = join(fixture, "node_modules", ".pnpm", "node_modules", "js-yaml");
  mkdirSync(dirname(destination), { recursive: true }); cpSync(parserSource, destination, { recursive: true });
  copyFileSync(join(root, "pnpm-lock.yaml"), join(fixture, "pnpm-lock.yaml"));
  writeFileSync(join(fixture, "pnpm-lock.yaml"), readFileSync(join(fixture, "pnpm-lock.yaml"), "utf8") + "\n# changed-coordinate-review-required\n");
  let calls = 0; await assert.rejects(collectRegistryAdvisoryProof(fixture, async () => { calls++; return new Response("{}"); }),
    /^Error: REGISTRY_ADVISORY_PROOF_INCOMPLETE$/); assert.equal(calls, 0);
});

test("network, status, redirect, oversized and invalid UTF-8/JSON errors remain unknown with no private fallback", async () => {
  for (const factory of [() => { throw Error("PRIVATE_NETWORK_ERROR"); }, () => new Response("{}", { status: 403 }),
    () => new Response("{}", { status: 302 }), () => new Response("{}", { headers: { "content-length": "2000001" } }),
    () => new Response("{}", { headers: { "content-length": "PRIVATE_LENGTH" } }), () => new Response("PRIVATE_INVALID_JSON"),
    () => new Response(Uint8Array.of(255)), () => new Response("")]) {
    let calls = 0; await assert.rejects(collectRegistryAdvisoryProof(root, async () => { calls++; return factory(); }),
      /^Error: REGISTRY_ADVISORY_PROOF_INCOMPLETE$/); assert.equal(calls, 1);
  }
  const response = new Response("{}"); Object.defineProperty(response, "url", { value: "https://private.invalid/" });
  await assert.rejects(collectRegistryAdvisoryProof(root, async () => response), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
});

test("oversized streaming advisory responses cancel the reader instead of becoming a zero-finding report", async () => {
  let canceled = false, emitted = 0;
  const stream = new ReadableStream({ pull(controller) { if (emitted++ < 22) controller.enqueue(new Uint8Array(100_000)); else controller.close(); },
    cancel() { canceled = true; } });
  await assert.rejects(collectRegistryAdvisoryProof(root, async () => new Response(stream)), /REGISTRY_ADVISORY_PROOF_INCOMPLETE/);
  assert.equal(canceled, true);
});

test("rejected advisory response headers cancel unread streams without a second request", async () => {
  for (const options of [{ status: 403 }, { headers: { "content-length": "2000001" } }]) {
    let canceled = false, calls = 0;
    const stream = new ReadableStream({ cancel() { canceled = true; } });
    await assert.rejects(collectRegistryAdvisoryProof(root, async () => {
      calls++; return new Response(stream, options);
    }), /^Error: REGISTRY_ADVISORY_PROOF_INCOMPLETE$/);
    assert.equal(calls, 1); assert.equal(canceled, true);
  }
});

test("the corrected source-map version handles an extreme indexed-map offset in a bounded credential-free child", () => {
  const requireFrontend = createRequire(join(root, "frontend", "package.json"));
  const vite = requireFrontend.resolve("vite/package.json"), postcss = createRequire(vite).resolve("postcss/package.json");
  const patched = createRequire(postcss).resolve("source-map-js/package.json"), metadata = JSON.parse(readFileSync(patched, "utf8"));
  assert.equal(metadata.version, "1.2.2"); assert.equal(metadata.license, "BSD-3-Clause");
  const script = 'try{const{SourceNode,SourceMapConsumer}=require("source-map-js");const map=line=>({version:3,file:"synthetic.js",sections:[{offset:{line,column:0},map:{version:3,sources:["synthetic.ts"],names:[],mappings:"AAAA",sourcesContent:["x"]}}]});const preserved=[0,9999999].every(line=>SourceNode.fromStringWithSourceMap("x",new SourceMapConsumer(map(line))).toString()==="x");let rejected=false;try{new SourceMapConsumer(map(1000000000000));}catch(e){rejected=e.message==="Section offset line must not exceed 10000000.";}console.log(JSON.stringify({completed:true,generatedBytesPreserved:preserved,extremeOffsetRejected:rejected}));}catch{console.error("PATCH_PROOF_INCOMPLETE");process.exitCode=1;}';
  const child = spawnSync(process.execPath, ["--max-old-space-size=64", "-e", script], { cwd: dirname(patched),
    env: cleanSourceChildEnvironment(process.env), timeout: 3000, maxBuffer: 20_000, encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0); assert.equal(child.signal, null); assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), { completed: true, generatedBytesPreserved: true, extremeOffsetRejected: true });
});

test("advisory CLI has zero requests by default and rejects upload, alternate hosts and arbitrary coordinate input", () => {
  const plan = spawnSync(process.execPath, ["scripts/registry-advisory-proof.mjs"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(plan.status, 0); const report = JSON.parse(plan.stdout); assert.equal(report.publicRegistryRequests, 0);
  assert.equal(report.changedLockRequiresCoordinateReview, true); assert.equal(report.privateMetadataFallbackAllowed, false);
  for (const args of [["--registry", "PRIVATE_DESTINATION"], ["--upload"], ["--execute-public-query", "PRIVATE_INPUT"]]) {
    const result = spawnSync(process.execPath, ["scripts/registry-advisory-proof.mjs", ...args], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr.includes("PRIVATE"), false);
    const failure = JSON.parse(result.stderr); assert.equal(failure.advisoryStatus, "unknown"); assert.equal(failure.readyForPublication, false);
  }
});

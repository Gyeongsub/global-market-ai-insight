import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { readLocalDependencyLock } from "../dependency-license-inventory.mjs";
import { MISSING_PUBLIC_LICENSE_READ_LIMIT, collectPublishedMissingLicenseMetadata,
  selectMissingLicenseTargets, verifyPublishedLicenseMetadata } from "../published-license-metadata.mjs";

const root = resolve("."), integrity = "sha512-" + "a".repeat(86) + "==";
const target = { name: "@synthetic/native-arch", version: "1.2.3", integrity };
function fixtures() {
  return { lock: { lockfileVersion: "9.0", packages: { "@synthetic/native-arch@1.2.3": { resolution: { integrity } },
    "synthetic-runtime@1.0.0": { resolution: { integrity } } } },
  inventory: { mode: "local-lock-aligned-license-metadata-inventory", awsCalls: 0, networkCalls: 0,
    lockPackageIdentities: 2, metadataAvailable: 1, metadataMissingOrConflicting: 1, lockMetadataComplete: false,
    unresolved: [{ name: target.name, version: target.version, state: "missing-installed-metadata" }],
    licenseExpressionCounts: { MIT: 1 }, readyForPublication: false } };
}
function metadata(selected = target, changes = {}) {
  return { name: selected.name, version: selected.version, license: "MIT", authors: ["PRIVATE_SERVER_FIELD"],
    dist: { integrity: selected.integrity, tarball: `https://registry.npmjs.org/${selected.name}/-/${selected.name.split("/").at(-1)}-${selected.version}.tgz` }, ...changes };
}
const bytes = value => Buffer.from(JSON.stringify(value));

test("only missing installed declarations may be augmented and the selector preserves the reviewed lock identity", () => {
  const f = fixtures(); assert.deepEqual(selectMissingLicenseTargets(f.lock, f.inventory), [target]);
  assert.equal(f.inventory.unresolved[0].state, "missing-installed-metadata"); assert.equal(f.inventory.lockMetadataComplete, false);
  assert.equal(MISSING_PUBLIC_LICENSE_READ_LIMIT, 64);
});

test("conflicting local metadata, unbound identities, duplicated rows and inconsistent counts stop before publication lookup", () => {
  for (const changes of [{ mode: "PRIVATE_MODE" }, { awsCalls: 1 }, { networkCalls: 1 }, { lockPackageIdentities: 3 },
    { metadataAvailable: 2 }, { metadataMissingOrConflicting: 0 }, { lockMetadataComplete: true }, { readyForPublication: true },
    { licenseExpressionCounts: { MIT: 2 } }, { licenseExpressionCounts: [1] }, { unresolved: [null] },
    { unresolved: [{ ...target, state: "missing-or-conflicting-license" }] },
    { unresolved: [{ name: "PRIVATE_COORDINATE", version: "1.2.3", state: "missing-installed-metadata" }] }]) {
    const f = fixtures(); assert.throws(() => selectMissingLicenseTargets(f.lock, { ...f.inventory, ...changes }), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
  }
  const f = fixtures(); f.inventory.unresolved.push(f.inventory.unresolved[0]);
  assert.throws(() => selectMissingLicenseTargets(f.lock, f.inventory), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
});

test("missing-platform requests are bounded before any network activity", () => {
  const f = fixtures();
  const rows = Array.from({ length: 65 }, (_, i) => ({ name: `synthetic-arch-${i}`, version: "1.0.0", state: "missing-installed-metadata" }));
  f.lock.packages = Object.fromEntries(rows.map(row => [`${row.name}@${row.version}`, { resolution: { integrity } }]));
  Object.assign(f.inventory, { lockPackageIdentities: 65, metadataAvailable: 0, metadataMissingOrConflicting: 65,
    licenseExpressionCounts: {}, unresolved: rows });
  assert.throws(() => selectMissingLicenseTargets(f.lock, f.inventory), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
});

test("publisher declaration binds name, exact version, canonical archive and integrity but never claims installed bytes or legal rights", () => {
  const meta = metadata(), report = verifyPublishedLicenseMetadata(target, meta, bytes(meta));
  assert.equal(report.licenseExpression, "MIT"); assert.equal(report.declaredIntegrityMatchesLock, true);
  assert.match(report.publicMetadataSha256, /^[a-f0-9]{64}$/); assert.equal(JSON.stringify(report).includes("PRIVATE_SERVER_FIELD"), false);
  for (const field of ["installedPackagePresent", "archiveOrNoticeBytesVerified", "legalApproval", "readyForPublication"]) assert.equal(report[field], false);
});

test("changed identity/integrity, unreviewable declaration text and mismatched raw JSON cannot masquerade as an exact publisher record", () => {
  const original = metadata();
  for (const changes of [{ name: "PRIVATE_NAME" }, { version: "1.2.4" }, { license: "" }, { license: { type: "MIT" } },
    { license: "PRIVATE\nLICENSE" }, { license: "https://private.invalid/" }, { license: "__proto__" }, { license: "constructor" },
    { license: "X".repeat(129) }, { dist: { ...original.dist, integrity: "sha512-INVALID" } },
    { dist: { ...original.dist, tarball: "https://private.invalid/" } }]) {
    const meta = { ...original, ...changes }; assert.throws(() => verifyPublishedLicenseMetadata(target, meta, bytes(meta)), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
  }
  assert.throws(() => verifyPublishedLicenseMetadata(target, original, bytes({ ...original, license: "BSD-3-Clause" })), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
  assert.throws(() => verifyPublishedLicenseMetadata({ ...target, name: "../PRIVATE" }, original, bytes(original)), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
});

test("50 synthetic public declarations complete only mixed-source metadata, not installed/source/notice coverage", async () => {
  const { lock } = readLocalDependencyLock(root); let calls = 0;
  const report = await collectPublishedMissingLicenseMetadata(root, async (url, options) => {
    calls++; const parsed = new URL(url), [name, version] = parsed.pathname.slice(1).split("/").map(decodeURIComponent);
    assert.equal(parsed.origin, "https://registry.npmjs.org"); assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    assert.deepEqual(Object.keys(options.headers), ["Accept"]); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.method, undefined); assert.equal(options.body, undefined);
    const selected = { name, version, integrity: lock.packages[`${name}@${version}`].resolution.integrity };
    return new Response(JSON.stringify(metadata(selected)));
  });
  assert.equal(calls, 50); assert.equal(report.publicRegistryRequests, 50); assert.equal(report.localInstalledDeclarations, 342);
  assert.equal(report.publishedMissingDeclarations, 50); assert.equal(report.lockPackageIdentities, 392); assert.equal(report.mixedSourceMetadataComplete, true);
  assert.equal(Object.values(report.licenseExpressionCounts).reduce((sum, count) => sum + count, 0), 392);
  assert.equal(report.localInventoryUnknownsNotOverwritten, true); assert.equal(report.installedMetadataComplete, false);
  for (const field of ["completeLegalProvenanceVerified", "fullDevelopmentNoticeCoverageVerified", "otherPlatformBinaryOrSourceInspected",
    "installedPackagesChanged", "downloadedPackageCodeExecuted", "uploaded", "readyForPublication"]) assert.equal(report[field], false);
  for (const field of ["awsCalls", "filesWritten", "packagesInstalled", "archiveDownloads"]) assert.equal(report[field], 0);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SERVER_FIELD"), false); assert.equal(JSON.stringify(report).includes(root), false);
});

test("rejected publisher headers cancel unread streams and cannot produce partial completeness", async () => {
  for (const options of [{ status: 403 }, { headers: { "content-length": "100001" } }]) {
    let canceled = false, calls = 0;
    const stream = new ReadableStream({ cancel() { canceled = true; } });
    await assert.rejects(collectPublishedMissingLicenseMetadata(root, async () => {
      calls++; return new Response(stream, options);
    }), /^Error: PUBLISHED_LICENSE_METADATA_INCOMPLETE$/);
    assert.equal(calls, 1); assert.equal(canceled, true);
  }
});

test("failed, redirected, oversized or invalid publisher metadata stops at the first request without partial completeness", async () => {
  for (const factory of [() => { throw Error("PRIVATE_NETWORK_ERROR"); }, () => new Response("{}", { status: 403 }),
    () => new Response("{}", { status: 302 }), () => new Response("{}", { headers: { "content-length": "100001" } }),
    () => new Response("{}", { headers: { "content-length": "PRIVATE_LENGTH" } }), () => new Response("PRIVATE_JSON"),
    () => new Response(Uint8Array.of(255)), () => new Response("{}"), () => new Response("")]) {
    let calls = 0; await assert.rejects(collectPublishedMissingLicenseMetadata(root, async () => { calls++; return factory(); }),
      /^Error: PUBLISHED_LICENSE_METADATA_INCOMPLETE$/); assert.equal(calls, 1);
  }
  const response = new Response("{}"); Object.defineProperty(response, "url", { value: "https://private.invalid/" });
  await assert.rejects(collectPublishedMissingLicenseMetadata(root, async () => response), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
});

test("excess streaming metadata is canceled rather than read indefinitely or reported as verified", async () => {
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(100_001)); }, cancel() { canceled = true; } });
  await assert.rejects(collectPublishedMissingLicenseMetadata(root, async () => new Response(stream)), /PUBLISHED_LICENSE_METADATA_INCOMPLETE/);
  assert.equal(canceled, true);
});

test("publisher CLI defaults to zero requests and refuses caller coordinates, installation, uploads and alternate registries", () => {
  const plan = spawnSync(process.execPath, ["scripts/published-license-metadata.mjs"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(plan.status, 0); const report = JSON.parse(plan.stdout); assert.equal(report.publicRegistryRequests, 0);
  assert.equal(report.missingMetadataReadsMax, 64); assert.equal(report.installedLicenseConflictFallbackAllowed, false);
  for (const args of [["--registry", "PRIVATE_DESTINATION"], ["--install"], ["--execute-public-metadata", "PRIVATE_TARGET"]]) {
    const result = spawnSync(process.execPath, ["scripts/published-license-metadata.mjs", ...args], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, ""); assert.equal(result.stderr.includes("PRIVATE"), false);
    const failure = JSON.parse(result.stderr); assert.equal(failure.declarationStatus, "unknown"); assert.equal(failure.readyForPublication, false);
  }
});

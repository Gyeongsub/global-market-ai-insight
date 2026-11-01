import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { readLocalDependencyLock } from "../dependency-license-inventory.mjs";
import { PUBLISHED_LICENSE_TARGETS } from "../published-license-proof.mjs";
import { REVIEWED_REGISTRY_KEY_ID, verifyReviewedRegistryKeys } from "../registry-signature-proof.mjs";
import { runtimeRegistrySignaturePlan, classifyRuntimeRegistrySignature, collectRuntimeRegistrySignatures } from "../runtime-registry-signatures.mjs";

// Public registry fixture only, not a credential or private signing key.
const key = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==";
const sig = "MEUCIQDy+Nf4+fCSZ0LrG58RfbIGGiC90s3NzsuOrrSobJGabwIgAe4qUEah5Ykbs02HxegFC42o5jV+aJ2oWXSoQ+kEIrI=";
const integrity = "sha512-X98zYOrVOeuosCX+6ktf29FC2N2GHPLia7qv6mzPzTc+RPAuHWCDS++Z6JK7eGYqb/v6uaW7bAXaOvDBfol+0w==";
const target = { ...PUBLISHED_LICENSE_TARGETS[0], integrity };
const unknown = "SHA256:" + "a".repeat(43);
const keys = () => ({ keys: [{ expires: null, keyid: REVIEWED_REGISTRY_KEY_ID, keytype: "ecdsa-sha2-nistp256",
  scheme: "ecdsa-sha2-nistp256", key }] });
const proof = () => verifyReviewedRegistryKeys(keys());
const metadata = (t = target) => ({ name: t.name, version: t.version,
  dist: { integrity: t.integrity, tarball: `https://registry.npmjs.org/${t.name}/-/${t.name.split("/").at(-1)}-${t.version}.tgz`,
    signatures: [{ keyid: REVIEWED_REGISTRY_KEY_ID, sig }] } });

test("the real public signature proves its narrow identity only, not archive bytes or source", () => {
  assert.deepEqual(classifyRuntimeRegistrySignature(target, metadata(), proof()), {
    state: "reviewed-registry-signature-verified", registrySignatureVerified: true, verifiedSignatures: 1 });
});

test("absent/empty signatures and unreviewed keys are explicit UNKNOWN, never a verified signature", () => {
  for (const value of [undefined, []]) {
    const m = metadata(); m.dist.signatures = value;
    assert.deepEqual(classifyRuntimeRegistrySignature(target, m, proof()), { state: "signature-not-advertised", registrySignatureVerified: false });
  }
  const m = metadata(); m.dist.signatures[0].keyid = unknown;
  assert.deepEqual(classifyRuntimeRegistrySignature(target, m, proof()), { state: "unreviewed-signing-key", registrySignatureVerified: false });
});

test("unreviewed-key presence cannot hide a corrupt signature from the reviewed key", () => {
  const m = metadata(); m.dist.signatures.push({ keyid: unknown, sig });
  assert.equal(classifyRuntimeRegistrySignature(target, m, proof()).registrySignatureVerified, false);
  m.dist.signatures[0].sig = Buffer.alloc(72).toString("base64");
  assert.throws(() => classifyRuntimeRegistrySignature(target, m, proof()));
});

test("wrong name/version/integrity/canonical URL fail before an unknown-key classification", () => {
  for (const mutate of [m => { m.name = "PRIVATE_SENTINEL"; }, m => { m.version = "0.0.0"; },
    m => { m.dist.integrity = "sha512-" + Buffer.alloc(64).toString("base64"); },
    m => { m.dist.tarball = "https://private.invalid/"; }]) {
    const m = metadata(); m.dist.signatures[0].keyid = unknown; mutate(m);
    assert.throws(() => classifyRuntimeRegistrySignature(target, m, proof()));
  }
  for (const t of [{ ...target, name: "../private" }, { ...target, version: "latest" }, { ...target, integrity: "PRIVATE_SENTINEL" }])
    assert.throws(() => classifyRuntimeRegistrySignature(t, metadata(t), proof()));
});

test("malformed/oversized/duplicate signatures are not mislabelled harmless unknowns", () => {
  for (const mutate of [m => { m.dist.signatures = null; }, m => { m.dist.signatures = {}; },
    m => { m.dist.signatures[0].sig += "\n"; }, m => { m.dist.signatures[0].keyid = "PRIVATE_SENTINEL"; },
    m => { m.dist.signatures[0].extra = true; }, m => { m.dist.signatures.push({ ...m.dist.signatures[0] }); },
    m => { m.dist.signatures = Array(5).fill(m.dist.signatures[0]); }]) {
    const m = metadata(); mutate(m); assert.throws(() => classifyRuntimeRegistrySignature(target, m, proof()));
  }
  assert.throws(() => classifyRuntimeRegistrySignature(target, metadata(), { ...proof() }));
});

function fakeMetadata(url) {
  const path = new URL(url).pathname, split = path.lastIndexOf("/"), name = decodeURIComponent(path.slice(1, split)), version = path.slice(split + 1);
  const { lock } = readLocalDependencyLock(process.cwd());
  const t = { name, version, integrity: lock.packages[`${name}@${version}`].resolution.integrity };
  const m = metadata(t); m.dist.signatures[0].keyid = unknown;
  return m;
}

test("a complete 37-component synthetic metadata run retains every unknown and never fetches archives", async () => {
  const requests = [];
  const result = await collectRuntimeRegistrySignatures(process.cwd(), async (url, options) => {
    requests.push(url); assert.equal(new URL(url).origin, "https://registry.npmjs.org");
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
    assert.deepEqual(Object.keys(options.headers), ["Accept"]); assert.ok(options.signal instanceof AbortSignal);
    if (url.endsWith("/-/npm/v1/keys")) return new Response(JSON.stringify(keys()));
    assert.equal(url.includes(".tgz"), false); return new Response(JSON.stringify(fakeMetadata(url)));
  });
  assert.equal(requests.length, 38); assert.equal(new Set(requests).size, 38);
  assert.equal(result.sourceUnchanged, true); assert.equal(result.components, 37);
  assert.equal(result.verifiedRegistrySignatureComponents, 0); assert.equal(result.unverifiedRegistrySignatureComponents, 37);
  for (const key of ["allRegistrySignaturesVerified", "installedPackageBytesVerified", "publisherSignatureVerified",
    "sourceCommitVerified", "buildProvenanceVerified", "vulnerabilityScanPerformed", "developmentOrImageGraphCovered", "legalApproval", "readyForPublication"])
    assert.equal(result[key], false);
  for (const key of ["awsCalls", "archivesFetched", "packagesInstalled", "filesWritten"]) assert.equal(result[key], 0);
});

test("failed, redirected, oversized, malformed and BOM metadata cancel and stop after the first package", async () => {
  for (const make of [() => new Response("X", { status: 403 }), () => new Response("X", { headers: { "content-length": "100001" } }),
    () => new Response("X".repeat(100001)), () => new Response("{}"), () => new Response(Buffer.from([0xff])),
    () => new Response("\ufeff{}"), () => { const r = new Response("{}"); Object.defineProperty(r, "url", { value: "https://private.invalid/" }); return r; }]) {
    let requests = 0;
    await assert.rejects(collectRuntimeRegistrySignatures(process.cwd(), async () => ++requests === 1 ? new Response(JSON.stringify(keys())) : make()));
    assert.equal(requests, 2);
  }
});

test("rejected metadata headers explicitly cancel an unread stream", async () => {
  let requests = 0, cancelled = false;
  await assert.rejects(collectRuntimeRegistrySignatures(process.cwd(), async () => {
    if (++requests === 1) return new Response(JSON.stringify(keys()));
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("X")); },
      cancel() { cancelled = true; } }), { status: 403 });
  }));
  assert.equal(requests, 2); assert.equal(cancelled, true);
});

test("aggregate metadata bytes are bounded independently of each individual response", async () => {
  let requests = 0;
  await assert.rejects(collectRuntimeRegistrySignatures(process.cwd(), async url => {
    requests++; if (requests === 1) return new Response(JSON.stringify(keys()));
    return new Response(JSON.stringify({ ...fakeMetadata(url), syntheticUnusedPadding: "P".repeat(90000) }));
  }));
  assert.ok(requests > 2 && requests < 38);
});

test("missing local source cannot send a package coordinate and arbitrary CLI scopes are rejected", async () => {
  let calls = 0;
  await assert.rejects(collectRuntimeRegistrySignatures("nonexistent-synthetic-runtime-source", async () => { calls++; }));
  assert.equal(calls, 0);
  const p = runtimeRegistrySignaturePlan();
  assert.equal(p.requestedRegistryReadsMax, 38); assert.equal(p.publicRegistryRequests, 0); assert.equal(p.readyForPublication, false);
  assert.throws(() => runtimeRegistrySignaturePlan(["PRIVATE_SENTINEL"]));
  for (const args of [[], ["--package", "PRIVATE_SENTINEL"], ["--execute-public-metadata", "--endpoint", "PRIVATE_SENTINEL"]]) {
    const r = spawnSync(process.execPath, ["scripts/runtime-registry-signatures.mjs", ...args], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(r.status, args.length ? 1 : 0); assert.equal((r.stdout + r.stderr).includes("PRIVATE_SENTINEL"), false);
    if (!args.length) assert.deepEqual(JSON.parse(r.stdout), p); else assert.equal(r.stdout, "");
  }
});

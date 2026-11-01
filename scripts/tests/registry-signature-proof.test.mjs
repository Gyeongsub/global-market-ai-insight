import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { PUBLISHED_LICENSE_TARGETS } from "../published-license-proof.mjs";
import { REVIEWED_REGISTRY_KEY_ID, REVIEWED_REGISTRY_SPKI_SHA256, registrySignaturePlan,
  verifyReviewedRegistryKeys, verifyPublishedRegistrySignature, verifyRegistrySignedIdentity, collectRegistrySignatureProof } from "../registry-signature-proof.mjs";

// PUBLIC npm registry key and two PUBLIC registry signatures, read 2026-10-15.
// No private signing key, account credential, source payload or remote test call.
const key = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==";
const integrity = "sha512-X98zYOrVOeuosCX+6ktf29FC2N2GHPLia7qv6mzPzTc+RPAuHWCDS++Z6JK7eGYqb/v6uaW7bAXaOvDBfol+0w==";
const target = PUBLISHED_LICENSE_TARGETS[0];
const keys = () => ({ keys: [{ expires: null, keyid: REVIEWED_REGISTRY_KEY_ID,
  keytype: "ecdsa-sha2-nistp256", scheme: "ecdsa-sha2-nistp256", key }] });
const metadata = () => ({ ...target, license: "Apache-2.0", repository: { url: "git+https://github.com/aws/aws-sdk-js-v3.git" },
  dist: { integrity, tarball: `https://registry.npmjs.org/${target.name}/-/credential-provider-http-${target.version}.tgz`,
    signatures: [
      { keyid: REVIEWED_REGISTRY_KEY_ID, sig: "MEUCIQDy+Nf4+fCSZ0LrG58RfbIGGiC90s3NzsuOrrSobJGabwIgAe4qUEah5Ykbs02HxegFC42o5jV+aJ2oWXSoQ+kEIrI=" },
      { keyid: REVIEWED_REGISTRY_KEY_ID, sig: "MEUCIQCpFSSXMfl494kYeBnqNnYFYcbweCL4WTa3mlfVsiGpwwIgGkej7Gk4V2XasGt9tMDgdwl2iauXvz8f5WwDjDHWlWE=" },
    ] } });
const proof = () => verifyReviewedRegistryKeys(keys());

test("the pinned real public key produces a frozen local proof without a publisher trust claim", () => {
  const p = proof();
  assert.equal(p.reviewedKeyMatched, true); assert.equal(Object.isFrozen(p), true);
  assert.equal(p.registryKeySpkiSha256, REVIEWED_REGISTRY_SPKI_SHA256);
  assert.equal(createHash("sha256").update(Buffer.from(key, "base64")).digest("hex"), REVIEWED_REGISTRY_SPKI_SHA256);
  assert.equal(p.independentPublisherTrustClaimed, false);
});

test("both real registry signatures verify the exact public name/version/integrity message", () => {
  const result = verifyPublishedRegistrySignature(target, metadata(), integrity, proof());
  assert.equal(result.registrySignatureVerified, true); assert.equal(result.verifiedSignatures, 2);
  assert.equal(result.signedIdentityAndIntegrityMatched, true);
  for (const name of ["repositoryFieldsCryptographicallyVerified", "sourceCommitVerified", "buildProvenanceVerified",
    "publisherSignatureVerified", "legalApproval", "readyForPublication"]) assert.equal(result[name], false);
  assert.equal(JSON.stringify(result).includes(metadata().dist.signatures[0].sig), false);
});

test("rotated/unreviewed keys, expired selected keys, malformed schemes and duplicate IDs fail closed", () => {
  for (const mutate of [doc => { doc.keys[0].keyid = "SHA256:" + "a".repeat(43); },
    doc => { doc.keys[0].expires = "2025-01-29T00:00:00.000Z"; },
    doc => { doc.keys[0].scheme = "PRIVATE_SCHEME"; }, doc => { doc.keys[0].keytype = "RSA"; },
    doc => { doc.keys.push({ ...doc.keys[0] }); }, doc => { doc.keys[0].key = key + "\n"; },
    doc => { doc.keys[0].key = key.slice(0, -1); }, doc => { doc.keys[0].unknown = true; },
    doc => { doc.extra = "PRIVATE_SENTINEL"; }, doc => { doc.keys = []; }]) {
    const doc = keys(); mutate(doc); assert.throws(() => verifyReviewedRegistryKeys(doc));
  }
  for (const doc of [null, [], { keys: Array(9).fill(keys().keys[0]) }, { keys: [null] }])
    assert.throws(() => verifyReviewedRegistryKeys(doc));
});

test("a different valid EC key cannot borrow the reviewed key ID or pin", () => {
  const doc = keys(), pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  doc.keys[0].key = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  assert.throws(() => verifyReviewedRegistryKeys(doc));
});

test("malformed extra/expired key records cannot silently pass as a complete reviewed key set", () => {
  const doc = keys(); doc.keys.push({ ...doc.keys[0], keyid: "SHA256:" + "b".repeat(43), expires: "2025-02-30T00:00:00.000Z" });
  assert.throws(() => verifyReviewedRegistryKeys(doc));
  const rsa = generateKeyPairSync("rsa", { modulusLength: 1024 });
  doc.keys[1].expires = null; doc.keys[1].key = rsa.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  assert.throws(() => verifyReviewedRegistryKeys(doc));
});

test("forged name/version/integrity, changed bytes and another target cannot reuse a valid signature", () => {
  for (const mutate of [m => { m.name = "PRIVATE_PACKAGE"; }, m => { m.version = "0.0.0"; },
    m => { m.dist.tarball = "https://private.invalid/"; }, m => { m.license = "UNKNOWN"; },
    m => { m.dist.signatures[0].sig = Buffer.alloc(72).toString("base64"); }]) {
    const m = metadata(); mutate(m); assert.throws(() => verifyPublishedRegistrySignature(target, m, integrity, proof()));
  }
  const m = metadata(), changed = "sha512-" + Buffer.alloc(64, 1).toString("base64"); m.dist.integrity = changed;
  assert.throws(() => verifyPublishedRegistrySignature(target, m, changed, proof()));
  assert.throws(() => verifyPublishedRegistrySignature(PUBLISHED_LICENSE_TARGETS[1], metadata(), integrity, proof()));
});

test("the pure signed identity requires bounded primitive version strings, never coercible array/object aliases", () => {
  assert.equal(verifyRegistrySignedIdentity(target, metadata(), integrity, proof()).registrySignatureVerified, true);
  for (const version of [[target.version], { toString: () => target.version }, new String(target.version), null,
    "9".repeat(49) + ".0.0"]) {
    const m = metadata(); m.version = version;
    assert.throws(() => verifyRegistrySignedIdentity({ ...target, version }, m, integrity, proof()));
  }
});

test("missing, unknown, duplicated, oversized or malformed signatures and copied key proofs are rejected", () => {
  for (const mutate of [m => { delete m.dist.signatures; }, m => { m.dist.signatures = []; },
    m => { m.dist.signatures[0].keyid = "UNKNOWN"; }, m => { m.dist.signatures.push({ ...m.dist.signatures[0] }); },
    m => { m.dist.signatures = Array(5).fill(m.dist.signatures[0]); },
    m => { m.dist.signatures[0].sig += "\n"; }, m => { m.dist.signatures[0].extra = "PRIVATE_SENTINEL"; }]) {
    const m = metadata(); mutate(m); assert.throws(() => verifyPublishedRegistrySignature(target, m, integrity, proof()));
  }
  for (const p of [undefined, null, {}, { ...proof() }])
    assert.throws(() => verifyPublishedRegistrySignature(target, metadata(), integrity, p));
});

test("a signature does not authenticate repository metadata or establish a source/build/license mapping", () => {
  const m = metadata(); m.repository.directory = "SYNTHETIC_UNVERIFIED_DIRECTORY";
  m.gitHead = "a".repeat(40); m.dist.attestations = { unverified: true };
  const result = verifyPublishedRegistrySignature(target, m, integrity, proof());
  assert.equal(result.registrySignatureVerified, true);
  assert.equal(result.repositoryFieldsCryptographicallyVerified, false); assert.equal(result.sourceCommitVerified, false);
  assert.equal(result.buildProvenanceVerified, false); assert.equal(result.legalApproval, false);
});

test("collector uses fixed credential-free key/metadata GETs and stops before archive access on invalid signature", async () => {
  const requests = [];
  await assert.rejects(collectRegistrySignatureProof(process.cwd(), async (url, options) => {
    requests.push(url); assert.equal(new URL(url).hostname, "registry.npmjs.org");
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer"); assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(Object.keys(options.headers), ["Accept"]);
    if (requests.length === 1) { assert.equal(url, "https://registry.npmjs.org/-/npm/v1/keys"); return new Response(JSON.stringify(keys())); }
    assert.equal(url, `https://registry.npmjs.org/${encodeURIComponent(target.name)}/${target.version}`);
    const m = metadata(); m.dist.signatures[0].sig = "PRIVATE_SENTINEL"; return new Response(JSON.stringify(m));
  }));
  assert.equal(requests.length, 2);
});

test("bad key response status, redirect, size, JSON, UTF8 and BOM leave collection incomplete and cancel streams", async () => {
  for (const item of [new Response("X", { status: 403 }), new Response("X", { headers: { "content-length": "20001" } }),
    new Response("X".repeat(20001)), new Response(""), new Response("{}"),
    new Response(Buffer.from([0xff])), new Response("\ufeff" + JSON.stringify(keys()))]) {
    let calls = 0; await assert.rejects(collectRegistrySignatureProof(process.cwd(), async () => { calls++; return item; }));
    assert.equal(calls, 1);
  }
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("X")); },
    cancel() { cancelled = true; } }), { status: 403 });
  await assert.rejects(collectRegistrySignatureProof(process.cwd(), async () => response)); assert.equal(cancelled, true);
  const redirected = new Response(JSON.stringify(keys())); Object.defineProperty(redirected, "url", { value: "https://private.invalid/" });
  await assert.rejects(collectRegistrySignatureProof(process.cwd(), async () => redirected));
});

test("unreadable root cannot disclose package coordinates or start a request", async () => {
  let calls = 0; await assert.rejects(collectRegistrySignatureProof("nonexistent-synthetic-proof-root", async () => { calls++; }));
  assert.equal(calls, 0);
});

test("import/default/rejected CLI stay zero-action and never echo caller-supplied private values", () => {
  const p = registrySignaturePlan();
  for (const field of ["awsCalls", "publicRegistryRequests", "filesWritten", "packagesInstalled", "subprocessesStarted"]) assert.equal(p[field], 0);
  assert.equal(p.requestedRegistryReadsMax, 7); assert.equal(p.readyForPublication, false);
  assert.throws(() => registrySignaturePlan(["PRIVATE_SENTINEL"]));
  for (const args of [[], ["--endpoint", "PRIVATE_SENTINEL"], ["--execute-public-metadata", "--upload", "PRIVATE_SENTINEL"]]) {
    const result = spawnSync(process.execPath, ["scripts/registry-signature-proof.mjs", ...args],
      { encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, args.length ? 1 : 0); assert.equal((result.stdout + result.stderr).includes("PRIVATE_SENTINEL"), false);
    if (!args.length) assert.deepEqual(JSON.parse(result.stdout), p); else assert.equal(result.stdout, "");
  }
});

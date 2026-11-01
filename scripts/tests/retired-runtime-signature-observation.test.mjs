import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { collectRetiredRuntimeSignatures, observeRetiredRegistryKey, RETIRED_KEY, RETIRED_TARGETS, retiredSignaturePlan, verifyRetiredRuntimeSignature } from "../retired-runtime-signature-observation.mjs";
import { REVIEWED_REGISTRY_KEY_ID } from "../registry-signature-proof.mjs";
import { RETIRED_SIGNATURE_FIXTURES } from "./fixtures/retired-registry-fixture.mjs";

const keys = () => ({ keys: [
  { expires: RETIRED_KEY.expires, keyid: RETIRED_KEY.keyId, keytype: "ecdsa-sha2-nistp256", scheme: "ecdsa-sha2-nistp256",
    key: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE1Olb3zMAFFxXKHiIkQO5cJ3Yhl5i6UPp+IhuteBJbuHcA5UogKo0EWtlWwW6KSaKoTNEYL7JlCQiVnkhBktUgg==" },
  { expires: null, keyid: REVIEWED_REGISTRY_KEY_ID, keytype: "ecdsa-sha2-nistp256", scheme: "ecdsa-sha2-nistp256",
    key: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEY6Ya7W++7aUPzvMTrezH6Ycx3c+HOKYCcNGybJZSCJq/fd7Qa8uuAKtdIkUQtQiEKERhAmE5lMMJhP8OkDOa2g==" },
] });
const NOW = Date.parse("2026-10-16T12:00:00Z");
const metadata = row => ({ name: row.name, version: row.version, dist: { integrity: row.integrity,
  tarball: `https://registry.npmjs.org/${row.name}/-/${row.name}-${row.version}.tgz`, signatures: [{ keyid: RETIRED_KEY.keyId, sig: row.sig }] } });

test("three real public retired-key signature equations verify without asserting a trustworthy signing time", () => {
  const key = observeRetiredRegistryKey(keys(), NOW);
  for (const row of RETIRED_SIGNATURE_FIXTURES) {
    const result = verifyRetiredRuntimeSignature(row, metadata(row), row.integrity, key);
    assert.equal(result.retiredKeySignatureEquationVerified, true); assert.equal(result.signedIdentityAndIntegrityMatched, true);
    for (const field of ["trustedSigningTimeVerified", "currentPolicyRegistrySignatureVerified", "publisherSignatureVerified",
      "sourceCommitVerified", "buildProvenanceVerified", "readyForPublication"]) assert.equal(result[field], false);
  }
});

test("modified identity/integrity/URL/signature or added signatures cannot borrow the retired-key proof", () => {
  const row = RETIRED_SIGNATURE_FIXTURES[0], proof = observeRetiredRegistryKey(keys(), NOW);
  for (const change of [p => { p.name = "tslib"; }, p => { p.version = "0.38.4"; },
    p => { p.dist.integrity = RETIRED_SIGNATURE_FIXTURES[1].integrity; }, p => { p.dist.tarball += "?PRIVATE_SENTINEL"; },
    p => { p.dist.signatures[0].sig = RETIRED_SIGNATURE_FIXTURES[1].sig; }, p => { p.dist.signatures.push(p.dist.signatures[0]); },
    p => { p.dist.signatures[0].keyid = REVIEWED_REGISTRY_KEY_ID; }, p => { p.dist.signatures[0].sig += "="; }]) {
    const value = metadata(row); change(value); assert.throws(() => verifyRetiredRuntimeSignature(row, value, row.integrity, proof));
  }
});

test("complete synthetic collector uses four fixed credential-free GETs and emits no upstream personal fields", async () => {
  const calls = [];
  const report = await collectRetiredRuntimeSignatures(process.cwd(), async (url, options) => {
    calls.push(url); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
    assert.deepEqual(options.headers, { Accept: "application/json" }); assert.ok(options.signal instanceof AbortSignal);
    const index = calls.length - 2;
    const body = index < 0 ? keys() : { ...metadata(RETIRED_SIGNATURE_FIXTURES[index]), author: "PRIVATE_SENTINEL", _where: "PRIVATE_SENTINEL" };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(calls, ["https://registry.npmjs.org/-/npm/v1/keys", ...RETIRED_TARGETS.map(p => `https://registry.npmjs.org/${p.name}/${p.version}`)]);
  assert.equal(report.publicRegistryRequests, 4); assert.equal(report.results.length, 3);
  assert.equal(report.allCurrentPolicySignaturesVerified, false); assert.equal(report.currentTrustPolicyChanged, false);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false); assert.equal(report.awsCalls, 0);
});

test("collector rejects bad status, redirects, length, malformed UTF8/JSON and raw transport errors privately", async () => {
  for (const response of [() => new Response("PRIVATE_SENTINEL", { status: 500 }),
    () => new Response("PRIVATE_SENTINEL", { headers: { "content-type": "application/json", "content-length": "bad" } }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    () => new Response('{"PRIVATE_SENTINEL":', { headers: { "content-type": "application/json" } }),
    () => { throw new Error("PRIVATE_SENTINEL"); },
    () => { const r = new Response(JSON.stringify(keys()), { headers: { "content-type": "application/json" } });
      Object.defineProperty(r, "url", { value: "https://invalid.example/PRIVATE_SENTINEL" }); return r; }]) {
    let calls = 0;
    const fetcher = async () => { calls++; return response(); };
    await assert.rejects(collectRetiredRuntimeSignatures(process.cwd(), fetcher), e => e instanceof Error && e.message === "RETIRED_SIGNATURE_OBSERVATION_INCOMPLETE");
    assert.equal(calls, 1);
  }
});

test("bounded private metadata streams are cancelled on the first oversized chunk", async () => {
  let cancelled = 0, pulls = 0;
  await assert.rejects(collectRetiredRuntimeSignatures(process.cwd(), async () => new Response(new ReadableStream({
    pull(c) { pulls++; if (pulls === 1) c.enqueue(new Uint8Array(100001)); else if (pulls === 2) c.enqueue(new Uint8Array(16)); else c.close(); }, cancel() { cancelled++; },
  }), { headers: { "content-type": "application/json" } })), /RETIRED_SIGNATURE_OBSERVATION_INCOMPLETE/);
  assert.equal(cancelled, 1); assert.ok(pulls <= 2);
});

test("aggregate metadata cap rejects a fourth padded document rather than returning partial coverage", async () => {
  let calls = 0;
  await assert.rejects(collectRetiredRuntimeSignatures(process.cwd(), async () => {
    const index = calls++ - 1, value = index < 0 ? keys() : metadata(RETIRED_SIGNATURE_FIXTURES[index]);
    const body = JSON.stringify(value); return new Response(body + " ".repeat(100000 - Buffer.byteLength(body)), { headers: { "content-type": "application/json" } });
  }), /RETIRED_SIGNATURE_OBSERVATION_INCOMPLETE/);
  assert.equal(calls, 4);
});

test("official pinned retired key observation retains current-policy and timestamp uncertainty", () => {
  const proof = observeRetiredRegistryKey(keys(), NOW);
  assert.equal(proof.keyExpiredAtObservation, true); assert.equal(proof.keySpkiSha256, RETIRED_KEY.spkiSha256);
  assert.equal(proof.currentTrustPolicyChanged, false); assert.equal(proof.trustedSigningTimeVerified, false);
  assert.equal(Object.isFrozen(proof), true); assert.equal(REVIEWED_REGISTRY_KEY_ID.includes("DhQ8"), true);
});

test("different expiry/key/active policy, malformed and duplicate key sets are not accepted", () => {
  for (const mutate of [p => { p.keys[0].expires = null; }, p => { p.keys[0].key = p.keys[1].key; },
    p => { p.keys[1].key = p.keys[0].key; }, p => { p.keys.push(p.keys[0]); }, p => { p.keys.shift(); },
    p => { p.keys[0].extra = "PRIVATE_SENTINEL"; }, p => { p.keys[0].scheme = "other"; }]) {
    const value = keys(); mutate(value); assert.throws(() => observeRetiredRegistryKey(value, NOW));
  }
  for (const now of [NaN, Infinity, -1, Date.parse(RETIRED_KEY.expires)]) assert.throws(() => observeRetiredRegistryKey(keys(), now));
});

test("a copied or forged key report cannot verify a retired signature", () => {
  const target = RETIRED_TARGETS[0], integrity = "sha512-" + Buffer.alloc(64).toString("base64");
  const metadata = { ...target, dist: { integrity, tarball: `https://registry.npmjs.org/${target.name}/-/${target.name}-${target.version}.tgz`,
    signatures: [{ keyid: RETIRED_KEY.keyId, sig: "MAA=" }] } };
  const proof = observeRetiredRegistryKey(keys(), NOW);
  for (const candidate of [{ ...proof }, {}, undefined, proof]) assert.throws(() => verifyRetiredRuntimeSignature(target, metadata, integrity, candidate));
  assert.throws(() => verifyRetiredRuntimeSignature({ name: "PRIVATE_SENTINEL", version: "1.0.0" }, metadata, integrity, proof));
});

test("default/invalid selectors have zero downloads and do not reflect private arguments", () => {
  assert.equal(retiredSignaturePlan().publicRegistryRequests, 0); assert.throws(() => retiredSignaturePlan(["--execute"]));
  assert.equal(Object.isFrozen(RETIRED_TARGETS), true); assert.equal(RETIRED_TARGETS.every(Object.isFrozen), true);
  for (const args of [[], ["--execute"], ["--execute-fixed-public-metadata", "PRIVATE_SENTINEL"]]) {
    const r = spawnSync(process.execPath, ["scripts/retired-runtime-signature-observation.mjs", ...args], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(r.status, args.length ? 1 : 0); assert.equal(`${r.stdout}${r.stderr}`.includes("PRIVATE_SENTINEL"), false);
  }
});

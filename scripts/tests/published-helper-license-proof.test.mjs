import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import test from "node:test";
import { FRONTEND_HELPER_PRODUCERS, collectFrontendHelperProducers } from "../frontend-helper-attribution.mjs";
import { collectPublishedHelperProof, fetchFrontendHelperBytes, inspectPublishedHelperArchive,
  verifyHelperPublishedMetadata } from "../published-helper-license-proof.mjs";

const root = resolve("."), req = createRequire(join(root, "frontend", "package.json"));
const vite = req.resolve("vite/package.json"), manifests = [vite, createRequire(vite).resolve("rolldown/package.json")];
const local = collectFrontendHelperProducers(root).report.producers;
function archive(target, changes = {}) {
  const index = FRONTEND_HELPER_PRODUCERS.indexOf(target);
  const packageJson = readFileSync(manifests[index]);
  const entries = [{ name: "package/package.json", bytes: changes.manifest ?? packageJson }, ...target.documents.map(doc =>
    ({ name: `package/${doc.name}`, bytes: readFileSync(join(dirname(manifests[index]), doc.name)) }))];
  const blocks = [];
  for (const entry of changes.entries ?? entries) {
    const header = Buffer.alloc(512), bytes = Buffer.from(entry.bytes);
    header.write(entry.name); header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156); header.write(entry.kind ?? "0", 156);
    header.write("ustar\0", 257); header.write("00", 263);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  const bytes = gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
  return { bytes, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, entries };
}
function metadata(target, integrity) {
  return { name: target.name, version: target.version, license: target.license, repository: { url: target.repository },
    dist: { tarball: `https://registry.npmjs.org/${target.name}/-/${target.name}-${target.version}.tgz`, integrity } };
}

test("both integrity-matched producer archives prove whole notice and manifest bytes, not generated-code rights", () => {
  for (const [index, target] of FRONTEND_HELPER_PRODUCERS.entries()) {
    const item = archive(target); const result = inspectPublishedHelperArchive(target, item.bytes, item.integrity, local[index]);
    assert.equal(result.lockedIntegrityMatched, true); assert.equal(result.installedNoticeBytesMatched, true);
    assert.equal(result.installedManifestBytesMatched, true); assert.equal(result.rootDocuments.length, target.documents.length);
    for (const key of ["archiveExtracted", "installedPackageModified", "installedProducerCodeBytesVerified",
      "exactGeneratedHelperSourceOriginVerified", "legalApproval", "readyForPublication"]) assert.equal(result[key], false);
    assert.equal(JSON.stringify(result).includes(root), false);
  }
});

test("metadata pins package, repository, canonical source and lock integrity before any archive access", () => {
  const target = FRONTEND_HELPER_PRODUCERS[0], { integrity } = archive(target), original = metadata(target, integrity);
  assert.doesNotThrow(() => verifyHelperPublishedMetadata(target, original, integrity));
  for (const change of [{ name: "PRIVATE_NAME" }, { version: "8.2.2" }, { license: "PRIVATE_LICENSE" },
    { repository: { url: "PRIVATE_REPOSITORY" } }, { dist: { ...original.dist, tarball: "https://private.invalid/" } },
    { dist: { ...original.dist, integrity: "INVALID" } }])
    assert.throws(() => verifyHelperPublishedMetadata(target, { ...original, ...change }, integrity));
  assert.throws(() => verifyHelperPublishedMetadata({ ...target }, original, integrity));
});

test("rehashed missing, modified and extra documents or changed manifests remain incomplete", () => {
  const target = FRONTEND_HELPER_PRODUCERS[1], original = archive(target);
  for (const entries of [original.entries.slice(0, -1), [...original.entries, { name: "package/NOTICE", bytes: "UNREVIEWED" }],
    original.entries.map((entry, index) => index === 1 ? { ...entry, bytes: "CHANGED_LICENSE" } : entry),
    original.entries.map((entry, index) => index === 0 ? { ...entry, bytes: JSON.stringify({ ...target, repository: { url: "PRIVATE" } }) } : entry)]) {
    const changed = archive(target, { entries });
    assert.throws(() => inspectPublishedHelperArchive(target, changed.bytes, changed.integrity, local[1]));
  }
  assert.throws(() => inspectPublishedHelperArchive(target, original.bytes, original.integrity, { ...local[1], manifestSha256: "0".repeat(64) }));
});

test("checksum failures, archive links, traversal, trailing garbage and nonzero padding cannot become evidence", () => {
  const target = FRONTEND_HELPER_PRODUCERS[0], original = archive(target);
  for (const entry of [{ name: "package/../LICENSE", bytes: "X" }, { name: "package/LINK", bytes: "X", kind: "2" },
    { name: "package/PRIVATE\nFILE", bytes: "X" }]) {
    const changed = archive(target, { entries: [...original.entries, entry] });
    assert.throws(() => inspectPublishedHelperArchive(target, changed.bytes, changed.integrity, local[0]));
  }
  for (const mutate of [bytes => { bytes[0] ^= 1; return bytes; }, bytes => bytes.subarray(0, bytes.length - 512),
    bytes => Buffer.concat([bytes, Buffer.from("GARBAGE")]), bytes => { bytes[512 + original.entries[0].bytes.length] = 1; return bytes; }]) {
    const changed = gzipSync(mutate(Buffer.from(gunzipSync(original.bytes))));
    const integrity = `sha512-${createHash("sha512").update(changed).digest("base64")}`;
    assert.throws(() => inspectPublishedHelperArchive(target, changed, integrity, local[0]));
  }
  assert.throws(() => inspectPublishedHelperArchive(target, original.bytes, "sha512-INVALID", local[0]));
});

test("network scope has fixed public URLs and headers and rejects foreign targets before contacting anything", async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++; assert.equal(new URL(url).hostname, "registry.npmjs.org"); assert.equal(options.redirect, "error");
    assert.deepEqual(Object.keys(options.headers), ["Accept"]); assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.ok(options.signal instanceof AbortSignal); return new Response("PUBLIC_METADATA");
  };
  assert.equal((await fetchFrontendHelperBytes(FRONTEND_HELPER_PRODUCERS[0], "metadata", fetcher)).toString(), "PUBLIC_METADATA");
  await assert.rejects(fetchFrontendHelperBytes({ ...FRONTEND_HELPER_PRODUCERS[0], name: "../PRIVATE" }, "metadata", fetcher));
  await assert.rejects(fetchFrontendHelperBytes(FRONTEND_HELPER_PRODUCERS[0], "PRIVATE", fetcher)); assert.equal(calls, 1);
});

test("redirected, failed and oversized responses do not supply published proof", async () => {
  for (const response of [new Response("X", { status: 302 }), new Response("X", { status: 403 }),
    new Response("X", { headers: { "content-length": "100001" } }), new Response("X", { headers: { "content-length": "INVALID" } }),
    new Response("X".repeat(100001)), new Response("")])
    await assert.rejects(fetchFrontendHelperBytes(FRONTEND_HELPER_PRODUCERS[0], "metadata", async () => response));
  const response = new Response("X"); Object.defineProperty(response, "url", { value: "https://private.invalid/" });
  await assert.rejects(fetchFrontendHelperBytes(FRONTEND_HELPER_PRODUCERS[0], "metadata", async () => response));
});

test("collector stops on changed lock-integrity metadata without writing, installing or fetching a tarball", async () => {
  let calls = 0;
  await assert.rejects(collectPublishedHelperProof(root, async () => {
    calls++; return new Response(JSON.stringify(metadata(FRONTEND_HELPER_PRODUCERS[0], archive(FRONTEND_HELPER_PRODUCERS[0]).integrity)));
  }));
  assert.equal(calls, 1);
});

test("CLI is zero-network by default and does not accept installation, upload or an arbitrary registry", () => {
  const plan = spawnSync(process.execPath, ["scripts/published-helper-license-proof.mjs"], { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(plan.status, 0); const result = JSON.parse(plan.stdout); assert.equal(result.publicRegistryRequests, 0);
  assert.equal(result.requestedRegistryReadsMax, 4); assert.equal(result.filesWritten, 0); assert.equal(result.packagesInstalled, 0);
  const rejected = spawnSync(process.execPath, ["scripts/published-helper-license-proof.mjs", "--registry", "PRIVATE_DESTINATION"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(rejected.status, 1); assert.equal(rejected.stdout, ""); assert.equal(rejected.stderr.includes("PRIVATE_DESTINATION"), false);
});

test("rejected public helper status, length and redirect cancel unread streams before failing", async () => {
  for (const changes of [{ status: 403 }, { headers: { "content-length": "100001" } }, { redirected: true }]) {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("X")); },
      cancel() { cancelled = true; } }), changes);
    if (changes.redirected) Object.defineProperty(response, "url", { value: "https://private.invalid/" });
    await assert.rejects(fetchFrontendHelperBytes(FRONTEND_HELPER_PRODUCERS[0], "metadata", async () => response));
    assert.equal(cancelled, true);
  }
});

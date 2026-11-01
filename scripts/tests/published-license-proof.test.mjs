import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";
import test from "node:test";
import { fetchPublishedBytes, inspectPublishedArchive, PUBLISHED_LICENSE_TARGETS, verifyPublishedMetadata } from "../published-license-proof.mjs";
import { inspectPinnedPackageArchive } from "../pinned-package-archive.mjs";

const target = PUBLISHED_LICENSE_TARGETS[0];
function archive(entries = [], changes = {}) {
  const files = [{ name: "package/package.json", text: JSON.stringify({ ...target, license: "Apache-2.0", ...changes }) }, ...entries];
  const blocks = [];
  for (const { name, text, kind = "0" } of files) {
    const data = Buffer.from(text); const header = Buffer.alloc(512);
    header.write(name); header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156); header.write(kind, 156);
    header.write("ustar\0", 257); header.write("00", 263);
    header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  const compressed = gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
  return { compressed, integrity: `sha512-${createHash("sha512").update(compressed).digest("base64")}` };
}

test("integrity-matched published document presence or omission never grants legal approval", () => {
  for (const files of [[], [{ name: "package/LICENSE", text: "SYNTHETIC_APACHE_DOCUMENT" }]]) {
    const { compressed, integrity } = archive(files);
    const result = inspectPublishedArchive(target, compressed, integrity);
    assert.equal(result.rootLicensePresent, files.length === 1);
    assert.equal(result.lockedIntegrityMatched, true);
    assert.equal(result.readyForPublication, false);
    assert.equal(result.archiveExtracted, false);
    assert.equal(JSON.stringify(result).includes("SYNTHETIC_APACHE_DOCUMENT"), false);
  }
});

test("foreign identities, changed registry destination, redirects and integrity declarations fail closed", () => {
  const { integrity } = archive();
  const metadata = { ...target, license: "Apache-2.0", repository: { url: "git+https://github.com/aws/aws-sdk-js-v3.git" },
    dist: { tarball: `https://registry.npmjs.org/${target.name}/-/credential-provider-http-${target.version}.tgz`, integrity } };
  assert.equal(verifyPublishedMetadata(target, metadata, integrity).integrity, integrity);
  for (const source of [{ ...metadata, version: "0.0.0" }, { ...metadata, license: "UNKNOWN" },
    { ...metadata, repository: { url: "https://private.example" } }, { ...metadata, dist: { ...metadata.dist, tarball: "https://private.example/data" } },
    { ...metadata, dist: { ...metadata.dist, integrity: "sha512-INVALID" } }]) assert.throws(() => verifyPublishedMetadata(target, source, integrity));
  assert.throws(() => verifyPublishedMetadata({ name: "another", version: "1.0.0" }, metadata, integrity));
});

test("corrupt bytes, checksum, truncated tar, wrong manifest and archive links cannot prove absence", () => {
  const original = archive();
  const corrupt = Buffer.from(original.compressed); corrupt[12] ^= 1;
  assert.throws(() => inspectPublishedArchive(target, corrupt, original.integrity));
  for (const entries of [[{ name: "package/../LICENSE", text: "X" }], [{ name: "/LICENSE", text: "X" }],
    [{ name: "package/LICENSE", text: "X", kind: "2" }], [{ name: "package/LICENSE", text: "X" }, { name: "package/LICENSE", text: "Y" }]]) {
    const item = archive(entries); assert.throws(() => inspectPublishedArchive(target, item.compressed, item.integrity));
  }
  const wrong = archive([], { version: "0.0.0" }); assert.throws(() => inspectPublishedArchive(target, wrong.compressed, wrong.integrity));
  for (const mutate of [
    bytes => { const result = Buffer.from(bytes); result[0] ^= 1; return result; },
    bytes => bytes.subarray(0, bytes.length - 512),
    bytes => Buffer.concat([bytes, Buffer.from("TRAILING_UNREVIEWED_DATA")]),
  ]) {
    const changed = gzipSync(mutate(gunzipSync(original.compressed)));
    const matched = `sha512-${createHash("sha512").update(changed).digest("base64")}`;
    assert.throws(() => inspectPublishedArchive(target, changed, matched));
  }
});

test("nested documents are not silently promoted into a root-license proof and gzip expansion is bounded", () => {
  const nested = archive([{ name: "package/example/LICENSE", text: "SYNTHETIC_NESTED_TEXT" }]);
  assert.equal(inspectPublishedArchive(target, nested.compressed, nested.integrity).rootLicensePresent, false);
  const bomb = gzipSync(Buffer.alloc(10_000_001));
  const integrity = `sha512-${createHash("sha512").update(bomb).digest("base64")}`;
  assert.throws(() => inspectPublishedArchive(target, bomb, integrity));
});

test("unsupported CLI arguments cannot access cloud, install or echo supplied private values", () => {
  const plan = spawnSync(process.execPath, ["scripts/published-license-proof.mjs"], { encoding: "utf8", timeout: 10_000 });
  assert.equal(plan.status, 0); assert.equal(JSON.parse(plan.stdout).publicRegistryRequests, 0);
  const invalid = spawnSync(process.execPath, ["scripts/published-license-proof.mjs", "--upload", "PRIVATE_VALUE"], { encoding: "utf8", timeout: 10_000 });
  assert.notEqual(invalid.status, 0); assert.equal(invalid.stdout, ""); assert.equal(invalid.stderr.includes("PRIVATE_VALUE"), false);
});

test("public reads use only fixed source URLs, no authorization, and fail before fetching changed identity", async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, "registry.npmjs.org");
    assert.equal(options.redirect, "error");
    assert.deepEqual(Object.keys(options.headers), ["Accept"]);
    assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
    return new Response("PUBLIC_SYNTHETIC_METADATA");
  };
  assert.equal((await fetchPublishedBytes(target, "metadata", fetcher)).toString(), "PUBLIC_SYNTHETIC_METADATA");
  await assert.rejects(fetchPublishedBytes({ ...target, name: "../../private" }, "metadata", fetcher));
  await assert.rejects(fetchPublishedBytes(target, "PRIVATE_VALUE", fetcher));
  assert.equal(calls, 1);
});

test("redirected, failed, oversized declared and oversized streaming responses stay incomplete", async () => {
  for (const response of [
    new Response("X", { status: 302 }), new Response("X", { status: 403 }),
    new Response("X", { headers: { "content-length": "100001" } }),
    new Response("X", { headers: { "content-length": "PRIVATE_VALUE" } }), new Response("X".repeat(100001)),
  ]) await assert.rejects(fetchPublishedBytes(target, "metadata", async () => response));
  const redirected = new Response("X"); Object.defineProperty(redirected, "url", { value: "https://private.example/data" });
  await assert.rejects(fetchPublishedBytes(target, "metadata", async () => redirected));
});

function changedHeader(mutate) {
  const original = archive(), tar = gunzipSync(original.compressed), header = tar.subarray(0, 512);
  mutate(header); header.fill(32, 148, 156);
  header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
  const compressed = gzipSync(tar);
  return { compressed, integrity: `sha512-${createHash("sha512").update(compressed).digest("base64")}` };
}

test("unknown, legacy, GNU and PAX headers cannot borrow the USTAR filename-prefix interpretation", () => {
  for (const mutate of [h => h.fill(0, 257, 265), h => h.write("ustar  \0", 257, 8),
    h => h.write("u\0star", 257, 6), h => { h[156] = 120; }, h => { h[156] = 103; }]) {
    const p = changedHeader(mutate); assert.throws(() => inspectPublishedArchive(target, p.compressed, p.integrity));
  }
});

test("hidden nonzero filename/prefix tails and regular-file link targets/padding fail even with recomputed integrity", () => {
  for (const mutate of [h => { h[99] = 65; }, h => { h[346] = 65; },
    h => { h[157] = 65; }, h => { h[500] = 65; }, h => { h[511] = 65; }]) {
    const p = changedHeader(mutate); assert.throws(() => inspectPublishedArchive(target, p.compressed, p.integrity));
  }
});

test("high-bit/base256 numeric bytes are never silently masked to ASCII octal", () => {
  const p = changedHeader(h => { h[124] |= 128; });
  assert.throws(() => inspectPublishedArchive(target, p.compressed, p.integrity));
});

test("checksum text cannot hide extra digits after its first NUL", () => {
  const original = archive(), tar = gunzipSync(original.compressed); tar[155] = 55;
  const compressed = gzipSync(tar), integrity = `sha512-${createHash("sha512").update(compressed).digest("base64")}`;
  assert.throws(() => inspectPublishedArchive(target, compressed, integrity));
});

test("a valid USTAR prefix remains supported without adding another accepted format", () => {
  const p = changedHeader(h => { h.fill(0, 0, 100); h.write("package.json", 0); h.write("package", 345); });
  assert.equal(inspectPublishedArchive(target, p.compressed, p.integrity).lockedIntegrityMatched, true);
});

test("leading BOM or invalid UTF8 in a package manifest cannot be normalized into verified source evidence", () => {
  const original = archive(), tar = gunzipSync(original.compressed), size = Number.parseInt(tar.subarray(124, 136).toString("ascii"), 8);
  for (const prefix of [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xff])]) {
    const bytes = Buffer.concat([prefix, tar.subarray(512, 512 + size)]), header = Buffer.from(tar.subarray(0, 512));
    header.fill(0, 124, 136); header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156); header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
    const compressed = gzipSync(Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512), Buffer.alloc(1024)]));
    const integrity = `sha512-${createHash("sha512").update(compressed).digest("base64")}`;
    assert.throws(() => inspectPublishedArchive(target, compressed, integrity));
  }
});

test("rejected status, declared length and redirected responses cancel unread public streams", async () => {
  for (const changes of [{ status: 403 }, { headers: { "content-length": "100001" } }, { redirected: true }]) {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("X")); },
      cancel() { cancelled = true; } }), changes);
    if (changes.redirected) Object.defineProperty(response, "url", { value: "https://private.invalid/" });
    await assert.rejects(fetchPublishedBytes(target, "metadata", async () => response));
    assert.equal(cancelled, true);
  }
});

test("the reviewed-runtime 0BSD profile does not broaden existing backend/helper license profiles", () => {
  const item = archive([], { license: "0BSD" }), runtimeTarget = { ...target, license: "0BSD" };
  const proof = inspectPinnedPackageArchive(runtimeTarget, item.compressed, item.integrity, "reviewed-runtime");
  assert.equal(proof.regularFiles.length, 1); assert.equal(proof.regularFiles[0].path, "package.json");
  assert.match(proof.regularFiles[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(proof.archiveExtracted, false);
  assert.throws(() => inspectPinnedPackageArchive(runtimeTarget, item.compressed, item.integrity, "aws-sdk"));
  assert.throws(() => inspectPinnedPackageArchive(runtimeTarget, item.compressed, item.integrity, "frontend-helper"));
});

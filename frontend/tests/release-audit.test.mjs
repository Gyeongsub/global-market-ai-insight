import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditCurrentRelease, auditRelease } from "../scripts/release-audit.mjs";
import { sanitizeSocialImage } from "../scripts/sanitize-social-image.mjs";
import { collectFrontendAttribution } from "../../scripts/frontend-helper-attribution.mjs";

const sourceSocialImage = readFileSync(new URL("../public/og.png", import.meta.url));
const cleanSocialImage = sanitizeSocialImage(sourceSocialImage);
// Public source may contain an already-clean cover. Test rejection with a
// synthetic provenance chunk, never require the owner's private metadata.
function syntheticMetadataImage(clean) {
  const data = Buffer.from("synthetic-test-metadata");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0); chunk.write("caBX", 4); data.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([clean.subarray(0, 33), chunk, clean.subarray(33)]);
}
const syntheticSocialImage = syntheticMetadataImage(cleanSocialImage.bytes);
const notices = (await collectFrontendAttribution(fileURLToPath(new URL("../../", import.meta.url)))).text;

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "gmai-release-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), '<link href="/assets/index-abcdefgh.css" rel="stylesheet"><script type="module" src="/assets/index-abcdefgh.js"></script>');
  writeFileSync(join(dir, "assets/index-abcdefgh.js"), "console.log('fixture');");
  writeFileSync(join(dir, "assets/index-abcdefgh.css"), "body{color:white}");
  writeFileSync(join(dir, "og.png"), cleanSocialImage.bytes);
  writeFileSync(join(dir, "THIRD_PARTY_NOTICES.txt"), notices);
  return dir;
}

test("release inventory is hashed and classifies cache metadata without uploading", t => {
  const result = auditRelease(fixture(t));
  assert.equal(result.awsCalls, 0);
  assert.equal(result.uploaded, false);
  assert.equal(result.files.length, 5);
  assert.ok(result.files.every(f => /^[a-f0-9]{64}$/.test(f.sha256)));
  assert.match(result.files.find(f => f.key === "index.html").cacheControl, /no-cache/);
  assert.match(result.files.find(f => f.key.endsWith(".js")).cacheControl, /immutable/);
});

test("notices are mandatory reviewed plain text, not arbitrary executable content", t => {
  const dir = fixture(t);
  rmSync(join(dir, "THIRD_PARTY_NOTICES.txt"));
  assert.throws(() => auditRelease(dir), /missing a required/);
  writeFileSync(join(dir, "THIRD_PARTY_NOTICES.txt"), "<script>notices()</script>");
  assert.throws(() => auditRelease(dir), /ATTRIBUTION_ARTIFACT_INVALID/);
});

test("current artifact notice bytes are matched to the pinned frontend documents, never legal approval", async t => {
  const result = await auditCurrentRelease(fixture(t));
  assert.equal(result.runtimeAttribution.runtimePackages, 3);
  assert.equal(result.runtimeAttribution.sourceLicenseBytesMatched, true);
  assert.equal(result.runtimeAttribution.buildHelperProducerPackages, 2);
  assert.equal(result.runtimeAttribution.buildHelperDocumentBytesMatched, true);
  assert.equal(result.runtimeAttribution.generatedHelperSourceReviewRequired, true);
  for (const key of ["exactBundledModuleCoverageVerified", "legalReviewApproved", "readyForPublication"]) assert.equal(result.runtimeAttribution[key], false);
});

test("altered, stale or shortened notice text cannot pass the current-artifact gate using its header alone", async t => {
  for (const replacement of [notices.replace("Permission is hereby granted", "Permission text changed"),
    notices.replace(/Lock SHA-256: [a-f0-9]{64}/, "Lock SHA-256: " + "f".repeat(64)),
    notices.slice(0, notices.indexOf("\n--- LICENSE ---")) + "\n--- LICENSE ---\nINCOMPLETE\n"]) {
    const dir = fixture(t);
    writeFileSync(join(dir, "THIRD_PARTY_NOTICES.txt"), replacement);
    // Structural archive checking and current package-byte proof are distinct.
    assert.doesNotThrow(() => auditRelease(dir));
    await assert.rejects(auditCurrentRelease(dir), /do not match the pinned runtime documents/);
  }
});

test("non-UTF-8 text cannot hide payloads inside a superficially valid notice or script", t => {
  for (const key of ["THIRD_PARTY_NOTICES.txt", "assets/index-abcdefgh.js"]) {
    const dir = fixture(t);
    writeFileSync(join(dir, key), Buffer.concat([Buffer.from(key.endsWith(".txt") ? notices : "console.log('fixture');"), Buffer.from([0xc0, 0xaf])]));
    assert.throws(() => auditRelease(dir), /invalid UTF-8/);
  }
});

test("distribution-audit CLI refuses upload-like arguments without revealing local paths", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/release-audit.mjs", import.meta.url)), "--upload"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), { mode: "local-audit", error: "RELEASE_AUDIT_INCOMPLETE", uploaded: false });
});

test("release rejects unexpected config, source maps and directories", t => {
  for (const name of [".env", "config.json", "assets/index-abcdefgh.js.map"]) {
    const dir = fixture(t);
    writeFileSync(join(dir, name), "not publishable");
    assert.throws(() => auditRelease(dir), /unexpected file/);
  }
  const dir = fixture(t);
  mkdirSync(join(dir, "source"));
  assert.throws(() => auditRelease(dir), /unexpected directory/);
});

test("release rejects credential patterns without echoing their value", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "assets/index-abcdefgh.js"), "AK" + "IA" + "Z".repeat(16));
  assert.throws(() => auditRelease(dir), { message: "Release contains a high-confidence credential pattern." });
});

test("built assets independently reject fine-grained tokens, session fields and provider assignments", t => {
  const token = "Token".repeat(10);
  for (const payload of ["github_" + "pat_" + "A".repeat(32), "AWS_SESSION_TOKEN=" + token,
    JSON.stringify({ refreshToken: token }), JSON.stringify({ secretAccessKey: token }),
    JSON.stringify({ apiKey: token }), "TWELVE_DATA_API_KEY=" + token]) {
    const dir = fixture(t);
    writeFileSync(join(dir, "assets/index-abcdefgh.js"), payload);
    assert.throws(() => auditRelease(dir), error => {
      assert.equal(error.message, "Release contains a high-confidence credential pattern.");
      assert.equal(error.message.includes(token), false); return true;
    });
  }
});

test("build files reject internal image addresses and unescaped or escaped personal paths", t => {
  const image = ["123456", "789012"].join("") + ".dkr.ecr.ap-northeast-1.amazonaws.com/private";
  const computerPath = ["C:", "Users", "Synthetic", "private"].join("\\");
  for (const payload of [image, computerPath, JSON.stringify(computerPath), "/home/" + "synthetic/private", "/Users/" + "synthetic/private"]) {
    const dir = fixture(t);
    writeFileSync(join(dir, "assets/index-abcdefgh.js"), payload);
    assert.throws(() => auditRelease(dir), error => {
      assert.match(error.message, /internal endpoint|personal-computer path/);
      assert.equal(error.message.includes("Synthetic"), false); return true;
    });
  }
});

test("social image build copy removes metadata without modifying pixel chunks", () => {
  const fixtureClean = sanitizeSocialImage(syntheticSocialImage);
  assert.ok(fixtureClean.removedBytes > 0);
  assert.deepEqual(fixtureClean.bytes, cleanSocialImage.bytes);
  assert.equal(fixtureClean.bytes.length + fixtureClean.removedBytes, syntheticSocialImage.length);
  assert.equal(cleanSocialImage.bytes.length + cleanSocialImage.removedBytes, sourceSocialImage.length);
  assert.equal(sanitizeSocialImage(cleanSocialImage.bytes).removedBytes, 0);
  assert.ok(cleanSocialImage.bytes.includes(sourceSocialImage.subarray(sourceSocialImage.indexOf("IDAT") + 4, sourceSocialImage.indexOf("IDAT") + 36)));
});

test("release refuses unreviewed image metadata and malformed images", t => {
  const dir = fixture(t);
  writeFileSync(join(dir, "og.png"), syntheticSocialImage);
  assert.throws(() => auditRelease(dir), /embedded metadata/);
  writeFileSync(join(dir, "og.png"), "not a PNG");
  assert.throws(() => auditRelease(dir), /must be a PNG/);
  const damaged = Buffer.from(cleanSocialImage.bytes);
  damaged[48] ^= 1;
  writeFileSync(join(dir, "og.png"), damaged);
  assert.throws(() => auditRelease(dir), /invalid PNG chunk checksum/);
});

test("release rejects external, missing and inline executable HTML", t => {
  for (const extra of ['<script src="https://example.com/x.js"></script>', "<script src='https://example.com/x.js'></script>", '<script src=https://example.com/x.js></script>', '<img src="/missing.png">', "<img src='/missing.png'>", '<script>alert(1)</script>', '<body onload="x()">']) {
    const dir = fixture(t);
    const html = '<link href="/assets/index-abcdefgh.css"><script src="/assets/index-abcdefgh.js"></script>';
    writeFileSync(join(dir, "index.html"), html + extra);
    assert.throws(() => auditRelease(dir), /external or missing|inline executable|unquoted asset reference/);
  }
});

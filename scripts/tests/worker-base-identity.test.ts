import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { verifyReviewedWorkerBaseSource, verifyWorkerBaseMetadata } from "../worker-base-identity.js";

const root = resolve("."), sha = (bytes: Buffer) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const input = JSON.parse(readFileSync(new URL("../data/public-base-metadata.json", import.meta.url), "utf8"));
const baseManifest = JSON.parse(Buffer.from(input.manifestBase64, "base64").toString("utf8"));
const baseConfig = JSON.parse(Buffer.from(input.configBase64, "base64").toString("utf8"));
const marker = (digit: string) => "sha256:" + digit.repeat(64);
function fixture(mutate: (manifest: any, config: any) => void = () => {}) {
  const config = structuredClone(baseConfig), manifest = structuredClone(baseManifest);
  config.config = { WorkingDir: "/app", User: "65532:65532", Entrypoint: ["/nodejs/bin/node", "main.mjs"] };
  config.rootfs.diff_ids.push(marker("a"), marker("b"));
  manifest.layers.push({ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: marker("c"), size: 1024 },
    { mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: marker("d"), size: 2048 });
  mutate(manifest, config);
  const configBytes = Buffer.from(JSON.stringify(config));
  manifest.config = { ...manifest.config, digest: sha(configBytes), size: configBytes.length };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return { manifestBytes, configBytes, target: { runtimeDigest: sha(manifestBytes), configDigest: sha(configBytes) } };
}
const verify = (f = fixture()) => verifyWorkerBaseMetadata(f.manifestBytes, f.configBytes, f.target);

test("actual reviewed public base prefix binds private derived metadata without claiming bodies or live AWS verification", () => {
  const r = verify(); assert.equal(r.baseLayers, 22); assert.equal(r.laterLayers, 2);
  assert.equal(r.baseLayerDescriptorPrefixMatched, true); assert.equal(r.baseConfigDiffIdPrefixMatched, true);
  for (const field of ["laterOverlayContentsVerified", "layerBodiesVerifiedByThisFunction", "liveAwsTargetBoundByThisFunction",
    "imageExecuted", "fullRootFilesystemOrLicenseProof", "publisherSignatureVerified", "vulnerabilityScanPerformed",
    "completeDistributedNoticesVerified", "readyForPublication"] as const) assert.equal(r[field], false);
  assert.equal(JSON.stringify(r).includes("sha256:"), false);
});

test("private manifest and config hashes must match independently before any prefix can be accepted", () => {
  const f = fixture();
  for (const target of [{ ...f.target, runtimeDigest: marker("0") }, { ...f.target, configDigest: marker("0") },
    { ...f.target, runtimeDigest: "PRIVATE_DIGEST" }, { ...f.target, configDigest: undefined }])
    assert.throws(() => verifyWorkerBaseMetadata(f.manifestBytes, f.configBytes, target as any), /^Error: WORKER_PROOF_BASE_IDENTITY_UNVERIFIED$/);
  assert.throws(() => verifyWorkerBaseMetadata(Buffer.from("PRIVATE"), f.configBytes, f.target), /BASE_IDENTITY_UNVERIFIED/);
});

test("validly rehashed but substituted, reordered or resized public base descriptors remain rejected", () => {
  for (const mutate of [
    (m: any) => m.layers[0].digest = marker("0"), (m: any) => m.layers[0].size++,
    (m: any) => [m.layers[0], m.layers[1]] = [m.layers[1], m.layers[0]],
    (m: any) => m.layers[0].mediaType = "application/vnd.docker.image.rootfs.diff.tar.gzip",
    (_m: any, c: any) => c.rootfs.diff_ids[0] = marker("0"),
    (_m: any, c: any) => [c.rootfs.diff_ids[0], c.rootfs.diff_ids[1]] = [c.rootfs.diff_ids[1], c.rootfs.diff_ids[0]],
  ]) assert.throws(() => verify(fixture(mutate)), /BASE_IDENTITY_UNVERIFIED/);
});

test("unreviewed extra overlays, missing layers and inconsistent diff-ID counts cannot inherit the two-layer application proof", () => {
  for (const mutate of [(m: any) => m.layers.pop(), (m: any) => m.layers.push(structuredClone(m.layers[0])),
    (_m: any, c: any) => c.rootfs.diff_ids.pop(), (_m: any, c: any) => c.rootfs.diff_ids[23] = "PRIVATE_DIFF_ID",
    (_m: any, c: any) => c.rootfs.type = "PRIVATE_TYPE"])
    assert.throws(() => verify(fixture(mutate)), /BASE_IDENTITY_UNVERIFIED/);
});

test("unknown platform/schema/config descriptors and inline or remote payload references are rejected", () => {
  for (const mutate of [(m: any) => m.schemaVersion = 1, (m: any) => m.mediaType = "PRIVATE_MEDIA",
    (m: any) => m.manifests = [], (m: any) => m.config.mediaType = "PRIVATE_CONFIG",
    (m: any) => m.config.urls = ["https://PRIVATE.invalid"], (m: any) => m.config.data = "PRIVATE_INLINE",
    (m: any) => m.layers[23].urls = ["https://PRIVATE.invalid"], (m: any) => m.layers[23].data = "PRIVATE_INLINE",
    (_m: any, c: any) => c.os = "windows", (_m: any, c: any) => c.architecture = "arm64"])
    assert.throws(() => verify(fixture(mutate)), /BASE_IDENTITY_UNVERIFIED/);
});

test("duplicate, zero, fractional and oversized later descriptors do not bypass bounded manifest checks", () => {
  for (const mutate of [(m: any) => m.layers[23].digest = m.layers[0].digest,
    (m: any) => m.layers[23].size = 0, (m: any) => m.layers[23].size = 1.5,
    (m: any) => m.layers[23].size = 64 * 1024 * 1024 + 1,
    (m: any) => { m.layers[22].size = 64 * 1024 * 1024; m.layers[23].size = 64 * 1024 * 1024; }])
    assert.throws(() => verify(fixture(mutate)), /BASE_IDENTITY_UNVERIFIED/);
});

test("oversized metadata and malformed JSON cannot become a sanitized success", () => {
  const f = fixture(), huge = Buffer.alloc(256 * 1024 + 1), broken = Buffer.from("{PRIVATE");
  for (const manifestBytes of [huge, broken]) assert.throws(() => verifyWorkerBaseMetadata(manifestBytes, f.configBytes,
    { ...f.target, runtimeDigest: sha(manifestBytes) }), /^Error: WORKER_PROOF_BASE_IDENTITY_UNVERIFIED$/);
  assert.throws(() => verifyWorkerBaseMetadata(f.manifestBytes, huge, { ...f.target, configDigest: sha(huge) }), /BASE_IDENTITY_UNVERIFIED/);
});

test("current Dockerfile is independently matched and changed/missing source is not a cloud deployment claim", t => {
  assert.deepEqual(verifyReviewedWorkerBaseSource(), { reviewedDockerfileMatched: true });
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "gmai-base-source-proof-")));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, "services", "worker", "Dockerfile"); mkdirSync(dirname(file), { recursive: true });
  assert.throws(() => verifyReviewedWorkerBaseSource(folder), /^Error: WORKER_PROOF_BASE_IDENTITY_UNVERIFIED$/);
  copyFileSync(join(root, "services", "worker", "Dockerfile"), file);
  assert.equal(verifyReviewedWorkerBaseSource(folder).reviewedDockerfileMatched, true);
  writeFileSync(file, "PRIVATE_CHANGED_SOURCE");
  assert.throws(() => verifyReviewedWorkerBaseSource(folder), /BASE_IDENTITY_UNVERIFIED/);
});

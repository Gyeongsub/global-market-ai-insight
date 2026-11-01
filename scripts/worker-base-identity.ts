import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_BASE_DIGEST, REVIEWED_WORKER_DOCKERFILE_SHA256, verifyPublicBaseMetadata } from "./public-base-notice-proof.mjs";

type Json = Record<string, any>;
interface PrivateIdentity { runtimeDigest: string; configDigest: string; }
const sha = (bytes: Buffer) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const id = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const fail = (): never => { throw new Error("WORKER_PROOF_BASE_IDENTITY_UNVERIFIED"); };
const object = (value: unknown): value is Json => value !== null && typeof value === "object" && !Array.isArray(value);
const decode = (bytes: Buffer): Json => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 256 * 1024) fail();
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!object(value)) fail(); return value;
};

/** Reviewed public bytes are inputs, not a network query or an installed image. */
function reviewedBase() {
  const folder = join(dirname(fileURLToPath(import.meta.url)), "data"), path = join(folder, "public-base-metadata.json");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32_000 || realpathSync(path) !== path ||
      lstatSync(folder).isSymbolicLink()) fail();
  const metadata = decode(readFileSync(path));
  if (metadata.manifestDigest !== PUBLIC_BASE_DIGEST || typeof metadata.manifestBase64 !== "string" ||
      typeof metadata.configBase64 !== "string") fail();
  const bytes = (text: string) => {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text) || text.length > 86_000) fail();
    const value = Buffer.from(text, "base64"); if (value.toString("base64") !== text) fail(); return value;
  };
  return verifyPublicBaseMetadata(bytes(metadata.manifestBase64), bytes(metadata.configBase64));
}

export function verifyReviewedWorkerBaseSource(root = process.cwd()) {
  try {
  const physical = realpathSync(root), directory = join(physical, "services", "worker"), path = join(directory, "Dockerfile");
  for (const item of [join(physical, "services"), directory]) if (!lstatSync(item).isDirectory() || lstatSync(item).isSymbolicLink() || realpathSync(item) !== item) fail();
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size < 1 || stat.size > 20_000 ||
      sha(readFileSync(path)).slice(7) !== REVIEWED_WORKER_DOCKERFILE_SHA256) fail();
  return { reviewedDockerfileMatched: true };
  } catch { return fail(); }
}

/** The private manifest/config are independently digest-bound before prefix checks.
 * Later application layers still require the separate strict mkdir/COPY proof. */
export function verifyWorkerBaseMetadata(manifestBytes: Buffer, configBytes: Buffer, expected: PrivateIdentity) {
  try {
    if (!Buffer.isBuffer(manifestBytes) || !Buffer.isBuffer(configBytes) ||
        manifestBytes.length < 1 || manifestBytes.length > 256 * 1024 || configBytes.length < 1 || configBytes.length > 256 * 1024 ||
        !object(expected) || !id(expected.runtimeDigest) || !id(expected.configDigest) ||
        sha(manifestBytes) !== expected.runtimeDigest || sha(configBytes) !== expected.configDigest) fail();
    const base = reviewedBase(), manifest = decode(manifestBytes), config = decode(configBytes);
    const layers = manifest.layers;
    if (manifest.schemaVersion !== 2 || manifest.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
        !object(manifest.config) || manifest.config.mediaType !== "application/vnd.oci.image.config.v1+json" ||
        manifest.config.digest !== expected.configDigest || manifest.config.size !== configBytes.length ||
        manifest.config.urls !== undefined || manifest.config.data !== undefined || manifest.manifests !== undefined ||
        !Array.isArray(layers) || layers.length !== base.layers.length + 2 ||
        config.os !== "linux" || config.architecture !== "amd64" || config.rootfs?.type !== "layers" ||
        !Array.isArray(config.rootfs.diff_ids) || config.rootfs.diff_ids.length !== layers.length ||
        !config.rootfs.diff_ids.every(id)) fail();
    let total = 0; const seen = new Set<string>();
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      if (!object(layer) || !id(layer.digest) || layer.mediaType !== "application/vnd.oci.image.layer.v1.tar+gzip" ||
          !Number.isSafeInteger(layer.size) || layer.size < 1 || layer.size > 64 * 1024 * 1024 ||
          layer.urls !== undefined || layer.data !== undefined || seen.has(layer.digest)) fail();
      seen.add(layer.digest); total += layer.size;
      const original = base.layers[index];
      if (original && (layer.digest !== original.digest || layer.size !== original.size ||
          layer.mediaType !== original.mediaType || config.rootfs.diff_ids[index] !== original.diffId)) fail();
    }
    if (total > 128 * 1024 * 1024) fail();
    return { reviewedPublicBaseManifestMatched: true, baseLayerDescriptorPrefixMatched: true,
      baseConfigDiffIdPrefixMatched: true, baseLayers: base.layers.length, laterLayers: 2,
      publicBasePlatform: base.platform, privateManifestAndConfigHashBound: true,
      laterOverlayContentsVerified: false, layerBodiesVerifiedByThisFunction: false,
      fullRootFilesystemOrLicenseProof: false, liveAwsTargetBoundByThisFunction: false,
      imageExecuted: false, publisherSignatureVerified: false, vulnerabilityScanPerformed: false,
      completeDistributedNoticesVerified: false, readyForPublication: false };
  } catch { return fail(); }
}

/** A registry manifest is a narrower proof: the private config/body and diff IDs
 * are NOT verified. Do not promote this result to the archive proof above. */
export function verifyWorkerBaseManifestPrefix(manifestBytes: Buffer, expected: PrivateIdentity) {
  try {
    if (!Buffer.isBuffer(manifestBytes) || manifestBytes.length < 1 || manifestBytes.length > 256 * 1024 ||
        !object(expected) || !id(expected.runtimeDigest) || !id(expected.configDigest) || sha(manifestBytes) !== expected.runtimeDigest) fail();
    const base = reviewedBase(), manifest = decode(manifestBytes), layers = manifest.layers;
    if (manifest.schemaVersion !== 2 || manifest.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
        manifest.manifests !== undefined || !object(manifest.config) || manifest.config.digest !== expected.configDigest ||
        manifest.config.mediaType !== "application/vnd.oci.image.config.v1+json" ||
        !Number.isSafeInteger(manifest.config.size) || manifest.config.size < 1 || manifest.config.size > 256 * 1024 ||
        manifest.config.urls !== undefined || manifest.config.data !== undefined || !Array.isArray(layers) ||
        layers.length !== base.layers.length + 2) fail();
    let total = 0; const seen = new Set<string>();
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index], original = base.layers[index];
      if (!object(layer) || !id(layer.digest) || layer.mediaType !== "application/vnd.oci.image.layer.v1.tar+gzip" ||
          !Number.isSafeInteger(layer.size) || layer.size < 1 || layer.size > 64 * 1024 * 1024 ||
          layer.urls !== undefined || layer.data !== undefined || seen.has(layer.digest) ||
          original && (layer.digest !== original.digest || layer.size !== original.size || layer.mediaType !== original.mediaType)) fail();
      seen.add(layer.digest); total += layer.size;
    }
    if (total > 128 * 1024 * 1024) fail();
    return { privateRuntimeManifestHashVerified: true, reviewedPublicBaseLayerPrefixMatched: true, baseLayers: base.layers.length,
      laterLayers: 2, privateConfigBytesVerified: false, privateConfigDiffIdsVerified: false,
      layerBodiesVerified: false, laterOverlayContentsVerified: false, currentApplicationBytesVerified: false,
      archiveExtracted: false, imageExecuted: false, publisherSignatureVerified: false,
      freshVulnerabilityScanPerformed: false, completeDistributedNoticesVerified: false, readyForPublication: false };
  } catch { return fail(); }
}

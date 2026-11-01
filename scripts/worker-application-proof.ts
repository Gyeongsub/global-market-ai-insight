import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { readBoundedCachedArchiveFiles, verifyCachedArchive, type PrivateCacheTarget } from "./scan-live-image-cache.js";

// Pure archive/source helpers: no CLI, promotion or top-level operator await.
export const WORKER_APPLICATION_FILES = Object.freeze(["main.mjs", "THIRD_PARTY_NOTICES.md", "licenses/AWS-SDK-JS-V3-APACHE-2.0.txt"] as const);
const FILES = WORKER_APPLICATION_FILES;
type Json = Record<string, any>;
const FAILURE_CODES = ["APPLICATION_FILE_INVALID", "ARCHIVE_INVALID", "ARGUMENTS_REJECTED", "BASE_IDENTITY_UNVERIFIED",
  "BUNDLE_SCOPE_INVALID", "CLOSING_STATE_CHANGED", "CONFIGURATION_INVALID", "CORE_BLOCKED", "DEADLINE_OR_CALL_LIMIT",
  "DIFF_ID_INVALID", "DOCKER_READ_UNVERIFIED", "ENTRYPOINT_INVALID", "INCOMPLETE", "LAYER_BINDING_INVALID",
  "LAYER_ENTRY_TYPE_REJECTED", "LAYER_INCOMPLETE", "LAYER_INVALID", "LAYER_SCOPE_INVALID", "LIVE_PATCH_REQUIRED",
  "METADATA_INVALID", "PRIVATE_ACL_UNVERIFIED", "SOURCE_BYTES_MISMATCH", "SOURCE_INVALID", "TEMP_CLEANUP_UNVERIFIED", "TEMP_INVALID"] as const;
type FailureCode = typeof FAILURE_CODES[number];
class WorkerProofFailure extends Error {
  readonly #packet;
  constructor(code: FailureCode, changedFiles: readonly typeof FILES[number][] = []) {
    const safe = FAILURE_CODES.includes(code) ? code : "INCOMPLETE";
    super(`WORKER_PROOF_${safe}`);
    // Fixed artifact labels only: no paths, hashes, bytes, cloud IDs or causes.
    const labels = safe === "SOURCE_BYTES_MISMATCH" ? FILES.filter(file => changedFiles.includes(file)) : [];
    this.#packet = Object.freeze({ error: `WORKER_PROOF_${safe}`, privateDetailsSuppressed: true,
      cloudMutations: 0, cleanupMustBeIndependentlyVerified: true,
      applicationMismatchFiles: Object.freeze(labels), currentImageSourceMatchVerified: false });
  }
  packet() { return this.#packet; }
}
export const workerProofFail = (code: FailureCode): never => { throw new WorkerProofFailure(code); };
const fail = workerProofFail;
export function workerProofFailurePacket(error: unknown) {
  try {
    if (error instanceof WorkerProofFailure) return WorkerProofFailure.prototype.packet.call(error);
  } catch { /* Untrusted prototypes/getters must not escape the private boundary. */ }
  return new WorkerProofFailure("INCOMPLETE").packet();
}
const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const utf8 = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\0.*$/s, "");

/** Only the final mkdir/COPY application layers, never an extracted filesystem.
 * No links, whiteouts, traversal or PAX redirection; no extraction/execution. */
export function readApplicationLayer(bytes: Buffer, directoryOnly = false) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || bytes.length > 16 * 1024 * 1024 || bytes.length % 512) fail("LAYER_INVALID");
  const files = new Map<string, Buffer>(), names = new Set<string>(); let ended = false;
  for (let offset = 0; offset < bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (bytes.length - offset < 1024 || !bytes.subarray(offset).every(byte => byte === 0)) fail("LAYER_INVALID");
      ended = true; break;
    }
    // A prefix has USTAR meaning only in the reviewed format. V7/GNU/PAX
    // normalization could otherwise prove a different filesystem path.
    if (!header.subarray(257, 265).equals(Buffer.from([117, 115, 116, 97, 114, 0, 48, 48]))) fail("LAYER_INVALID");
    const field = (start: number, length: number) => {
      const value = header.subarray(start, start + length), zero = value.indexOf(0);
      if (zero >= 0 && value.subarray(zero).some(byte => byte !== 0)) fail("LAYER_INVALID");
      try { return new TextDecoder("utf-8", { fatal: true }).decode(zero < 0 ? value : value.subarray(0, zero)); }
      catch { return fail("LAYER_INVALID"); }
    };
    const octal = (start: number, length: number) => {
      const value = header.subarray(start, start + length);
      if (value.some(byte => byte > 127)) fail("LAYER_INVALID");
      const text = value.toString("ascii");
      if (!/^ *[0-7]+[\0 ]*$/.test(text)) fail("LAYER_INVALID");
      const result = Number.parseInt(text, 8);
      if (!Number.isSafeInteger(result)) fail("LAYER_INVALID"); return result;
    };
    const checksum = octal(148, 8), size = octal(124, 12), kind = header[156];
    if (checksum !== header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0) || size > 5_000_000 || offset + 512 + size > bytes.length) fail("LAYER_INVALID");
    if (field(157, 100) !== "") fail("LAYER_INVALID");
    const prefix = field(345, 155), raw = `${prefix ? prefix + "/" : ""}${field(0, 100)}`;
    if (kind !== 53 && raw.endsWith("/")) fail("LAYER_SCOPE_INVALID");
    const name = kind === 53 ? raw.replace(/\/$/, "") : raw;
    if (names.has(name) || names.size >= 16 || !["app", "app/licenses", ...FILES.map(file => `app/${file}`)].includes(name)) fail("LAYER_SCOPE_INVALID");
    names.add(name);
    if (kind === 53) { if (size !== 0 || !["app", "app/licenses"].includes(name)) fail("LAYER_SCOPE_INVALID"); }
    else if ((kind === 0 || kind === 48) && !directoryOnly && name.startsWith("app/") && FILES.includes(name.slice(4) as typeof FILES[number])) {
      if (size < 1 || octal(108, 8) !== 65532 || octal(116, 8) !== 65532 || (octal(100, 8) & 0o7000) !== 0) fail("APPLICATION_FILE_INVALID");
      files.set(name.slice(4), bytes.subarray(offset + 512, offset + 512 + size));
    } else fail("LAYER_ENTRY_TYPE_REJECTED");
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (bytes.subarray(offset + 512 + size, next).some(byte => byte !== 0)) fail("LAYER_INVALID");
    offset = next;
  }
  if (!ended || directoryOnly && (!names.has("app") || names.size !== 1) || !directoryOnly && files.size !== FILES.length) fail("LAYER_INCOMPLETE");
  return files;
}

export function verifyWorkerApplicationArchive(bytes: Buffer, target: PrivateCacheTarget, expected: ReadonlyMap<string, Buffer>) {
  if (expected.size !== FILES.length || FILES.some(file => !Buffer.isBuffer(expected.get(file)) || expected.get(file)!.length < 1 || expected.get(file)!.length > 5_000_000)) fail("SOURCE_INVALID");
  const binding = verifyCachedArchive(bytes, target), files = readBoundedCachedArchiveFiles(bytes);
  const parse = (id: string) => { const data = files.get(`blobs/sha256/${id.slice(7)}`); if (!data || data.length > 256 * 1024) fail("METADATA_INVALID"); return JSON.parse(utf8(data!)); };
  const manifest = parse(target.runtimeDigest), config = parse(target.configDigest);
  if (config.config?.WorkingDir !== "/app" || JSON.stringify(config.config.Entrypoint) !== JSON.stringify(["/nodejs/bin/node", "main.mjs"]) ||
      config.config.User !== "65532:65532" || config.config.Cmd != null && JSON.stringify(config.config.Cmd) !== "[]" || manifest.layers.length < 2) fail("ENTRYPOINT_INVALID");
  const readLayer = (index: number, directoryOnly: boolean) => {
    const layer = manifest.layers[index], compressed = files.get(`blobs/sha256/${layer.digest.slice(7)}`);
    if (!compressed || compressed.length !== layer.size || compressed.length > 5_000_000 ||
        layer.mediaType !== "application/vnd.oci.image.layer.v1.tar+gzip" || digest(compressed) !== layer.digest) fail("LAYER_BINDING_INVALID");
    const unpacked = gunzipSync(compressed!, { maxOutputLength: directoryOnly ? 1024 * 1024 : 16 * 1024 * 1024 });
    if (digest(unpacked) !== config.rootfs.diff_ids[index]) fail("DIFF_ID_INVALID");
    return readApplicationLayer(unpacked, directoryOnly);
  };
  // Require the final two filesystem layers to be the reviewed WORKDIR mkdir
  // then COPY. No later overlay can replace/redirect the compared files.
  readLayer(manifest.layers.length - 2, true);
  const actual = readLayer(manifest.layers.length - 1, false);
  const changedFiles = FILES.filter(file => !expected.get(file)!.equals(actual.get(file)!));
  if (changedFiles.length) throw new WorkerProofFailure("SOURCE_BYTES_MISMATCH", changedFiles);
  return { ...binding, finalApplicationLayers: 2, regularApplicationFiles: FILES.length, applicationModuleBytes: actual.get("main.mjs")!.length,
    applicationModuleSha256: digest(actual.get("main.mjs")!).slice(7), applicationFilesMatchedCurrentBundle: true,
    finalLayerDiffIdsMatched: true, applicationLinksWhiteoutsOrPathRedirectionAccepted: false, archiveExtracted: false,
    imageExecuted: false, fullRootFilesystemOrLicenseProof: false, completeApplicationDependencyScanVerified: false, readyForPublication: false };
}

export function safeWorkerProofDirectory(base: string, directory: string, physicalBase: string) {
  try { return /^gmai-worker-source-proof-[A-Za-z0-9_-]+$/.test(basename(directory)) &&
    relative(resolve(base), resolve(directory)) === basename(directory) && realpathSync(base) === physicalBase &&
    !lstatSync(directory).isSymbolicLink() && lstatSync(directory).isDirectory() && realpathSync(directory) === resolve(physicalBase, basename(directory)); } catch { return false; }
}
export function readCurrentWorkerBundle() {
  const root = resolve("services/worker/bundle"), expected = new Map<string, Buffer>();
  for (const path of [root, join(root, "licenses")]) if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) fail("BUNDLE_SCOPE_INVALID");
  for (const file of FILES) { const path = resolve(root, file), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || stat.size < 1 || stat.size > 5_000_000) fail("BUNDLE_SCOPE_INVALID");
    expected.set(file, readFileSync(path)); }
  return expected;
}

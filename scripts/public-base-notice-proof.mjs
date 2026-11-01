import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { summarizeCaBundle } from "./worker-ca-trust.mjs";
import { assertNodeSecurityBaseline } from "./node-security-baseline.mjs";

export const PUBLIC_BASE_DIGEST = "sha256:eed5cbf9fcdb7f97de1fb39adde1972efa57df1085c0c76a5ea17c7c27ff8f6c";
// 2026-10-22: both pinned stages refreshed for the Node/CA security release.
// Current Dockerfile bytes, public metadata and private layer prefixes must agree.
export const REVIEWED_WORKER_DOCKERFILE_SHA256 = "7b82dbe84cc1c26a8c7807512aaa463ecd420fce517d58c12dad9084b0bee022";
const REGISTRY = "https://gcr.io/v2/distroless/nodejs22-debian13";
const TYPES = { manifest: "application/vnd.oci.image.manifest.v1+json",
  config: "application/vnd.oci.image.config.v1+json", layer: "application/vnd.oci.image.layer.v1.tar+gzip" };
const LIMIT = { requests: 50, milliseconds: 480_000, layers: 32, compressed: 64 * 1024 * 1024,
  totalCompressed: 128 * 1024 * 1024, expanded: 192 * 1024 * 1024, totalExpanded: 384 * 1024 * 1024,
  entries: 30_000, selectedBytes: 4 * 1024 * 1024, document: 500_000, metadata: 64_000 };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = bytes => "sha256:" + hash(bytes);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => /^sha256:[a-f0-9]{64}$/.test(value ?? "");
const fail = (reason = "UNVERIFIED") => {
  const error = new Error("PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE"); error.reasonCode = reason; throw error;
};
const utf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const pkgName = /^[a-z0-9][a-z0-9+.-]{0,127}$/;
const statusPath = /^var\/lib\/dpkg\/status\.d\/(?!.*\.md5sums$)([a-z0-9][a-z0-9+.-]{0,127})$/;
const copyrightPath = /^usr\/share\/doc\/[a-z0-9][a-z0-9+.-]{0,127}\/copyright$/;
const commonLicensePath = /^usr\/share\/common-licenses\/[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/;
const selected = path => statusPath.test(path) || copyrightPath.test(path) ||
  commonLicensePath.test(path) ||
  ["nodejs/LICENSE", "nodejs/LICENSE.txt", "nodejs/LICENSE.md", "usr/lib/os-release", "etc/os-release",
    "etc/ssl/certs/ca-certificates.crt"].includes(path);

function decodeObject(bytes, maximum) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximum) fail();
  const value = JSON.parse(utf8(bytes)); if (!object(value)) fail(); return value;
}
function descriptor(value, type, maximum) {
  if (!object(value) || !id(value.digest) || value.mediaType !== type || !Number.isSafeInteger(value.size) ||
      value.size < 1 || value.size > maximum || value.urls !== undefined || value.data !== undefined) fail();
  return { digest: value.digest, mediaType: value.mediaType, size: value.size };
}

/** Pure digest/platform binding, not a signature, vulnerability scan or live image proof. */
export function verifyPublicBaseMetadata(manifestBytes, configBytes, expectedDigest = PUBLIC_BASE_DIGEST) {
  if (!id(expectedDigest) || digest(manifestBytes) !== expectedDigest) fail();
  const manifest = decodeObject(manifestBytes, 64_000);
  if (manifest.schemaVersion !== 2 || manifest.mediaType !== TYPES.manifest || !Array.isArray(manifest.layers) ||
      manifest.layers.length < 1 || manifest.layers.length > LIMIT.layers) fail();
  const configDescriptor = descriptor(manifest.config, TYPES.config, 64_000);
  if (configBytes.length !== configDescriptor.size || digest(configBytes) !== configDescriptor.digest) fail();
  const config = decodeObject(configBytes, 64_000);
  if (config.os !== "linux" || config.architecture !== "amd64" || !object(config.config) || config.config.User !== "65532" ||
      JSON.stringify(config.config.Entrypoint) !== JSON.stringify(["/nodejs/bin/node"]) ||
      config.rootfs?.type !== "layers" || !Array.isArray(config.rootfs.diff_ids) ||
      config.rootfs.diff_ids.length !== manifest.layers.length || !config.rootfs.diff_ids.every(id)) fail();
  const layers = manifest.layers.map(layer => descriptor(layer, TYPES.layer, LIMIT.compressed));
  if (new Set(layers.map(layer => layer.digest)).size !== layers.length ||
      layers.reduce((sum, layer) => sum + layer.size, 0) > LIMIT.totalCompressed) fail();
  return { manifestDigest: expectedDigest, manifestBytes: manifestBytes.length, configDigest: configDescriptor.digest,
    configBytes: configBytes.length, platform: "linux/amd64", nonrootBaseUser: "65532",
    layers: layers.map((layer, index) => ({ ...layer, diffId: config.rootfs.diff_ids[index] })) };
}

function tarString(bytes) {
  const zero = bytes.indexOf(0);
  if (zero !== -1 && bytes.subarray(zero).some(byte => byte !== 0)) fail();
  return utf8(zero === -1 ? bytes : bytes.subarray(0, zero));
}
function pathName(raw, directory) {
  const path = raw.startsWith("./") ? raw.slice(2) : raw;
  const cleaned = directory && path.endsWith("/") ? path.slice(0, -1) : path;
  if (directory && ["./", "."].includes(raw)) return "";
  if (!cleaned || cleaned.length > 4096 || cleaned.startsWith("/") || /[\x00-\x1f\x7f\\:]/.test(cleaned) ||
      cleaned.split("/").some(part => !part || [".", ".."].includes(part))) fail();
  return cleaned;
}
function octal(bytes) {
  if (bytes.some(byte => byte > 127)) fail("TAR_NUMERIC_FORMAT_UNSUPPORTED");
  const text = bytes.toString("ascii");
  if (!/^ *[0-7]{1,12}[\0 ]*$/.test(text)) fail("TAR_NUMERIC_FORMAT_UNSUPPORTED");
  const value = Number.parseInt(text, 8); if (!Number.isSafeInteger(value)) fail(); return value;
}

/** No path is extracted, followed or executed. Restricted regular GNU records
 * have no USTAR prefix; extensions/sparse/PAX/device entries fail closed. */
export function inspectPublicBaseLayer(tar) {
  if (!Buffer.isBuffer(tar) || tar.length < 1024 || tar.length > LIMIT.expanded || tar.length % 512) fail();
  const entries = [], seen = new Set(); let end = false, selectedBytes = 0;
  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (tar.length - offset < 1024 || tar.subarray(offset).some(byte => byte !== 0)) fail();
      end = true; break;
    }
    const ustar = header.subarray(257, 265).equals(Buffer.from([117, 115, 116, 97, 114, 0, 48, 48]));
    const gnu = header.subarray(257, 265).equals(Buffer.from([117, 115, 116, 97, 114, 32, 32, 0]));
    if (!ustar && !gnu) fail("TAR_FORMAT_UNSUPPORTED");
    if (gnu) {
      // GNU offsets 345/357 are optional atime/ctime, NOT a filename prefix.
      // No offset, long-name/sparse/continuation or further header state.
      if (header.subarray(369).some(byte => byte !== 0)) fail("TAR_GNU_EXTENSION_REJECTED");
      for (const start of [345, 357]) {
        const value = header.subarray(start, start + 12);
        if (value.some(byte => byte !== 0)) octal(value);
      }
    }
    if (entries.length >= LIMIT.entries ||
        octal(header.subarray(148, 156)) !== header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)) fail();
    const size = octal(header.subarray(124, 136)), type = header[156], directory = type === 53;
    if (size > LIMIT.expanded || offset + 512 + size > tar.length || ![0, 48, 49, 50, 53].includes(type) ||
        (directory || type === 49 || type === 50) && size !== 0) fail();
    const prefix = ustar ? tarString(header.subarray(345, 500)) : "", name = tarString(header.subarray(0, 100));
    const path = pathName((prefix ? prefix + "/" : "") + name, directory);
    if (seen.has(path)) fail(); seen.add(path);
    const kind = directory ? "directory" : [49, 50].includes(type) ? "link" : "file";
    const part = path.split("/").at(-1), whiteout = part.startsWith(".wh.");
    if (whiteout && (kind !== "file" || size !== 0 || part === ".wh.")) fail();
    const entry = { path, kind, whiteout, bytes: size, tarFormat: ustar ? "ustar" : "restricted-gnu" };
    const content = tar.subarray(offset + 512, offset + 512 + size);
    if (kind === "link") {
      entry.archiveLinkTarget = tarString(header.subarray(157, 257));
      entry.archiveLinkKind = type === 50 ? "symlink" : "hardlink";
      entry.linkFollowed = false;
    }
    if (kind === "file" && selected(path)) {
      const maximum = statusPath.test(path) ? LIMIT.metadata : LIMIT.document;
      if (size < 1 || size > maximum || (selectedBytes += size) > LIMIT.selectedBytes) fail();
      utf8(content); entry.selectedContent = Buffer.from(content);
    }
    if (kind === "file" && path === "nodejs/bin/node") {
      if (size < 1) fail(); entry.nodeBinarySha256 = hash(content);
    }
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (tar.subarray(offset + 512 + size, next).some(byte => byte !== 0)) fail();
    entries.push(entry); offset = next;
  }
  if (!end) fail();
  return { entries, expandedBytes: tar.length };
}

function statusRecord(path, bytes) {
  const fields = new Map();
  for (const line of utf8(bytes).split("\n")) {
    if (!line || /^\s/.test(line)) continue;
    const colon = line.indexOf(":"); if (colon < 1) fail();
    const key = line.slice(0, colon);
    if (fields.has(key)) fail(); fields.set(key, line.slice(colon + 1).trim());
  }
  const name = fields.get("Package"), version = fields.get("Version"), architecture = fields.get("Architecture");
  if (!pkgName.test(name ?? "") || statusPath.exec(path)?.[1] !== name || typeof version !== "string" ||
      !/^[A-Za-z0-9.+:~_-]{1,128}$/.test(version) || !["amd64", "all"].includes(architecture)) fail();
  return { name, version, architecture, metadataBytes: bytes.length, metadataSha256: hash(bytes) };
}

/** Overlay ordering retains only bounded selected bytes; links are never dereferenced. */
export function evaluatePublicBaseLayers(binding, compressedLayers) {
  if (!object(binding) || !Array.isArray(binding.layers) || !Array.isArray(compressedLayers) ||
      binding.layers.length !== compressedLayers.length || binding.layers.length < 1 || binding.layers.length > LIMIT.layers) fail();
  const namespace = new Map(), retained = new Map(), reports = [];
  let expandedTotal = 0, compressedTotal = 0, inspectedEntries = 0, whiteouts = 0;
  const remove = (path, descendantsOnly = false) => {
    for (const key of namespace.keys()) if ((!descendantsOnly && key === path) || key.startsWith(path ? path + "/" : "")) {
      namespace.delete(key); retained.delete(key);
    }
  };
  for (let index = 0; index < binding.layers.length; index++) {
    const layer = binding.layers[index], compressed = compressedLayers[index];
    if (!id(layer?.digest) || !id(layer?.diffId) || layer.mediaType !== TYPES.layer || !Buffer.isBuffer(compressed) ||
        compressed.length !== layer.size || compressed.length > LIMIT.compressed || digest(compressed) !== layer.digest ||
        (compressedTotal += compressed.length) > LIMIT.totalCompressed) fail();
    const tar = gunzipSync(compressed, { maxOutputLength: LIMIT.expanded });
    if (digest(tar) !== layer.diffId || (expandedTotal += tar.length) > LIMIT.totalExpanded) fail();
    const parsed = inspectPublicBaseLayer(tar);
    if ((inspectedEntries += parsed.entries.length) > LIMIT.entries) fail();
    // OCI whiteouts only hide lower layers; same-layer entries are applied afterward.
    for (const entry of parsed.entries.filter(entry => entry.whiteout)) {
      whiteouts++; const slash = entry.path.lastIndexOf("/"), parent = slash < 0 ? "" : entry.path.slice(0, slash);
      const filename = entry.path.slice(slash + 1);
      if (filename === ".wh..wh..opq") remove(parent, true);
      else {
        const target = filename.slice(4); if (!target || [".", ".."].includes(target)) fail();
        remove((parent ? parent + "/" : "") + target);
      }
    }
    for (const entry of parsed.entries.filter(entry => !entry.whiteout)) {
      if (entry.path === "") continue;
      const pieces = entry.path.split("/");
      for (let part = 1; part < pieces.length; part++) {
        const parentKind = namespace.get(pieces.slice(0, part).join("/"))?.kind;
        if (parentKind !== undefined && parentKind !== "directory") fail();
      }
      const previousKind = namespace.get(entry.path)?.kind;
      if (entry.kind !== "directory" || previousKind !== undefined && previousKind !== "directory") remove(entry.path);
      namespace.set(entry.path, { kind: entry.kind, nodeBinarySha256: entry.nodeBinarySha256,
        archiveLinkTarget: entry.archiveLinkTarget, archiveLinkKind: entry.archiveLinkKind });
      retained.delete(entry.path);
      if (entry.selectedContent) retained.set(entry.path, Buffer.from(entry.selectedContent));
      if (namespace.size > LIMIT.entries || retained.size > 256 ||
          [...retained.values()].reduce((sum, bytes) => sum + bytes.length, 0) > LIMIT.selectedBytes) fail();
    }
    reports.push({ digest: layer.digest, diffId: layer.diffId, compressedBytes: compressed.length,
      expandedBytes: parsed.expandedBytes, entries: parsed.entries.length, digestAndDiffIdVerified: true,
      ustarEntries: parsed.entries.filter(entry => entry.tarFormat === "ustar").length,
      restrictedGnuEntries: parsed.entries.filter(entry => entry.tarFormat === "restricted-gnu").length });
  }
  const packages = [...retained.entries()].filter(([path]) => statusPath.test(path))
    .map(([path, bytes]) => statusRecord(path, bytes)).sort((a, b) => a.name.localeCompare(b.name));
  if (!packages.length || new Set(packages.map(pkg => pkg.name)).size !== packages.length ||
      namespace.get("nodejs/bin/node")?.kind !== "file" || !namespace.get("nodejs/bin/node").nodeBinarySha256) fail();
  const documents = [...retained.entries()].filter(([path]) => copyrightPath.test(path) || commonLicensePath.test(path) || path.startsWith("nodejs/LICENSE"))
    .map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
  const unresolvedSelectedLinks = [...namespace.entries()].filter(([path, entry]) => selected(path) && entry.kind === "link").map(([path]) => path).sort();
  const packageDocuments = packages.map(pkg => ({ ...pkg,
    copyrightParentKind: namespace.get("usr/share/doc/" + pkg.name)?.kind ?? "absent",
    exactCopyrightDocumentPresent: documents.some(doc => doc.path === "usr/share/doc/" + pkg.name + "/copyright") }));
  // A fixed one-hop GCC metadata relationship only. No generic path resolver,
  // filesystem dereference, recursive link traversal or repository-license fallback.
  const sharedCopyrightDocumentMappings = [];
  const gcc = packages.find(pkg => pkg.name === "gcc-14-base"), sourcePath = "usr/share/doc/gcc-14-base/copyright";
  const sourceDocument = documents.find(doc => doc.path === sourcePath);
  for (const name of ["libgcc-s1", "libgomp1", "libstdc++6"]) {
    const pkg = packages.find(pkg => pkg.name === name), parentPath = "usr/share/doc/" + name;
    const parent = namespace.get(parentPath);
    if (!pkg || !gcc || pkg.version !== gcc.version || pkg.architecture !== gcc.architecture ||
        parent?.kind !== "link" || parent.archiveLinkKind !== "symlink" ||
        !["gcc-14-base", "./gcc-14-base"].includes(parent.archiveLinkTarget) ||
        namespace.get("usr/share/doc/gcc-14-base")?.kind !== "directory" || !sourceDocument) continue;
    sharedCopyrightDocumentMappings.push({ package: name, parentPath, sourcePackage: "gcc-14-base",
      sourcePath, documentBytes: sourceDocument.bytes, documentSha256: sourceDocument.sha256,
      parentLinkMetadataSha256: hash(Buffer.from(parent.archiveLinkTarget)), mappingKind: "fixed-one-hop-public-archive-symlink",
      filesystemLinkFollowed: false, applicableLegalObligationsVerified: false });
  }
  const commonLicenseReferences = [];
  for (const [source, bytes] of retained) {
    if (!copyrightPath.test(source) && !source.startsWith("nodejs/LICENSE")) continue;
    const paths = new Set();
    for (const match of utf8(bytes).matchAll(/\/usr\/share\/common-licenses\/[A-Za-z0-9][A-Za-z0-9.-]{0,63}(?=$|[\s,;)'"\]])/g)) {
      paths.add(match[0].slice(1));
      if (paths.size > 64 || commonLicenseReferences.length + paths.size > 256) fail();
    }
    for (const path of paths) {
      const document = documents.find(doc => doc.path === path);
      commonLicenseReferences.push({ source, referencedPath: path, regularDocumentPresent: !!document,
        documentSha256: document?.sha256 ?? null, namespaceKind: namespace.get(path)?.kind ?? "absent" });
    }
  }
  return { layers: reports, compressedBytes: compressedTotal, expandedBytes: expandedTotal, inspectedEntries,
    whiteoutsApplied: whiteouts, packageDeclarations: packageDocuments, documents, unresolvedSelectedLinks,
    caBundle: retained.has("etc/ssl/certs/ca-certificates.crt") ? summarizeCaBundle(retained.get("etc/ssl/certs/ca-certificates.crt")) : null,
    sharedCopyrightDocumentMappings, commonLicenseReferences,
    archiveLinkMappingsInspected: true, arbitraryLinkTargetsResolved: false,
    completeReferenceInventoryVerified: false,
    packagesWithExactCopyrightDocument: packageDocuments.filter(pkg => pkg.exactCopyrightDocumentPresent).length,
    nodeBinarySha256: namespace.get("nodejs/bin/node").nodeBinarySha256,
    nodeLicenseDocumentPresent: documents.some(doc => doc.path.startsWith("nodejs/LICENSE")),
    archiveExtracted: false, linksFollowed: false, imageCodeExecuted: false, installedPackagesChanged: false,
    liveAwsImageBound: false, vulnerabilityScanPerformed: false, publisherSignatureVerified: false,
    applicableLegalObligationsVerified: false, completeDistributedNoticesVerified: false, readyForPublication: false };
}

function dockerfileBinding(root) {
  const physical = realpathSync(root), path = join(physical, "services", "worker", "Dockerfile");
  const stat = lstatSync(path), actual = realpathSync(path), offset = relative(physical, actual);
  if (!stat.isFile() || stat.isSymbolicLink() || isAbsolute(offset) || offset.startsWith(".." + sep) ||
      actual !== path || stat.size < 1 || stat.size > 20_000) fail();
  const bytes = readFileSync(path);
  if (hash(bytes) !== REVIEWED_WORKER_DOCKERFILE_SHA256 ||
      !utf8(bytes).includes("FROM gcr.io/distroless/nodejs22-debian13:nonroot@" + PUBLIC_BASE_DIGEST + " AS runtime")) fail();
  return hash(bytes);
}

/** Fixed anonymous public reads. Redirects stay on the observed public namespace. */
export async function collectPublicBaseNoticeProof(root = process.cwd(), fetcher = fetch) {
  let stage = "runtime-security-baseline";
  try {
    assertNodeSecurityBaseline(); stage = "dockerfile-binding";
    const source = dockerfileBinding(root), started = performance.now(); let calls = 0, bytesRead = 0;
    const read = async (url, maximum, redirectAllowed) => {
      let destination = url;
      for (let hop = 0; hop < 2; hop++) {
        const remaining = LIMIT.milliseconds - (performance.now() - started);
        if (remaining <= 0 || ++calls > LIMIT.requests) fail();
        const response = await fetcher(destination, { redirect: "manual", credentials: "omit",
          signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(20_000, remaining)))),
          headers: { Accept: "application/vnd.oci.image.manifest.v1+json, application/json, application/octet-stream" } });
        const reject = async () => { await response.body?.cancel(); fail(); };
        if (response.url && response.url !== destination) await reject();
        if ([301, 302, 307, 308].includes(response.status)) {
          if (!redirectAllowed || hop !== 0 || !response.headers.has("location")) await reject();
          const next = new URL(response.headers.get("location"), destination);
          if (next.protocol !== "https:" || next.hostname !== "gcr.io" || next.port || next.username || next.password ||
              next.search || next.hash || !next.pathname.startsWith("/artifacts-downloads/namespaces/distroless/repositories/")) await reject();
          await response.body?.cancel(); destination = next.href; continue;
        }
        const declared = response.headers.get("content-length");
        if (response.status !== 200 || !response.body || (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum))) await reject();
        const reader = response.body.getReader(), chunks = []; let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > maximum || performance.now() - started >= LIMIT.milliseconds) fail();
            chunks.push(Buffer.from(value));
          }
        } finally { await reader.cancel(); }
        if (size < 1 || (bytesRead += size) > LIMIT.totalCompressed + 128_000) fail();
        return Buffer.concat(chunks);
      }
      fail();
    };
    stage = "public-manifest";
    const manifestBytes = await read(REGISTRY + "/manifests/" + PUBLIC_BASE_DIGEST, 64_000, false);
    if (digest(manifestBytes) !== PUBLIC_BASE_DIGEST) fail();
    const manifest = decodeObject(manifestBytes, 64_000);
    const configDescriptor = descriptor(manifest.config, TYPES.config, 64_000);
    stage = "public-config";
    const configBytes = await read(REGISTRY + "/blobs/" + configDescriptor.digest, 64_000, true);
    stage = "metadata-binding";
    const binding = verifyPublicBaseMetadata(manifestBytes, configBytes), compressed = [];
    stage = "public-layers";
    for (const layer of binding.layers) compressed.push(await read(REGISTRY + "/blobs/" + layer.digest, layer.size, true));
    if (performance.now() - started >= LIMIT.milliseconds) fail();
    stage = "layer-provenance";
    const report = evaluatePublicBaseLayers(binding, compressed);
    stage = "final-source-binding";
    if (dockerfileBinding(root) !== source || performance.now() - started >= LIMIT.milliseconds) fail();
    return { mode: "fixed-public-base-notice-provenance-proof", observedAtUtc: new Date().toISOString(),
      dockerfileSha256: source, publicManifestDigest: binding.manifestDigest, publicConfigDigest: binding.configDigest,
      basePlatform: binding.platform, manifestAndConfigDigestsVerified: true, publicRegistryRequests: calls, publicBytesRead: bytesRead,
      awsCalls: 0, dockerCalls: 0, filesWritten: 0, packagesInstalled: 0, imagePushes: 0,
      privateCredentialsSent: false, privateProjectMetadataSent: false, ...report };
  } catch (cause) {
    const error = new Error("PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE");
    error.proofStage = stage;
    if (["TAR_GNU_EXTENSION_REJECTED", "TAR_FORMAT_UNSUPPORTED", "TAR_NUMERIC_FORMAT_UNSUPPORTED"].includes(cause?.reasonCode))
      error.proofReason = cause.reasonCode;
    throw error;
  }
}

if (import.meta.url === (process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "")) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) console.log(JSON.stringify({ mode: "dry-run", publicRegistryRequests: 0, awsCalls: 0, dockerCalls: 0,
      publicRequestsMax: LIMIT.requests, fixedPublicBaseDigest: PUBLIC_BASE_DIGEST, filesWritten: 0, packagesInstalled: 0,
      imageCodeExecuted: false, liveAwsImageBound: false, readyForPublication: false }));
    else {
      if (args.length !== 1 || args[0] !== "--execute-public-base") fail();
      console.log(JSON.stringify(await collectPublicBaseNoticeProof()));
    }
  } catch (error) { console.error(JSON.stringify({ error: "PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE", provenanceStatus: "unknown",
    proofStage: error.proofStage ?? "arguments",
    ...(error.proofReason ? { proofReason: error.proofReason } : {}),
    rawDetailsSuppressed: true, readyForPublication: false })); process.exitCode = 1; }
}

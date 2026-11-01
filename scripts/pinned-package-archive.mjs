import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("PINNED_PACKAGE_ARCHIVE_INVALID"); };
const utf8 = bytes => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
const rootDocument = /^(?:LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)(?:[._-][A-Za-z0-9._-]{1,48})?$/i;
function tarString(bytes) {
  const zero = bytes.indexOf(0);
  if (zero !== -1 && bytes.subarray(zero).some(byte => byte !== 0)) fail();
  return utf8(zero === -1 ? bytes : bytes.subarray(0, zero));
}
function octal(bytes) {
  if (bytes.some(byte => byte > 127) || !/^ *[0-7]{1,12}[\0 ]*$/.test(bytes.toString("ascii"))) fail();
  const value = Number.parseInt(bytes.toString("ascii"), 8);
  if (!Number.isSafeInteger(value)) fail();
  return value;
}

/** Pure in-memory inspection. No extraction, filesystem reads, installation or execution. */
export function inspectPinnedPackageArchive(target, compressed, integrity, profile = "aws-sdk") {
  const limits = profile === "aws-sdk" ? [2_000_000, 10_000_000, 2000] :
    profile === "frontend-helper" ? [5_000_000, 20_000_000, 4000] :
    profile === "reviewed-runtime" ? [5_000_000, 30_000_000, 5000] :
    profile === "reviewed-native-compiler" && target?.name === "@esbuild/win32-x64" && target?.version === "0.28.1" &&
      target?.license === "MIT" ? [16_000_000, 48_000_000, 64] :
    profile === "reviewed-frontend-native-compiler" && target?.name === "@rolldown/binding-win32-x64-msvc" &&
      target?.version === "1.2.14" && target?.license === "MIT" ? [16_000_000, 32_000_000, 16, 24_000_000] : null;
  const licenses = profile === "reviewed-runtime" ? ["Apache-2.0", "MIT", "0BSD"] : ["Apache-2.0", "MIT"];
  if (!limits || !target || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(target.name ?? "") ||
      !/^\d+\.\d+\.\d+$/.test(target.version ?? "") || !licenses.includes(target.license) ||
      !Buffer.isBuffer(compressed) || compressed.length < 1 || compressed.length > limits[0] ||
      !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity ?? "") ||
      `sha512-${createHash("sha512").update(compressed).digest("base64")}` !== integrity) fail();
  const tar = gunzipSync(compressed, { maxOutputLength: limits[1] });
  if (tar.length % 512 !== 0 || tar.length < 1024) fail();
  const names = new Set(), documents = [], regularFiles = [];
  let manifest, manifestBytes, manifestSha256, ended = false;
  for (let offset = 0; offset < tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every(byte => byte === 0)) fail();
      ended = true; break;
    }
    // npm's observed USTAR regular-file subset only. GNU/PAX/legacy headers
    // cannot borrow USTAR prefix semantics or establish document absence.
    if (!header.subarray(257, 265).equals(Buffer.from([117, 115, 116, 97, 114, 0, 48, 48])) ||
        header.subarray(500).some(byte => byte !== 0) || header.subarray(157, 257).some(byte => byte !== 0)) fail();
    const field = (start, length) => tarString(header.subarray(start, start + length));
    const checksum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header.subarray(148, 156))) fail();
    const prefix = field(345, 155), name = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
    if (!name.startsWith("package/") || name.includes("\\") ||
        /[\x00-\x1f\x7f]/.test(name) || name.split("/").some(part => !part || part === "." || part === "..") ||
        names.has(name) || names.size >= limits[2]) fail();
    const size = octal(header.subarray(124, 136)), kind = header[156];
    // Only the exact reviewed frontend native profile separates its compressed
    // transfer cap from its larger single .node file. Other profiles are unchanged.
    if (!Number.isSafeInteger(size) || size > (limits[3] ?? limits[0]) || (kind !== 0 && kind !== 48) || offset + 512 + size > tar.length) fail();
    names.add(name);
    const bytes = tar.subarray(offset + 512, offset + 512 + size);
    regularFiles.push({ path: name.slice(8), bytes: size, sha256: hash(bytes) });
    if (name === "package/package.json") {
      if (size < 1 || size > 100_000) fail();
      manifest = JSON.parse(utf8(bytes)); manifestBytes = bytes.length; manifestSha256 = hash(bytes);
    }
    const documentName = name.slice(8);
    if (!documentName.includes("/") && (rootDocument.test(documentName) ||
        (profile === "frontend-helper" && documentName === "THIRD-PARTY-LICENSE"))) {
      if (size < 1 || size > 500_000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(utf8(bytes))) fail();
      documents.push({ name: documentName, bytes: size, sha256: hash(bytes) });
    }
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (next > tar.length || !tar.subarray(offset + 512 + size, next).every(byte => byte === 0)) fail();
    offset = next;
  }
  if (!ended || manifest?.name !== target.name || manifest?.version !== target.version || manifest?.license !== target.license) fail();
  return { manifest, manifestBytes, manifestSha256, tarballSha256: hash(compressed), filesInspected: names.size,
    rootDocuments: documents.sort((a, b) => a.name.localeCompare(b.name)), regularFiles,
    expandedBytes: tar.length, archiveExtracted: false };
}

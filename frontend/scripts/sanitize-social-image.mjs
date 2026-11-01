import { readFileSync, writeFileSync } from "node:fs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ALLOWED_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function validChunkCrc(bytes, offset, end) {
  let crc = 0xffffffff;
  for (let i = offset + 4; i < end - 4; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0) === bytes.readUInt32BE(end - 4);
}

/**
 * Keep only the pixel-bearing chunks of the reviewed RGB social image.
 * Unknown chunks fail closed instead of silently changing its appearance.
 */
export function sanitizeSocialImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Social image must be a PNG.");
  }
  const chunks = [PNG_SIGNATURE];
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  let removedBytes = 0;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("Social image has a truncated PNG chunk.");
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length || end < offset) throw new Error("Social image has an invalid PNG chunk length.");
    if (!validChunkCrc(bytes, offset, end)) throw new Error("Social image has an invalid PNG chunk checksum.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset, end);
    if (type === "IHDR") {
      if (sawHeader || offset !== 8 || length !== 13 || bytes[offset + 16] !== 8 || bytes[offset + 17] !== 2 ||
          bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0 ||
          bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0) {
        throw new Error("Social image has an unsupported PNG header.");
      }
      sawHeader = true;
    } else if (type === "caBX") {
      if (!sawHeader || sawData || sawEnd) throw new Error("Social image metadata is out of order.");
      removedBytes += chunk.length;
    } else if (type === "IDAT") {
      if (!sawHeader || sawEnd) throw new Error("Social image pixel data is out of order.");
      sawData = true;
    } else if (type === "IEND") {
      if (!sawData || sawEnd || length !== 0 || end !== bytes.length) {
        throw new Error("Social image has an invalid PNG ending.");
      }
      sawEnd = true;
    } else if (!ALLOWED_CHUNKS.has(type)) {
      throw new Error("Social image contains an unreviewed PNG chunk.");
    }
    if (type !== "caBX") chunks.push(chunk);
    offset = end;
  }
  if (!sawHeader || !sawData || !sawEnd) throw new Error("Social image is incomplete.");
  return { bytes: Buffer.concat(chunks), removedBytes };
}

export function sanitizeSocialImageFile(path) {
  const source = readFileSync(path);
  const sanitized = sanitizeSocialImage(source);
  if (sanitized.removedBytes > 0) writeFileSync(path, sanitized.bytes);
  return { removedBytes: sanitized.removedBytes, outputBytes: sanitized.bytes.length };
}

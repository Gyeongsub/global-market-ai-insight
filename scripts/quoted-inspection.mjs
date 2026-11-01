const MAX_BYTES = 5_000_000;
const fail = () => { throw new Error("QUOTED_INSPECTION_SCOPE_INVALID"); };

/** In-memory heuristic views only: never evaluate JavaScript or print data.
 * Normalize complete JSON-style double-quoted strings, not a parsed object:
 * duplicate fields and all surrounding source must remain visible. Retain the
 * original view and decoded escaped values so normalization cannot hide a hit.
 * This is not a universal source-language/encoding parser or release approval. */
export function quotedInspectionVariants(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_BYTES) fail();
  const pieces = [], decoded = [];
  let last = 0, tokens = 0, work = 0, derivedBytes = 0;
  for (let index = 0; index < text.length;) {
    if (text[index] !== '"') { index++; continue; }
    let end = index + 1, escaped = false, invalid = false;
    for (; end < text.length; end++) {
      if (++work > text.length * 4 + 1000) fail();
      if (text.charCodeAt(end) < 0x20) { invalid = true; break; }
      if (text[end] === "\\") { escaped = true; end++; }
      else if (text[end] === '"') break;
    }
    if (invalid) { index++; continue; }
    if (end >= text.length) break;
    if (++tokens > 100_000) fail();
    if (escaped) {
      const raw = text.slice(index, end + 1);
      let value;
      try { value = JSON.parse(raw); }
      catch (error) { if (error instanceof SyntaxError) { index++; continue; } fail(); }
      if (typeof value !== "string") fail();
      derivedBytes += Buffer.byteLength(value, "utf8"); if (derivedBytes > MAX_BYTES * 2) fail();
      decoded.push(value);
      const normalized = JSON.stringify(value);
      if (normalized !== raw) { pieces.push(text.slice(last, index), normalized); last = end + 1; }
    }
    index = end + 1;
  }
  const normalized = pieces.length ? pieces.join("") + text.slice(last) : text;
  if (normalized !== text) {
    derivedBytes += Buffer.byteLength(normalized, "utf8"); if (derivedBytes > MAX_BYTES * 2) fail();
  }
  return [text, ...(normalized === text ? [] : [normalized]), ...decoded];
}

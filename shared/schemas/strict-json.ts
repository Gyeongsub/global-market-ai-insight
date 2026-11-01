const MAX_JSON_BYTES = 65_536;
const MAX_DEPTH = 32;
const MAX_ITEMS = 4_096;
const fail = (): never => { throw new Error("JSON_BOUNDARY_INVALID"); };

/** Native JSON grammar, followed by a bounded iterative inspection of the
 * original text. Duplicate decoded keys are ambiguous even when their last
 * value would satisfy a schema. No source evaluation, key normalization,
 * recursive reviver, repair, or raw parser message escapes this boundary. */
export function parseUnambiguousJson(text: string, maximumBytes = MAX_JSON_BYTES): unknown {
  if (typeof text !== "string" || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > MAX_JSON_BYTES ||
      text.length === 0 || text.length > maximumBytes || new TextEncoder().encode(text).length > maximumBytes) fail();
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return fail(); }
  const frames: ({ kind: "object"; expectsKey: boolean; keys: Set<string> } | { kind: "array" })[] = [];
  let items = 0;
  for (let cursor = 0; cursor < text.length; cursor++) {
    const char = text[cursor];
    if (char === '"') {
      const start = cursor;
      // Native parsing has already proved closed strings/valid escape grammar.
      for (cursor++; cursor < text.length; cursor++) {
        if (text[cursor] === "\\") cursor++;
        else if (text[cursor] === '"') break;
      }
      if (++items > MAX_ITEMS || cursor >= text.length) fail();
      const parent = frames.at(-1);
      if (parent?.kind === "object" && parent.expectsKey) {
        let key: string;
        try { key = JSON.parse(text.slice(start, cursor + 1)) as string; } catch { return fail(); }
        if (parent.keys.has(key)) fail();
        parent.keys.add(key); parent.expectsKey = false;
      }
    } else if (char === "{" || char === "[") {
      if (++items > MAX_ITEMS || frames.length >= MAX_DEPTH) fail();
      frames.push(char === "{" ? { kind: "object", expectsKey: true, keys: new Set() } : { kind: "array" });
    } else if (char === "}" || char === "]") {
      frames.pop();
    } else if (char === ",") {
      if (++items > MAX_ITEMS) fail();
      const parent = frames.at(-1); if (parent?.kind === "object") parent.expectsKey = true;
    }
  }
  if (frames.length !== 0) fail();
  return parsed;
}

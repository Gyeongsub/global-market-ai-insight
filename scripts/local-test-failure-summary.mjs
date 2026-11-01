import { createHash } from "node:crypto";

/** Diagnostic hints only, never gate authority. Preserve no raw test names,
 * assertions, paths, error messages, environment or child output. Hashes permit
 * matching a static test title locally without publishing that title in receipts.
 * Spec reporters can repeat failures in their final summary; de-duplicate them.
 * Missing/unrecognized/truncated output is not evidence that tests passed. */
export function summarizeLocalTestFailures(output) {
  const packet = { mode: "local-test-failure-hints", recognizedFailureMarkers: 0,
    uniqueFailureHints: [], hintsTruncated: false, rawDetailsSuppressed: true,
    successfulGateClaimed: false };
  if (typeof output !== "string" || output.length > 2_000_000) return packet;
  const seen = new Set();
  for (const line of output.split(/\r?\n/)) {
    const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
    const tap = /^\s*not ok ([0-9]{1,6}) - (.{1,1024})$/.exec(plain);
    const spec = /^\s*✖ (.{1,1024}) \([0-9.]+ms\)$/.exec(plain);
    if (!tap && !spec) continue;
    packet.recognizedFailureMarkers++;
    const name = tap ? tap[2] : spec[1];
    if (/[\x00-\x1f\x7f]/.test(name)) continue;
    const nameSha256 = createHash("sha256").update(name).digest("hex");
    const ordinal = tap ? Number(tap[1]) : null;
    const key = `${ordinal}:${nameSha256}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (packet.uniqueFailureHints.length === 16) { packet.hintsTruncated = true; continue; }
    packet.uniqueFailureHints.push({ ordinal, nameSha256 });
  }
  return packet;
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { summarizeLocalTestFailures as summarize } from "../local-test-failure-summary.mjs";

const hash = name => createHash("sha256").update(name).digest("hex");
test("TAP and spec failures retain only ordinal and title digest, never raw diagnostics", () => {
  const p = summarize('not ok 42 - PRIVATE_SENTINEL\n  error: PRIVATE_ERROR\n  path: C:/Users/private/file\n✖ second title (12.3ms)');
  assert.equal(p.recognizedFailureMarkers, 2);
  assert.deepEqual(p.uniqueFailureHints, [{ ordinal: 42, nameSha256: hash("PRIVATE_SENTINEL") },
    { ordinal: null, nameSha256: hash("second title") }]);
  assert.equal(p.successfulGateClaimed, false); assert.equal(p.rawDetailsSuppressed, true);
  assert.doesNotMatch(JSON.stringify(p), /PRIVATE|Users|second title|error:/);
});
test("ANSI spec output and repeated final summaries are deduplicated", () => {
  const p = summarize('\x1b[31m✖ fixed title (1.25ms)\x1b[39m\n✖ fixed title (1.25ms)');
  assert.equal(p.recognizedFailureMarkers, 2); assert.equal(p.uniqueFailureHints.length, 1);
  assert.equal(p.uniqueFailureHints[0].nameSha256, hash("fixed title"));
});
test("success, arbitrary errors and missing output are not converted to failure titles or passes", () => {
  for (const value of [undefined, null, {}, 1, '', '✔ passing title (1ms)\n# fail 0\nPRIVATE_ERROR', 'x'.repeat(2_000_001)]) {
    const p = summarize(value); assert.equal(p.recognizedFailureMarkers, 0);
    assert.deepEqual(p.uniqueFailureHints, []); assert.equal(p.successfulGateClaimed, false);
  }
});
test("diagnostic cardinality and raw line lengths remain bounded without claiming completeness", () => {
  const p = summarize(Array.from({ length: 30 }, (_, i) => `not ok ${i + 1} - case-${i}`).join('\n'));
  assert.equal(p.recognizedFailureMarkers, 30); assert.equal(p.uniqueFailureHints.length, 16); assert.equal(p.hintsTruncated, true);
  const malformed = summarize('not ok 2 - PRIVATE\x00VALUE\nnot ok 9999999 - large ordinal\n✖ ' + 'x'.repeat(1025) + ' (1ms)');
  assert.deepEqual(malformed.uniqueFailureHints, []);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateReleaseSourceProof, verifyReleaseSource } from "../release-source-proof.js";
const expected = Buffer.from("SYNTHETIC_BUNDLE");
const hash = createHash("sha256").update(expected).digest("hex");
function fixture() {
  return { mode: "local-backend-emitted-module-proof", awsCalls: 0, externalNetworkCalls: 0, filesWritten: 0,
    currentLockMatched: true, lockfileSha256: "a".repeat(64), readyForPublication: false,
    reports: ["controller", "worker", "sweeper", "alarm-circuit"].map(service => ({service, artifactBytes: expected.length, artifactSha256: hash,
      inMemoryRebuildMatchedWrittenArtifact: true, inMemoryRebuilds: 2, inputsBracketedFinalRebuild: true, inputBytesRechecked: true})) };
}
test("a bounded in-memory rebuild binds the exact selected application bytes and lock", () => {
  for (const service of ["controller", "worker"] as const) {
    const report = validateReleaseSourceProof(fixture(), service, expected);
    assert.equal(report.currentSourceRebuildVerified, true); assert.equal(report.artifactSha256, hash);
    assert.equal(JSON.stringify(report).includes("SYNTHETIC_BUNDLE"), false);
  }
});
test("stale artifact, incomplete input bracketing, duplicate targets or active side effects cannot pass", () => {
  const changes = [(v: any) => v.reports[1].artifactSha256 = "b".repeat(64), (v: any) => v.reports[1].artifactBytes++,
    (v: any) => v.reports[1].inputBytesRechecked = false, (v: any) => v.reports[1].inputsBracketedFinalRebuild = false,
    (v: any) => v.reports[1].inMemoryRebuilds = 1, (v: any) => v.reports[1].inMemoryRebuildMatchedWrittenArtifact = false,
    (v: any) => v.reports[2].service = "worker", (v: any) => v.reports.pop(), (v: any) => v.currentLockMatched = false,
    (v: any) => v.filesWritten = 1, (v: any) => v.externalNetworkCalls = 1, (v: any) => v.awsCalls = 1,
    (v: any) => v.readyForPublication = true, (v: any) => v.lockfileSha256 = "PRIVATE_SENTINEL"];
  for (const change of changes) { const value = fixture(); change(value);
    assert.throws(() => validateReleaseSourceProof(value, "worker", expected), /^Error: RELEASE_SOURCE_UNVERIFIED$/); }
  assert.throws(() => validateReleaseSourceProof(fixture(), "worker", Buffer.from("STALE_BUNDLE")), /^Error: RELEASE_SOURCE_UNVERIFIED$/);
});
test("invalid targets or input cannot start the fixed local subprocess", () => {
  for (const args of [["PRIVATE_SENTINEL", expected], ["worker", Buffer.alloc(0)], ["worker", null]]) {
    assert.throws(() => verifyReleaseSource(args[0] as any, args[1] as any), /^Error: RELEASE_SOURCE_UNVERIFIED$/);
  }
});
test("both live operators prove current source before cloud reads and recheck before success", () => {
  for (const service of ["controller", "worker"]) {
    const source = readFileSync(`scripts/verify-${service}-release.ts`, "utf8");
    const first = source.indexOf(`verifyReleaseSource("${service}"`);
    const cloud = source.indexOf(service === "worker" ? "const initialCore = core()" : "const initial=baseline()");
    const second = source.indexOf(`verifyReleaseSource("${service}"`, first + 1);
    assert.ok(first > 0 && first < cloud && second > cloud);
    assert.match(source, /currentSourceRebuildVerified:true|currentSourceRebuildVerified: true/);
  }
});

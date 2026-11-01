import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { capturePublicationManifest } from "../publication-audit.mjs";
import { publicationSnapshotPlan, createPublicationReviewSnapshot, writePublicationReviewSnapshot } from "../publication-review-snapshot.mjs";

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-publication-snapshot-"));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync("git", ["init", "-q", root], { windowsHide: true }).status, 0);
  writeFileSync(join(root, ".gitignore"), "outputs/\n");
  writeFileSync(join(root, "README.md"), "PRIVATE_CONTENT_SENTINEL");
  return root;
}

test("snapshot plan is inert and does not accept publication flags", () => {
  const p = publicationSnapshotPlan();
  assert.equal(p.filesWritten, 0); assert.equal(p.candidateReads, 0); assert.equal(p.gitReads, 0);
  assert.equal(p.readyForPublication, false); assert.equal(p.pushPerformed, false);
  assert.throws(() => publicationSnapshotPlan(["--push"]));
});
test("stable snapshot binds every candidate byte without including contents or clearing findings", t => {
  const root = repo(t), s = createPublicationReviewSnapshot(root);
  assert.equal(s.candidateFiles, 2); assert.equal(s.stableDoubleReadVerified, true);
  const row = s.manifest.find(x => x.file === "README.md");
  assert.equal(row.sha256, createHash("sha256").update("PRIVATE_CONTENT_SENTINEL").digest("hex"));
  assert.doesNotMatch(JSON.stringify(s), /PRIVATE_CONTENT_SENTINEL/);
  assert.equal(s.readyForPublication, false); assert.equal(s.atomicSnapshotClaimed, false);
  const result = writePublicationReviewSnapshot(root, s);
  const stored = JSON.parse(readFileSync(join(root, "outputs/local-gates", result.reportFile), "utf8"));
  assert.deepEqual(stored, s); assert.equal(result.filesWritten, 1);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "PRIVATE_CONTENT_SENTINEL");
  assert.equal(capturePublicationManifest(root).candidateFiles, 2);
});
test("changes after review prevent writing a stale snapshot", t => {
  const root = repo(t), s = createPublicationReviewSnapshot(root);
  writeFileSync(join(root, "README.md"), "CHANGED_CONTENT_SENTINEL");
  assert.throws(() => writePublicationReviewSnapshot(root, s), /PUBLICATION_SNAPSHOT_INCOMPLETE/);
  assert.equal(readdirSync(root).includes("outputs"), false);
});
test("mutated or caller-forged records cannot be written", t => {
  const root = repo(t), s = createPublicationReviewSnapshot(root);
  assert.throws(() => writePublicationReviewSnapshot(root, structuredClone(s)));
  s.readyForPublication = true;
  assert.throws(() => writePublicationReviewSnapshot(root, s));
  assert.equal(readdirSync(root).includes("outputs"), false);
});
test("tracked private state and credential findings block even local inventory persistence", t => {
  const root = repo(t);
  writeFileSync(join(root, ".env"), "private fixture");
  assert.throws(() => createPublicationReviewSnapshot(root));
  rmSync(join(root, ".env"));
  writeFileSync(join(root, "README.md"), "AK" + "IA" + "Z".repeat(16));
  assert.throws(() => createPublicationReviewSnapshot(root));
  assert.equal(readdirSync(root).includes("outputs"), false);
});
test("workflow cost and other manual findings remain visible, never waived", t => {
  const root = repo(t);
  writeFileSync(join(root, "blob.xyz"), "unrecognized fixture");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(join(root, ".github/workflows/check.yml"), "name: fixture\non: push\n");
  const s = createPublicationReviewSnapshot(root);
  assert.ok(s.findings.some(x => x.category === "unrecognized-file-type-review"));
  assert.ok(s.findings.some(x => x.category === "automation-workflow-cost-review"));
  assert.equal(s.findingsWaived, false); assert.equal(s.metadataOrRightsCleared, false);
});
test("oversized candidate cannot produce a partial success manifest", t => {
  const root = repo(t);
  writeFileSync(join(root, "large.txt"), Buffer.alloc(10_000_001, 65));
  assert.throws(() => capturePublicationManifest(root), /PUBLICATION_SNAPSHOT_INCOMPLETE/);
});
test("deleted tracked candidates make the manifest incomplete", t => {
  const root = repo(t);
  assert.equal(spawnSync("git", ["add", "README.md"], { cwd: root, windowsHide: true }).status, 0);
  rmSync(join(root, "README.md"));
  assert.throws(() => capturePublicationManifest(root), /PUBLICATION_SNAPSHOT_INCOMPLETE/);
});
test("inherited Git directory redirection cannot substitute another repository", t => {
  const root = repo(t), other = repo(t), prior = process.env.GIT_DIR;
  writeFileSync(join(other, "outside.md"), "FOREIGN_SENTINEL");
  try {
    process.env.GIT_DIR = join(other, ".git");
    const s = createPublicationReviewSnapshot(root);
    assert.equal(s.candidateFiles, 2); assert.equal(s.manifest.some(x => x.file === "outside.md"), false);
  } finally { if (prior === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = prior; }
});
test("CLI invalid arguments fail closed without disclosing filesystem or raw error details", () => {
  const script = resolve("scripts/publication-review-snapshot.mjs");
  const r = spawnSync(process.execPath, [script, "--push"], { cwd: tmpdir(), encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(r.status, 1); assert.equal(r.stdout, "");
  const p = JSON.parse(r.stderr); assert.equal(p.error, "PUBLICATION_SNAPSHOT_INCOMPLETE");
  assert.equal(p.rawDetailsSuppressed, true); assert.equal(p.pushPerformed, false);
  assert.equal(r.stderr.includes(tmpdir()), false);
});

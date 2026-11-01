import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { publicSourcePlan, publicSourceProjection, preparePublicSourceCandidate } from "../public-source-candidate.mjs";
import { sanitizeSocialImage } from "../../frontend/scripts/sanitize-social-image.mjs";

test("source candidate default is inert and arbitrary publication destinations are rejected", () => {
  const p = publicSourcePlan();
  assert.equal(p.networkCalls, 0); assert.equal(p.sourceCopied, false); assert.equal(p.readyForPublication, false);
  assert.throws(() => publicSourcePlan(["--push"]));
  const r = spawnSync(process.execPath, ["scripts/public-source-candidate.mjs", "--push", "private-sentinel"], { encoding: "utf8" });
  assert.equal(r.status, 1); assert.equal(r.stderr.includes("private-sentinel"), false);
});

test("the projection omits only the fixed historical SBOM and retains source bytes", () => {
  const source = Buffer.from("synthetic contents");
  assert.equal(publicSourceProjection("docs/evidence/worker-image-20260810.cdx.json", source), null);
  const copy = publicSourceProjection("docs/evidence/another.json", source);
  assert.deepEqual(copy, source); assert.notEqual(copy, source);
  for (const path of ["../x", "/x", "a/../x", "a//b", "a\\b", "a:b", ".git/config", "a/./b", "a\nb"]) {
    assert.throws(() => publicSourceProjection(path, source));
  }
});

test("public image projection preserves the original and equals the existing clean pixel copy", () => {
  const original = readFileSync(new URL("../../frontend/public/og.png", import.meta.url));
  const before = Buffer.from(original), clean = publicSourceProjection("frontend/public/og.png", original);
  assert.deepEqual(original, before);
  assert.deepEqual(clean, sanitizeSocialImage(original).bytes);
  assert.equal(sanitizeSocialImage(clean).removedBytes, 0);
  assert.throws(() => publicSourceProjection("frontend/public/og.png", Buffer.from("not png")));
});

test("local candidate copies only the reviewed projection and never changes originals or Git index", t => {
  const base = mkdtempSync(join(tmpdir(), "gmai-public-source-test-"));
  assert.ok(resolve(base).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  assert.equal(spawnSync("git", ["init", "-q", base]).status, 0);
  writeFileSync(join(base, ".gitignore"), "outputs/\n");
  mkdirSync(join(base, "frontend/public"), { recursive: true });
  mkdirSync(join(base, "docs/evidence"), { recursive: true });
  const image = readFileSync(new URL("../../frontend/public/og.png", import.meta.url));
  writeFileSync(join(base, "frontend/public/og.png"), image);
  const sbom = join(base, "docs/evidence/worker-image-20260810.cdx.json");
  writeFileSync(sbom, "{}");
  writeFileSync(join(base, "README.md"), "Synthetic test candidate\n");
  const record = preparePublicSourceCandidate(base), target = join(base, record.candidateDirectory);
  assert.equal(record.candidateFiles, 3); assert.equal(record.findingCount, 0);
  assert.equal(record.originalsPreserved, true); assert.equal(record.readyForPublication, false);
  assert.equal(record.publicationPerformed, false); assert.equal(record.networkCalls, 0);
  assert.equal(existsSync(join(target, "docs/evidence/worker-image-20260810.cdx.json")), false);
  assert.equal(existsSync(join(target, ".git")), false);
  assert.equal(existsSync(join(base, ".git/index")), false);
  assert.equal(readFileSync(sbom, "utf8"), "{}");
  assert.deepEqual(readFileSync(join(base, "frontend/public/og.png")), image);
  assert.deepEqual(readFileSync(join(target, "frontend/public/og.png")), sanitizeSocialImage(image).bytes);
  // A new secret-shaped source stops before another candidate can be prepared.
  writeFileSync(join(base, "secret.txt"), "AK" + "IA" + "Z".repeat(16));
  assert.throws(() => preparePublicSourceCandidate(base));
});

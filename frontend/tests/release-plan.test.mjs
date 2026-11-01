import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditRelease } from "../scripts/release-audit.mjs";
import { makeReleasePlan } from "../scripts/release-plan.mjs";

const current = auditRelease(fileURLToPath(new URL("../dist", import.meta.url)));
const builtDirectory = fileURLToPath(new URL("../dist", import.meta.url));

test("first release plans assets before image before HTML without AWS calls", () => {
  const plan = makeReleasePlan(current);
  assert.equal(plan.awsCalls, 0);
  assert.equal(plan.uploaded, false);
  assert.equal(plan.deletionPlanned, false);
  assert.deepEqual(plan.stages.map(stage => stage.name), ["immutable-assets", "stable-social-image", "stable-runtime-notices", "html-last"]);
  assert.ok(plan.stages[0].files.every(file => file.key.startsWith("assets/")));
  assert.deepEqual(plan.stages[1].files.map(file => file.key), ["og.png"]);
  assert.deepEqual(plan.stages[2].files.map(file => file.key), ["THIRD_PARTY_NOTICES.txt"]);
  assert.deepEqual(plan.stages[3].files.map(file => file.key), ["index.html"]);
  assert.equal(plan.noticesContentTypeRequired, "text/plain; charset=utf-8");
  assert.equal(plan.rollback.available, false);
});

test("unchanged release is a no-op and an old asset is retained", () => {
  assert.ok(makeReleasePlan(current, current).stages.every(stage => stage.files.length === 0));
  const old = structuredClone(current);
  const js = old.files.find(file => file.key.endsWith(".js"));
  js.key = "assets/previous-abcdefgh.js";
  const plan = makeReleasePlan(current, old);
  assert.deepEqual(plan.retainOldAssets, [js.key]);
  assert.deepEqual(plan.stages[0].files.map(file => file.key), current.files.filter(file => file.key.endsWith(".js")).map(file => file.key));
  assert.equal(plan.rollback.available, false);
  assert.match(plan.rollback.reason, /archived previous bundle/);
});

test("same immutable asset name cannot be silently overwritten", () => {
  const old = structuredClone(current);
  old.files.find(file => file.key.endsWith(".css")).sha256 = "0".repeat(64);
  assert.throws(() => makeReleasePlan(current, old), /immutable asset key changed/);
});

test("untrusted manifest cannot inject path, cache metadata or duplicate keys", () => {
  for (const edit of [
    old => { old.files[0].key = "../.env"; },
    old => { old.files[0].cacheControl = "public,max-age=999999999"; },
    old => { old.files[1].key = old.files[0].key; },
    old => { old.awsCalls = 1; },
  ]) {
    const old = structuredClone(current);
    edit(old);
    assert.throws(() => makeReleasePlan(current, old), /not a reviewed local audit|invalid file record/);
  }
});

test("real archived bytes can be verified locally without claiming remote rollback", () => {
  const plan = makeReleasePlan(current, current, builtDirectory);
  assert.equal(plan.awsCalls, 0);
  assert.equal(plan.rollback.localArchiveVerified, true);
  assert.equal(plan.rollback.available, false);
  assert.match(plan.rollback.reason, /remote object verification/);
  assert.throws(() => makeReleasePlan(current, null, builtDirectory), /requires its reviewed manifest/);
});

test("a changed archive is rejected even when its manifest looks valid", t => {
  const temporary = mkdtempSync(join(tmpdir(), "gmai-release-archive-"));
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const archive = join(temporary, "bundle");
  cpSync(builtDirectory, archive, { recursive: true });
  const htmlPath = join(archive, "index.html");
  writeFileSync(htmlPath, readFileSync(htmlPath, "utf8") + "\n");
  assert.throws(() => makeReleasePlan(current, current, archive), /bytes do not match/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateLicenseDocumentInventory, inspectInstalledLicenseDocuments } from "../dependency-license-inventory.mjs";

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-license-text-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pkg = join(root, "runtime");
  mkdirSync(pkg);
  return { root, pkg };
}
const lock = () => ({ lockfileVersion: "9.0", packages: { "runtime@1.0.0": {}, "optional@2.0.0": {} },
  importers: { ".": { dependencies: { runtime: { version: "1.0.0" } } } } });
const manifest = proof => ({ name: "runtime", version: "1.0.0", license: "MIT", licenseDocumentProof: proof });

test("license and notice files produce kind, byte count and hashes, never content or private file paths", t => {
  const { root, pkg } = directory(t);
  writeFileSync(join(pkg, "LICENSE.md"), "SYNTHETIC_LICENSE_TEXT");
  writeFileSync(join(pkg, "NOTICE.txt"), "SYNTHETIC_NOTICE_TEXT");
  writeFileSync(join(pkg, "unrelated.txt"), "NOT_A_LICENSE");
  const proof = inspectInstalledLicenseDocuments(pkg, realpathSync(root));
  assert.deepEqual(proof.issueCategories, []);
  assert.equal(proof.documents.length, 2);
  assert.equal(proof.documents[0].sha256, createHash("sha256").update("SYNTHETIC_LICENSE_TEXT").digest("hex"));
  assert.equal(JSON.stringify(proof).includes("SYNTHETIC_LICENSE_TEXT"), false);
  assert.equal(JSON.stringify(proof).includes(root), false);
});

test("missing platform metadata and empty document sets remain manual work, not publication or legal approval", () => {
  const result = evaluateLicenseDocumentInventory(lock(), [manifest({ documents: [], issueCategories: [] })]);
  assert.equal(result.packageRootsInspected, 1);
  assert.equal(result.packagesWithoutVerifiedLicenseFile, 2);
  assert.equal(result.incompleteOrConflictingRoots, 1);
  assert.equal(result.readyForPublication, false);
  assert.equal(result.declaredLicenseTextValidated, false);
  assert.equal(result.distributedNoticesComplete, false);
  assert.equal(result.noticeAbsenceTreatedAsLegalViolation, false);
});

test("root containment is verified before inspecting an unrelated directory", t => {
  const first = directory(t);
  const second = directory(t);
  assert.throws(() => inspectInstalledLicenseDocuments(second.pkg, realpathSync(first.root)), /SCOPE_INVALID/);
});

test("empty, oversized and nested license locations remain explicitly uninspected", t => {
  const { root, pkg } = directory(t);
  writeFileSync(join(pkg, "LICENSE"), "");
  writeFileSync(join(pkg, "COPYING.txt"), " ".repeat(500_001));
  mkdirSync(join(pkg, "licenses"));
  const proof = inspectInstalledLicenseDocuments(pkg, realpathSync(root));
  assert.equal(proof.documents.length, 0);
  assert.deepEqual(proof.issueCategories, ["empty-or-oversized-license-document-not-inspected"]);
  // Other nested directories are outside this deliberately root-only inventory.
});

test("linked license files or directories are not followed", t => {
  const { root, pkg } = directory(t);
  const outside = directory(t);
  try { symlinkSync(outside.pkg, join(pkg, "LICENSE"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  const proof = inspectInstalledLicenseDocuments(pkg, realpathSync(root));
  assert.equal(proof.documents.length, 0);
  assert.deepEqual(proof.issueCategories, ["non-regular-license-document-not-inspected"]);
});

test("conflicting peer-instance hashes cannot silently supply notice evidence", () => {
  const doc = digest => ({ kind: "license", bytes: 10, sha256: digest.repeat(64) });
  const result = evaluateLicenseDocumentInventory(lock(), [manifest({ documents: [doc("a")], issueCategories: [] }),
    manifest({ documents: [doc("b")], issueCategories: [] })]);
  assert.equal(result.packagesWithLicenseFile, 0);
  assert.equal(result.directRuntime[0].state, "document-review-required");
  assert.deepEqual(result.directRuntime[0].documentHashes, []);
});

test("malformed or sensitive document-proof values fail without being reflected", () => {
  assert.throws(() => evaluateLicenseDocumentInventory(lock(), [manifest({ documents: [{ kind: "license", bytes: 1, sha256: "PRIVATE_VALUE" }], issueCategories: [] })]), /PROOF_INVALID/);
  assert.throws(() => evaluateLicenseDocumentInventory(lock(), [manifest({ documents: [], issueCategories: ["PRIVATE_VALUE"] })]), /PROOF_INVALID/);
});

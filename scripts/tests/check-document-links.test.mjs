import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { checkDocumentLinks, markdownLinkTargets } from "../check-document-links.mjs";

test("extracts inline links but ignores fenced examples", () => {
  const markdown = '[one](docs/a.md) ![image](<assets/a b.png>)\n```md\n[ignored](missing.md)\n```\n[web](https://example.test)';
  assert.deepEqual(markdownLinkTargets(markdown), ["docs/a.md", "assets/a b.png", "https://example.test"]);
});

test("local documentation checker reports categories without leaking targets", t => {
  const root = join(tmpdir(), `gmai-doc-links-${process.pid}-${Date.now()}`);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "ok.md"), "# OK\n", "utf8");
  writeFileSync(join(root, "README.md"), [
    "[ok](docs/ok.md)",
    "[missing](docs/private-name.md)",
    "[outside](../outside.md)",
    "[absolute](C:/Users/Private/file.md)",
    "[web](https://example.test)",
  ].join("\n"), "utf8");
  const result = checkDocumentLinks(root);
  assert.equal(result.linksChecked, 4);
  assert.deepEqual(result.findings.map(({ category }) => category).sort(), [
    "absolute-or-invalid-local-link",
    "link-outside-project",
    "missing-local-link",
  ]);
  assert.doesNotMatch(JSON.stringify(result.findings), /private-name|Users\/Private|outside\.md/);
});

test("current project documentation has no missing or escaping relative links", () => {
  const result = checkDocumentLinks(process.cwd());
  assert.ok(result.markdownFiles > 20);
  assert.ok(result.linksChecked > 20);
  assert.deepEqual(result.findings, []);
});

function temporaryDocs(t) {
  const directory = mkdtempSync(join(tmpdir(), "gmai-doc-boundary-"));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("percent encoding cannot bypass absolute-drive, unknown-scheme or parent-traversal review", t => {
  const root = temporaryDocs(t);
  writeFileSync(join(root, "README.md"), "[drive](D%3A%5Cprivate%5Cfile.md)\n[scheme](file%3A%2F%2Fprivate)\n[outside](%2E%2E%2Fprivate.md)");
  const result = checkDocumentLinks(root);
  assert.deepEqual(result.findings.map(item => item.category).sort(), ["absolute-or-invalid-local-link", "absolute-or-invalid-local-link", "link-outside-project"]);
  assert.equal(JSON.stringify(result.findings).includes("private"), false);
});

test("linked documentation sources are not followed or silently counted as checked", t => {
  const root = temporaryDocs(t);
  const outside = temporaryDocs(t);
  writeFileSync(join(root, "README.md"), "# Local source");
  writeFileSync(join(outside, "outside.md"), "[untrusted](https://private.example)");
  try { symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  const result = checkDocumentLinks(root);
  assert.equal(result.markdownFiles, 1);
  assert.ok(result.findings.some(item => item.category === "linked-document-source-not-scanned"));
  assert.equal(JSON.stringify(result).includes("outside.md"), false);
});

test("oversized Markdown is an incomplete check, not a clean source", t => {
  const root = temporaryDocs(t);
  writeFileSync(join(root, "large.md"), " ".repeat(2_000_001));
  const result = checkDocumentLinks(root);
  assert.equal(result.markdownFiles, 0);
  assert.deepEqual(result.findings, [{ file: "large.md", category: "oversized-document-not-scanned" }]);
});

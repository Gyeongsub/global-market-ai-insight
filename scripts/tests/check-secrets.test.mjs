import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { credentialFindingNames } from "../credential-patterns.mjs";
import { quotedInspectionVariants } from "../quoted-inspection.mjs";

const scanner = fileURLToPath(new URL("../check-secrets.mjs", import.meta.url));

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-secret-test-"));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("local secret scanner reports token categories without echoing values", t => {
  const root = directory(t);
  const github = "github_" + "pat_" + "A".repeat(32);
  const session = "AWS_SESSION_TOKEN='" + "B".repeat(48) + "'";
  writeFileSync(join(root, "candidate.txt"), `${github}\n${session}`);
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stderr);
  assert.deepEqual(output.findings.map(finding => finding.detector), ["GitHub token", "non-empty AWS session assignment"]);
  assert.doesNotMatch(result.stderr, /github_pat_|AWS_SESSION_TOKEN|A{20}|B{20}/);
});

test("local secret scanner accepts a clean candidate without cloud calls", t => {
  const root = directory(t);
  writeFileSync(join(root, "clean.txt"), "synthetic local file");
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { secretScan: "passed", highConfidenceFindings: 0 });
});

test("local dependency patches cannot bypass credential scanning", t => {
  const root = directory(t);
  const token = "AK" + "IA" + "Z".repeat(16);
  writeFileSync(join(root, "dependency.patch"), "+token=" + token);
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).findings.length, 1);
  assert.equal(result.stderr.includes(token), false);
});

test("ESM, CommonJS and declaration TypeScript extensions cannot bypass credential scanning", t => {
  const root = directory(t);
  const token = "AK" + "IA" + "Z".repeat(16);
  for (const name of ["module.mts", "module.cts", "module.d.mts", "module.d.cts"]) writeFileSync(join(root, name), token);
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).findings.length, 4);
  assert.equal(result.stderr.includes(token), false);
});

test("JSON credential fields are detected without exposing values", t => {
  const root = directory(t);
  const token = "Token".repeat(10);
  for (const key of ["secretAccessKey", "sessionToken", "accessToken", "refreshToken", "apiKey", "TWELVE_DATA_API_KEY"]) {
    writeFileSync(join(root, "candidate.json"), JSON.stringify({ [key]: token }));
    const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stderr).findings.some(finding => finding.detector === "non-empty JSON credential field"));
    assert.equal(result.stderr.includes(token), false);
  }
});

test("short redacted JSON credential examples are not treated as actual secrets", t => {
  const root = directory(t);
  writeFileSync(join(root, "example.json"), JSON.stringify({ accessToken: "REDACTED", apiKey: "", secretAccessKey: "not-a-secret" }));
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("a linked source directory is not followed or falsely reported clean", t => {
  const root = directory(t);
  const outside = directory(t);
  const token = "Token".repeat(10);
  writeFileSync(join(outside, "private.json"), JSON.stringify({ accessToken: token }));
  try { symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr).findings, []);
  assert.ok(JSON.parse(result.stderr).scanErrors.some(entry => entry.category === "linked-path-not-scanned"));
  assert.equal(result.stderr.includes(token), false);
});

test("the generated dependency store is excluded without following its links", t => {
  const root = directory(t);
  const outside = directory(t);
  const store = join(root, ".pnpm-store");
  mkdirSync(store);
  try { symlinkSync(outside, join(store, "project-cache"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  writeFileSync(join(root, "clean.txt"), "synthetic local source");
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("oversized text sources cannot silently count as inspected", t => {
  const root = directory(t);
  writeFileSync(join(root, "large.json"), " ".repeat(2_000_001));
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stderr).scanErrors.some(entry => entry.category === "oversized-source-not-scanned"));
});

test("ambiguous text encoding fails closed without echoing candidate bytes", t => {
  const root = directory(t);
  for (const bytes of [Buffer.from([0xff]), Buffer.from("PRIVATE_SENTINEL", "utf16le"), Buffer.from("safe\0PRIVATE_SENTINEL")]) {
    writeFileSync(join(root, "candidate.txt"), bytes);
    const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stderr).scanErrors.some(entry => entry.category === "unreviewed-text-encoding"));
    assert.equal((result.stdout + result.stderr).includes("PRIVATE_SENTINEL"), false);
  }
});

const encodedString = value => '"' + [...value].map(character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")).join("") + '"';

test("JSON string escapes and duplicate keys cannot hide credential fields or token values", () => {
  const value = "Token".repeat(10);
  for (const content of ["{" + encodedString("apiKey") + ":" + encodedString(value) + "}",
    "{" + encodedString("apiKey") + ":" + encodedString(value) + ',"apiKey":""}',
    "const fixture = {" + encodedString("apiKey") + ":" + encodedString(value) + "};"]) {
    assert.deepEqual(credentialFindingNames(content), ["non-empty JSON credential field"]);
  }
  assert.deepEqual(credentialFindingNames(encodedString("AK" + "IA" + "Z".repeat(16))), ["AWS access key ID"]);
  assert.deepEqual(credentialFindingNames(encodedString("github_" + "pat_" + "A".repeat(32))), ["GitHub token"]);
});

test("escaped JSON credentials fail source scanning without printing decoded values", t => {
  const root = directory(t), value = "Token".repeat(10);
  writeFileSync(join(root, "candidate.json"), "{" + encodedString("apiKey") + ":" + encodedString(value) + "}");
  const result = spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stderr).findings[0].detector, "non-empty JSON credential field");
  assert.equal((result.stdout + result.stderr).includes(value), false);
});

test("quoted inspection retains original text and duplicate fields without executing source", () => {
  const source = "const fixture={" + encodedString("apiKey") + ':' + encodedString("Token".repeat(10)) + ',"apiKey":""};';
  const variants = quotedInspectionVariants(source);
  assert.equal(variants[0], source); assert.equal((variants[1].match(/"apiKey"/g) ?? []).length, 2);
  assert.ok(variants.some(value => value === "Token".repeat(10)));
  const arbitrary = "throw new Error(\"PRIVATE_SENTINEL\");";
  assert.deepEqual(quotedInspectionVariants(arbitrary), [arbitrary]);
});

test("escaped assignment values and malformed surrounding tokens cannot hide an original detector match", () => {
  const session = 'AWS_SESSION_TOKEN="' + "B".repeat(48) + '"';
  assert.deepEqual(credentialFindingNames(encodedString(session)), ["non-empty AWS session assignment"]);
  const original = 'BROKEN "\\q"\n' + "github_" + "pat_" + "A".repeat(32);
  assert.deepEqual(credentialFindingNames(original), ["GitHub token"]);
});

test("oversized or excessive quoted-token inspection is unknown, never an unbounded clean scan", () => {
  for (const input of [null, "x".repeat(5_000_001), '"" '.repeat(100_001)])
    assert.throws(() => quotedInspectionVariants(input), /^Error: QUOTED_INSPECTION_SCOPE_INVALID$/);
});

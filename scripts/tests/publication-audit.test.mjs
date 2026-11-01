import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { auditPublication, inspectPublicationCandidate } from "../publication-audit.mjs";

function temporaryRepository(t) {
  const root = mkdtempSync(join(tmpdir(), "gmai-publication-audit-"));
  assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const init = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  return root;
}

function stage(root, path) {
  const added = spawnSync("git", ["add", "--", path], { cwd: root, encoding: "utf8" });
  assert.equal(added.status, 0, added.stderr);
}

test("publication preflight reports categories without returning sensitive values", () => {
  const sensitive = "AK" + "IA" + "Z".repeat(16) + " user@example.test C:\\Users\\Someone\\secret";
  const found = inspectPublicationCandidate("note.md", Buffer.from(sensitive));
  assert.deepEqual(found, ["credential-pattern", "personal-computer-path", "email-string-review"]);
  assert.doesNotMatch(JSON.stringify(found), /Someone|example\.test|AKIA/);
});

test("fine-grained GitHub and AWS session token shapes are categories only", () => {
  const github = "github_" + "pat_" + "A".repeat(32);
  const awsSession = "AWS_SESSION_TOKEN=\"" + "A".repeat(48) + "\"";
  const found = inspectPublicationCandidate("notes.md", Buffer.from(`${github}\n${awsSession}`));
  assert.deepEqual(found, ["credential-pattern"]);
  assert.doesNotMatch(JSON.stringify(found), /github_pat_|AWS_SESSION_TOKEN/);
});

test("dependency patches are inspected as text, including added credential-shaped lines", () => {
  const token = "AK" + "IA" + "Z".repeat(16);
  assert.deepEqual(inspectPublicationCandidate("scripts/patches/example.patch",
    Buffer.from("+token=" + token)), ["credential-pattern"]);
  assert.deepEqual(inspectPublicationCandidate("scripts/patches/example.patch",
    Buffer.from("+if (items.length > 1000) return items;")), []);
});

test("TypeScript module and declaration extensions receive normal text privacy checks", () => {
  const token = "AK" + "IA" + "Z".repeat(16);
  for (const path of ["module.mts", "module.cts", "module.d.mts", "module.d.cts"]) {
    assert.deepEqual(inspectPublicationCandidate(path, Buffer.from(token)), ["credential-pattern"]);
    assert.deepEqual(inspectPublicationCandidate(path, Buffer.from("declare const safe: boolean;")), []);
  }
});

test("invalid image and unreviewed binary are not silently cleared", () => {
  assert.deepEqual(inspectPublicationCandidate("og.png", Buffer.from("not a PNG")), ["image-invalid-or-unreviewed"]);
  assert.deepEqual(inspectPublicationCandidate("evidence.pdf", Buffer.from("pdf")), ["binary-rights-and-metadata-review"]);
});

test("tracked credentials and generated output cannot hide behind Git ignore rules", () => {
  assert.ok(inspectPublicationCandidate(".env", Buffer.from("x")).includes("sensitive-file-name-review"));
  assert.ok(inspectPublicationCandidate("cert.pem", Buffer.from("x")).includes("sensitive-file-name-review"));
  assert.ok(inspectPublicationCandidate("cdk.out/template.json", Buffer.from("{}" )).includes("generated-or-private-path-review"));
  for (const path of [".pnpm-store/index.json", "frontend/dist/index.html", "services/worker/bundle/main.mjs"]) {
    assert.ok(inspectPublicationCandidate(path, Buffer.from("{}" )).includes("generated-or-private-path-review"));
  }
});

test("tracked credential caches, assistant state and private temporary output are never silently cleared", () => {
  for (const path of [".aws/login/cache.json", ".codex/history.jsonl", ".agents/local-context.json", "nested/.aws/config.json"]) {
    assert.ok(inspectPublicationCandidate(path, Buffer.from("{}" )).includes("credential-or-assistant-private-state-review"));
  }
  assert.ok(inspectPublicationCandidate(".tmp/references.json", Buffer.from("{}" )).includes("generated-or-private-path-review"));
  assert.ok(inspectPublicationCandidate("state.tfstate.backup", Buffer.from("{}" )).includes("sensitive-file-name-review"));
});

test("escaped Windows, forward-slash Windows and Unix personal paths require review without reflecting owners", () => {
  const windows = ["C:", "Users", "SyntheticOwner", "private"].join("\\");
  const unix = "/" + ["home", "SyntheticOwner", "private"].join("/");
  for (const content of [windows, JSON.stringify(windows), windows.replaceAll("\\", "/"), unix, unix.replaceAll("/", "\\/")]) {
    const found = inspectPublicationCandidate("notes.json", Buffer.from(content));
    assert.deepEqual(found, ["personal-computer-path"]);
    assert.equal(JSON.stringify(found).includes("SyntheticOwner"), false);
  }
});

test("internal ECR image addresses are reviewable cloud identity, not automatically public content", () => {
  const address = ["123456", "789012"].join("") + ".dkr.ecr.ap-northeast-1.amazonaws.com/private";
  const found = inspectPublicationCandidate("image-note.md", Buffer.from(address));
  assert.deepEqual(found, ["cloud-identifier-review"]);
  assert.equal(JSON.stringify(found).includes(address), false);
});

test("CLI rejects expansive flags and suppresses Git/filesystem error details without a push", () => {
  const script = resolve("scripts/publication-audit.mjs");
  for (const args of [[script, "--push"], [script]]) {
    const result = spawnSync(process.execPath, args, { cwd: tmpdir(), encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), { mode: "local-publication-preflight", error: "PUBLICATION_REVIEW_INCOMPLETE", pushPerformed: false, readyForPublication: false });
    assert.equal(result.stderr.includes(tmpdir()), false);
  }
});

test("JSON token-shaped credentials are blocked without returning their values", () => {
  const token = "Token".repeat(10);
  for (const key of ["secretAccessKey", "sessionToken", "accessToken", "refreshToken", "apiKey", "aws_secret_access_key"]) {
    const found = inspectPublicationCandidate("candidate.json", Buffer.from(JSON.stringify({ [key]: token })));
    assert.deepEqual(found, ["credential-pattern"]);
    assert.equal(JSON.stringify(found).includes(token), false);
  }
});

test("cloud account ARNs and API endpoints require review without echoing their values", () => {
  const content = "arn:aws:ecs:ap-northeast-1:123456789012:task/demo/abcdef https://abcdef.execute-api.ap-northeast-1.amazonaws.com";
  const found = inspectPublicationCandidate("deployment-note.md", Buffer.from(content));
  assert.deepEqual(found, ["cloud-identifier-review"]);
  assert.doesNotMatch(JSON.stringify(found), /123456789012|abcdef/);
});

test("configuration examples are inspected as text and unknown file types do not pass silently", () => {
  assert.deepEqual(inspectPublicationCandidate(".env.example", Buffer.from("AWS_ACCESS_KEY_ID=AK" + "IA" + "Z".repeat(16))), ["credential-pattern"]);
  assert.deepEqual(inspectPublicationCandidate("blob.xyz", Buffer.from("unreviewed")), ["unrecognized-file-type-review"]);
});

test("ambiguous text encoding cannot be silently cleared for publication", () => {
  for (const bytes of [Buffer.from([0xff]), Buffer.from("PRIVATE_SENTINEL", "utf16le"), Buffer.from("safe\0PRIVATE_SENTINEL")]) {
    assert.deepEqual(inspectPublicationCandidate("candidate.txt", bytes), ["unreviewed-text-encoding"]);
  }
});

test("escaped JSON privacy strings retain cloud, personal-path and email review categories", () => {
  const escaped = value => '"' + [...value].map(character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")).join("") + '"';
  const cases = [
    ["user@example.test", "email-string-review"],
    [["C:", "Users", "SyntheticOwner", "private"].join("\\"), "personal-computer-path"],
    ["arn:aws:ecs:ap-northeast-1:123456789012:task/synthetic/example", "cloud-identifier-review"],
  ];
  for (const [value, category] of cases) {
    const findings = inspectPublicationCandidate("candidate.json", Buffer.from('{"note":' + escaped(value) + "}"));
    assert.deepEqual(findings, [category]); assert.equal(JSON.stringify(findings).includes(value), false);
  }
});

test("escaped credential fields and excessive normalization cannot receive a clean publication result", () => {
  const escaped = value => '"' + [...value].map(character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")).join("") + '"';
  assert.deepEqual(inspectPublicationCandidate("candidate.json", Buffer.from("{" + escaped("apiKey") + ":" + escaped("Token".repeat(10)) + "}")), ["credential-pattern"]);
  assert.deepEqual(inspectPublicationCandidate("candidate.txt", Buffer.from('"" '.repeat(100_001))), ["unreviewed-text-normalization"]);
});

test("a future GitHub workflow always requires explicit automation and cost review", () => {
  const found = inspectPublicationCandidate(".github/workflows/ci.yml", Buffer.from("name: local checks\non: push\n"));
  assert.deepEqual(found, ["automation-workflow-cost-review"]);
});

test("a deleted tracked candidate is reported without aborting the whole audit", t => {
  const root = temporaryRepository(t);
  writeFileSync(join(root, "tracked.md"), "temporary fixture");
  stage(root, "tracked.md");
  rmSync(join(root, "tracked.md"));
  const result = auditPublication(root);
  assert.equal(result.readyForPublication, false);
  assert.deepEqual(result.findings, [{ file: "tracked.md", category: "missing-candidate-review" }]);
});

test("a tracked path redirected through a directory junction cannot be read", t => {
  const root = temporaryRepository(t);
  const outside = mkdtempSync(join(tmpdir(), "gmai-publication-outside-"));
  assert.ok(resolve(outside).startsWith(resolve(tmpdir()) + sep));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested", "tracked.md"), "original");
  stage(root, "nested/tracked.md");
  rmSync(join(root, "nested"), { recursive: true });
  writeFileSync(join(outside, "tracked.md"), "must not be scanned");
  try {
    symlinkSync(outside, join(root, "nested"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") return t.skip("Directory links require OS permission in this test environment.");
    throw error;
  }
  const result = auditPublication(root);
  assert.ok(result.findings.some(finding => finding.file === "nested/tracked.md" && finding.category === "outside-repository-path-review"));
  assert.doesNotMatch(JSON.stringify(result), /must not be scanned/);
});

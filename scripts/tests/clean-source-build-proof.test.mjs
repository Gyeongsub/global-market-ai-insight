import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import test from "node:test";

test("clean proofs discard inherited compiler executable and compiler-mode overrides", () => {
  const input=Object.freeze({PATH:"safe-path",ESBUILD_BINARY_PATH:"PRIVATE_SENTINEL",esbuild_worker_threads:"PRIVATE_SENTINEL",npm_config_esbuild_binary_path:"PRIVATE_SENTINEL"});
  const env=cleanSourceChildEnvironment(input);
  assert.equal(env.PATH,"safe-path"); assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"),false);
  assert.equal(input.ESBUILD_BINARY_PATH,"PRIVATE_SENTINEL");
});
import { cleanSourceChildEnvironment, copyFilter, copyInstalledDependencies, fingerprintCopiedSource, fingerprintCurrentSource, safeToRemove, summarizeLocalGateTests } from "../clean-source-build-proof.mjs";

test("local proof children do not inherit unknown application credentials or executable settings", () => {
  const original = Object.freeze({ Path: "safe-path", TEMP: "safe-temp", SystemRoot: "safe-system",
    DATABASE_URL: "PRIVATE_SENTINEL", AUTH_TOKEN: "PRIVATE_SENTINEL", AZURE_CLIENT_SECRET: "PRIVATE_SENTINEL",
    GOOGLE_APPLICATION_CREDENTIALS: "PRIVATE_SENTINEL", SSH_AUTH_SOCK: "PRIVATE_SENTINEL", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL", NODE_EXTRA_CA_CERTS: "PRIVATE_SENTINEL",
    SSLKEYLOGFILE: "PRIVATE_SENTINEL", LD_PRELOAD: "PRIVATE_SENTINEL", DYLD_INSERT_LIBRARIES: "PRIVATE_SENTINEL",
    PSModulePath: "PRIVATE_SENTINEL", VITE_PRIVATE_VALUE: "PRIVATE_SENTINEL", APP_ENV: "cloud", JOB_ID: "PRIVATE_SENTINEL" });
  const env = cleanSourceChildEnvironment(original);
  assert.equal(env.Path, original.Path); assert.equal(env.TEMP, original.TEMP); assert.equal(env.SystemRoot, original.SystemRoot);
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false);
  assert.equal(Object.hasOwn(env, "GIT_CONFIG_COUNT"), false); assert.equal(Object.hasOwn(env, "APP_ENV"), false);
  assert.equal(original.AUTH_TOKEN, "PRIVATE_SENTINEL");
});

test("a real Node child sees no inherited arbitrary credential sentinel", () => {
  const env = cleanSourceChildEnvironment({ ...process.env, UNRECOGNIZED_SERVICE_CREDENTIAL: "PRIVATE_SENTINEL" });
  const child = spawnSync(process.execPath, ["-e", 'console.log(JSON.stringify({credentialAbsent:!Object.hasOwn(process.env,"UNRECOGNIZED_SERVICE_CREDENTIAL"),metadataDisabled:process.env.AWS_EC2_METADATA_DISABLED==="true"}));'],
    { env, encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(child.status, 0); assert.equal(child.signal, null);
  assert.deepEqual(JSON.parse(child.stdout), { credentialAbsent: true, metadataDisabled: true });
});

test("bootstrap ambiguity and malformed values fail without returning rejected contents", () => {
  for (const input of [null, [], { PATH: 1 }, { TEMP: "PRIVATE\0SENTINEL" }, { TMP: "PRIVATE\nSENTINEL" },
    { PATH: "x".repeat(32769) }, { PATH: "safe-path", Path: "different-path" }])
    assert.throws(() => cleanSourceChildEnvironment(input), /^Error: LOCAL_PROOF_ENVIRONMENT_INVALID$/);
  assert.equal(Object.keys(cleanSourceChildEnvironment({ PATH: "same", Path: "same" })).filter(key => key.toUpperCase() === "PATH").length, 1);
  assert.equal(Object.hasOwn(cleanSourceChildEnvironment({ UNRECOGNIZED_SETTING: "PRIVATE\0SENTINEL" }), "UNRECOGNIZED_SETTING"), false);
});

test("whole-gate synthetic overrides and standalone test entrypoints use the same minimal boundary", () => {
  const gate = readFileSync("scripts/check-all.mjs", "utf8");
  assert.match(gate, /const localEnvironment = cleanSourceChildEnvironment\(process\.env\)/);
  assert.equal(/\.\.\.process\.env/.test(gate), false);
  assert.equal([...gate.matchAll(/\.\.\.localEnvironment/g)].length, 2);
  for (const path of ["scripts/test-all.mjs", "scripts/test-infra.mjs"])
    assert.match(readFileSync(path, "utf8"), /env: cleanSourceChildEnvironment\(process\.env\)/);
});

function temporary(t, prefix = "gmai-clean-source-proof-") {
  const base = resolve(tmpdir());
  const path = mkdtempSync(join(base, prefix));
  assert.ok(relative(base, path) && !relative(base, path).startsWith(`..${sep}`));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

function currentSourceFixture(t) {
  const root = temporary(t);
  for (const name of [".dockerignore", ".env.example", ".gitignore", "LICENSE", "README.md", "THIRD_PARTY_NOTICES.md",
    "agent.md", "cdk.json", "package.json", "plan.md", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.services.json"])
    writeFileSync(join(root, name), "synthetic-private-sentinel\n");
  for (const name of ["docs", "frontend", "infrastructure", "scripts", "services", "shared"]) mkdirSync(join(root, name));
  return root;
}

test("current-source framing matches the clean copied-tree scope without depending on directory insertion order", t => {
  const root = currentSourceFixture(t);
  mkdirSync(join(root, "docs", "example")); writeFileSync(join(root, "docs", "example", "z.md"), "source");
  writeFileSync(join(root, "docs", "example.md"), "sibling");
  const fingerprint = fingerprintCurrentSource(root);
  assert.deepEqual(fingerprint, fingerprintCopiedSource(root));
  assert.equal(fingerprint.files, 15); assert.equal(JSON.stringify(fingerprint).includes("private"), false);
  writeFileSync(join(root, "docs", "example.md"), "changed");
  assert.notEqual(fingerprint.sha256, fingerprintCurrentSource(root).sha256);
});

test("working-directory fingerprints exclude build/dependency/private residue but not legitimate source", t => {
  const root = currentSourceFixture(t), before = fingerprintCurrentSource(root);
  for (const name of ["node_modules", "outputs", ".aws", ".git", "cdk.out", "frontend/.next", "frontend/.vinext", "frontend/dist", "services/worker/bundle"])
    { mkdirSync(join(root, name), { recursive: true }); writeFileSync(join(root, name, "private.mjs"), "PRIVATE_SENTINEL"); }
  assert.deepEqual(fingerprintCurrentSource(root), before);
  mkdirSync(join(root, "docs", "out")); writeFileSync(join(root, "docs", "out", "source.md"), "retained-source");
  assert.notEqual(fingerprintCurrentSource(root).sha256, before.sha256);
});

test("missing required source, oversized files, private key material and redirected directories fail closed", t => {
  const root = currentSourceFixture(t), outside = temporary(t);
  rmSync(join(root, "plan.md")); assert.throws(() => fingerprintCurrentSource(root));
  writeFileSync(join(root, "plan.md"), "safe-source");
  writeFileSync(join(root, "docs", "private.pem"), "synthetic-only"); assert.throws(() => fingerprintCurrentSource(root));
  rmSync(join(root, "docs", "private.pem"));
  writeFileSync(join(root, "docs", "huge.md"), "x".repeat(10000001)); assert.throws(() => fingerprintCurrentSource(root));
  rmSync(join(root, "docs", "huge.md"));
  symlinkSync(outside, join(root, "docs", "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => fingerprintCurrentSource(root));
  assert.throws(() => fingerprintCurrentSource(join(root, "docs", "linked")));
});

test("module import performs no build, AWS read or temporary source copy", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./scripts/clean-source-build-proof.mjs"); console.log("IMPORTED_ONLY");'],
    { cwd: process.cwd(), encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "IMPORTED_ONLY");
  assert.equal(result.stderr, "");
});

test("copy boundary excludes credentials, private scratch state, dependency stores and cloud state", t => {
  const root = temporary(t);
  for (const name of [".aws", ".AWS", ".codex", ".agents", ".tmp", "outputs", "work", ".terraform", "node_modules", ".pnpm-store", "dist", "bundle", "cdk.out", "coverage", ".git", "cdk.context.json", "terraform.tfstate", "state.tfstate.backup", "state.tfstate.json", ".env", ".env.local", ".ENV.LOCAL", ".npmrc", ".yarnrc.yml", ".netrc"]) {
    assert.equal(copyFilter(join(root, name), root), false);
  }
  writeFileSync(join(root, ".env.example"), "APP_ENV=local");
  assert.equal(copyFilter(join(root, ".env.example"), root), true);
});

test("copied-source fingerprint is deterministic, framed and sensitive to source names and bytes", t => {
  const first = temporary(t), second = temporary(t);
  for (const root of [first, second]) { mkdirSync(join(root, "source")); writeFileSync(join(root, "source", "a.mjs"), "safe-source"); }
  const snapshot = fingerprintCopiedSource(first);
  assert.deepEqual(snapshot, fingerprintCopiedSource(second));
  assert.equal(snapshot.files, 1); assert.equal(snapshot.bytes, 11); assert.match(snapshot.sha256, /^[a-f0-9]{64}$/);
  writeFileSync(join(second, "source", "a.mjs"), "changed-source");
  assert.notEqual(snapshot.sha256, fingerprintCopiedSource(second).sha256);
  writeFileSync(join(first, "source", "b.mjs"), "safe-source");
  assert.notEqual(snapshot.sha256, fingerprintCopiedSource(first).sha256);
});

test("known frontend generated roots cannot become reproducibility inputs; unrelated source names stay included", t => {
  const root = temporary(t); mkdirSync(join(root, "frontend")); mkdirSync(join(root, "docs"));
  for (const name of [".next", ".vinext", ".wrangler", "out"]) {
    assert.equal(copyFilter(join(root, "frontend", name), root), false);
    const generated = join(root, "frontend", name); mkdirSync(generated); writeFileSync(join(generated, "cache.mjs"), "SYNTHETIC_ONLY");
    assert.throws(() => fingerprintCopiedSource(root), /Generated or private inputs/);
    rmSync(generated, { recursive: true });
  }
  // A legitimate non-frontend directory named out is not silently omitted.
  mkdirSync(join(root, "docs/out")); writeFileSync(join(root, "docs/out/source.md"), "source");
  assert.equal(copyFilter(join(root, "docs/out"), root), true);
  assert.equal(fingerprintCopiedSource(root).files, 1);
});

test("source fingerprints refuse generated/private inputs, certificates and directory redirects", t => {
  const root = temporary(t), outside = temporary(t);
  for (const name of ["node_modules", ".npmrc", ".aws", "private.CER", "state.tfstate.copy"]) {
    writeFileSync(join(root, name), "synthetic-only");
    assert.throws(() => fingerprintCopiedSource(root)); rmSync(join(root, name));
  }
  symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => fingerprintCopiedSource(root), /symlinks/);
  assert.throws(() => fingerprintCopiedSource(join(root, "linked")), /physical directory/);
});

test("clean-source test evidence requires four complete numeric groups and never returns captured output", () => {
  const group = prefix => `${prefix}tests 2\n${prefix}suites 0\n${prefix}pass 1\n${prefix}fail 0\n${prefix}cancelled 0\n${prefix}skipped 1\n${prefix}todo 0\n`;
  const source = "SYNTHETIC_PRIVATE_SENTINEL\n" + group("ℹ ") + group("# ") + group("ℹ ") + group("# ");
  assert.deepEqual(summarizeLocalGateTests(source), { groups: 4, total: 8, passed: 4, skipped: 4 });
  assert.equal(JSON.stringify(summarizeLocalGateTests(source)).includes("PRIVATE"), false);
  assert.throws(() => summarizeLocalGateTests(group("ℹ ")), /four reviewed test groups/);
  for (const [from, to] of [["fail 0", "fail 1"], ["todo 0", "todo 1"], ["cancelled 0", "cancelled 1"], ["tests 2", "tests 9"]])
    assert.throws(() => summarizeLocalGateTests(source.replace(from, to)), /incomplete/);
});

test("regular source is allowed, while source escape and private key files fail closed", t => {
  const root = temporary(t);
  const outside = temporary(t);
  writeFileSync(join(root, "index.mjs"), "export const safe = true;");
  writeFileSync(join(root, "private.PEM"), "synthetic test content");
  writeFileSync(join(outside, "index.mjs"), "outside source");
  assert.equal(copyFilter(join(root, "index.mjs"), root), true);
  assert.throws(() => copyFilter(join(root, "private.PEM"), root), /Private-key/);
  assert.throws(() => copyFilter(join(outside, "index.mjs"), root), /boundary/);
});

test("linked source directories cannot bring external private content into the copy", t => {
  const root = temporary(t);
  const outside = temporary(t);
  try { symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  assert.throws(() => copyFilter(join(root, "linked"), root), /symlinks/);
});

test("temporary cleanup requires a direct physical child, correct prefix and unchanged base", t => {
  const root = temporary(t);
  const base = resolve(tmpdir());
  const physicalBase = realpathSync(base);
  assert.equal(safeToRemove(base, root, physicalBase), true);
  for (const [candidateBase, candidate, expected] of [[base, root, undefined], [base, base, physicalBase],
    [root, base, physicalBase], [base, root, join(physicalBase, "wrong-root")]]) {
    assert.equal(safeToRemove(candidateBase, candidate, expected), false);
  }
  mkdirSync(join(root, "gmai-clean-source-proof-nested"));
  assert.equal(safeToRemove(base, join(root, "gmai-clean-source-proof-nested"), physicalBase), false);
});

test("a redirected temporary child is refused before recursive cleanup", t => {
  const root = temporary(t, "gmai-clean-source-guard-");
  const outside = temporary(t);
  const child = join(root, "gmai-clean-source-proof-linked");
  try { symlinkSync(outside, child, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error?.code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  assert.equal(safeToRemove(root, child, realpathSync(root)), false);
});

test("inherited credentials and cloud opt-ins are removed case-insensitively without mutating the caller", () => {
  const original = { Path: "synthetic-path", TEMP: "synthetic-temp", aws_security_token: "sentinel", AWS_ENDPOINT_URL: "sentinel",
    AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: "sentinel", Gmai_Enable_Internal_Jobs: "true", CDK_DEFAULT_ACCOUNT: "sentinel",
    TwelveData_Api_Key: "sentinel", OPENAI_API_KEY: "sentinel", GH_TOKEN: "sentinel", node_options: "sentinel", Node_Path: "sentinel",
    node_compile_cache: "sentinel", NODE_COMPILE_CACHE_PORTABLE: "sentinel", Node_Disable_Compile_Cache: "sentinel",
    NODE_V8_COVERAGE: "sentinel", node_tls_reject_unauthorized: "sentinel" };
  const env = cleanSourceChildEnvironment(original);
  assert.equal(env.Path, original.Path);
  assert.equal(env.TEMP, original.TEMP);
  assert.equal(Object.values(env).includes("sentinel"), false);
  assert.equal(env.AWS_EC2_METADATA_DISABLED, "true");
  assert.equal(env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  assert.equal(env.NODE_DISABLE_COMPILE_CACHE, "1"); assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, "1");
  assert.equal(original.Gmai_Enable_Internal_Jobs, "true");
});

test("unsupported command-line flags do not initiate a build", () => {
  const result = spawnSync(process.execPath, [resolve("scripts/clean-source-build-proof.mjs"), "--execute"],
    { encoding: "utf8", timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /accepts no arguments/);
});

function dependencyFixture(t) {
  const source = temporary(t), target = temporary(t);
  for (const root of [source, target]) mkdirSync(join(root, "frontend"));
  mkdirSync(join(source, "node_modules", ".pnpm", "synthetic@1.0.0", "node_modules", "synthetic"), { recursive: true });
  mkdirSync(join(source, "frontend", "node_modules"));
  const pkg = join(source, "node_modules", ".pnpm", "synthetic@1.0.0", "node_modules", "synthetic");
  writeFileSync(join(pkg, "package.json"), '{"name":"synthetic","version":"1.0.0"}');
  for (const path of [join(source, "node_modules", "synthetic"), join(source, "frontend", "node_modules", "synthetic")])
    symlinkSync(pkg, path, process.platform === "win32" ? "junction" : "dir");
  return { source, target, pkg };
}

test("dependency reuse copies bytes and rewrites directory links entirely inside the temporary tree", t => {
  const f = dependencyFixture(t);
  const report = copyInstalledDependencies(f.source, f.target);
  assert.deepEqual(report, { files: 1, bytes: 38, links: 2, unresolvedLinksOmitted: 0 });
  const copied = join(f.target, "node_modules", "synthetic", "package.json");
  assert.equal(realpathSync(join(f.target, "frontend", "node_modules", "synthetic")),
    join(f.target, "node_modules", ".pnpm", "synthetic@1.0.0", "node_modules", "synthetic"));
  writeFileSync(copied, "COPIED_ONLY");
  assert.match(readFileSync(join(f.pkg, "package.json"), "utf8"), /synthetic/);
  assert.throws(() => copyInstalledDependencies(f.source, f.target), /fresh output/);
});

test("dependency copy reports unused broken links without installing or concealing missing inputs", t => {
  const f = dependencyFixture(t);
  symlinkSync(join(f.source, "node_modules", "absent"), join(f.source, "node_modules", "broken"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(copyInstalledDependencies(f.source, f.target).unresolvedLinksOmitted, 1);
  assert.equal(existsSync(join(f.target, "node_modules", "broken")), false);
  assert.equal(existsSync(join(f.source, "node_modules", "absent")), false);
});

test("dependency links cannot copy external private directories or redirect the frontend output", t => {
  const f = dependencyFixture(t);
  const outside = temporary(t);
  symlinkSync(outside, join(f.source, "node_modules", "external"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => copyInstalledDependencies(f.source, f.target), /escapes the installed roots/);
  const other = dependencyFixture(t);
  rmSync(join(other.target, "frontend"), { recursive: true });
  symlinkSync(outside, join(other.target, "frontend"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => copyInstalledDependencies(other.source, other.target), /cannot be redirected/);
  assert.equal(existsSync(join(outside, "node_modules")), false);
});

test("only the exact byte-matched frontend workspace source may be rebased from the pnpm index", t => {
  const f = dependencyFixture(t);
  const manifest = '{"name":"synthetic-frontend","version":"1.0.0"}';
  writeFileSync(join(f.source, "frontend", "package.json"), manifest);
  writeFileSync(join(f.target, "frontend", "package.json"), manifest);
  symlinkSync(join(f.source, "frontend"), join(f.source, "node_modules", "workspace-package"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(copyInstalledDependencies(f.source, f.target).links, 3);
  assert.equal(realpathSync(join(f.target, "node_modules", "workspace-package")), join(f.target, "frontend"));
  const bad = dependencyFixture(t);
  writeFileSync(join(bad.source, "frontend", "package.json"), manifest);
  writeFileSync(join(bad.target, "frontend", "package.json"), manifest + " ");
  symlinkSync(join(bad.source, "frontend"), join(bad.source, "node_modules", "workspace-package"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => copyInstalledDependencies(bad.source, bad.target), /does not match its source/);
});

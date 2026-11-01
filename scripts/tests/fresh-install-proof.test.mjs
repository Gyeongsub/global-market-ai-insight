import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { LOCAL_GATE_TIMEOUT_MS } from "../clean-source-build-proof.mjs";
import { fetchPinnedPnpm, freshInstallEnvironment, freshInstallPlan, inspectPinnedPnpmArchive, inspectPnpmTarContents,
  PINNED_PNPM, safeFreshInstallTemporaryDirectory, validateFreshInstallLock, verifyPnpmMetadata, summarizeFrozenInstallFailure, summarizeLocalGateFailure } from "../fresh-install-proof.mjs";

const manifest = { private: true, packageManager: "pnpm@11.16.0" };
const lock = { lockfileVersion: "9.0", importers: { ".": {}, frontend: {} }, packages: { "fixture@1.0.0": { resolution: { integrity: `sha512-${"a".repeat(86)}==` } } } };
const metadata = { name: "pnpm", version: "11.16.0", license: "MIT", repository: { url: "git+https://github.com/pnpm/pnpm.git" },
  dist: { tarball: PINNED_PNPM.tarball, integrity: PINNED_PNPM.integrity }, bin: { pnpm: "bin/pnpm.mjs" }, engines: { node: ">=22.13" } };
const clone = value => JSON.parse(JSON.stringify(value));
test("install failure diagnostics retain bounded progress without private paths, URLs or process output", () => {
  const report=summarizeFrozenInstallFailure({status:null,signal:"SIGTERM",error:{code:"ETIMEDOUT",message:"PRIVATE_SENTINEL"},
    stdout:"PRIVATE_SENTINEL Progress: resolved 391, reused 0, downloaded 123, added 100",stderr:"https://PRIVATE_SENTINEL"});
  assert.equal(report.timeout,true); assert.deepEqual(report.progress,{resolved:391,reused:0,downloaded:123,added:100});
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"),false);
  assert.equal(summarizeFrozenInstallFailure({stdout:"Progress: resolved 1001, reused 0, downloaded 0, added 0"}).progress,null);
  assert.equal(summarizeFrozenInstallFailure({}).progress,null);
});
test("gate failure diagnostics distinguish timeout from failed exit without private output", () => {
  const report = summarizeLocalGateFailure({ status: null, signal: "SIGTERM", error: { code: "ETIMEDOUT", message: "PRIVATE_SENTINEL" },
    stdout: "PRIVATE_SENTINEL", stderr: "https://PRIVATE_SENTINEL" }, 240_031);
  assert.equal(report.timeout, true); assert.equal(report.successfulExit, false); assert.equal(report.elapsedMs, 240_031);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  assert.equal(summarizeLocalGateFailure({ status: 1, signal: null }, 1000).timeout, false);
  assert.equal(LOCAL_GATE_TIMEOUT_MS, 600_000);
  assert.equal(summarizeLocalGateFailure({ status: null, error: { code: "ETIMEDOUT" } }, 360_031).successfulExit, false);
  assert.equal(summarizeLocalGateFailure({}, 360_031).elapsedMs, 360_031);
  for (const elapsed of [-1, NaN, Infinity, LOCAL_GATE_TIMEOUT_MS + 5001, "PRIVATE_SENTINEL"]) assert.equal(summarizeLocalGateFailure({}, elapsed).elapsedMs, null);
});

test("installation diagnostics retain only bounded exit facts and fixed failure hints", () => {
  const report = summarizeFrozenInstallFailure({ status: 3221225477, signal: null,
    stdout: "PRIVATE_SENTINEL", stderr: "ERR_PNPM_FETCH_403 https://PRIVATE_SENTINEL EPERM SELF_SIGNED_CERT_IN_CHAIN panicked at PRIVATE_SENTINEL" });
  assert.equal(report.exitCode, 3221225477); assert.equal(report.successfulExit, false);
  assert.deepEqual(report.packageManagerErrorCodes, ["ERR_PNPM_FETCH_403"]);
  assert.equal(report.certificateFailureTextDetected, true); assert.equal(report.filesystemFailureTextDetected, true);
  assert.equal(report.internalPanicTextDetected, true); assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  const unknown = summarizeFrozenInstallFailure({ status: Infinity, signal: "PRIVATE_SENTINEL", error: { code: "PRIVATE_SENTINEL" },
    stderr: "ERR_PNPM_PRIVATE_SENTINEL" });
  assert.equal(unknown.exitCode, null); assert.equal(unknown.terminationSignal, null); assert.equal(unknown.spawnErrorCode, null);
  assert.deepEqual(unknown.packageManagerErrorCodes, []); assert.equal(JSON.stringify(unknown).includes("PRIVATE_SENTINEL"), false);
});
function tar(entries) {
  return Buffer.concat([...entries.flatMap(entry => { const header = Buffer.alloc(512); header.write(entry.name, 0, 100);
    header.write(entry.bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12); header.fill(32, 148, 156); header[156] = (entry.kind ?? "0").charCodeAt(0);
    header.write(header.reduce((value, byte) => value + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148, 8);
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)]; }), Buffer.alloc(1024)]);
}
const entries = () => [{ name: "package/package.json", bytes: Buffer.from(JSON.stringify({ name: "pnpm", version: "11.16.0", license: "MIT", bin: { pnpm: "bin/pnpm.mjs" } })) },
  { name: "package/bin/pnpm.mjs", bytes: Buffer.from("synthetic test only; never executed") }];

test("fresh proof accepts only the declared private project and integrity-only public lock resolutions", () => {
  assert.equal(validateFreshInstallLock(lock, manifest).lockedIdentities, 1);
  for (const value of [{ ...manifest, private: false }, { ...manifest, packageManager: "pnpm@latest" }]) assert.throws(() => validateFreshInstallLock(lock, value));
  for (const change of [value => { value.packages["fixture@1.0.0"].resolution.tarball = "PRIVATE_SENTINEL"; },
    value => { value.importers.other = {}; }, value => { value.packages["fixture@1.0.0"].resolution.integrity = "sha1-weak"; },
    value => { value.packages["git+https://PRIVATE_SENTINEL"] = value.packages["fixture@1.0.0"]; }]) {
    const bad = clone(lock); change(bad); assert.throws(() => validateFreshInstallLock(bad, manifest));
  }
});

test("tool metadata has one pinned version, repository, tarball, integrity and entrypoint", () => {
  verifyPnpmMetadata(metadata);
  for (const change of [value => { value.version = "11.19.0"; }, value => { value.dist.integrity = "PRIVATE_SENTINEL"; },
    value => { value.dist.tarball = "https://example.invalid/pnpm.tgz"; }, value => { value.repository.url = "PRIVATE_SENTINEL"; },
    value => { value.bin.pnpm = "postinstall.js"; }, value => { value.engines.node = "*"; }]) {
    const bad = clone(metadata); change(bad); assert.throws(() => verifyPnpmMetadata(bad));
  }
});

test("synthetic or corrupted downloads never pass pinned SHA-512 to reach extraction/execution", () => {
  const bytes = gzipSync(tar(entries())); assert.throws(() => inspectPinnedPnpmArchive(bytes), /INTEGRITY_INVALID/);
  assert.throws(() => inspectPinnedPnpmArchive(bytes, `sha512-${"a".repeat(86)}==`), /INTEGRITY_INVALID/);
  assert.throws(() => inspectPinnedPnpmArchive(Buffer.alloc(16_000_001)), /INTEGRITY_INVALID/);
});

test("tar inspection is bounded, non-extracting and requires the exact package/CLI manifest", () => {
  const result = inspectPnpmTarContents(tar(entries())); assert.equal(result.files, 2);
  assert.equal(result.entries.get("package/bin/pnpm.mjs").toString(), "synthetic test only; never executed");
  const wrong = entries(); wrong[0].bytes = Buffer.from(JSON.stringify({ name: "pnpm", version: "11.19.0" })); assert.throws(() => inspectPnpmTarContents(tar(wrong)));
  assert.throws(() => inspectPnpmTarContents(tar([entries()[0]])));
});

test("tar traversal, Windows devices, links, duplicates and incomplete/checksum-corrupt archives fail", () => {
  for (const entry of [{ name: "package/../PRIVATE_SENTINEL", bytes: Buffer.alloc(0) }, { name: "package/dist/NUL.txt", bytes: Buffer.alloc(0) },
    { name: "package/CON", bytes: Buffer.alloc(0) }, { name: "package/file.", bytes: Buffer.alloc(0) },
    { name: "package/link", bytes: Buffer.alloc(0), kind: "2" }, { name: "package/link", bytes: Buffer.alloc(0), kind: "1" }]) {
    assert.throws(() => inspectPnpmTarContents(tar([...entries(), entry])));
  }
  assert.throws(() => inspectPnpmTarContents(tar([...entries(), entries()[0]])));
  const corrupted = tar(entries()); corrupted[0] ^= 1; assert.throws(() => inspectPnpmTarContents(corrupted));
  assert.throws(() => inspectPnpmTarContents(tar(entries()).subarray(0, -1024)));
});

test("GNU long-name metadata extends one regular public path but cannot create a filesystem link or escape", () => {
  const longName = "package/dist/" + "a".repeat(110) + ".mjs";
  const extension = { name: "././@LongLink", bytes: Buffer.from(longName + "\0"), kind: "L" };
  const regular = { name: "package/truncated", bytes: Buffer.from("synthetic long-path file") };
  assert.equal(inspectPnpmTarContents(tar([...entries(), extension, regular])).entries.has(longName), true);
  for (const sequence of [[extension], [extension, extension, regular], [extension, { ...regular, kind: "2" }],
    [{ ...extension, bytes: Buffer.from("package/../PRIVATE_SENTINEL\0") }, regular],
    [{ ...extension, bytes: Buffer.from(longName) }, regular]]) assert.throws(() => inspectPnpmTarContents(tar([...entries(), ...sequence])));
});

test("public tool reads reject redirects, wrong destinations, errors and oversized streams without credentials", async () => {
  let calls = 0;
  const fetcher = async (url, options) => { calls++; assert.equal(url, PINNED_PNPM.metadata); assert.equal(options.redirect, "error");
    assert.equal(Object.keys(options.headers).join(","), "Accept"); return new Response(JSON.stringify(metadata), { status: 200 }); };
  assert.equal(JSON.parse((await fetchPinnedPnpm("metadata", fetcher)).toString()).version, "11.16.0"); assert.equal(calls, 1);
  await assert.rejects(fetchPinnedPnpm("PRIVATE_SENTINEL", fetcher)); assert.equal(calls, 1);
  for (const response of [new Response("private", { status: 401 }), new Response("x", { headers: { "content-length": "100001" } }),
    new Response(new Uint8Array(100001))]) await assert.rejects(fetchPinnedPnpm("metadata", async () => response));
});

test("fresh install inherits no cloud, AI, npm, proxy or package manager credentials/settings", () => {
  const env = freshInstallEnvironment({ PATH: "safe-path", AWS_PROFILE: "gmai-admin", AWS_SECRET_ACCESS_KEY: "PRIVATE_SENTINEL",
    npm_config__auth: "PRIVATE_SENTINEL", NPM_TOKEN: "PRIVATE_SENTINEL", PNPM_HOME: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL",
    GMAI_CONFIG: "PRIVATE_SENTINEL", NODE_OPTIONS: "PRIVATE_SENTINEL", OPENAI_API_KEY: "PRIVATE_SENTINEL",
    UNRECOGNIZED_SERVICE_CREDENTIAL: "PRIVATE_SENTINEL", SSH_AUTH_SOCK: "PRIVATE_SENTINEL", NODE_EXTRA_CA_CERTS: "PRIVATE_SENTINEL" }, "owned-root");
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false); assert.equal(env.PATH, "safe-path"); assert.equal(env.CI, "true");
  assert.equal(env.npm_config_ignore_scripts, "true"); assert.equal(env.pnpm_config_manage_package_manager_versions, "false");
  assert.equal(env.npm_config_registry, "https://registry.npmjs.org/"); assert.equal(env.pnpm_config_package_manager_strict, "true");
});

test("fresh proof cleanup requires its own exact physical child and cannot delete broad/nested paths", () => {
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-fresh-install-proof-"));
  try { assert.equal(safeFreshInstallTemporaryDirectory(base, directory, physical), true); mkdirSync(join(directory, "nested"));
    assert.equal(safeFreshInstallTemporaryDirectory(base, base, physical), false); assert.equal(safeFreshInstallTemporaryDirectory(base, join(directory, "nested"), physical), false);
    assert.equal(safeFreshInstallTemporaryDirectory(base, directory, physical + "different"), false);
  } finally { assert.equal(safeFreshInstallTemporaryDirectory(base, directory, physical), true); rmSync(directory, { recursive: true }); }
});

test("default CLI/import cannot fetch, install, execute an arbitrary argument or reveal private input", () => {
  assert.equal(freshInstallPlan().packagesInstalled, 0); assert.equal(freshInstallPlan().awsCalls, 0);
  for (const args of [[], ["--execute"], ["--execute-isolated-install", "PRIVATE_SENTINEL"]]) {
    const run = spawnSync(process.execPath, ["scripts/fresh-install-proof.mjs", ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(run.status, args.length ? 1 : 0); assert.equal(`${run.stdout}${run.stderr}`.includes("PRIVATE_SENTINEL"), false);
  }
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./scripts/fresh-install-proof.mjs");'], { encoding: "utf8", timeout: 5000 });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});

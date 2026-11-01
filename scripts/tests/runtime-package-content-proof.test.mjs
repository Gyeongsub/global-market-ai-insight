import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import test from "node:test";
import { runtimePackageContentPlan, validateRuntimeArchiveFileRecords, compareInstalledRuntimePackage,
  collectRuntimePackageContentProof, captureRuntimeInstallationSnapshot, verifyRuntimeInstallationSnapshot } from "../runtime-package-content-proof.mjs";

const digest = text => createHash("sha256").update(text).digest("hex");
const record = (path, text) => ({ path, bytes: Buffer.byteLength(text), sha256: digest(text) });
function fixture(run) {
  const base = resolve(tmpdir()), root = mkdtempSync(join(base, "gmai-runtime-content-test-")), marker = randomUUID();
  const pkg = join(root, "pkg"), rows = [record("package.json", "{}"), record("nested/public.js", "PUBLIC_FIXTURE\n")];
  writeFileSync(join(root, "scope"), marker); mkdirSync(join(pkg, "nested"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), "{}"); writeFileSync(join(pkg, "nested/public.js"), "PUBLIC_FIXTURE\n");
  try { return run({ root, pkg, rows }); }
  finally {
    if (dirname(root) !== base || !/^gmai-runtime-content-test-[A-Za-z0-9]+$/.test(basename(root)) ||
        lstatSync(root).isSymbolicLink() || realpathSync(root) !== join(realpathSync(base), basename(root)) ||
        readFileSync(join(root, "scope"), "utf8") !== marker) throw Error("OWNED_TEST_CLEANUP_REFUSED");
    rmSync(root, { recursive: true, force: true });
  }
}

test("exact publisher file set and bytes match without changing or executing the package", () => fixture(({ pkg, rows }) => {
  assert.deepEqual(compareInstalledRuntimePackage(pkg, rows), { filesMatched: 2, bytesMatched: 17,
    exactLocalFileSetMatched: true, linksFollowed: false, packagesModified: false, packageCodeExecuted: false });
  assert.equal(readFileSync(join(pkg, "nested/public.js"), "utf8"), "PUBLIC_FIXTURE\n");
}));

test("absolute, traversal, device, ADS, alternate separator, ambiguous case and unsupported path forms fail first", () => {
  for (const name of ["/private", "../private", "a/../private", "C:/private", "a\\private", "a//b", "a/", ".", "a./b",
    "a/ b", "a/b ", "a\0b", "NUL", "nested/CON.js", "COM1.txt", "LPT9", "private:key", "a?b", "a*", "한글.js"])
    assert.throws(() => validateRuntimeArchiveFileRecords([record("package.json", "{}"), record(name, "X")]));
  assert.throws(() => validateRuntimeArchiveFileRecords([record("package.json", "{}"), record("Package.json", "{}") ]));
});

test("malformed, absent, oversized or duplicate file records cannot define an installed-file scope", () => {
  const valid = record("package.json", "{}");
  for (const records of [[], null, Array(5001).fill(valid), [valid, valid], [record("not-a-manifest", "X")],
    [{ ...valid, bytes: -1 }], [{ ...valid, bytes: 5000001 }], [{ ...valid, bytes: NaN }],
    [{ ...valid, sha256: "PRIVATE_SENTINEL" }], [{ ...valid, extra: true }]])
    assert.throws(() => validateRuntimeArchiveFileRecords(records));
});

test("same-size changed bytes, missing files and extra unreviewed private files never get repaired or printed", () => fixture(({ pkg, rows }) => {
  const file = join(pkg, "nested/public.js"); writeFileSync(file, "CHANGED_BYTES!\n");
  assert.throws(() => compareInstalledRuntimePackage(pkg, rows));
  writeFileSync(file, "PUBLIC_FIXTURE\n"); writeFileSync(join(pkg, ".env"), "PRIVATE_SENTINEL");
  assert.throws(() => compareInstalledRuntimePackage(pkg, rows), /^Error: RUNTIME_PACKAGE_CONTENT_PROOF_INCOMPLETE$/);
  rmSync(join(pkg, ".env")); rmSync(file);
  assert.throws(() => compareInstalledRuntimePackage(pkg, rows));
}));

test("a root or nested directory junction is refused without following its publisher-like contents", () => fixture(({ root, pkg, rows }) => {
  const alias = join(root, "alias"); symlinkSync(pkg, alias, "junction");
  assert.throws(() => compareInstalledRuntimePackage(alias, rows));
  const outside = join(root, "owned-outside"); mkdirSync(outside); writeFileSync(join(outside, "private"), "PRIVATE_SENTINEL");
  symlinkSync(outside, join(pkg, "redirect"), "junction");
  assert.throws(() => compareInstalledRuntimePackage(pkg, rows));
}));

test("post-read metadata change is rejected even when the read bytes themselves matched", () => fixture(({ pkg, rows }) => {
  const original = rows[1]; let reads = 0;
  const changed = { path: original.path, bytes: original.bytes, get sha256() {
    if (++reads === 2) utimesSync(join(pkg, "nested/public.js"), new Date(0), new Date(0));
    return original.sha256;
  } };
  assert.throws(() => compareInstalledRuntimePackage(pkg, [rows[0], changed])); assert.equal(reads, 2);
}));

test("private whole-installation metadata snapshots bind the exact directory and cannot be forged or cloned", () => fixture(({ root, pkg }) => {
  const snapshot = captureRuntimeInstallationSnapshot(pkg);
  assert.equal(Object.isFrozen(snapshot), true); assert.equal(JSON.stringify(snapshot).includes(root), false);
  assert.deepEqual(verifyRuntimeInstallationSnapshot(pkg, snapshot), { metadataStable: true, filesObserved: 2 });
  for (const value of [undefined, {}, { ...snapshot }]) assert.throws(() => verifyRuntimeInstallationSnapshot(pkg, value));
  assert.throws(() => verifyRuntimeInstallationSnapshot(root, snapshot));
}));

test("a later file or timestamp change cannot borrow an earlier whole-installation snapshot", () => fixture(({ pkg }) => {
  const initial = captureRuntimeInstallationSnapshot(pkg), file = join(pkg, "nested/public.js");
  utimesSync(file, new Date(0), new Date(0)); assert.throws(() => verifyRuntimeInstallationSnapshot(pkg, initial));
  const second = captureRuntimeInstallationSnapshot(pkg); writeFileSync(join(pkg, "extra"), "PRIVATE_SENTINEL");
  assert.throws(() => verifyRuntimeInstallationSnapshot(pkg, second));
}));

test("bad response status, redirect, length, empty/invalid archives stop after one fixed GET", async () => {
  for (const make of [() => new Response("X", { status: 403 }), () => new Response("X", { headers: { "content-length": "5000001" } }),
    () => new Response(""), () => new Response("NOT_AN_ARCHIVE"), () => {
      const r = new Response("X"); Object.defineProperty(r, "url", { value: "https://private.invalid/" }); return r;
    }]) {
    let requests = 0;
    await assert.rejects(collectRuntimePackageContentProof(process.cwd(), async (url, options) => {
      requests++; assert.equal(new URL(url).origin, "https://registry.npmjs.org"); assert.ok(url.endsWith(".tgz"));
      assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
      assert.deepEqual(Object.keys(options.headers), ["Accept"]); assert.ok(options.signal instanceof AbortSignal); return make();
    }));
    assert.equal(requests, 1);
  }
});

test("rejected archive headers cancel unread streams", async () => {
  let cancelled = false;
  await assert.rejects(collectRuntimePackageContentProof(process.cwd(), async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("X")); }, cancel() { cancelled = true; }
  }), { status: 403 })));
  assert.equal(cancelled, true);
});

test("missing source/default/rejected CLI cannot trigger a request or disclose caller scope", async () => {
  let requests = 0; await assert.rejects(collectRuntimePackageContentProof("nonexistent-synthetic-content-root", async () => { requests++; }));
  assert.equal(requests, 0);
  const plan = runtimePackageContentPlan(); assert.equal(plan.requestedArchiveReadsMax, 37);
  for (const field of ["awsCalls", "publicRegistryRequests", "filesWritten", "packagesInstalled", "subprocessesStarted"]) assert.equal(plan[field], 0);
  assert.equal(plan.registrySignatureVerificationPerformed, false); assert.equal(plan.readyForPublication, false);
  assert.throws(() => runtimePackageContentPlan(["PRIVATE_SENTINEL"]));
  for (const args of [[], ["--package", "PRIVATE_SENTINEL"], ["--execute-public-archives", "--repair", "PRIVATE_SENTINEL"]]) {
    const r = spawnSync(process.execPath, ["scripts/runtime-package-content-proof.mjs", ...args], { encoding: "utf8", timeout: 5000, windowsHide: true });
    assert.equal(r.status, args.length ? 1 : 0); assert.equal((r.stdout + r.stderr).includes("PRIVATE_SENTINEL"), false);
    if (!args.length) assert.deepEqual(JSON.parse(r.stdout), plan); else assert.equal(r.stdout, "");
  }
});

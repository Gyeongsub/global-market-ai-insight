import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

test("local archive scan children cannot select an inherited compiler binary", () => {
  const source={PATH:"safe-path",ESBUILD_BINARY_PATH:"PRIVATE_SENTINEL",esbuild_worker_threads:"PRIVATE_SENTINEL",npm_config_esbuild_binary_path:"PRIVATE_SENTINEL"};
  const env=cacheScanChildEnvironment(source,"owned-empty-config");
  assert.equal(env.PATH,"safe-path"); assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"),false);
  assert.equal(source.ESBUILD_BINARY_PATH,"PRIVATE_SENTINEL");
});
import { cacheScanChildEnvironment, cachedScanFailurePacket, collectPrivateCacheTarget, collectPrivateDatedPatchCacheTarget, liveCacheScanPlan, safeScanTemporaryDirectory,
  scanLiveImageCache, summarizeLiveArchiveScan, verifyCachedArchive, verifyCachedLiveImage, verifyCachedScanner, verifyOwnedScanContainer } from "../scan-live-image-cache.js";
import { ACCOUNT, clone, CONFIG, CONFIG_DIGEST, DIGEST, indexedResponses, LAYER_BYTES, LAYER_DIGEST, MANIFEST, NOW } from "./fixtures/live-image-fixture.js";
import { PATCH } from "../worker-patch-identity.js";

const imageId = CONFIG_DIGEST;
const scanner = "sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f";
const input = indexedResponses() as any[];
const target = { reference: input[4].taskDefinition.containerDefinitions[0].image, configDigest: imageId, runtimeDigest: DIGEST };
const image = () => [{ Id: imageId, Os: "linux", Architecture: "amd64", RepoDigests: [target.reference], Config: { User: "65532:65532" }, Size: 55_000_000 }];
const scannerImage = () => [{ Id: scanner, Os: "linux", Architecture: "amd64", RepoDigests: [`aquasec/trivy@sha256:${"e".repeat(64)}`], Config: { Entrypoint: ["trivy"] } }];
const database = (now = NOW) => ({ Version: 2, UpdatedAt: new Date(now - 60_000).toISOString(), DownloadedAt: new Date(now - 30_000).toISOString(), NextUpdate: new Date(now + 86_400_000).toISOString() });
const scan = () => ({ SchemaVersion: 2, Metadata: { ImageID: imageId }, Results: [{ Class: "os-pkgs", Target: "PRIVATE_SENTINEL", Packages: [{ Name: "libssl3t64" }], Vulnerabilities: [] }] });

test("cached scan errors retain a trusted fixed code without reading arbitrary message prefixes", () => {
  let trusted: any;
  try { verifyCachedScanner([{}]); } catch (caught) { trusted = caught; }
  const expected = { error: "CACHE_SCANNER_IDENTITY_INVALID", stage: "cached-image-or-scanner", readyForExecution: false,
    rawDetailsSuppressed: true, cleanupMustBeIndependentlyVerified: true };
  assert.deepEqual(cachedScanFailurePacket(trusted), expected);
  trusted.message = "CACHE_PRIVATE_SENTINEL"; trusted.packet = () => ({ error: "PRIVATE" });
  assert.deepEqual(cachedScanFailurePacket(trusted), expected);
  assert.equal(Object.isFrozen(cachedScanFailurePacket(trusted)), true);
  for (const error of [new Error("CACHE_PRIVATE_SENTINEL"), Object.create(Object.getPrototypeOf(trusted)),
    new Proxy(trusted, {}), new Proxy({}, { getPrototypeOf() { throw Error("PRIVATE"); } }),
    { get message() { throw Error("PRIVATE"); } }]) {
    const packet = cachedScanFailurePacket(error);
    assert.equal(packet.error, "CACHE_SCAN_INCOMPLETE"); assert.equal(packet.stage, "unknown");
    assert.equal(packet.readyForExecution, false); assert.equal(packet.cleanupMustBeIndependentlyVerified, true);
    assert.ok(!JSON.stringify(packet).includes("PRIVATE"));
  }
});

test("cached scan reporting preserves the underlying fixed image-read failure stage", () => {
  let trusted: any;
  try { collectPrivateCacheTarget(() => ({}), () => NOW); } catch (caught) { trusted = caught; }
  assert.deepEqual(cachedScanFailurePacket(trusted), { error: "LIVE_IMAGE_RESPONSE_INVALID", stage: "identity", readyForExecution: false,
    rawDetailsSuppressed: true, cleanupMustBeIndependentlyVerified: true });
  assert.ok(!JSON.stringify(cachedScanFailurePacket(trusted)).includes(ACCOUNT));
});

function tar(entries: { name: string; bytes: Buffer; kind?: string }[]) {
  return Buffer.concat([...entries.flatMap(entry => {
    const header = Buffer.alloc(512); header.write(entry.name, 0, 100);
    header.write(entry.bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12); header.fill(32, 148, 156); header[156] = (entry.kind ?? "0").charCodeAt(0);
    const sum = header.reduce((value, byte) => value + byte, 0); header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    return [header, entry.bytes, Buffer.alloc((512 - entry.bytes.length % 512) % 512)];
  }), Buffer.alloc(1024)]);
}
function archiveEntries() {
  return [
    { name: `blobs/sha256/${CONFIG_DIGEST.slice(7)}`, bytes: Buffer.from(CONFIG) },
    { name: `blobs/sha256/${DIGEST.slice(7)}`, bytes: Buffer.from(MANIFEST) },
    { name: `blobs/sha256/${LAYER_DIGEST.slice(7)}`, bytes: LAYER_BYTES },
    { name: "oci-layout", bytes: Buffer.from(JSON.stringify({ imageLayoutVersion: "1.0.0" })) },
    { name: "index.json", bytes: Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [{ digest: DIGEST }] })) },
    { name: "manifest.json", bytes: Buffer.from(JSON.stringify([{ Config: `blobs/sha256/${CONFIG_DIGEST.slice(7)}`, Layers: [`blobs/sha256/${LAYER_DIGEST.slice(7)}`] }])) },
  ];
}

test("containerd parent/child IDs need a matching descriptor and still do not stand in for archive config hashes", () => {
  for (const id of [target.reference.split("@")[1], target.runtimeDigest]) {
    const value = image() as any; value[0].Id = id; value[0].Descriptor = { digest: id, mediaType: "application/vnd.oci.image.index.v1+json" };
    assert.equal(verifyCachedLiveImage(value, target).imageId, id);
    value[0].Descriptor.digest = imageId; assert.throws(() => verifyCachedLiveImage(value, target));
  }
});

test("OCI export config, runtime manifest and all named blobs are independently hashed without extraction", () => {
  assert.deepEqual(verifyCachedArchive(tar(archiveEntries()), target), { archiveContentsMatchedToRuntimeManifest: true, imageConfigArchitectureVerified: true, hashedBlobs: 3 });
  const tampered = archiveEntries(); tampered[0].bytes = Buffer.from(CONFIG + " ");
  assert.throws(() => verifyCachedArchive(tar(tampered), target), /BLOB_HASH_INVALID/);
  const wrongLayer = archiveEntries(); wrongLayer[2].bytes = Buffer.from("substituted private bytes");
  assert.throws(() => verifyCachedArchive(tar(wrongLayer), target), /BLOB_HASH_INVALID/);
});

test("tar links, traversal, duplicate paths, bad checksum and incomplete endings fail before scanner launch", () => {
  for (const entry of [{ name: "../PRIVATE_SENTINEL", bytes: Buffer.alloc(0) }, { name: "/PRIVATE_SENTINEL", bytes: Buffer.alloc(0) },
    { name: "oci-layout", bytes: Buffer.alloc(0), kind: "2" }, { name: "oci-layout", bytes: Buffer.alloc(0), kind: "1" }]) {
    assert.throws(() => verifyCachedArchive(tar([entry, ...archiveEntries()]), target));
  }
  assert.throws(() => verifyCachedArchive(tar([...archiveEntries(), archiveEntries()[0]]), target));
  const corrupt = tar(archiveEntries()); corrupt[0] ^= 1; assert.throws(() => verifyCachedArchive(corrupt, target));
  assert.throws(() => verifyCachedArchive(tar(archiveEntries()).subarray(0, -1024), target));
});

test("Docker-compatible manifest must choose exactly the hashed config and expected layer bytes", () => {
  for (const manifest of [[], [{ Config: "PRIVATE_SENTINEL", Layers: [] }],
    [{ Config: `blobs/sha256/${CONFIG_DIGEST.slice(7)}`, Layers: [`blobs/sha256/${CONFIG_DIGEST.slice(7)}`] }]]) {
    const entries = archiveEntries(); entries[5].bytes = Buffer.from(JSON.stringify(manifest));
    assert.throws(() => verifyCachedArchive(tar(entries), target));
  }
});

test("private target comes from the hash-verified disabled live binding, not CLI input", () => {
  let reads = 0; const result = collectPrivateCacheTarget(() => clone(input[reads++]), () => NOW);
  assert.equal(reads, 12); assert.deepEqual(result.target, target); assert.equal(Object.isFrozen(result.target), true);
  for (const text of [ACCOUNT, target.reference, DIGEST, "PRIVATE_SENTINEL"]) assert.equal(JSON.stringify(result.report).includes(text), false);
  const invalid = clone(input); invalid[9].images[0].imageManifest += " "; let index = 0;
  assert.throws(() => collectPrivateCacheTarget(() => invalid[index++], () => NOW));
});

test("dated candidate mode first verifies current live ownership and never falls back to a substitute image", () => {
  for (const candidate of [{}, { imageDetails: [] }, { imageDetails: [{ registryId: ACCOUNT, repositoryName: "global-market-ai-insight-dev-worker",
    imageDigest: DIGEST, imageTags: [PATCH.remoteTag], imageManifestMediaType: "application/vnd.oci.image.manifest.v1+json", imageSizeInBytes: 50_000_000 }] }]) {
    let factories = 0, reads = 0, candidateReads = 0;
    assert.throws(() => collectPrivateDatedPatchCacheTarget(() => ++factories === 1 ? () => clone(input[reads++]) : args => {
      candidateReads++; assert.equal(args[1], "describe-images"); assert.equal(args.includes(`imageDigest=${PATCH.runtimeDigest}`), true);
      assert.equal(args.includes("get-authorization-token"), false); return candidate;
    }, () => NOW));
    assert.equal(reads, 12); assert.equal(candidateReads, 1);
  }
  let factories = 0; const invalid = clone(input); invalid[3].Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true"; let reads = 0;
  assert.throws(() => collectPrivateDatedPatchCacheTarget(() => { factories++; return () => invalid[reads++]; }, () => NOW));
  assert.equal(factories, 1);
});

test("local image config hash, parent registry digest, OS, architecture and nonroot must all agree", () => {
  assert.deepEqual(verifyCachedLiveImage(image(), target), { imageId, size: 55_000_000 });
  for (const change of [(value: any) => { value.Id = DIGEST; }, (value: any) => { value.RepoDigests = []; },
    (value: any) => { value.Os = "windows"; }, (value: any) => { value.Architecture = "arm64"; },
    (value: any) => { value.Config.User = "0"; }, (value: any) => { value.Size = 256 * 1024 * 1024 + 1; }]) {
    const value = image(); change(value[0]); assert.throws(() => verifyCachedLiveImage(value, target));
  }
  assert.throws(() => verifyCachedLiveImage([...image(), ...image()], target));
  assert.throws(() => verifyCachedLiveImage(image(), { ...target, reference: "PRIVATE_SENTINEL" }));
  assert.throws(() => verifyCachedLiveImage(image(), { ...target, reference: target.reference.replace("ap-northeast-1", "us-east-1") }));
});

test("scanner is a cached exact immutable image, never a mutable tag or replacement executable", () => {
  verifyCachedScanner(scannerImage());
  for (const change of [(value: any) => { value.Id = imageId; }, (value: any) => { value.Config.Entrypoint = ["sh"]; },
    (value: any) => { value.RepoDigests = ["foreign/trivy:latest"]; }, (value: any) => { value.Architecture = "arm64"; }]) {
    const value = scannerImage(); change(value[0]); assert.throws(() => verifyCachedScanner(value));
  }
});

test("private package paths and secret matches reduce to counts without printing them", () => {
  const value = scan() as any;
  value.Results[0].Vulnerabilities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(Severity => ({ Severity, Description: "PRIVATE_SENTINEL" }));
  value.Results.push({ Class: "secret", Target: "PRIVATE_SENTINEL", Secrets: [{ Match: "PRIVATE_SENTINEL" }] });
  const report = summarizeLiveArchiveScan(value, imageId, database(), NOW);
  assert.deepEqual(report.severityCounts, { UNKNOWN: 0, LOW: 1, MEDIUM: 1, HIGH: 1, CRITICAL: 1 });
  assert.equal(report.detectedSecrets, 1); assert.equal(report.archiveGatePassed, false);
  assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false); assert.equal(JSON.stringify(report).includes(imageId), false);
});

test("zero findings still cannot clear complete dependency, legal, deployment or publication gates", () => {
  const report = summarizeLiveArchiveScan(scan(), imageId, database(), NOW);
  assert.equal(report.archiveGatePassed, true); assert.equal(report.osPackagesInspected, 1);
  for (const key of ["completeApplicationDependencyScanVerified", "completeLicenseProvenanceVerified", "currentSourceDeploymentVerified", "readyForExecution", "readyForPublication"] as const) assert.equal(report[key], false);
});

test("UNKNOWN findings, missing OS packages or mismatched image identities fail conservatively", () => {
  const unknown = scan() as any; unknown.Results[0].Vulnerabilities.push({ Severity: "UNKNOWN" });
  assert.equal(summarizeLiveArchiveScan(unknown, imageId, database(), NOW).archiveGatePassed, false);
  for (const change of [(value: any) => { value.Metadata.ImageID = DIGEST; }, (value: any) => { value.Results = []; },
    (value: any) => { value.Results[0].Packages = []; }, (value: any) => { value.Results[0].Vulnerabilities = [{ Severity: "PRIVATE_SENTINEL" }]; },
    (value: any) => { value.Results[0].Class = "misconfig"; }, (value: any) => { value.SchemaVersion = 1; }]) {
    const value = scan(); change(value); assert.throws(() => summarizeLiveArchiveScan(value, imageId, database(), NOW));
  }
});

test("scanner output and installed package inventory have finite size bounds", () => {
  for (const mutate of [(value: any) => { value.Results = Array.from({ length: 129 }, () => value.Results[0]); },
    (value: any) => { value.Results[0].Packages = Array.from({ length: 1001 }, () => ({})); },
    (value: any) => { value.Results[0].Vulnerabilities = Array.from({ length: 5001 }, () => ({ Severity: "LOW" })); },
    (value: any) => { value.Results.push({ Class: "secret", Secrets: Array.from({ length: 1001 }, () => ({})) }); }]) {
    const value = scan(); mutate(value); assert.throws(() => summarizeLiveArchiveScan(value, imageId, database(), NOW));
  }
});

test("DB must be fresh, downloaded after update, not future-dated or expired", () => {
  for (const changed of [{ ...database(), Version: 1 }, { ...database(), UpdatedAt: new Date(NOW - 86_400_001).toISOString() },
    { ...database(), DownloadedAt: new Date(NOW + 1).toISOString() }, { ...database(), DownloadedAt: new Date(NOW - 120_000).toISOString() },
    { ...database(), NextUpdate: new Date(NOW).toISOString() }, { ...database(), UpdatedAt: "2026-02-30T00:00:00Z" },
    { ...database(), UpdatedAt: "2026-10-04T24:00:00Z" }]) assert.throws(() => summarizeLiveArchiveScan(scan(), imageId, changed, NOW));
});

test("Docker child receives an empty owned config and no cloud, AI, registry or proxy credentials", () => {
  const env = cacheScanChildEnvironment({ PATH: "path", AWS_PROFILE: "gmai-admin", AWS_ACCESS_KEY_ID: "PRIVATE_SENTINEL", GMAI_DOCKER_CLI_PATH: "PRIVATE_SENTINEL",
    DOCKER_AUTH_CONFIG: "PRIVATE_SENTINEL", DOCKER_HOST: "PRIVATE_SENTINEL", HTTP_PROXY: "PRIVATE_SENTINEL", https_proxy: "PRIVATE_SENTINEL",
    OPENAI_API_KEY: "PRIVATE_SENTINEL", GH_TOKEN: "PRIVATE_SENTINEL", NODE_OPTIONS: "PRIVATE_SENTINEL" }, "owned-empty-config");
  assert.equal(env.PATH, "path"); assert.equal(env.DOCKER_CONFIG, "owned-empty-config"); assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false);
});

test("local build/scanner cannot inherit a remote builder, telemetry or caller code-cache destination", () => {
  const input = Object.freeze({ PATH: "safe-path", BUILDX_BUILDER: "PRIVATE_SENTINEL", buildx_config: "PRIVATE_SENTINEL",
    BUILDKIT_HOST: "PRIVATE_SENTINEL", OTEL_EXPORTER_OTLP_ENDPOINT: "PRIVATE_SENTINEL", TRACEPARENT: "PRIVATE_SENTINEL",
    TRACESTATE: "PRIVATE_SENTINEL", BAGGAGE: "PRIVATE_SENTINEL", NODE_COMPILE_CACHE: "PRIVATE_SENTINEL",
    NODE_V8_COVERAGE: "PRIVATE_SENTINEL", NODE_TLS_REJECT_UNAUTHORIZED: "0" });
  const env = cacheScanChildEnvironment(input, "owned-empty-config");
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false); assert.equal(env.PATH, "safe-path");
  assert.equal(env.DOCKER_CONFIG, "owned-empty-config"); assert.equal(env.NODE_DISABLE_COMPILE_CACHE, "1");
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, "1"); assert.equal(input.BUILDX_BUILDER, "PRIVATE_SENTINEL");
});

test("temporary cleanup accepts only its exact physical OS-temp child, not a broad or nested directory", () => {
  const base = resolve(tmpdir()), physical = realpathSync(base), directory = mkdtempSync(join(base, "gmai-live-image-scan-"));
  try { assert.equal(safeScanTemporaryDirectory(base, directory, physical), true);
    assert.equal(safeScanTemporaryDirectory(base, base, physical), false); assert.equal(safeScanTemporaryDirectory(base, directory, dirname(physical)), false);
    mkdirSync(join(directory, "nested")); assert.equal(safeScanTemporaryDirectory(base, join(directory, "nested"), physical), false);
  } finally { assert.equal(safeScanTemporaryDirectory(base, directory, physical), true); rmSync(directory, { recursive: true }); }
});

test("remaining scanner cleanup needs exact name, image, labels and random scope", () => {
  const scope = "a".repeat(32), name = `gmai-live-image-scan-${scope}`, id = "b".repeat(64);
  const value = [{ Id: id, Name: `/${name}`, Image: scanner, Config: { Labels: { "com.gmai.operator": "gmai-live-image-archive-scan", "com.gmai.scope": scope } } }];
  assert.equal(verifyOwnedScanContainer(value, name, scope), id);
  for (const mutate of [(v: any) => { v[0].Image = imageId; }, (v: any) => { v[0].Name = "/user-container"; },
    (v: any) => { v[0].Config.Labels["com.gmai.scope"] = "c".repeat(32); }, (v: any) => { v[0].Config.Labels["com.gmai.operator"] = "foreign"; }]) {
    const bad = clone(value); mutate(bad); assert.throws(() => verifyOwnedScanContainer(bad, name, scope));
  }
});

test("default plan and import have no Docker, network or AWS effects", () => {
  assert.equal(liveCacheScanPlan().awsCalls, 0); assert.equal(liveCacheScanPlan().imagePulls, 0);
  const env = { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL" };
  for (const args of [[], ["--execute"], ["--execute-cached-archive-scan", "--image", "PRIVATE_SENTINEL"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", resolve("scripts/scan-live-image-cache.ts"), ...args], { encoding: "utf8", env, timeout: 5000 });
    assert.equal(result.status, args.length ? 1 : 0); assert.equal(`${result.stdout}${result.stderr}`.includes("PRIVATE_SENTINEL"), false);
  }
});

function operatorHarness(mode: "success" | "timeout" | "missing-cache" | "changed-reference") {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "gmai-scan-test-")), cli = join(fixtureRoot, "docker.exe");
  writeFileSync(cli, "not executed; spawn is mocked");
  const oldCli = process.env.GMAI_DOCKER_CLI_PATH, oldProfile = process.env.AWS_PROFILE;
  process.env.GMAI_DOCKER_CLI_PATH = cli; process.env.AWS_PROFILE = "gmai-admin";
  let readerNumber = 0, createdName = "", scope = "", ownedDir = "", running = false;
  const calls: string[][] = [];
  const readFactory = () => { const source = clone(input); if (readerNumber++ > 0 && mode === "changed-reference") {
    source[4].taskDefinition.containerDefinitions[0].image += "bad";
  } let index = 0; return () => source[index++]; };
  const ok = (stdout: unknown) => ({ status: 0, signal: null, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
  const spawn = ((_command: string, args: string[], options: any) => {
    calls.push([...args]); assert.deepEqual(args.slice(0, 2), ["--host", "npipe:////./pipe/dockerDesktopLinuxEngine"]);
    assert.equal(options.env.AWS_PROFILE, undefined); assert.equal(options.env.DOCKER_AUTH_CONFIG, undefined);
    const command = args.slice(2);
    if (command[0] === "image" && command[1] === "inspect") {
      if (command[2] === scanner) return ok(scannerImage());
      if (mode === "missing-cache") return { status: 1, signal: null, stdout: "", stderr: "PRIVATE_SENTINEL" };
      return ok(image());
    }
    if (command[0] === "image" && command[1] === "save") {
      assert.equal(command[command.indexOf("--platform") + 1], "linux/amd64");
      const archive = command[command.indexOf("--output") + 1]; ownedDir = dirname(archive); writeFileSync(archive, tar(archiveEntries())); return ok("");
    }
    if (command[0] === "run") {
      createdName = command[command.indexOf("--name") + 1]; scope = createdName.slice("gmai-live-image-scan-".length);
      for (const value of ["never", "--read-only", "ALL", "no-new-privileges", "vuln,secret", "--list-all-pkgs", "--offline-scan", "--disable-telemetry", "--skip-version-check"]) assert.equal(command.includes(value), true);
      assert.equal(command.some(value => value.includes("docker.sock") || value.includes(".aws")), false);
      if (mode === "timeout") { running = true; return { status: null, signal: "SIGTERM", stdout: "PRIVATE_SENTINEL", stderr: "PRIVATE_SENTINEL" }; }
      const dbDir = join(ownedDir, "cache", "db"); mkdirSync(dbDir); writeFileSync(join(dbDir, "metadata.json"), JSON.stringify(database(Date.now()))); return ok(scan());
    }
    if (command[0] === "container" && command[1] === "inspect") return running
      ? ok([{ Id: "b".repeat(64), Name: `/${createdName}`, Image: scanner, Config: { Labels: { "com.gmai.operator": "gmai-live-image-archive-scan", "com.gmai.scope": scope } } }])
      : { status: 1, signal: null, stdout: "", stderr: `Error: No such container: ${createdName}` };
    if (command[0] === "container" && command[1] === "stop") { assert.equal(command.at(-1), "b".repeat(64)); running = false; return ok(""); }
    assert.fail("unexpected Docker operation");
  }) as unknown as typeof spawnSync;
  return { run: () => scanLiveImageCache({ readFactory, spawn }), calls, directory: () => ownedDir,
    cleanup: () => { if (oldCli === undefined) delete process.env.GMAI_DOCKER_CLI_PATH; else process.env.GMAI_DOCKER_CLI_PATH = oldCli;
      if (oldProfile === undefined) delete process.env.AWS_PROFILE; else process.env.AWS_PROFILE = oldProfile; rmSync(fixtureRoot, { recursive: true }); } };
}

test("full cached scan independently rechecks live binding and removes only its temporary inputs", () => {
  const run = operatorHarness("success"); try {
    const report = run.run(); assert.equal(report.awsCalls, 24); assert.equal(report.ownedScannerAbsent, true);
    assert.equal(report.temporaryArchiveAndCacheRemoved, true); assert.equal(existsSync(run.directory()), false);
    for (const text of [ACCOUNT, target.reference, "PRIVATE_SENTINEL", imageId]) assert.equal(JSON.stringify(report).includes(text), false);
  } finally { run.cleanup(); }
});

test("scanner-client timeout explicitly stops only its ownership-verified container and removes archive", () => {
  const run = operatorHarness("timeout"); try {
    assert.throws(() => run.run(), /DOCKER_OPERATION_FAILED/); assert.equal(existsSync(run.directory()), false);
    assert.equal(run.calls.filter(args => args[2] === "run").length, 1);
    assert.equal(run.calls.filter(args => args[2] === "container" && args[3] === "stop").length, 1);
  } finally { run.cleanup(); }
});

test("a missing cache cannot retrieve credentials, pull images or start a scanner", () => {
  const run = operatorHarness("missing-cache"); try { assert.throws(() => run.run());
    assert.equal(run.calls.length, 1); assert.equal(run.calls.some(args => args.includes("pull") || args.includes("login") || args.includes("run")), false);
  } finally { run.cleanup(); }
});

test("a changed live task reference cannot become archive acceptance and still cleans temporary files", () => {
  const run = operatorHarness("changed-reference"); try { assert.throws(() => run.run()); assert.equal(existsSync(run.directory()), false);
  } finally { run.cleanup(); }
});

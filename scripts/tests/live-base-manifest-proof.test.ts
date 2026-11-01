import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { collectLiveBaseManifestProof, liveBaseManifestPlan } from "../live-base-manifest-proof.js";
import { validatePhase11ReadOnlyQuery } from "../phase11-live-readiness.js";
import { validateLiveImageReadOnlyQuery } from "../live-image-readiness.js";
import { ACCOUNT, DIGEST, NOW, PREFIX, hash, manifestResponse, responses, clone } from "./fixtures/live-image-fixture.js";

const publicMetadata = JSON.parse(readFileSync(new URL("../data/public-base-metadata.json", import.meta.url), "utf8"));
function imageFixture(change: (manifest: any) => void = () => {}) {
  const manifest = JSON.parse(Buffer.from(publicMetadata.manifestBase64, "base64").toString("utf8"));
  manifest.config.digest = hash(Buffer.from("SYNTHETIC_PRIVATE_CONFIG_NOT_READ"));
  manifest.config.size = 1000;
  manifest.layers.push({ mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: "sha256:" + "c".repeat(64), size: 1024 },
    { mediaType: "application/vnd.oci.image.layer.v1.tar+gzip", digest: "sha256:" + "d".repeat(64), size: 2048 });
  change(manifest);
  const raw = JSON.stringify(manifest), digest = hash(raw), rows: any[] = responses();
  rows[4].taskDefinition.containerDefinitions[0].image = rows[4].taskDefinition.containerDefinitions[0].image.replace(DIGEST, digest);
  rows[6].imageDetails[0].imageDigest = digest;
  rows[7] = manifestResponse(raw); rows[8].imageId.imageDigest = digest;
  return rows;
}
function coreFixture(imageRows = imageFixture(), version = "11"): any[] {
  return [clone(imageRows[0]), clone(imageRows[3]),
    { Budgets: [{ BudgetType: "COST", TimeUnit: "MONTHLY", BudgetLimit: { Amount: "5", Unit: "USD" },
      CalculatedSpend: { ActualSpend: { Amount: "0", Unit: "USD" }, ForecastedSpend: { Amount: "0.008", Unit: "USD" } } }] },
    { Stacks: ["foundation", "compute", "api"].map(name => ({ StackName: PREFIX + "-" + name, StackStatus: "CREATE_COMPLETE" })) },
    { taskArns: [] }, { taskArns: [] }, { serviceArns: [] }, clone(imageRows[4]),
    { Item: { jobId: { S: "control_circuit" }, state: { S: "OPEN" }, version: { N: version } } }, {}, {},
  ];
}
function fixture() {
  const images = [imageFixture(), imageFixture()], cores = [coreFixture(images[0]), coreFixture(images[1])];
  let imageIndex = 0, coreIndex = 0, reads = 0, sourceReads = 0;
  const io = { now: () => NOW,
    source: () => { sourceReads++; return { reviewedDockerfileMatched: true }; },
    imageReader: () => { const rows = images[imageIndex++]; let index = 0;
      return (args: readonly string[]) => { validateLiveImageReadOnlyQuery(args); reads++; return rows[index++]; }; },
    coreReader: () => { const rows = cores[coreIndex++]; let index = 0;
      return (args: readonly string[]) => { validatePhase11ReadOnlyQuery(args); reads++; return rows[index++]; }; },
  };
  return { io, images, cores, reads: () => reads, sourceReads: () => sourceReads };
}

test("two owned manifest passes and two complete safe-state passes prove only the public-base descriptor prefix", () => {
  const f = fixture(), r = collectLiveBaseManifestProof(f.io);
  assert.equal(r.awsCalls, 42); assert.equal(f.reads(), 42); assert.equal(f.sourceReads(), 2);
  assert.equal(r.baseLayers, 22); assert.equal(r.sourceAndOwnedTargetRechecked, true);
  assert.equal(r.disabledExecutionAndDisplayVerified, true); assert.equal(r.verifiedOpenCircuitVersionUnchanged, true);
  for (const field of ["privateConfigBytesRead", "layerBodiesRead", "privateConfigBytesVerified", "privateConfigDiffIdsVerified",
    "layerBodiesVerified", "laterOverlayContentsVerified", "currentApplicationBytesVerified", "imageExecuted",
    "publisherSignatureVerified", "freshVulnerabilityScanPerformed", "completeDistributedNoticesVerified", "readyForPublication"])
    assert.equal(r[field], false);
  for (const privateValue of [ACCOUNT, "arn:aws:", "dkr.ecr", "PRIVATE_SENTINEL", "SYNTHETIC_PRIVATE_CONFIG_NOT_READ", "sha256:"])
    assert.equal(JSON.stringify(r).includes(privateValue), false);
});

test("wrong principal, unknown source and enabled or partial initial state stop before image reads", () => {
  const source = fixture(); source.io.source = () => ({ reviewedDockerfileMatched: false });
  assert.throws(() => collectLiveBaseManifestProof(source.io), /^Error: LIVE_BASE_MANIFEST_PROOF_INCOMPLETE$/); assert.equal(source.reads(), 0);
  for (const mutate of [(rows: any[]) => rows[0].Arn += "-foreign", (rows: any[]) => rows[1].Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true",
    (rows: any[]) => rows[4].nextToken = "PRIVATE_CURSOR", (rows: any[]) => rows[8].Item.state.S = "CLOSED"])
  { const f = fixture(); mutate(f.cores[0]); assert.throws(() => collectLiveBaseManifestProof(f.io), /LIVE_BASE_MANIFEST_PROOF_INCOMPLETE/);
    assert.ok(f.reads() <= 11); }
});

test("rehashed manifest substitutions and bad config descriptors are rejected without a private archive or fallback", () => {
  for (const mutate of [(m: any) => m.layers[0].digest = "sha256:" + "0".repeat(64), (m: any) => m.layers[0].size++,
    (m: any) => m.layers.pop(), (m: any) => m.config.mediaType = "PRIVATE_MEDIA", (m: any) => m.layers[23].urls = ["https://PRIVATE.invalid"]]) {
    const f = fixture(); f.images[0] = imageFixture(mutate); f.cores[0] = coreFixture(f.images[0]);
    assert.throws(() => collectLiveBaseManifestProof(f.io), /^Error: LIVE_BASE_MANIFEST_PROOF_INCOMPLETE$/);
  }
});

test("changed closing owned image, mismatched core reference, circuit version or enabled closing state cannot pass", () => {
  const changed = fixture(); changed.images[1] = imageFixture(m => m.layers[23].digest = "sha256:" + "e".repeat(64));
  changed.cores[1] = coreFixture(changed.images[1]); assert.throws(() => collectLiveBaseManifestProof(changed.io), /LIVE_BASE_MANIFEST_PROOF_INCOMPLETE/);
  for (const mutate of [(f: ReturnType<typeof fixture>) => f.cores[0][7].taskDefinition.containerDefinitions[0].image =
      f.cores[0][7].taskDefinition.containerDefinitions[0].image.replace(/sha256:[a-f0-9]{64}/, "sha256:" + "f".repeat(64)),
    (f: ReturnType<typeof fixture>) => f.cores[1][8].Item.version.N = "12",
    (f: ReturnType<typeof fixture>) => f.cores[1][1].Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY = "true"])
  { const f = fixture(); mutate(f); assert.throws(() => collectLiveBaseManifestProof(f.io), /LIVE_BASE_MANIFEST_PROOF_INCOMPLETE/); }
});

test("source drift at closure and expired, reversed or invalid clocks remain unknown", () => {
  const changed = fixture(); let sources = 0;
  changed.io.source = () => ({ reviewedDockerfileMatched: ++sources === 1 });
  assert.throws(() => collectLiveBaseManifestProof(changed.io), /LIVE_BASE_MANIFEST_PROOF_INCOMPLETE/);
  for (const times of [[NOW, NOW + 480_000], [NOW, NOW - 1], [NOW, Number.NaN]]) {
    const f = fixture(); let clock = 0; f.io.now = () => times[Math.min(clock++, times.length - 1)];
    assert.throws(() => collectLiveBaseManifestProof(f.io), /^Error: LIVE_BASE_MANIFEST_PROOF_INCOMPLETE$/);
    assert.equal(f.reads(), 0);
  }
});

test("a thrown private query error or malformed manifest is suppressed, not relabeled as an empty successful proof", () => {
  const failed = fixture(); failed.io.imageReader = () => () => { throw Error("PRIVATE_ERROR_WITH_ACCOUNT_AND_TOKEN"); };
  assert.throws(() => collectLiveBaseManifestProof(failed.io), /^Error: LIVE_BASE_MANIFEST_PROOF_INCOMPLETE$/);
  const malformed = fixture(); malformed.images[0][7].images[0].imageManifest = "{PRIVATE_INVALID";
  assert.throws(() => collectLiveBaseManifestProof(malformed.io), /^Error: LIVE_BASE_MANIFEST_PROOF_INCOMPLETE$/);
});

test("default/import/extra arguments cannot query AWS, pull images or upload metadata", () => {
  assert.equal(liveBaseManifestPlan().awsCalls, 0); assert.equal(liveBaseManifestPlan().awsReadsMax, 46);
  assert.throws(() => liveBaseManifestPlan(["--execute"]));
  for (const args of [[], ["--execute"], ["--execute-read-only", "PRIVATE_DESTINATION"], ["--upload"]]) {
    const r = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/live-base-manifest-proof.ts"), ...args],
      { encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, AWS_PROFILE: "PRIVATE_PROFILE" } });
    assert.equal(r.status, args.length ? 1 : 0); assert.equal((r.stdout + r.stderr).includes("PRIVATE"), false);
    if (args.length) assert.equal(JSON.parse(r.stderr).provenanceStatus, "unknown");
  }
});

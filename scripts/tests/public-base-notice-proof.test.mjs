import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {rootCertificates} from "node:tls";
import { cleanSourceChildEnvironment } from "../clean-source-build-proof.mjs";
import { PUBLIC_BASE_DIGEST, collectPublicBaseNoticeProof, evaluatePublicBaseLayers,
  inspectPublicBaseLayer, verifyPublicBaseMetadata } from "../public-base-notice-proof.mjs";

const root = resolve("."), digest = bytes => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const types = { manifest: "application/vnd.oci.image.manifest.v1+json", config: "application/vnd.oci.image.config.v1+json",
  layer: "application/vnd.oci.image.layer.v1.tar+gzip" };
const status = "Package: synthetic-lib\nVersion: 1:2.3.4-5\nArchitecture: amd64\nMaintainer: PRIVATE_PUBLISHER_FIELD\nDescription: fixture\n continuation\n";
const document = "Copyright: PRIVATE_COPYRIGHT_BODY\nLicense: synthetic-text-not-legal-approval\n";
function tar(items) {
  const output = [];
  for (const item of items) {
    const bytes = Buffer.from(item.text ?? ""), header = Buffer.alloc(512);
    header.write(item.path, 0, 100, "utf8");
    header.write("0000644\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
    header.fill(32, 148, 156); header[156] = item.type ?? 48;
    header.write(item.link ?? "", 157, 100); header.write("ustar\0", 257); header.write("00", 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    output.push(header, bytes, Buffer.alloc(Math.ceil(bytes.length / 512) * 512 - bytes.length));
  }
  return Buffer.concat([...output, Buffer.alloc(1024)]);
}
const initial = () => [
  { path: "var/lib/dpkg/status.d/synthetic-lib", text: status },
  { path: "var/lib/dpkg/status.d/synthetic-lib.md5sums", text: "synthetic md5 data not package fields" },
  { path: "usr/share/doc/synthetic-lib/copyright", text: document },
  { path: "nodejs/LICENSE", text: document }, { path: "nodejs/bin/node", text: "NEVER_EXECUTED_BINARY" },
];
function fixtures(tars = [tar(initial())], configChanges = {}) {
  const compressed = tars.map(bytes => gzipSync(bytes)), config = Buffer.from(JSON.stringify({
    os: "linux", architecture: "amd64", config: { User: "65532", Entrypoint: ["/nodejs/bin/node"] },
    rootfs: { type: "layers", diff_ids: tars.map(digest) }, ...configChanges,
  }));
  const manifestObject = { schemaVersion: 2, mediaType: types.manifest,
    config: { digest: digest(config), size: config.length, mediaType: types.config },
    layers: compressed.map(bytes => ({ digest: digest(bytes), size: bytes.length, mediaType: types.layer })) };
  const manifest = Buffer.from(JSON.stringify(manifestObject));
  return { tars, compressed, config, manifest, manifestObject,
    binding: verifyPublicBaseMetadata(manifest, config, digest(manifest)) };
}
const evaluate = f => evaluatePublicBaseLayers(f.binding, f.compressed);
const publicMetadata = JSON.parse(readFileSync(new URL("../data/public-base-metadata.json", import.meta.url), "utf8"));
const publicManifest = Buffer.from(publicMetadata.manifestBase64, "base64");
const publicConfig = Buffer.from(publicMetadata.configBase64, "base64");

test("manifest and config are independently digest-bound to nonroot linux/amd64 without executing code", () => {
  const f = fixtures(); assert.equal(f.binding.platform, "linux/amd64"); assert.equal(f.binding.nonrootBaseUser, "65532");
  assert.equal(f.binding.layers.length, 1); assert.equal(f.binding.layers[0].diffId, digest(f.tars[0]));
  assert.throws(() => verifyPublicBaseMetadata(f.manifest, f.config), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  for (const changes of [{ os: "PRIVATE_OS" }, { architecture: "arm64" }, { config: { User: "0", Entrypoint: ["/nodejs/bin/node"] } },
    { config: { User: "65532", Entrypoint: ["PRIVATE_PROGRAM"] } }, { rootfs: { type: "layers", diff_ids: [] } }])
    assert.throws(() => fixtures(undefined, changes), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.throws(() => verifyPublicBaseMetadata(f.manifest, Buffer.from("{}"), digest(f.manifest)), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("unbound descriptors, unknown media, duplicate layers, remote URLs and oversized declared counts fail closed", () => {
  const f = fixtures();
  for (const mutate of [
    value => { value.schemaVersion = 1; }, value => { value.config.urls = ["https://PRIVATE.invalid/"]; },
    value => { value.layers[0].data = "PRIVATE_EMBEDDED_DATA"; }, value => { value.layers[0].mediaType = "PRIVATE_MEDIA"; },
    value => { value.layers[0].size = 100_000_000; }, value => { value.layers = []; },
    value => { value.layers[0].digest = "sha256:invalid"; }, value => { value.layers = Array(33).fill(value.layers[0]); },
  ]) {
    const candidate = structuredClone(f.manifestObject); mutate(candidate); const bytes = Buffer.from(JSON.stringify(candidate));
    assert.throws(() => verifyPublicBaseMetadata(bytes, f.config, digest(bytes)), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  }
});

test("regular package/copyright metadata is source-bound while raw publisher fields and binary code are never serialized", () => {
  const report = evaluate(fixtures()); assert.equal(report.packageDeclarations.length, 1);
  assert.equal(report.packageDeclarations[0].name, "synthetic-lib"); assert.equal(report.packageDeclarations[0].version, "1:2.3.4-5");
  assert.equal(report.packagesWithExactCopyrightDocument, 1); assert.equal(report.nodeLicenseDocumentPresent, true);
  assert.equal(report.documents.length, 2); assert.match(report.nodeBinarySha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(report).includes("PRIVATE"), false); assert.equal(JSON.stringify(report).includes("NEVER_EXECUTED"), false);
  for (const field of ["archiveExtracted", "linksFollowed", "imageCodeExecuted", "installedPackagesChanged", "liveAwsImageBound",
    "vulnerabilityScanPerformed", "publisherSignatureVerified", "applicableLegalObligationsVerified", "completeDistributedNoticesVerified", "readyForPublication"])
    assert.equal(report[field], false);
});

test("gzip descriptor and uncompressed diff-ID checks cannot be replaced by document presence", () => {
  const f = fixtures();
  assert.throws(() => evaluatePublicBaseLayers(f.binding, [Buffer.from("PRIVATE_BYTES")]), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  const changed = structuredClone(f.binding); changed.layers[0].diffId = "sha256:" + "0".repeat(64);
  assert.throws(() => evaluatePublicBaseLayers(changed, f.compressed), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.throws(() => evaluatePublicBaseLayers(f.binding, []), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("actual fixed public metadata fixture binds both digests without pretending to prove the layer bodies", () => {
  const binding = verifyPublicBaseMetadata(publicManifest, publicConfig);
  assert.equal(binding.manifestDigest, PUBLIC_BASE_DIGEST);
  assert.equal(binding.configDigest, publicMetadata.configDigest);
  assert.equal(binding.layers.length, 22);
  assert.equal(binding.layers.reduce((sum, layer) => sum + layer.size, 0), 54_653_562);
  assert.equal(JSON.parse(publicManifest).annotations["com.google.distroless.nodejs.version"], "22.23.4");
  assert.throws(() => evaluatePublicBaseLayers(binding, []), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("CA bundle observation follows validated overlay order without extraction, links or active-trust claims",()=>{
  const path="etc/ssl/certs/ca-certificates.crt",text=rootCertificates[0];
  const f=fixtures([tar([...initial(),{path,text}])]),p=evaluate(f);
  assert.equal(p.caBundle.certificates,1);assert.equal(p.caBundle.certificateBodiesRetained,false);
  assert.equal(p.caBundle.activeNodeTrustVerified,false);assert.equal(JSON.stringify(p).includes("BEGIN CERTIFICATE"),false);
  assert.equal(evaluate(fixtures([f.tars[0],tar([{path:"etc/ssl/certs/.wh.ca-certificates.crt"}])])).caBundle,null);
  const linked=evaluate(fixtures([f.tars[0],tar([{path,type:50,link:"PRIVATE_TARGET"}])]));
  assert.equal(linked.caBundle,null);assert.ok(linked.unresolvedSelectedLinks.includes(path));
  assert.throws(()=>evaluate(fixtures([tar([...initial(),{path,text:"PRIVATE_INVALID_CA"}])])),/WORKER_CA_TRUST_INCOMPLETE/);
});

test("root directories and later explicit parents preserve already present descendants, but replacing parents removes them", () => {
  for (const path of [".", "./"]) assert.equal(inspectPublicBaseLayer(tar([{ path, type: 53 }])).entries[0].path, "");
  const laterParents = tar([{ path: "usr/share/doc/synthetic-lib", type: 53 }, { path: "usr/share/doc", type: 53 }]);
  const preserved = evaluate(fixtures([tar(initial()), laterParents]));
  assert.equal(preserved.packagesWithExactCopyrightDocument, 1);
  assert.equal(preserved.packageDeclarations[0].copyrightParentKind, "directory");
  const replaced = evaluate(fixtures([tar(initial()), tar([{ path: "usr/share/doc/synthetic-lib", type: 50, link: "PRIVATE_TARGET" }])]));
  assert.equal(replaced.packagesWithExactCopyrightDocument, 0);
  assert.equal(replaced.packageDeclarations[0].copyrightParentKind, "link");
  assert.equal(JSON.stringify(replaced).includes("PRIVATE_TARGET"), false);
});

test("lower-layer copyright removal and opaque whiteouts are applied before same-layer replacement files", () => {
  const removal = tar([{ path: "usr/share/doc/synthetic-lib/.wh.copyright" }]);
  const removed = evaluate(fixtures([tar(initial()), removal]));
  assert.equal(removed.whiteoutsApplied, 1); assert.equal(removed.packagesWithExactCopyrightDocument, 0);
  const replacement = tar([{ path: "usr/share/doc/synthetic-lib/copyright", text: "replacement" },
    { path: "usr/share/doc/synthetic-lib/.wh..wh..opq" }]);
  const final = evaluate(fixtures([tar(initial()), replacement]));
  assert.equal(final.packagesWithExactCopyrightDocument, 1);
  assert.equal(final.documents.find(row => row.path.includes("synthetic-lib")).sha256, digest(Buffer.from("replacement")).slice(7));
  for (const path of ["usr/share/doc/.wh..", "usr/share/doc/.wh...", "usr/share/doc/.wh."])
    assert.throws(() => evaluate(fixtures([tar(initial()), tar([{ path }])])), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("selected symlink documents are unknown, not followed or replaced by a generic repository license", () => {
  const report = evaluate(fixtures([tar(initial()), tar([{ path: "usr/share/doc/synthetic-lib/copyright", type: 50, link: "../../PRIVATE" }])]));
  assert.equal(report.packagesWithExactCopyrightDocument, 0);
  assert.deepEqual(report.unresolvedSelectedLinks, ["usr/share/doc/synthetic-lib/copyright"]);
  assert.equal(report.linksFollowed, false); assert.equal(JSON.stringify(report).includes("PRIVATE"), false);
  const parentLink = tar([{ path: "usr/share/doc", type: 50, link: "/PRIVATE" }]);
  assert.throws(() => evaluate(fixtures([tar(initial()), parentLink, tar([{ path: "usr/share/doc/synthetic-lib/copyright", text: document }])])),
    /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("invalid package fields and deleted/missing package or Node metadata cannot produce complete provenance", () => {
  for (const text of [status.replace("synthetic-lib", "wrong-package"), status.replace("amd64", "arm64"),
    status.replace("1:2.3.4-5", "PRIVATE VERSION"), status + "Package: duplicated\n"])
    assert.throws(() => evaluate(fixtures([tar(initial().map(row => row.path === "var/lib/dpkg/status.d/synthetic-lib" ? { ...row, text } : row))])),
      /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.throws(() => evaluate(fixtures([tar(initial()), tar([{ path: "nodejs/bin/.wh.node" }])])), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

function gccRows(target = "gcc-14-base", kind = 50) {
  return [
    ...initial(), { path: "usr/share/doc/gcc-14-base", type: 53 },
    { path: "var/lib/dpkg/status.d/gcc-14-base", text: "Package: gcc-14-base\nVersion: 14.2.0-19\nArchitecture: amd64\n" },
    { path: "usr/share/doc/gcc-14-base/copyright", text: "exact fixture bytes, not a generic license approval" },
    ...["libgcc-s1", "libgomp1", "libstdc++6"].flatMap(name => [
      { path: "var/lib/dpkg/status.d/" + name, text: "Package: " + name + "\nVersion: 14.2.0-19\nArchitecture: amd64\n" },
      { path: "usr/share/doc/" + name, type: kind, link: target },
    ]),
  ];
}

test("fixed GCC one-hop shared-document relationships inspect archive metadata only, not filesystem links or generic terms", () => {
  for (const target of ["gcc-14-base", "./gcc-14-base"]) {
    const report = evaluate(fixtures([tar(gccRows(target))]));
    assert.equal(report.sharedCopyrightDocumentMappings.length, 3);
    assert.equal(report.packagesWithExactCopyrightDocument, 2);
    for (const row of report.sharedCopyrightDocumentMappings) {
      assert.equal(row.sourcePath, "usr/share/doc/gcc-14-base/copyright");
      assert.equal(row.filesystemLinkFollowed, false); assert.equal(row.applicableLegalObligationsVerified, false);
      assert.equal(row.documentSha256, report.documents.find(doc => doc.path === row.sourcePath).sha256);
    }
    assert.equal(report.linksFollowed, false); assert.equal(report.arbitraryLinkTargetsResolved, false);
    assert.equal(report.completeDistributedNoticesVerified, false);
  }
});

test("other targets, hardlinks, traversal and recursive links remain unknown and are not serialized", () => {
  for (const target of ["../gcc-14-base", "/usr/share/doc/gcc-14-base", "../PRIVATE_TARGET", "libgcc-s1", "gcc-14-base/../PRIVATE_TARGET"]) {
    const report = evaluate(fixtures([tar(gccRows(target))]));
    assert.equal(report.sharedCopyrightDocumentMappings.length, 0); assert.equal(JSON.stringify(report).includes("PRIVATE_TARGET"), false);
  }
  assert.equal(evaluate(fixtures([tar(gccRows("gcc-14-base", 49))])).sharedCopyrightDocumentMappings.length, 0);
});

test("shared-document mapping requires matching source package version/architecture and a regular source document", () => {
  const rows = gccRows();
  for (const replacement of ["14.2.0-20", "14.2.0-19\nArchitecture: all"]) {
    const changed = rows.map(row => row.path === "var/lib/dpkg/status.d/gcc-14-base" ? { ...row,
      text: "Package: gcc-14-base\nVersion: " + replacement + "\n" + (replacement.includes("Architecture:") ? "" : "Architecture: amd64\n") } : row);
    assert.equal(evaluate(fixtures([tar(changed)])).sharedCopyrightDocumentMappings.length, 0);
  }
  const removed = evaluate(fixtures([tar(rows), tar([{ path: "usr/share/doc/gcc-14-base/.wh.copyright" }])]));
  assert.equal(removed.sharedCopyrightDocumentMappings.length, 0);
  const linked = rows.map(row => row.path === "usr/share/doc/gcc-14-base/copyright" ? { path: row.path, type: 50, link: "PRIVATE_TARGET" } : row);
  assert.equal(evaluate(fixtures([tar(linked)])).sharedCopyrightDocumentMappings.length, 0);
});

test("common-license literal references are hash-matched only to regular retained documents; absence is not legal clearance", () => {
  const source = "usr/share/doc/synthetic-lib/copyright", referencedPath = "usr/share/common-licenses/MIT";
  const rows = initial().map(row => row.path === source ? { ...row, text: "See /usr/share/common-licenses/MIT\nSee /usr/share/common-licenses/MIT\nNot a regular-document reference: /usr/share/common-licenses/MIT/../../PRIVATE\n" } : row);
  const matched = evaluate(fixtures([tar([...rows, { path: referencedPath, text: "SYNTHETIC_COMMON_LICENSE" }])]));
  assert.equal(matched.commonLicenseReferences.length, 1);
  assert.equal(matched.commonLicenseReferences[0].regularDocumentPresent, true);
  assert.equal(matched.commonLicenseReferences[0].documentSha256, digest(Buffer.from("SYNTHETIC_COMMON_LICENSE")).slice(7));
  for (const later of [[{ path: "usr/share/common-licenses/.wh.MIT" }], [{ path: referencedPath, type: 50, link: "PRIVATE_TARGET" }]]) {
    const report = evaluate(fixtures([tar([...rows, { path: referencedPath, text: "SYNTHETIC_COMMON_LICENSE" }]), tar(later)]));
    assert.equal(report.commonLicenseReferences[0].regularDocumentPresent, false);
    assert.equal(report.commonLicenseReferences[0].documentSha256, null);
    assert.equal(report.completeReferenceInventoryVerified, false); assert.equal(report.applicableLegalObligationsVerified, false);
    assert.equal(JSON.stringify(report).includes("PRIVATE_TARGET"), false);
  }
});

test("tar traversal, redirection, duplicated entries, unsupported PAX/devices and malformed end padding fail closed", () => {
  for (const path of ["../PRIVATE", "/PRIVATE", "a/../PRIVATE", "a\\PRIVATE", "C:PRIVATE", "a//PRIVATE", "a/./PRIVATE"])
    assert.throws(() => inspectPublicBaseLayer(tar([{ path, text: "x" }])), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  for (const type of [120, 103, 51, 52, 54])
    assert.throws(() => inspectPublicBaseLayer(tar([{ path: "PRIVATE", type }])), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.throws(() => inspectPublicBaseLayer(tar([{ path: "same" }, { path: "same" }])), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  const bad = tar([{ path: "ordinary", text: "x" }]); bad[512 + 1] = 1;
  assert.throws(() => inspectPublicBaseLayer(bad), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  const checksum = tar([{ path: "ordinary" }]); checksum[0] ^= 1;
  assert.throws(() => inspectPublicBaseLayer(checksum), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  const end = tar([{ path: "ordinary" }]); end[end.length - 1] = 1;
  assert.throws(() => inspectPublicBaseLayer(end), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

function modifiedFirstHeader(change) {
  const bytes = tar(initial()), header = bytes.subarray(0, 512);
  change(header); header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return bytes;
}
test("public paths require recognized format semantics; GNU cannot borrow a USTAR path prefix", () => {
  for (const change of [header => { header.write("ustar  \0", 257, 8); header.write("PRIVATE_PREFIX", 345); }, header => header.write("u\0star", 257, 6),
    header => header.write("01", 263, 2), header => header.fill(0, 257, 265)])
    assert.throws(() => inspectPublicBaseLayer(modifiedFirstHeader(change)), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});
test("restricted ordinary GNU records ignore only valid time metadata, never extensions or filename prefixes", () => {
  const valid = modifiedFirstHeader(header => { header.write("ustar  \0", 257, 8); header.write("00000000000\0", 345, 12); });
  const parsed = inspectPublicBaseLayer(valid);
  assert.equal(parsed.entries[0].path, "var/lib/dpkg/status.d/synthetic-lib");
  assert.equal(parsed.entries[0].tarFormat, "restricted-gnu");
  for (const start of [369, 381, 386, 482, 483, 500])
    assert.throws(() => inspectPublicBaseLayer(modifiedFirstHeader(header => { header.write("ustar  \0", 257, 8); header[start] = 49; })),
      /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});
test("high-bit numeric bytes and data after octal termination cannot be reinterpreted as harmless public record sizes", () => {
  for (const change of [header => { header[124] |= 128; }, header => { header[126] = 0; header[127] = 49; }])
    assert.throws(() => inspectPublicBaseLayer(modifiedFirstHeader(change)), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
});

test("a changed Dockerfile stops before any public query and never sends project paths or cloud credentials", async t => {
  const folder = mkdtempSync(join(tmpdir(), "gmai-public-base-proof-")); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, "services", "worker", "Dockerfile"); mkdirSync(dirname(file), { recursive: true });
  copyFileSync(join(root, "services", "worker", "Dockerfile"), file);
  writeFileSync(file, "PRIVATE_CHANGED_SOURCE"); let calls = 0;
  await assert.rejects(collectPublicBaseNoticeProof(folder, async () => { calls++; return new Response("{}"); }),
    /^Error: PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE$/); assert.equal(calls, 0);
});

test("public requests are fixed, credential-free and cannot redirect a manifest or accept malformed/oversized bodies", async () => {
  for (const options of [{ status: 403 }, { status: 302, headers: { location: "https://PRIVATE.invalid/" } },
    { headers: { "content-length": "64001" } }, { headers: { "content-length": "PRIVATE_LENGTH" } }]) {
    let canceled = false, calls = 0;
    const stream = new ReadableStream({ cancel() { canceled = true; } });
    await assert.rejects(collectPublicBaseNoticeProof(root, async (url, request) => {
      calls++; assert.equal(url, "https://gcr.io/v2/distroless/nodejs22-debian13/manifests/" + PUBLIC_BASE_DIGEST);
      assert.equal(request.redirect, "manual"); assert.equal(request.credentials, "omit"); assert.deepEqual(Object.keys(request.headers), ["Accept"]);
      assert.ok(request.signal instanceof AbortSignal); assert.equal(request.body, undefined); assert.equal(request.method, undefined);
      assert.equal(JSON.stringify(request).includes("AWS_PROFILE"), false); return new Response(stream, options);
    }), /^Error: PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE$/);
    assert.equal(calls, 1); assert.equal(canceled, true);
  }
  await assert.rejects(collectPublicBaseNoticeProof(root, async () => new Response("{}")), /^Error: PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE$/);
  const redirect = new Response("{}"); Object.defineProperty(redirect, "url", { value: "https://PRIVATE.invalid/" });
  await assert.rejects(collectPublicBaseNoticeProof(root, async () => redirect), /^Error: PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE$/);
});

test("oversized streamed public metadata is canceled and remains unknown rather than becoming a zero-gap result", async () => {
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65_000)); }, cancel() { canceled = true; } });
  await assert.rejects(collectPublicBaseNoticeProof(root, async () => new Response(stream)), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.equal(canceled, true);
});

test("blob redirects cannot leave the fixed public namespace, attach credentials or create an unbounded redirect chain", async () => {
  const prefix = "https://gcr.io/artifacts-downloads/namespaces/distroless/repositories/";
  for (const location of ["https://PRIVATE.invalid/blob", "http://gcr.io/artifacts-downloads/namespaces/distroless/repositories/blob",
    prefix + "blob?PRIVATE_TOKEN=x", prefix + "blob#PRIVATE_FRAGMENT", "https://PRIVATE_USER@gcr.io/artifacts-downloads/namespaces/distroless/repositories/blob",
    "https://gcr.io:8443/artifacts-downloads/namespaces/distroless/repositories/blob", "https://gcr.io/PRIVATE/blob"]) {
    let calls = 0, canceled = false;
    await assert.rejects(collectPublicBaseNoticeProof(root, async () => {
      calls++; if (calls === 1) return new Response(publicManifest);
      return new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 302, headers: { location } });
    }), error => error.message === "PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE" && error.proofStage === "public-config");
    assert.equal(calls, 2); assert.equal(canceled, true);
  }
  let chainCalls = 0;
  await assert.rejects(collectPublicBaseNoticeProof(root, async () => {
    if (++chainCalls === 1) return new Response(publicManifest);
    return new Response("", { status: 302, headers: { location: prefix + "fixture" } });
  }), /PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE/);
  assert.equal(chainCalls, 3);
});

test("one public blob redirect can reach the pinned config, but bad or absent layers remain unknown", async () => {
  const redirect = "https://gcr.io/artifacts-downloads/namespaces/distroless/repositories/fixture";
  const urls = [];
  await assert.rejects(collectPublicBaseNoticeProof(root, async (url, options) => {
    urls.push(url); assert.equal(options.credentials, "omit"); assert.deepEqual(Object.keys(options.headers), ["Accept"]);
    if (urls.length === 1) return new Response(publicManifest);
    if (urls.length === 2) return new Response("", { status: 302, headers: { location: redirect } });
    if (urls.length === 3) { assert.equal(url, redirect); return new Response(publicConfig); }
    return new Response("", { status: 403 });
  }), error => error.message === "PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE" && error.proofStage === "public-layers");
  assert.equal(urls.length, 4);
  let mutatedCalls = 0;
  await assert.rejects(collectPublicBaseNoticeProof(root, async () => ++mutatedCalls === 1 ? new Response(publicManifest) : new Response("{}")),
    error => error.message === "PUBLIC_BASE_NOTICE_PROOF_INCOMPLETE" && error.proofStage === "metadata-binding");
  assert.equal(mutatedCalls, 2);
});

test("public base CLI defaults to zero requests and refuses arbitrary image, destination, execute and upload options", () => {
  const run = args => spawnSync(process.execPath, ["scripts/public-base-notice-proof.mjs", ...args], {
    cwd: root, env: cleanSourceChildEnvironment(process.env), encoding: "utf8", timeout: 5000, windowsHide: true,
  });
  const planned = run([]); assert.equal(planned.status, 0); const report = JSON.parse(planned.stdout);
  assert.equal(report.publicRegistryRequests, 0); assert.equal(report.awsCalls, 0); assert.equal(report.dockerCalls, 0);
  assert.equal(report.imageCodeExecuted, false); assert.equal(report.readyForPublication, false);
  for (const args of [["--execute"], ["--image", "PRIVATE_IMAGE"], ["--upload"], ["--execute-public-base", "PRIVATE_DESTINATION"]]) {
    const result = run(args); assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes("PRIVATE"), false); assert.equal(JSON.parse(result.stderr).provenanceStatus, "unknown");
  }
});

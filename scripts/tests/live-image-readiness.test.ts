import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { collectLiveImageReadiness, createLiveImageReadOnlyRunner, evaluateStoredBasicScan, liveImageReadinessPlan,
  selectLinuxAmd64Child, summarizeLiveImageFailure, validateLiveImageReadOnlyQuery, verifyRegistryManifest } from "../live-image-readiness.js";

import { ACCOUNT, REPOSITORY, MANIFEST_TYPE, INDEX_TYPE, MANIFEST, DIGEST, TASK, NOW, clone, hash, scan, responses, manifestResponse, indexedResponses } from "./fixtures/live-image-fixture.js";
function collect(input = responses()) {
  let calls = 0;
  return { report: collectLiveImageReadiness(args => { validateLiveImageReadOnlyQuery(args); return input[calls++]; }, () => NOW), calls };
}

test("live image failures preserve only fixed trusted stages despite mutable error properties", () => {
  let error: any;
  try { collectLiveImageReadiness(() => ({}), () => NOW); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error);
  const expected = { error: "LIVE_IMAGE_RESPONSE_INVALID", stage: "identity", readyForExecution: false, privateDetailsSuppressed: true };
  assert.deepEqual(summarizeLiveImageFailure(error), expected);
  error.message = "PRIVATE_SENTINEL"; error.code = "PRIVATE_CODE"; error.stage = "PRIVATE_ACCOUNT_123456789012";
  error.packet = () => ({ error: "PRIVATE_SENTINEL" });
  assert.deepEqual(summarizeLiveImageFailure(error), expected);
  assert.equal(Object.isFrozen(summarizeLiveImageFailure(error)), true);
});

test("forged live error prototypes and hostile getters never escape the sanitized boundary", () => {
  let trusted: any;
  try { collectLiveImageReadiness(() => ({}), () => NOW); } catch (caught) { trusted = caught; }
  const unknown = { error: "LIVE_IMAGE_CHECK_INCOMPLETE", stage: "unknown", readyForExecution: false, privateDetailsSuppressed: true };
  const forged = Object.create(Object.getPrototypeOf(trusted));
  for (const error of [new Error("LIVE_IMAGE_READ_FAILED_PRIVATE_SENTINEL"), forged,
    { get message() { throw Error("PRIVATE_SENTINEL"); } },
    new Proxy(trusted, {}), new Proxy({}, { getPrototypeOf() { throw Error("PRIVATE_SENTINEL"); } })]) {
    assert.deepEqual(summarizeLiveImageFailure(error), unknown);
  }
});

test("ten exact single-manifest reads reveal no private identifiers and never enable execution", () => {
  const input = responses();
  const captured: string[][] = [];
  const report = collectLiveImageReadiness(args => { captured.push([...args]); validateLiveImageReadOnlyQuery(args); return input[captured.length - 1]; }, () => NOW);
  assert.equal(captured.length, 10); assert.equal(report.awsCalls, 10); assert.equal(report.basicOsGatePassed, true);
  assert.deepEqual(captured.map(args => `${args[0]}.${args[1]}`), ["sts.get-caller-identity", "cloudformation.list-stack-resources", "cloudformation.list-stack-resources",
    "lambda.get-function-configuration", "ecs.describe-task-definition", "ecr.describe-repositories", "ecr.describe-images", "ecr.batch-get-image", "ecr.describe-image-scan-findings", "lambda.get-function-configuration"]);
  assert.ok(captured[8]!.includes(`imageDigest=${DIGEST}`)); assert.ok(captured[8]!.includes("1000"));
  assert.ok(captured.every(args => args.includes("--no-paginate") && args.includes("--no-cli-pager")));
  for (const field of ["readyForExecution", "readyForPublication", "secretScanVerified", "applicationDependencyScanVerified", "currentSourceDeploymentVerified"]) assert.equal(report[field as keyof typeof report], false);
  for (const privateText of [ACCOUNT, TASK, DIGEST, "PRIVATE_SENTINEL", "arn:aws", "dkr.ecr"]) assert.equal(JSON.stringify(report).includes(privateText), false);
});

test("wrong principal or owner is rejected before reading private downstream resources", () => {
  for (const index of [0, 1, 2]) {
    const input = responses() as any[];
    if (index === 0) input[0].Arn += "-foreign";
    if (index === 1) input[1].StackResourceSummaries[0].PhysicalResourceId = "foreign";
    if (index === 2) input[2].StackResourceSummaries[0].ResourceStatus = "DELETE_COMPLETE";
    let calls = 0;
    assert.throws(() => collectLiveImageReadiness(() => input[calls++], () => NOW));
    assert.equal(calls, index + 1);
  }
});

test("partial or duplicate owner inventory cannot prove a live image", () => {
  for (const mutate of [(entry: any) => { entry.nextToken = "PRIVATE_SENTINEL"; },
    (entry: any) => { entry.StackResourceSummaries.push(clone(entry.StackResourceSummaries[0])); },
    (entry: any) => { entry.StackResourceSummaries = [null]; }]) {
    const input = responses() as any[]; mutate(input[1]); assert.throws(() => collect(input));
  }
});

test("enabled, unknown or changed controller never passes the read gate", () => {
  for (const [index, field, value] of [[3, "ENABLE_PROVIDER_BACKED_JOBS", "true"], [3, "ENABLE_LIVE_RESULT_DISPLAY", undefined], [9, "WORKER_TASK_DEFINITION", TASK.replace(":9", ":10")], [9, "ENABLE_PROVIDER_BACKED_JOBS", "true"]] as const) {
    const input = responses() as any[]; input[index] = clone(input[index]); input[index].Environment.Variables[field] = value;
    assert.throws(() => collect(input));
  }
});

test("foreign, mutable, multi-container or non-hardened task cannot choose a scan destination", () => {
  for (const mutate of [(task: any) => { task.containerDefinitions[0].image = task.containerDefinitions[0].image.replace(ACCOUNT, "999999999999"); },
    (task: any) => { task.containerDefinitions[0].image = task.containerDefinitions[0].image.replace(`@${DIGEST}`, ":latest"); },
    (task: any) => { task.containerDefinitions.push(null); }, (task: any) => { task.containerDefinitions[0].readonlyRootFilesystem = false; },
    (task: any) => { task.containerDefinitions[0].user = "root"; }, (task: any) => { task.containerDefinitions[0].privileged = true; },
    (task: any) => { task.taskDefinitionArn = TASK.replace("ap-northeast-1", "ap-northeast-2"); }, (task: any) => { task.runtimePlatform.cpuArchitecture = "ARM64"; }]) {
    const input = responses() as any[]; mutate(input[4].taskDefinition); let calls = 0;
    assert.throws(() => collectLiveImageReadiness(() => input[calls++], () => NOW)); assert.equal(calls, 5);
  }
});

test("repository and image replies must agree with the owned immutable exact task digest", () => {
  for (const [index, mutate] of [[5, (entry: any) => { entry.repositories[0].repositoryUri += "/foreign"; }],
    [5, (entry: any) => { entry.repositories[0].imageTagMutability = "MUTABLE"; }],
    [5, (entry: any) => { entry.repositories[0].registryId = "999999999999"; }],
    [6, (entry: any) => { entry.imageDetails[0].imageDigest = `sha256:${"b".repeat(64)}`; }],
    [6, (entry: any) => { entry.imageDetails[0].imageManifestMediaType = "application/vnd.oci.image.index.v1+json"; }],
    [6, (entry: any) => { entry.nextToken = "more"; }], [6, (entry: any) => { entry.imageDetails.push(clone(entry.imageDetails[0])); }],
    [6, (entry: any) => { entry.imageDetails[0].imageSizeInBytes = 300_000_000; }]] as const) {
    const input = responses() as any[]; mutate(input[index]); assert.throws(() => collect(input));
  }
});

test("old DescribeImages scan summaries cannot substitute for current findings", () => {
  const input = responses() as any[]; input[8] = { imageScanStatus: { status: "COMPLETE" }, imageScanFindingsSummary: { findingSeverityCounts: {} } };
  assert.throws(() => collect(input));
});

test("stale scan or stale vulnerability feed retains a blocked OS gate", () => {
  for (const field of ["imageScanCompletedAt", "vulnerabilitySourceUpdatedAt"]) {
    const input = scan() as any; input.imageScanFindings[field] = new Date(NOW - 24 * 3600_000 - 1).toISOString();
    const report = evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW);
    assert.equal(report.freshWithin24Hours, false); assert.equal(report.basicOsGatePassed, false);
  }
});

test("high, critical and undefined severities block even a recent complete scan", () => {
  for (const severity of ["HIGH", "CRITICAL", "UNDEFINED"]) {
    const input = scan() as any; input.imageScanFindings.findingSeverityCounts[severity] = 1; input.imageScanFindings.findings.push({ severity });
    assert.equal(evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW).basicOsGatePassed, false);
  }
});

test("sparse counts mean zero only with a complete and consistent findings array", () => {
  const input = scan(); input.imageScanFindings.findings = []; input.imageScanFindings.findingSeverityCounts = {} as any;
  assert.equal(evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW).basicOsGatePassed, true);
  delete (input.imageScanFindings as any).findings; assert.throws(() => evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW));
});

test("pagination, unknown severities, mismatched counts or enhanced scan shape fail closed", () => {
  for (const mutate of [(entry: any) => { entry.nextToken = "more"; }, (entry: any) => { entry.imageScanFindings.enhancedFindings = []; },
    (entry: any) => { entry.imageScanStatus.status = "ACTIVE"; }, (entry: any) => { entry.imageScanFindings.findingSeverityCounts.PRIVATE = 0; },
    (entry: any) => { entry.imageScanFindings.findingSeverityCounts.HIGH = -1; }, (entry: any) => { entry.imageScanFindings.findingSeverityCounts.HIGH = "0"; },
    (entry: any) => { entry.imageScanFindings.findingSeverityCounts.LOW = 0; }, (entry: any) => { entry.imageScanFindings.findings[0].severity = "UNKNOWN"; },
    (entry: any) => { entry.imageScanFindings.findingSeverityCounts.LOW = 1.5; }, (entry: any) => { entry.imageScanFindings.findingSeverityCounts.LOW = 1001; }]) {
    const input = scan(); mutate(input); assert.throws(() => evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW));
  }
});

test("bad, missing or future timestamps cannot appear fresh", () => {
  for (const value of [undefined, "today", "0", -1, Number.NaN, "2026-10-04T06:00:00Z", "2026-02-30T05:00:00Z", "2026-10-03T24:00:00Z"]) {
    const input = scan() as any; input.imageScanFindings.imageScanCompletedAt = value;
    assert.throws(() => evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW));
  }
  const input = scan() as any; input.imageScanFindings.imageScanCompletedAt = (NOW - 60_000) / 1000;
  assert.equal(evaluateStoredBasicScan(input, ACCOUNT, DIGEST, NOW).freshWithin24Hours, true);
});

test("ECR read arguments cannot widen destination, retrieve passwords or start a scan", () => {
  const captured: string[][] = []; const input = responses();
  collectLiveImageReadiness(args => { captured.push([...args]); return input[captured.length - 1]; }, () => NOW);
  for (const query of captured.filter(args => args[0] === "ecr")) {
    for (const added of [["--endpoint-url", "PRIVATE_SENTINEL"], ["--no-verify-ssl"], ["--debug"], ["--profile", "foreign"], ["--next-token", "foreign"]]) {
      assert.throws(() => validateLiveImageReadOnlyQuery([...query, ...added]));
    }
    assert.throws(() => validateLiveImageReadOnlyQuery(query.map(arg => arg === "ap-northeast-1" ? "us-east-1" : arg)));
    assert.throws(() => validateLiveImageReadOnlyQuery(query.map(arg => arg === REPOSITORY ? "foreign" : arg)));
    if (query.some(arg => arg.startsWith("imageDigest="))) assert.throws(() => validateLiveImageReadOnlyQuery(query.map(arg => arg.startsWith("imageDigest=") ? "imageTag=latest" : arg)));
  }
  for (const operation of ["start-image-scan", "get-authorization-token", "get-download-url-for-layer", "delete-repository"]) {
    assert.throws(() => validateLiveImageReadOnlyQuery(["ecr", operation]));
  }
});

test("runner is bounded to twelve reads and validates before any child spawn", () => {
  let calls = 0; const valid = ["sts", "get-caller-identity", "--profile", "gmai-admin", "--region", "ap-northeast-1", "--output", "json", "--no-paginate", "--no-cli-pager"];
  const runner = createLiveImageReadOnlyRunner({ now: () => NOW, spawn: (_command, _args, options) => {
    calls += 1; assert.equal(options.timeout, 30_000); assert.equal(options.windowsHide, true); assert.equal(options.maxBuffer, 2_000_000);
    assert.equal(options.env.AWS_MAX_ATTEMPTS, "1"); assert.equal(options.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
    return { status: 0, signal: null, stdout: "{}" };
  } });
  assert.throws(() => runner(["ecr", "start-image-scan"])); assert.equal(calls, 0);
  for (let count = 0; count < 12; count++) runner(valid);
  assert.throws(() => runner(valid)); assert.equal(calls, 12);
});

test("runner deadline, child failures, large or malformed output stay private", () => {
  const query = ["sts", "get-caller-identity", "--profile", "gmai-admin", "--region", "ap-northeast-1", "--output", "json", "--no-paginate", "--no-cli-pager"];
  for (const result of [{ status: 1, signal: null, stdout: "PRIVATE_SENTINEL", stderr: "PRIVATE_SENTINEL" }, { status: 0, signal: null, stdout: "PRIVATE_SENTINEL" },
    { status: 0, signal: "SIGTERM", stdout: "{}" }, { status: 0, signal: null, stdout: "x".repeat(2_000_001) }]) {
    const runner = createLiveImageReadOnlyRunner({ now: () => NOW, spawn: () => result });
    try { runner(query); assert.fail("must fail"); } catch (error) { assert.equal(JSON.stringify(summarizeLiveImageFailure(error)).includes("PRIVATE_SENTINEL"), false); }
  }
  let clock = NOW; let calls = 0;
  const expired = createLiveImageReadOnlyRunner({ now: () => clock, spawn: () => { calls++; return { status: 0, signal: null, stdout: "{}" }; } });
  clock += 180_000; assert.throws(() => expired(query)); assert.equal(calls, 0);
  let step = 0;
  const late = createLiveImageReadOnlyRunner({ now: () => NOW + (step++ >= 2 ? 180_000 : 0), spawn: () => ({ status: 0, signal: null, stdout: "{}" }) });
  assert.throws(() => late(query));
});

test("missing stored scan is classified without exposing AWS identifiers or error text", () => {
  const input = responses(); const captured: string[][] = [];
  collectLiveImageReadiness(args => { captured.push([...args]); return input[captured.length - 1]; }, () => NOW);
  const runner = createLiveImageReadOnlyRunner({ now: () => NOW, spawn: () => ({ status: 1, signal: null, stdout: "", stderr: "An error occurred (ScanNotFoundException) PRIVATE_SENTINEL" }) });
  try { runner(captured[8]!); assert.fail("missing scan"); } catch (error) {
    assert.equal(summarizeLiveImageFailure(error).error, "LIVE_IMAGE_SCAN_NOT_FOUND"); assert.equal(JSON.stringify(summarizeLiveImageFailure(error)).includes("PRIVATE_SENTINEL"), false);
  }
});

test("immutable index selects and hashes one Linux amd64 child and scans that exact digest in twelve reads", () => {
  const input = indexedResponses(); const captured: string[][] = [];
  const report = collectLiveImageReadiness(args => { validateLiveImageReadOnlyQuery(args); captured.push([...args]); return input[captured.length - 1]; }, () => NOW);
  assert.equal(captured.length, 12); assert.equal(report.awsCalls, 12); assert.equal(report.indexChildSelected, true);
  assert.equal(report.manifestBytesVerified, true); assert.equal(report.basicOsGatePassed, true); assert.equal(report.imageConfigArchitectureVerified, false);
  assert.equal(captured[10]!.includes(`imageDigest=${DIGEST}`), true);
  assert.equal(captured[10]!.includes(`imageDigest=${(input[6] as any).imageDetails[0].imageDigest}`), false);
});

test("index selection refuses missing or ambiguous platform and unsafe descriptors", () => {
  const normal = { schemaVersion: 2, mediaType: INDEX_TYPE, manifests: [
    { mediaType: MANIFEST_TYPE, digest: DIGEST, size: Buffer.byteLength(MANIFEST), platform: { os: "linux", architecture: "amd64" } },
  ] };
  for (const mutate of [(entry: any) => { entry.manifests[0].platform.os = "windows"; }, (entry: any) => { entry.manifests[0].platform.architecture = "arm64"; },
    (entry: any) => { entry.manifests.push({ ...clone(entry.manifests[0]), digest: `sha256:${"b".repeat(64)}` }); },
    (entry: any) => { entry.manifests.push(clone(entry.manifests[0])); }, (entry: any) => { entry.manifests[0].platform.variant = "v3"; },
    (entry: any) => { entry.manifests[0].platform["os.features"] = ["PRIVATE_SENTINEL"]; }, (entry: any) => { entry.manifests[0].urls = ["PRIVATE_SENTINEL"]; },
    (entry: any) => { entry.manifests[0].data = "PRIVATE_SENTINEL"; }, (entry: any) => { entry.manifests[0].mediaType = INDEX_TYPE; },
    (entry: any) => { entry.manifests[0].size = 65_537; }, (entry: any) => { entry.manifests = []; }, (entry: any) => { entry.manifests = Array(9).fill(entry.manifests[0]); }]) {
    const input = clone(normal); mutate(input); assert.throws(() => selectLinuxAmd64Child(input));
  }
});

test("manifest response identity, exact byte hash, size and schema must all agree", () => {
  const valid = manifestResponse(MANIFEST);
  assert.equal(verifyRegistryManifest(valid, ACCOUNT, DIGEST, MANIFEST_TYPE).schemaVersion, 2);
  for (const mutate of [(entry: any) => { entry.failures = [{ failureReason: "PRIVATE_SENTINEL" }]; },
    (entry: any) => { entry.images[0].registryId = "999999999999"; }, (entry: any) => { entry.images[0].imageManifest += " "; },
    (entry: any) => { entry.images[0].imageId.imageDigest = `sha256:${"b".repeat(64)}`; }, (entry: any) => { entry.images.push(clone(entry.images[0])); },
    (entry: any) => { entry.images[0].imageManifestMediaType = INDEX_TYPE; }]) {
    const input = clone(valid); mutate(input); assert.throws(() => verifyRegistryManifest(input, ACCOUNT, DIGEST, MANIFEST_TYPE));
  }
  assert.throws(() => verifyRegistryManifest(valid, ACCOUNT, DIGEST, MANIFEST_TYPE, Buffer.byteLength(MANIFEST) + 1));
  for (const manifest of [{ schemaVersion: 1, mediaType: MANIFEST_TYPE }, { schemaVersion: 2, mediaType: MANIFEST_TYPE, subject: {} },
    { schemaVersion: 2, mediaType: MANIFEST_TYPE, artifactType: "PRIVATE_SENTINEL" }]) {
    const bytes = JSON.stringify(manifest); assert.throws(() => verifyRegistryManifest(manifestResponse(bytes), ACCOUNT, hash(bytes), MANIFEST_TYPE));
  }
});

test("scan of the parent index or a substituted child cannot clear the runtime gate", () => {
  const input = indexedResponses() as any[];
  input[10].imageId.imageDigest = input[6].imageDetails[0].imageDigest;
  assert.throws(() => collect(input));
  const substituted = indexedResponses() as any[]; substituted[9].images[0].imageManifest += " ";
  assert.throws(() => collect(substituted));
});

test("runtime manifests with foreign layer URLs, artifact config or oversized layer totals fail before scan", () => {
  for (const mutate of [(entry: any) => { entry.layers[0].urls = ["PRIVATE_SENTINEL"]; },
    (entry: any) => { entry.config.mediaType = "application/vnd.in-toto+json"; },
    (entry: any) => { entry.layers = []; }, (entry: any) => { entry.layers[0].size = 256 * 1024 * 1024; entry.layers.push(clone(entry.layers[0])); }]) {
    const input = responses() as any[]; const manifest = JSON.parse(MANIFEST); mutate(manifest);
    const bytes = JSON.stringify(manifest); const digest = hash(bytes);
    input[4].taskDefinition.containerDefinitions[0].image = input[4].taskDefinition.containerDefinitions[0].image.replace(DIGEST, digest);
    input[6].imageDetails[0].imageDigest = digest; input[7] = manifestResponse(bytes);
    let calls = 0; assert.throws(() => collectLiveImageReadiness(() => input[calls++], () => NOW)); assert.equal(calls, 8);
  }
});

test("default and import are zero-call; unsupported CLI options never echo private values", () => {
  assert.equal(liveImageReadinessPlan().awsCalls, 0);
  const script = resolve("scripts/live-image-readiness.ts");
  const env = { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL", GMAI_ENABLE_INTERNAL_JOBS: "true" };
  for (const args of [[], ["--execute"], ["--execute-read-only", "--endpoint-url", "PRIVATE_SENTINEL"]]) {
    const run = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
    assert.equal(run.status, args.length === 0 ? 0 : 1); assert.equal(`${run.stdout}${run.stderr}`.includes("PRIVATE_SENTINEL"), false);
    if (args.length === 0) assert.equal(JSON.parse(run.stdout).awsCalls, 0);
  }
  const imported = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'await import("./scripts/live-image-readiness.ts");'], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});

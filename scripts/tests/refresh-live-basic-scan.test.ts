import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { basicScanRefreshPlan, createBasicScanControlRunner, refreshLiveBasicScan, summarizeBasicScanRefreshFailure,
  validateBasicScanControlQuery } from "../refresh-live-basic-scan.js";
import { validateLiveImageReadOnlyQuery } from "../live-image-readiness.js";
import { ACCOUNT, DIGEST, REPOSITORY, NOW, clone, indexedResponses, scan, TASK } from "./fixtures/live-image-fixture.js";
import { PATCH } from "../worker-patch-identity.js";
import { DATED_PATCH_MANIFEST, datedPatchResponses } from "./fixtures/dated-patch-manifest.js";
import { hash } from "./fixtures/live-image-fixture.js";

const configuration = { registryId: ACCOUNT, scanningConfiguration: { scanType: "BASIC", rules: [] } };
const status = (state: string) => ({ registryId: ACCOUNT, repositoryName: REPOSITORY, imageId: { imageDigest: DIGEST }, imageScanStatus: { status: state } });
const configurationArgs = ["ecr", "get-registry-scanning-configuration", "--profile", "gmai-admin", "--region", "ap-northeast-1", "--output", "json", "--no-paginate", "--no-cli-pager"];
const startArgs = ["ecr", "start-image-scan", "--registry-id", ACCOUNT, "--repository-name", REPOSITORY, "--image-id", `imageDigest=${DIGEST}`,
  "--profile", "gmai-admin", "--region", "ap-northeast-1", "--output", "json", "--no-paginate", "--no-cli-pager"];

function harness() {
  const initial = indexedResponses() as any[];
  const previous = new Date(NOW - 35 * 24 * 3600_000).toISOString();
  initial[10].imageScanFindings.imageScanCompletedAt = previous;
  initial[10].imageScanFindings.vulnerabilitySourceUpdatedAt = previous;
  const final = indexedResponses() as any[];
  const polls: unknown[] = [scan()];
  const controls: unknown[] = [clone(configuration), status("IN_PROGRESS")];
  const reads: string[][] = [];
  const controlCalls: string[][] = [];
  const waits: number[] = [];
  let clock = NOW;
  let factories = 0;
  const dependencies = {
    now: () => clock,
    wait: async (milliseconds: number) => { waits.push(milliseconds); },
    readFactory: () => {
      const source = factories++ === 0 ? initial : factories === 2 ? polls : final;
      let count = 0;
      return (args: readonly string[]) => { validateLiveImageReadOnlyQuery(args); reads.push([...args]); return source[count++]; };
    },
    control: (args: readonly string[]) => { validateBasicScanControlQuery(args); controlCalls.push([...args]); return controls[controlCalls.length - 1]; },
  };
  return { initial, final, polls, controls, reads, controlCalls, waits, dependencies, setClock: (value: number) => { clock = value; } };
}

function patchHarness() {
  const initial = [...indexedResponses(), ...datedPatchResponses(true)] as any[];
  const final = [...indexedResponses(), ...datedPatchResponses()] as any[];
  const findings = datedPatchResponses()[2]!;
  const sources = [initial.slice(0,12), initial.slice(12), [findings], final.slice(0,12), final.slice(12)];
  const controls = [clone(configuration), { ...status("IN_PROGRESS"), imageId: { imageDigest: PATCH.runtimeDigest } }];
  const calls: string[][] = []; let factory = 0;
  const dependencies = { now: () => NOW, wait: async () => {}, readFactory: () => {
    const source = sources[factory++]!; let position = 0;
    return (args: readonly string[]) => { validateLiveImageReadOnlyQuery(args); return source[position++]; };
  }, control: (args: readonly string[]) => { validateBasicScanControlQuery(args); calls.push([...args]); return controls[calls.length-1]; } };
  return { initial, final, sources, controls, calls, dependencies };
}

test("dated candidate refresh binds exact public manifest descriptors, never a caller-selected image", async () => {
  assert.equal(hash(DATED_PATCH_MANIFEST), PATCH.runtimeDigest);
  const run = patchHarness(); const report = await refreshLiveBasicScan(run.dependencies, true);
  assert.equal(report.mode, "dated-patch-basic-scan-refresh"); assert.equal(report.awsCalls, 33);
  assert.equal(report.scanStartAttempts, 1); assert.equal(report.liveImage.datedCandidateVerified, true);
  assert.equal(report.liveImage.basicOsGatePassed, true); assert.equal(report.readyForExecution, false);
  assert.equal(run.calls[1]![run.calls[1]!.indexOf("--image-id")+1], `imageDigest=${PATCH.runtimeDigest}`);
  for (const sentinel of [ACCOUNT, PATCH.runtimeDigest, "PRIVATE_SENTINEL", "arn:aws", "dkr.ecr"]) assert.equal(JSON.stringify(report).includes(sentinel), false);
});

test("dated refresh blocks foreign, mutated or untagged candidate before scan control", async () => {
  for (const mutate of [(values: any[]) => { values[0].imageDetails[0].registryId="999999999999"; },
    (values: any[]) => { values[0].imageDetails[0].imageTags=[]; },
    (values: any[]) => { values[1].images[0].imageManifest+=" "; }]) {
    const run=patchHarness(); mutate(run.sources[1]!);
    await assert.rejects(refreshLiveBasicScan(run.dependencies,true)); assert.equal(run.calls.length,0);
  }
});

test("dated refresh treats final candidate changes or execution enablement as unverified", async () => {
  for (const mutate of [(run: ReturnType<typeof patchHarness>) => { (run.sources[4] as any[])[0].imageDetails[0].imageTags=[]; },
    (run: ReturnType<typeof patchHarness>) => { (run.sources[3] as any[])[3].Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS="true"; }]) {
    const run=patchHarness(); mutate(run); await assert.rejects(refreshLiveBasicScan(run.dependencies,true));
    assert.equal(run.calls.length,2);
  }
});

test("fresh dated candidate performs no scan write even when the deployed image scan is stale", async () => {
  const run=patchHarness(); run.sources[1]![2]=datedPatchResponses()[2]!;
  const report=await refreshLiveBasicScan(run.dependencies,true);
  assert.equal(report.awsCalls,15); assert.equal(report.cloudMutations,0); assert.equal(run.calls.length,0);
});

test("one stale owned basic scan refresh completes and independently rechecks the same disabled target", async () => {
  const run = harness(); const report = await refreshLiveBasicScan(run.dependencies);
  assert.equal(report.awsCalls, 27); assert.equal(report.scanStartAttempts, 1); assert.equal(report.cloudMutations, 1);
  assert.equal(report.scanCompletionVerified, true); assert.equal(report.readyForExecution, false);
  assert.equal(report.liveImage.basicOsGatePassed, true); assert.equal(report.liveImage.controllerStillDisabled, true);
  assert.deepEqual(run.controlCalls, [configurationArgs, startArgs]);
  assert.equal(run.reads.filter(args => args[1] === "describe-image-scan-findings").length, 3);
  assert.equal(run.waits.length, 0);
  for (const sentinel of [ACCOUNT, DIGEST, "PRIVATE_SENTINEL", "arn:aws", "dkr.ecr"]) assert.equal(JSON.stringify(report).includes(sentinel), false);
});

test("a fresh existing scan performs no write or registry configuration call, including fresh HIGH findings", async () => {
  const run = harness(); run.initial[10] = scan();
  run.initial[10].imageScanFindings.findingSeverityCounts.HIGH = 1;
  run.initial[10].imageScanFindings.findings.push({ severity: "HIGH" });
  const report = await refreshLiveBasicScan(run.dependencies);
  assert.equal(report.cloudMutations, 0); assert.equal(report.scanStartAttempts, 0); assert.equal(report.awsCalls, 12);
  assert.equal(report.liveImage.basicOsGatePassed, false); assert.equal(run.controlCalls.length, 0);
});

test("a stale feed alone cannot start a second scan inside the same 24-hour daily window", async () => {
  const run = harness(); run.initial[10].imageScanFindings.imageScanCompletedAt = new Date(NOW - 60_000).toISOString();
  await assert.rejects(refreshLiveBasicScan(run.dependencies), /DAILY_REFRESH_NOT_ELIGIBLE/);
  assert.equal(run.controlCalls.length, 0);
});

test("wrong owner, enabled execution or broken manifest stops before any scan-control call", async () => {
  for (const mutate of [(input: any[]) => { input[0].Arn += "-wrong"; }, (input: any[]) => { input[3].Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true"; },
    (input: any[]) => { input[9].images[0].imageManifest += " "; }]) {
    const run = harness(); mutate(run.initial); await assert.rejects(refreshLiveBasicScan(run.dependencies)); assert.equal(run.controlCalls.length, 0);
  }
});

test("unknown, enhanced or foreign registry scanning never expands into paid Inspector", async () => {
  for (const value of [{ registryId: ACCOUNT, scanningConfiguration: { scanType: "ENHANCED" } }, { registryId: "999999999999", scanningConfiguration: { scanType: "BASIC" } }, {}]) {
    const run = harness(); run.controls[0] = value; await assert.rejects(refreshLiveBasicScan(run.dependencies), /MODE_NOT_VERIFIED/);
    assert.equal(run.controlCalls.length, 1); assert.equal(run.controlCalls.some(args => args[1] === "start-image-scan"), false);
  }
});

test("an ambiguous scan start is consumed once with no retry or polling", async () => {
  const run = harness(); run.dependencies.control = args => {
    run.controlCalls.push([...args]); if (run.controlCalls.length === 1) return configuration;
    throw new Error("PRIVATE_SENTINEL");
  };
  try { await refreshLiveBasicScan(run.dependencies); assert.fail("must fail"); } catch (error) {
    const report = summarizeBasicScanRefreshFailure(error);
    assert.equal(report.scanStartAttempted, true); assert.equal(report.retryPermitted, false); assert.equal(JSON.stringify(report).includes("PRIVATE_SENTINEL"), false);
  }
  assert.equal(run.controlCalls.length, 2); assert.equal(run.reads.length, 12);
});

test("a start reply for another image cannot become completion proof", async () => {
  const run = harness(); run.controls[1] = { ...status("IN_PROGRESS"), imageId: { imageDigest: `sha256:${"b".repeat(64)}` } };
  await assert.rejects(refreshLiveBasicScan(run.dependencies), /START_UNVERIFIED/); assert.equal(run.controlCalls.length, 2); assert.equal(run.reads.length, 12);
});

test("exactly five polls and four bounded delays may reach the 31-call ceiling", async () => {
  const run = harness(); run.polls.splice(0, run.polls.length, ...Array.from({ length: 4 }, () => status("IN_PROGRESS")), scan());
  const report = await refreshLiveBasicScan(run.dependencies);
  assert.equal(report.awsCalls, 31); assert.equal(report.pollReads, 5); assert.deepEqual(run.waits, [10_000, 10_000, 10_000, 10_000]);
});

test("documented PENDING is waiting, never completion, and still consumes one start", async () => {
  const run = harness(); run.controls[1] = status("PENDING");
  run.polls.splice(0, run.polls.length, status("PENDING"), status("IN_PROGRESS"), scan());
  const report = await refreshLiveBasicScan(run.dependencies);
  assert.equal(report.scanStartAttempts, 1); assert.equal(report.scanCompletionVerified, true);
  assert.equal(report.pollReads, 3); assert.deepEqual(run.waits, [10_000, 10_000]);
  assert.equal(run.controlCalls.length, 2); assert.equal(report.readyForExecution, false);
});

test("Enhanced ACTIVE and unknown scan states do not count as Basic completion", async () => {
  for (const state of ["ACTIVE", "UNSUPPORTED_IMAGE", "FINDINGS_UNAVAILABLE", "PRIVATE_SENTINEL", ""]) {
    const run = harness(); run.controls[1] = status(state);
    await assert.rejects(refreshLiveBasicScan(run.dependencies), /START_UNVERIFIED/);
    assert.equal(run.controlCalls.length, 2); assert.equal(run.reads.length, 12);
  }
});

test("five incomplete polls abort without another start or a sixth poll", async () => {
  const run = harness(); run.polls.splice(0, run.polls.length, ...Array.from({ length: 5 }, () => status("IN_PROGRESS")));
  await assert.rejects(refreshLiveBasicScan(run.dependencies), /COMPLETION_UNVERIFIED/);
  assert.equal(run.controlCalls.length, 2); assert.equal(run.reads.length, 17); assert.equal(run.waits.length, 4);
});

test("failed or foreign poll replies abort immediately, retaining conservative start evidence", async () => {
  for (const response of [status("FAILED"), { ...status("IN_PROGRESS"), registryId: "999999999999" }, { ...status("COMPLETE"), imageScanFindings: {} }]) {
    const run = harness(); run.polls[0] = response;
    try { await refreshLiveBasicScan(run.dependencies); assert.fail("must fail"); } catch (error) { assert.equal(summarizeBasicScanRefreshFailure(error).scanStartAttempted, true); }
    assert.equal(run.controlCalls.length, 2); assert.equal(run.waits.length, 0);
  }
});

test("current high findings are reported as blocked, never filtered out", async () => {
  const run = harness(); const fresh = scan() as any;
  fresh.imageScanFindings.findingSeverityCounts.HIGH = 1; fresh.imageScanFindings.findings.push({ severity: "HIGH" });
  run.polls[0] = fresh; run.final[10] = fresh;
  const report = await refreshLiveBasicScan(run.dependencies);
  assert.equal(report.scanCompletionVerified, true); assert.equal(report.liveImage.basicOsGatePassed, false); assert.equal(report.liveImage.severityCounts.HIGH, 1);
  assert.equal(report.readyForExecution, false);
});

test("final controller enablement or changed task reference invalidates the result", async () => {
  for (const change of ["enabled", "task"]) {
    const run = harness(); run.final[3] = clone(run.final[3]);
    if (change === "enabled") run.final[3].Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS = "true";
    else run.final[3].Environment.Variables.WORKER_TASK_DEFINITION = TASK.replace(":9", ":10");
    await assert.rejects(refreshLiveBasicScan(run.dependencies)); assert.equal(run.controlCalls.length, 2);
  }
});

test("a six-minute deadline or clock reversal cannot start new control work", async () => {
  for (const adjustment of [360_000, -1]) {
    const run = harness(); let reads = 0; const factory = run.dependencies.readFactory;
    run.dependencies.readFactory = () => { const reader = factory(); return args => { const result = reader(args); if (++reads === 1) run.setClock(NOW + adjustment); return result; }; };
    await assert.rejects(refreshLiveBasicScan(run.dependencies), /DEADLINE_OR_CALL_LIMIT/); assert.equal(run.controlCalls.length, 0);
  }
});

test("scan-control guard rejects extra flags, mutable tags, mode changes and foreign destination", () => {
  assert.equal(validateBasicScanControlQuery(configurationArgs), "configuration-read"); assert.equal(validateBasicScanControlQuery(startArgs), "one-scan-start");
  for (const args of [[...startArgs, "--no-verify-ssl"], [...startArgs, "--endpoint-url", "PRIVATE_SENTINEL"], [...startArgs, "--profile", "foreign"],
    startArgs.map(value => value === "ap-northeast-1" ? "us-east-1" : value), startArgs.map(value => value.startsWith("imageDigest=") ? "imageTag=latest" : value),
    ["ecr", "put-registry-scanning-configuration"], [...configurationArgs, "--debug"]]) assert.throws(() => validateBasicScanControlQuery(args));
});

test("control runner requires BASIC config first, pins that registry and consumes ambiguous writes", () => {
  let calls = 0;
  const runner = createBasicScanControlRunner({ spawn: (_command, _args, options) => {
    calls++; assert.equal(options.env.AWS_MAX_ATTEMPTS, "1"); assert.equal(options.timeout, 30_000); assert.equal(options.windowsHide, true);
    return calls === 1 ? { status: 0, signal: null, stdout: JSON.stringify(configuration) } : { status: 1, signal: null, stdout: "PRIVATE_SENTINEL" };
  } });
  assert.throws(() => runner(startArgs)); assert.equal(calls, 0);
  runner(configurationArgs);
  assert.throws(() => runner(startArgs.map(value => value === ACCOUNT ? "999999999999" : value))); assert.equal(calls, 1);
  assert.throws(() => runner(startArgs)); assert.equal(calls, 2);
  assert.throws(() => runner(startArgs)); assert.equal(calls, 2);
  assert.throws(() => runner(configurationArgs)); assert.equal(calls, 2);
  const enhanced = createBasicScanControlRunner({ spawn: () => ({ status: 0, signal: null, stdout: JSON.stringify({ registryId: ACCOUNT, scanningConfiguration: { scanType: "ENHANCED" } }) }) });
  assert.throws(() => enhanced(configurationArgs), /MODE_NOT_VERIFIED/); assert.throws(() => enhanced(startArgs));
});

test("default and import cannot start scans, while all other CLI options fail privately", () => {
  assert.equal(basicScanRefreshPlan().awsCalls, 0); assert.equal(basicScanRefreshPlan().scanStartAttemptsMax, 1);
  const script = resolve("scripts/refresh-live-basic-scan.ts"); const env = { ...process.env, AWS_PROFILE: "PRIVATE_SENTINEL" };
  for (const args of [[], ["--execute"], ["--execute-one-basic-scan"], ["--execute-one-basic-scan", "--digest", "PRIVATE_SENTINEL"]]) {
    const run = spawnSync(process.execPath, ["--import", "tsx", script, ...args], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
    assert.equal(run.status, args.length === 0 ? 0 : 1); assert.equal(`${run.stdout}${run.stderr}`.includes("PRIVATE_SENTINEL"), false);
  }
  const imported = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", 'await import("./scripts/refresh-live-basic-scan.ts");'], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
  assert.equal(imported.status, 0); assert.equal(imported.stdout, ""); assert.equal(imported.stderr, "");
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { PATCH, privateAclChildEnvironment, privatePatchPromotionPlan, registryPassword, requireRecentPatchAcceptance, verifyPromotedImageDetail } from "../promote-worker-patch.js";

const ACCOUNT = "123456789012", NOW = Date.parse("2026-10-04T06:50:00Z");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function auth() { return { authorizationData: [{ proxyEndpoint: `${"https://"}${ACCOUNT}.dkr.ecr.ap-northeast-1.amazonaws.com`,
  authorizationToken: Buffer.from("AWS:PRIVATE_SENTINEL_PASSWORD_NOT_REAL").toString("base64"), expiresAt: new Date(NOW + 12 * 3600_000).toISOString() }] }; }
function image() { return { imageDetails: [{ registryId: ACCOUNT, repositoryName: "global-market-ai-insight-dev-worker", imageDigest: PATCH.runtimeDigest,
  imageManifestMediaType: "application/vnd.oci.image.manifest.v1+json", imageTags: [PATCH.remoteTag], imageSizeInBytes: 55_000_000 }] }; }

test("default promotion plan retrieves no password and never claims logout revokes its server validity", () => {
  const plan = privatePatchPromotionPlan(); assert.equal(plan.awsCalls, 0); assert.equal(plan.privateImagePushesMax, 1); assert.equal(plan.credentialsPrinted, false);
  assert.equal(plan.registryPasswordLifetimeRevokedByLogout, false); assert.equal(plan.deployments, 0); assert.equal(plan.readyForExecution, false);
  const result = spawnSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/promote-worker-patch.ts")], { encoding: "utf8" });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).awsCalls, 0); assert.equal(result.stdout.includes("PRIVATE_SENTINEL"), false);
});
test("generic push, credential output, deploy and extra CLI arguments are rejected", () => {
  for (const args of [["--push"], ["--output-password"], ["--deploy"], ["--execute-one-private-push", "--all-tags"]]) {
    assert.throws(() => privatePatchPromotionPlan(args));
  }
});
test("promotion acceptance is limited to this exact dated proof and less than one hour", () => {
  requireRecentPatchAcceptance(NOW);
  for (const now of [Date.parse(PATCH.acceptanceTime) - 1, Date.parse(PATCH.acceptanceTime) + 3600_000, Date.parse("2026-10-05T06:42:00Z"), NaN, 1.5]) {
    assert.throws(() => requireRecentPatchAcceptance(now));
  }
  assert.equal(Object.isFrozen(PATCH), true);
});
test("only one owned Tokyo registry token with a bounded valid lifetime is decoded in private memory", () => {
  assert.equal(registryPassword(auth(), ACCOUNT, NOW), "PRIVATE_SENTINEL_PASSWORD_NOT_REAL");
  for (const mutate of [(input: any) => { input.authorizationData.push(clone(input.authorizationData[0])); },
    (input: any) => { input.authorizationData[0].proxyEndpoint = "https://foreign.invalid"; },
    (input: any) => { input.authorizationData[0].proxyEndpoint = input.authorizationData[0].proxyEndpoint.replace("ap-northeast-1", "us-east-1"); },
    (input: any) => { input.authorizationData[0].expiresAt = new Date(NOW).toISOString(); },
    (input: any) => { input.authorizationData[0].expiresAt = new Date(NOW + 13 * 3600_000).toISOString(); }]) {
    const input = auth(); mutate(input); assert.throws(() => registryPassword(input, ACCOUNT, NOW));
  }
  assert.throws(() => registryPassword(auth(), "000000000000", NOW));
  assert.throws(() => registryPassword(auth(), ACCOUNT, NaN));
});
test("noncanonical base64, wrong username, whitespace, control bytes and oversized tokens cannot enter Docker stdin", () => {
  for (const text of ["user:PRIVATE_SENTINEL_PASSWORD", "AWS:password\nPRIVATE_SENTINEL", "AWS:password\0PRIVATE_SENTINEL", "AWS:x", `AWS:${"a".repeat(8192)}`]) {
    const input = auth(); input.authorizationData[0]!.authorizationToken = Buffer.from(text).toString("base64");
    assert.throws(() => registryPassword(input, ACCOUNT, NOW));
  }
  const next = auth(); next.authorizationData[0]!.authorizationToken += "?"; assert.throws(() => registryPassword(next, ACCOUNT, NOW));
});
test("ECR postcheck binds the exact dated digest, repository, tag, media type and bounded bytes", () => {
  assert.equal(verifyPromotedImageDetail(image(), ACCOUNT), 55_000_000);
  for (const mutate of [(input: any) => { input.imageDetails[0].registryId = "999999999999"; },
    (input: any) => { input.imageDetails[0].repositoryName = "foreign"; }, (input: any) => { input.imageDetails[0].imageDigest = `sha256:${"a".repeat(64)}`; },
    (input: any) => { input.imageDetails[0].imageTags = ["latest"]; }, (input: any) => { input.imageDetails[0].imageManifestMediaType = "application/vnd.oci.image.index.v1+json"; },
    (input: any) => { input.imageDetails[0].imageSizeInBytes = 256 * 1024 * 1024 + 1; }, (input: any) => { input.imageDetails.push(clone(input.imageDetails[0])); },
    (input: any) => { input.nextToken = "PRIVATE_SENTINEL"; }]) {
    const input = image(); mutate(input); assert.throws(() => verifyPromotedImageDetail(input, ACCOUNT));
  }
});
test("Windows ACL probe initializes native modules without inherited foreign module paths or credentials", () => {
  const source = { pSmOdUlEpAtH: "PRIVATE_SENTINEL", AWS_SESSION_TOKEN: "PRIVATE_SENTINEL", DOCKER_CONFIG: "PRIVATE_SENTINEL" };
  const env = privateAclChildEnvironment(source, "owned-config");
  assert.equal(Object.keys(env).some(key => key.toUpperCase() === "PSMODULEPATH"), false);
  assert.equal(env.GMAI_OWNED_DOCKER_CONFIG, "owned-config"); assert.equal(env.DOCKER_CONFIG, "owned-config");
  assert.equal(JSON.stringify(env).includes("PRIVATE_SENTINEL"), false); assert.equal(source.pSmOdUlEpAtH, "PRIVATE_SENTINEL");
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { phase11CredentialFreeSynthEnvironment, readPhase11AssemblyJson } from "../phase11-drill-preflight.js";

test("credential-free synthesis does not inherit unknown application, compiler, Python or transport settings", () => {
  const source = {Path: "synthetic-path", UNRECOGNIZED_VENDOR_AUTH: "PRIVATE_SENTINEL", ESBUILD_BINARY_PATH: "PRIVATE_SENTINEL",
    HTTPS_PROXY: "PRIVATE_SENTINEL", PYTHONPATH: "PRIVATE_SENTINEL", NODE_EXTRA_CA_CERTS: "PRIVATE_SENTINEL", NODE_TLS_REJECT_UNAUTHORIZED: "0"};
  const output = phase11CredentialFreeSynthEnvironment(source);
  assert.equal(Object.values(output).includes("PRIVATE_SENTINEL"), false);
  assert.equal(output.NODE_TLS_REJECT_UNAUTHORIZED, "1");
  assert.equal(source.NODE_TLS_REJECT_UNAUTHORIZED, "0");
});

test("credential-free synth drops alternate credentials, endpoints, authorization flags and script injection", () => {
  const source = { Path: "synthetic-path", TEMP: "synthetic-temp", AWS_ACCESS_KEY_ID: "sentinel", aws_security_token: "sentinel",
    Aws_Endpoint_Url_Dynamodb: "sentinel", AWS_DATA_PATH: "sentinel", AWS_CONTAINER_AUTHORIZATION_TOKEN: "sentinel",
    AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: "sentinel", AWS_CONFIG_FILE: "sentinel", AWS_ROLE_ARN: "sentinel",
    Gmai_Config: "sentinel", GMAI_ENABLE_INTERNAL_JOBS: "true", CDK_DEFAULT_ACCOUNT: "sentinel", CDK_OUTDIR: "sentinel",
    TWELVE_DATA_API_KEY: "sentinel", Github_Token: "sentinel", NODE_OPTIONS: "sentinel", node_path: "sentinel" };
  const result = phase11CredentialFreeSynthEnvironment(source);
  assert.equal(result.Path, source.Path);
  assert.equal(result.TEMP, source.TEMP);
  assert.equal(Object.values(result).includes("sentinel"), false);
  assert.equal(result.GMAI_ENABLE_INTERNAL_JOBS, undefined);
  assert.equal(result.AWS_EC2_METADATA_DISABLED, "true");
  assert.equal(result.AWS_MAX_ATTEMPTS, "1");
  assert.equal(result.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS, "true");
  assert.equal(source.GMAI_ENABLE_INTERNAL_JOBS, "true");
});

test("a clean input receives only local no-network guard defaults, not fake login credentials", () => {
  const result = phase11CredentialFreeSynthEnvironment({});
  assert.deepEqual(Object.keys(result).sort(), ["AWS_CLI_AUTO_PROMPT", "AWS_EC2_METADATA_DISABLED", "AWS_IGNORE_CONFIGURED_ENDPOINT_URLS", "AWS_MAX_ATTEMPTS", "AWS_PAGER", "NODE_DISABLE_COMPILE_CACHE", "NODE_TLS_REJECT_UNAUTHORIZED"]);
  assert.equal(result.NODE_DISABLE_COMPILE_CACHE, "1");
  assert.equal(result.NODE_TLS_REJECT_UNAUTHORIZED, "1");
  assert.equal(result.AWS_PROFILE, undefined);
  assert.equal(result.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(result.CDK_DEFAULT_ACCOUNT, undefined);
});

test("assembly manifests and templates share the same regular-file and byte boundary", t => {
  const root = mkdtempSync(join(tmpdir(), "gmai-assembly-read-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "manifest.json"), '{"artifacts":{}}');
  assert.deepEqual(readPhase11AssemblyJson(root, "manifest.json"), { artifacts: {} });
  writeFileSync(join(root, "large.json"), " ".repeat(2_000_001));
  assert.throws(() => readPhase11AssemblyJson(root, "large.json"), /bounded regular file/);
  assert.throws(() => readPhase11AssemblyJson(root, root), /relative/);
});

test("assembly paths cannot inspect a sibling outside the intended output directory", t => {
  const root = mkdtempSync(join(tmpdir(), "gmai-assembly-scope-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, "output");
  mkdirSync(output);
  writeFileSync(join(root, "private.json"), '{"synthetic":true}');
  assert.throws(() => readPhase11AssemblyJson(output, "../private.json"), /escaped/);
});

test("a redirected assembly parent directory is rejected before JSON content is read", t => {
  const root = mkdtempSync(join(tmpdir(), "gmai-assembly-links-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, "output");
  const outside = join(root, "outside");
  mkdirSync(output); mkdirSync(outside);
  writeFileSync(join(outside, "manifest.json"), '{"synthetic":true}');
  try { symlinkSync(outside, join(output, "linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return t.skip("Directory links require OS permission."); throw error; }
  assert.throws(() => readPhase11AssemblyJson(output, "linked/manifest.json"), /escaped/);
});

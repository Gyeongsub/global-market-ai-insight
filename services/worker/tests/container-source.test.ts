import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("services/worker/Dockerfile", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith("#"));

test("worker image pins both stages and keeps the runtime minimal and non-root", () => {
  const fromLines = dockerfile.match(/^FROM .+$/gm) ?? [];
  assert.equal(fromLines.length, 2);
  for (const line of fromLines) assert.match(line, /@sha256:[a-f0-9]{64}(?: AS \w+)?$/);
  assert.match(fromLines[1]!, /^FROM gcr\.io\/distroless\/nodejs22-debian13:nonroot@/);
  assert.ok(fromLines[1]!.includes("@sha256:eed5cbf9fcdb7f97de1fb39adde1972efa57df1085c0c76a5ea17c7c27ff8f6c"),
    "The runtime must retain the reviewed Node/CA 2026-10-22 security refresh, not a superseded base.");
  assert.match(fromLines[0]!,/^FROM node:22\.23\.4-bookworm-slim@sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09 AS build$/);
  assert.match(dockerfile, /^USER 65532:65532$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\/nodejs\/bin\/node", "main\.mjs"\]$/m);
  assert.doesNotMatch(dockerfile, /^ARG\s+/m);
  assert.deepEqual(dockerfile.match(/^ENV .+$/gm), ["ENV NODE_ENV=production"]);
});

test("runtime stage copies only the freshly built worker bundle", () => {
  const runtime = dockerfile.slice(dockerfile.lastIndexOf("FROM "));
  assert.match(runtime, /COPY --from=build --chown=65532:65532 \/workspace\/services\/worker\/bundle \.\//);
  assert.equal((runtime.match(/^COPY /gm) ?? []).length, 1);
  assert.doesNotMatch(runtime, /COPY\s+\.|package\.json|pnpm|services\/controller|shared\//i);
  assert.match(dockerfile, /pnpm install --frozen-lockfile --ignore-scripts/);
});

test("Docker build context excludes credentials, generated output and local evidence", () => {
  const required = [
    ".git",
    ".env*",
    "node_modules",
    "frontend/node_modules",
    "frontend/dist",
    "services/**/bundle",
    "services/**/dist",
    "cdk.out",
    ".terraform",
    "*.tfstate",
    "*.tfstate.*",
    "outputs",
    "work",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "cdk.context.json",
    "docs",
  ];
  for (const entry of required) assert.ok(dockerignore.includes(entry), `missing .dockerignore entry: ${entry}`);
  assert.equal(new Set(dockerignore).size, dockerignore.length);
});

test("private state, registry credentials and certificates stay excluded at any context depth without negation overrides", () => {
  const nestedPrivatePatterns = ["**/.git", "**/.aws", "**/.codex", "**/.agents", "**/.tmp", "**/.terraform",
    "**/.env*", "**/.npmrc", "**/.yarnrc.yml", "**/.netrc", "**/node_modules", "**/.pnpm-store",
    "**/cdk.context.json", "**/*.tfstate", "**/*.tfstate.*", "**/*.pem", "**/*.key", "**/*.p12", "**/*.pfx",
    "**/*.crt", "**/*.cer", "**/*.der", "**/*.log"];
  const workerIgnore = readFileSync("services/worker/.dockerignore", "utf8").split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
  for (const patterns of [dockerignore, workerIgnore]) {
    for (const pattern of nestedPrivatePatterns) assert.ok(patterns.includes(pattern), "Nested private-context exclusion is missing.");
    assert.equal(patterns.some(pattern => pattern.startsWith("!")), false, "A later negation can silently re-include private state.");
    assert.equal(new Set(patterns).size, patterns.length);
  }
});

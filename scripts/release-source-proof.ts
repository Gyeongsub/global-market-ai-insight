import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

type Service = "controller" | "worker";
function fail(): never { throw new Error("RELEASE_SOURCE_UNVERIFIED"); }
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** A generated bundle alone cannot establish that today's source built it. */
export function validateReleaseSourceProof(value: unknown, service: Service, expected: Buffer) {
  if (!["controller", "worker"].includes(service) || !Buffer.isBuffer(expected) || expected.length < 1 || expected.length > 5_000_000) fail();
  const report = value as Record<string, unknown> | null;
  if (!report || report.mode !== "local-backend-emitted-module-proof" || report.awsCalls !== 0 || report.externalNetworkCalls !== 0 ||
      report.filesWritten !== 0 || report.currentLockMatched !== true || typeof report.lockfileSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(report.lockfileSha256) || report.readyForPublication !== false || !Array.isArray(report.reports) || report.reports.length !== 4) fail();
  const names = new Set<string>();
  let matched = false;
  for (const item of report.reports as Record<string, unknown>[]) {
    if (!item || typeof item.service !== "string" || !["controller", "worker", "sweeper", "alarm-circuit"].includes(item.service) || names.has(item.service) ||
        item.inMemoryRebuildMatchedWrittenArtifact !== true || item.inMemoryRebuilds !== 2 || item.inputsBracketedFinalRebuild !== true || item.inputBytesRechecked !== true) fail();
    names.add(item.service);
    if (item.service === service) {
      if (item.artifactBytes !== expected.length || item.artifactSha256 !== digest(expected)) fail();
      matched = true;
    }
  }
  if (!matched) fail();
  return { currentSourceRebuildVerified: true, service, artifactSha256: digest(expected), lockfileSha256: report.lockfileSha256 } as const;
}

/** Fixed local verifier only: no app code, network, credentials, build output writes or caller-selected executable. */
export function verifyReleaseSource(service: Service, expected: Buffer) {
  if (!["controller", "worker"].includes(service) || !Buffer.isBuffer(expected) || expected.length < 1 || expected.length > 5_000_000) fail();
  const env: NodeJS.ProcessEnv = { NODE_DISABLE_COMPILE_CACHE: "1" };
  for (const key of ["SystemRoot", "WINDIR", "SystemDrive", "TEMP", "TMP"]) if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(process.execPath, [resolve("scripts/backend-module-proof.mjs")], {
    cwd: process.cwd(), env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 100_000,
  });
  if (result.status !== 0 || result.signal !== null || result.error) fail();
  try { return validateReleaseSourceProof(JSON.parse(result.stdout), service, expected); } catch { return fail(); }
}

import { closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { validateJobRequest, type JobRequest } from "../../../frontend/src/api/jobs.js";
import { ownerAdmissionAllowed, type OwnerAdmissionWindow } from "../../controller/src/owner-admission-window.js";
import { createOwnerJobSession, type OwnerJobTransport } from "./job-session.js";

export interface OwnerRecoveryRecord {
  readonly kind: "owner-job-dispatch-intent";
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly request: Readonly<JobRequest>;
  readonly preparedAt: string;
  readonly admissionWindow: Readonly<OwnerAdmissionWindow>;
  readonly dispatchMayOccur: true;
  readonly reconciliationRequired: true;
}
function fail(): never { throw Error("OWNER_RECOVERY_RECORD_UNAVAILABLE"); }
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
function jobId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^job_[a-f0-9]{48}$/.test(value)) fail();
}

export function validateOwnerRecoveryRecord(input: unknown): Readonly<OwnerRecoveryRecord> {
  try {
    if (!exact(input, ["kind", "schemaVersion", "jobId", "request", "preparedAt", "admissionWindow", "dispatchMayOccur", "reconciliationRequired"]) ||
        input.kind !== "owner-job-dispatch-intent" || input.schemaVersion !== 1 || input.dispatchMayOccur !== true || input.reconciliationRequired !== true) fail();
    jobId(input.jobId);
    if (!exact(input.request, ["operation", "symbol", "locale"])) fail();
    validateJobRequest(input.request as unknown as JobRequest);
    if (typeof input.preparedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.preparedAt)) fail();
    const at = Date.parse(input.preparedAt);
    if (!Number.isSafeInteger(at) || new Date(at).toISOString() !== input.preparedAt ||
        !exact(input.admissionWindow, ["startsAtMs", "expiresAtMs"]) || !ownerAdmissionAllowed(input.admissionWindow as unknown as OwnerAdmissionWindow, at)) fail();
    return Object.freeze({ kind: "owner-job-dispatch-intent", schemaVersion: 1, jobId: input.jobId,
      request: Object.freeze({ ...(input.request as unknown as JobRequest) }), preparedAt: input.preparedAt,
      admissionWindow: Object.freeze({ ...(input.admissionWindow as unknown as OwnerAdmissionWindow) }),
      dispatchMayOccur: true, reconciliationRequired: true });
  } catch { return fail(); }
}
const serialize = (input: unknown) => JSON.stringify(validateOwnerRecoveryRecord(input)) + "\n";

function ordinaryPath(path: string, directory: boolean) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || realpathSync(path) !== path || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) fail();
  return stat;
}
function recordDirectory(root: string, create: boolean) {
  if (!isAbsolute(root) || root.includes("\0") || resolve(root) !== root) fail();
  ordinaryPath(root, true);
  const ignore = join(root, ".gitignore");
  if (ordinaryPath(ignore, false).size > 65536 || !/^outputs\/$/m.test(readFileSync(ignore, "utf8"))) fail();
  let current = root;
  for (const name of ["outputs", "owner-recovery"]) {
    current = join(current, name);
    if (!existsSync(current) && create) mkdirSync(current, { mode: 0o700 });
    ordinaryPath(current, true);
  }
  return current;
}

/** Trusted-owner filesystem, not protection against a hostile local OS account.
 * No credential, raw idempotency key, ARN, provider data or result is written.
 * Exclusive creation + sync + bounded readback precede dispatch. A partial write
 * is retained as failed evidence, never silently repaired or counted as safe. */
export function writeOwnerRecoveryRecord(root: string, input: unknown): void {
  let fd: number | undefined;
  try {
    const value = validateOwnerRecoveryRecord(input), text = serialize(value), directory = recordDirectory(root, true);
    if (Buffer.byteLength(text) > 4096) fail();
    const path = join(directory, `${value.jobId}.json`);
    fd = openSync(path, "wx+", 0o600);
    writeFileSync(fd, text, "utf8"); fsyncSync(fd);
    const stat = fstatSync(fd), persisted = ordinaryPath(path, false);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== Buffer.byteLength(text) || stat.dev !== persisted.dev || stat.ino !== persisted.ino ||
        recordDirectory(root, false) !== directory) fail();
    const bytes = Buffer.alloc(stat.size);
    if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length || bytes.toString("utf8") !== text) fail();
  } catch { fail(); }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch { fail(); } } }
}

/** Returns a recovery target only, never a resume command, job existence proof,
 * final task state, spend guarantee or permission to create a replacement job. */
export function readOwnerRecoveryRecord(root: string, expectedJobId: string): Readonly<OwnerRecoveryRecord> {
  let fd: number | undefined;
  try {
    jobId(expectedJobId);
    const directory = recordDirectory(root, false), path = join(directory, `${expectedJobId}.json`), before = ordinaryPath(path, false);
    if (before.size < 1 || before.size > 4096) fail();
    fd = openSync(path, "r"); const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size !== before.size || opened.dev !== before.dev || opened.ino !== before.ino) fail();
    const bytes = Buffer.alloc(opened.size);
    if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) fail();
    const text = bytes.toString("utf8"), value = validateOwnerRecoveryRecord(JSON.parse(text));
    const after = ordinaryPath(path, false);
    if (value.jobId !== expectedJobId || serialize(value) !== text || after.size !== before.size || after.dev !== before.dev || after.ino !== before.ino ||
        recordDirectory(root, false) !== directory) fail();
    return value;
  } catch { return fail(); }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch { fail(); } } }
}

/** Local candidate, deliberately unwired to the observation server or any CLI.
 * Caller must still prove live cloud safety and data entitlement. Recording an
 * intent does not establish either. Files are never automatically overwritten. */
export function createRecordedOwnerJobSession(root: string, transport: OwnerJobTransport, input: JobRequest,
  window: OwnerAdmissionWindow, clocks: { wall?: () => number; elapsed?: () => number } = {}) {
  const wall = clocks.wall ?? Date.now, at = wall();
  if (!ownerAdmissionAllowed(window, at)) fail();
  const session = createOwnerJobSession(transport, input, window, clocks);
  let record: Readonly<OwnerRecoveryRecord>;
  try {
    record = validateOwnerRecoveryRecord({ kind: "owner-job-dispatch-intent", schemaVersion: 1, jobId: session.expectedJobId,
      request: input, preparedAt: new Date(at).toISOString(), admissionWindow: window, dispatchMayOccur: true, reconciliationRequired: true });
    writeOwnerRecoveryRecord(root, record);
  } catch { session.close(); return fail(); }
  return {
    ...session,
    start: async () => {
      try {
        if (serialize(readOwnerRecoveryRecord(root, session.expectedJobId)) !== serialize(record)) fail();
        return await session.start();
      } catch { session.close(); return fail(); }
    },
  };
}

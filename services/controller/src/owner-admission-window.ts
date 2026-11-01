/** Fixed UTC admission window, not a timer renewed by requests or cold starts.
 * Independent of the owner's browser/PC. This does not stop an existing task,
 * revoke credentials, prove data rights or replace the persisted circuit. */
export const OWNER_ADMISSION_MAX_MS = 300_000;
export const OWNER_ADMISSION_DISPATCH_RESERVE_MS = 15_000;
export interface OwnerAdmissionWindow {
  readonly startsAtMs: number;
  readonly expiresAtMs: number;
}
const invalid = () => { throw Error("Owner admission window configuration is invalid."); };

export function parseOwnerAdmissionWindow(start: unknown, end: unknown, configuredOwner: string | null): OwnerAdmissionWindow | null {
  if (start === undefined && end === undefined) return null;
  if (!configuredOwner) return invalid();
  const time = (value: unknown) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return invalid();
    const ms = Date.parse(value);
    if (!Number.isSafeInteger(ms) || new Date(ms).toISOString() !== value) return invalid();
    return ms;
  };
  const startsAtMs = time(start), expiresAtMs = time(end);
  const duration = expiresAtMs - startsAtMs;
  if (duration <= OWNER_ADMISSION_DISPATCH_RESERVE_MS || duration > OWNER_ADMISSION_MAX_MS) return invalid();
  return Object.freeze({ startsAtMs, expiresAtMs });
}

export function ownerAdmissionAllowed(window: OwnerAdmissionWindow | null | undefined, nowMs: number): boolean {
  if (!window || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(window.startsAtMs) || !Number.isSafeInteger(window.expiresAtMs)) return false;
  const duration = window.expiresAtMs - window.startsAtMs;
  return duration > OWNER_ADMISSION_DISPATCH_RESERVE_MS && duration <= OWNER_ADMISSION_MAX_MS &&
    nowMs >= window.startsAtMs && nowMs < window.expiresAtMs - OWNER_ADMISSION_DISPATCH_RESERVE_MS;
}

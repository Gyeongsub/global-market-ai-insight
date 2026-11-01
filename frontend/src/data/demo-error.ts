/** Display-only allowlist. Never take wording, URLs or retry instructions from
 * an API error. Unknown input is a request failure, not missing market data. */
const extraErrors = {
  ACCESS_DENIED: "accessDenied",
  VALIDATION_ERROR: "invalidRequest", UNSUPPORTED_SYMBOL: "invalidRequest", UNSUPPORTED_LOCALE: "invalidRequest",
  IDEMPOTENCY_CONFLICT: "conflict", RATE_LIMITED: "limited", JOB_NOT_FOUND: "missing",
  PROVIDER_ERROR: "provider", MODEL_ERROR: "model", TASK_LAUNCH_FAILED: "launch", INTERNAL_ERROR: "internal",
  INVALID_RESPONSE: "invalidResponse", REQUEST_FAILED: "requestFailed",
} as const;
export type DemoError = keyof typeof extraErrors | "DATA_UNAVAILABLE" | "TIMED_OUT" | "CIRCUIT_OPEN";
type Message = { title: string; body: string };
export interface DemoErrorText {
  circuitTitle: string; circuitBody: string; timeoutTitle: string; timeoutBody: string;
  unavailableTitle: string; dataUnavailableBody: string; recoveryHint: string; requestFailureRecovery: string;
  requestErrors: Record<(typeof extraErrors)[keyof typeof extraErrors], Message>;
}
export function demoErrorCode(value: unknown): DemoError {
  return value === "DATA_UNAVAILABLE" || value === "TIMED_OUT" || value === "CIRCUIT_OPEN" ? value :
    typeof value === "string" && Object.hasOwn(extraErrors, value) ? value as keyof typeof extraErrors : "REQUEST_FAILED";
}
export function demoErrorPresentation(value: unknown, text: DemoErrorText): Message & { code: DemoError; recovery: string } {
  const code = demoErrorCode(value);
  if (code === "CIRCUIT_OPEN") return { code, title: text.circuitTitle, body: text.circuitBody, recovery: text.recoveryHint };
  if (code === "TIMED_OUT") return { code, title: text.timeoutTitle, body: text.timeoutBody, recovery: text.recoveryHint };
  if (code === "DATA_UNAVAILABLE") return { code, title: text.unavailableTitle, body: text.dataUnavailableBody, recovery: text.recoveryHint };
  return { code, ...text.requestErrors[extraErrors[code]], recovery: text.requestFailureRecovery };
}

import { parseUnambiguousJson } from "../../../shared/schemas/strict-json.js";

const cases = {
  "parameter-canary": { action: "ssm:GetParameter", statuses: [400, 403], sessionOnly: false },
  "cluster-read": { action: "ecs:DescribeClusters", statuses: [400, 403], sessionOnly: false },
  "wrong-model": { action: "bedrock:InvokeModel", statuses: [403], sessionOnly: false },
  "wrong-region": { action: "bedrock:InvokeModel", statuses: [403], sessionOnly: false },
  "expired-window": { action: "bedrock:InvokeModel", statuses: [403], sessionOnly: true },
  "run-task": { action: "ecs:RunTask", statuses: [400, 403], sessionOnly: false },
} as const;
export type SyntheticDenialCase = keyof typeof cases;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** restJson1 permits legacy colon suffixes and namespace# prefixes. Only the
 * normalized exact denial code is used; suffix prose is never persisted.
 * Conflicting code carriers, control bytes and oversized values still fail. */
function accessDeniedCode(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[\x00-\x20\x7f]/.test(value)) return false;
  const shape = value.split(":", 1)[0]!;
  return /^(?:[A-Za-z0-9_.]+#)?AccessDeniedException$/.test(shape);
}

/** Pure parser candidate, NOT live authorization evidence. A future bounded
 * transport must bind the exact request, restricted principal, HTTPS origin and
 * timing independently. Never pass generic failed requests off as IAM denial.
 * No network/credentials/files; raw AWS prose is never returned or thrown. */
export function reviewSyntheticDenialResponse(caseName: SyntheticDenialCase, response: unknown) {
  const reject = (reason: "ENVELOPE" | "STATUS_OR_BODY" | "JSON" | "ERROR_CODE" | "MESSAGE" | "ACTION" | "POLICY_LAYER") =>
    ({ accepted: false as const, code: "DENIAL_EVIDENCE_UNVERIFIED" as const, reason,
      liveAuthorizationVerified: false, rawDetailsSuppressed: true });
  try {
    if (!Object.hasOwn(cases, caseName) || !object(response)) return reject("ENVELOPE");
    const expected = cases[caseName];
    if (typeof response.status !== "number" || !(expected.statuses as readonly number[]).includes(response.status) ||
        typeof response.body !== "string") return reject("STATUS_OR_BODY");
    const body = parseUnambiguousJson(response.body, 16384);
    if (!object(body)) return reject("JSON");
    const codes = [body.__type, body.code, body.Code, response.errorType].filter(v => v !== undefined);
    // If multiple code carriers are present, every one must agree. No substring
    // acceptance of ValidationException/ExpiredToken/signature errors.
    if (!codes.length || codes.some(v => !accessDeniedCode(v))) return reject("ERROR_CODE");
    const messages = [body.message, body.Message].filter(v => v !== undefined);
    if (messages.length !== 1 || typeof messages[0] !== "string" || /[\r\n\x00]/.test(messages[0])) return reject("MESSAGE");
    const message = messages[0];
    const action = expected.action.replace(":", "\\:");
    if (!new RegExp(`(?:^|[^A-Za-z0-9_:])${action}(?:$|[^A-Za-z0-9_:])`).test(message)) return reject("ACTION");
    const session = /\bwith an explicit deny in a session policy\b/.test(message);
    const identity = /\bwith an explicit deny in an identity-based policy\b/.test(message);
    if (!(session || identity) || expected.sessionOnly && !session) return reject("POLICY_LAYER");
    return { accepted: true as const, caseName, action: expected.action,
      policyLayer: session ? "session" as const : "identity" as const,
      liveAuthorizationVerified: false, rawDetailsSuppressed: true };
  } catch { return reject("JSON"); }
}

export function syntheticDenialEvidencePlan() {
  return { mode: "local-candidate", networkCalls: 0, credentialAccess: false,
    cases: Object.keys(cases), runTaskDenialVerified: false, secretReadPerformed: false,
    foreignPrincipalVerified: false, serverSideExpiryVerified: false,
    liveTransportImplemented: false, liveAuthorizationVerified: false };
}

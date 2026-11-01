import { quotedInspectionVariants } from "./quoted-inspection.mjs";

// Shared source/publication/distribution heuristics. These are not exhaustive
// secret detection, legal review, proof of provenance or publication permission.
export const credentialDetectors = Object.freeze([
  { name: "AWS access key ID", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "non-empty AWS secret assignment", pattern: /\bAWS_SECRET_ACCESS_KEY[ \t]*=[ \t]*[^\s#]{16,}/ },
  { name: "non-empty AWS session assignment", pattern: /\bAWS_SESSION_TOKEN["']?[ \t]*[:=][ \t]*["']?[A-Za-z0-9/+=]{40,}/ },
  { name: "non-empty provider key assignment", pattern: /\bTWELVE_DATA_API_KEY[ \t]*=[ \t]*[^\s#]{8,}/ },
  { name: "non-empty GitHub token assignment", pattern: /\bGITHUB_TOKEN[ \t]*=[ \t]*[^\s#]{16,}/ },
  { name: "non-empty JSON credential field", pattern: /["'](?:secretAccessKey|sessionToken|accessToken|refreshToken|apiKey|aws_secret_access_key|aws_session_token|twelve_data_api_key)["'][ \t]*:[ \t]*["'][A-Za-z0-9/+=._-]{24,}["']/i },
]);

/** Detector labels only: never matched values, text excerpts or offsets. */
export function credentialFindingNames(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 5_000_000) throw new Error("CREDENTIAL_SCAN_INPUT_INVALID");
  const variants = quotedInspectionVariants(text);
  return credentialDetectors.filter(detector => variants.some(value => detector.pattern.test(value))).map(detector => detector.name);
}

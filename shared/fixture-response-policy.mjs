// Fixture-only policy, not live API authorization. React's chart bars need
// style attributes, but inline/eval scripts and all API connections stay denied.
export const FIXTURE_CSP="default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const FIXTURE_PERMISSIONS_POLICY="camera=(), microphone=(), geolocation=()";

// The local preview shares these security decisions with the hosting template.
// HSTS, TLS, origin access, cache semantics and remote delivery are NOT proved
// by an HTTP loopback preview and must remain separate deployment gates.
export const FIXTURE_PREVIEW_HEADERS=Object.freeze({
  "Content-Security-Policy":FIXTURE_CSP,
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Permissions-Policy":FIXTURE_PERMISSIONS_POLICY,
});

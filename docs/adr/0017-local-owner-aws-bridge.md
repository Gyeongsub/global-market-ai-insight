# ADR 0017 — Trusted-owner loopback UI with real AWS

Date: 2026-10-25. Status: accepted architecture; read-only connection checkpoint verified;
full PRICE/ANALYZE implementation and live acceptance pending.

## Decision and scope

The user explicitly approved real AWS private practice without a domain purchase.
Keep the deployed event-driven API/Lambda/DynamoDB/Fargate/Bedrock architecture.
Serve the owner UI from a five-minute local process bound only to `127.0.0.1`.
That process signs allowed AWS HTTPS requests; the browser receives no AWS or
provider credentials. No new hosted service, domain, certificate, Cognito user
pool, public website, scheduled job, or GitHub upload is part of this decision.

CloudFront/private-S3 hosting and ADR 0016's hosted session candidate are deferred,
not removed or claimed deployed. The initial milestone is a **read-only status
observation**, not the complete PRICE/ANALYZE product. Full completion still needs
bounded job submission/polling, multilingual results, negative access tests,
operational acceptance and a safe-stop demonstration.

The [first read-only browser evidence](../evidence/LOCAL_OWNER_OBSERVATION_2026-10-25.md)
does not approve job execution or provider-data display. A cloud-enforced admission
window is the next local-only cost-control candidate; it does not replace the
existing circuit, worker deadline or post-run closure check. See the local-only
[admission window candidate](0018-owner-admission-window.md) for its exact limits.
The [single-use job session](../LOCAL_OWNER_JOB_SESSION.md) is separately tested
local preparation and is not connected to the live observation server.

## Trust and security boundary

- The owner controls and trusts the OS and browser. Another hostile local process
  or OS user is outside this isolation boundary; loopback is not a user identity.
- Use exactly IPv4 loopback, strict Host, same-origin checks, Fetch Metadata,
  no CORS, no redirects, no arbitrary file paths or upstream URLs.
- Browser mutations/reads through the bridge require a random session capability,
  retained only in page/process memory. No capability in URLs, logs, files,
  localStorage or cookies. This limits remote-web CSRF, not compromised local OS.
- Serve fixed audited assets, restrictive CSP, no embedding, no referrer, no cache.
- A cross-site top-level browser navigation receives only a denied, data/token-free
  landing with an explicit local link. It cannot access the protected bootstrap
  until a same-origin navigation follows. No header or CORS guard is disabled.
- HTTP is allowed only on the same-device loopback. Remote AWS stays HTTPS with
  IAM/SigV4 and the deployed owner guard. Do not relax CloudFront TLS or open API routes.
- No session token, endpoint identifier, account ID, ARN or upstream error prose
  is forwarded to the browser. Fail closed; do not fall back to fixtures on auth failure.
- Temporary AWS login/MFA remains an operator prerequisite. Browser console login
  is not evidence of a valid CLI session. Local process exit is not credential revocation.

## Bounded first milestone

Fresh owner/readiness checks precede any live request. Fetch exactly one catalog
GET and one safe health GET, validate against the fixed catalog and
`{status: "ok", circuit: "OPEN", jobCreationEnabled: false}`, then disconnect the
cloud client from the HTTP server. Display a sanitized, timestamped **snapshot**.
Browser refreshes must not generate cloud calls or imply a new observation.
Do not start the server if preflight or either response fails. No job POST, Fargate,
provider or model call is allowed. The server expires within five minutes and is
closed in `finally` on every controlled exit. Unit tests use injected transports,
and their observations are explicitly marked fixture, never live evidence.

## Cost and verification

No additional hosting/idle resource is introduced. Actual catalog/health GETs
may incur small API/Lambda/DynamoDB charges; AWS preflight reads and existing
storage are not represented as a zero-cost guarantee. Budgets are alerts, not a
hard cap. This design bounds new calls and does not change circuit/jobs/display.

Required evidence: parser/snapshot rejection tests; actual HTTP origin/capability,
duplicate-header and expiry tests; source/type/full local gates; fresh scoped AWS
preflight and two signed GETs; browser UI verification; local process/listener
closure and AWS safe posture. No fake acknowledgement counts as live acceptance.

## References

- [API Gateway IAM authorization](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-access-control-iam.html)
- [Browser same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [Fetch Metadata site classification](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site)
- [Node HTTP server closure](https://nodejs.org/api/http.html#servercloseallconnections)

SOP restricts cross-origin reads but is not authorization by itself. The owner
IAM guard and short-lived local capability serve different trust boundaries.

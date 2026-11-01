# ADR 0016: Bounded private-browser session preparation

Status: **local proposal and partial implementation**, 2026-10-25. Not deployed;
not permission to add a public login route, weaken current IAM, buy a domain,
purchase a subscription or expose market data. The user confirmed no owned
domain and deferred purchase. Hosting remains blocked, not waived.

## Verified foundation

The exact-owner controller is deployed with signed owner GET/anonymous rejection
evidence in [the deployment record](../evidence/PRIVATE_OWNER_DEPLOYMENT_2026-10-25.md).
Its four `/v1` routes remain AWS_IAM. Browser code must never obtain the owner's
AWS credentials. CloudFront OAC alone protects only S3, not viewers.

The disabled FrontendStack now requires a validated public verification key and
adds the same trusted key group to every behavior, including immutable assets.
Only GET/HEAD is allowed. Key pairs in tests are ephemeral; no deployment private
key has been created or saved. This is only a delivery restriction, not an issuer,
identity service, private website or proof of remote rejection.

## Proposed session flow, not wired routes

1. A future explicitly IAM-protected operator route may issue a one-minute,
   256-bit random bootstrap ticket only after the exact owner check. One
   outstanding ticket per owner/origin is the persistence contract. No browser
   input may select the owner. No credentials, ticket or cookie go into logs.
2. An owner-controlled HTTPS bootstrap flow redeems that ticket once. Consuming
   the ticket and creating the session must be atomic. Only digests are stored;
   replay, collision and ambiguous acknowledgment never trigger automatic retry.
3. A five-minute session is carried in a host-only Secure, HttpOnly, SameSite=Strict
   cookie, never localStorage or a query string. Expiry is checked at every
   admission, even if database TTL has not removed its record. The local core
   limits each session to 64 admitted reads and each store operation to two seconds.
4. A future API authorizer must validate that session independently, with caching
   disabled and strict owner/origin/route checks. CloudFront cookies alone must
   not authorize a direct API Gateway URL. Existing IAM routes remain unchanged.
   The current session core permits **reads only**, not job POSTs.
5. Logout must revoke the exact session before acknowledging cookie clearing.
   Failure is not reported as successful logout. A stolen bearer remains a risk
   until expiry/revocation; exact owner issuance is not proof of per-request MFA.

The local `OwnerSessionService` has ports only: no SDK, network, file reader,
handler, deployed issuer, browser fallback or production configuration switch.
Atomic mock-store tests prove local state transitions, not DynamoDB behavior.
The prepared DynamoDB adapter requires an injected sender; it cannot create a
client or discover credentials. Command plans use only `auth_ticket_*`,
`auth_owner_*` and `auth_session_*` keys in the existing jobs table. Issuance is
one two-item transaction; redemption consistently reads the ticket and then
atomically deletes the ticket/owner slot and inserts a unique session. Reads
increment a bounded counter conditionally. There is no retry after an ambiguous
write, and `expiresAt` is compatible with the existing table TTL attribute.

The local REQUEST/v2 authorizer candidate accepts only the exact configured
gateway/account/stage and three read routes. It rejects mixed cookie/header
authentication, cross-site metadata, query/body credentials and route ambiguity
before storage. Composed tests cover the actual core, plans, injected adapter and
authorizer together with scripted SDK acknowledgements. They are not a DynamoDB
emulator, remote authorizer/cookie acceptance, a deployed route, or a cache-policy
test. No current controller entrypoint imports this candidate.

The subsequent local HTTP factory prepares only POST redemption/logout, not an
issuer or job endpoint. It uses the same fixed gateway boundary, bounded
duplicate-key-rejecting JSON parsing and same-origin checks. Success carries the
session only in the API-v2 `cookies` response; JSON contains no bearer. Responses
are `no-store`, with no CORS grant or raw failure detail. Logout clears only after
the store acknowledges revocation. The composed fixture flow now exercises this
HTTP factory too; no listener, real browser cookie store or remote route is used.

An earlier source checkpoint passed the 90-step current-installation gate with
1,510 tests (1,509 pass, one existing privilege skip), receipt
`284f0a03-d31a-472e-8f84-e2ab97613b89`, completed `2026-10-25T07:36:52.382Z`.
Its source digest was `7f36f31a77cc986386d4bf3870e7e5e38cc01397982f6964455cc890a3177838`.
That gate had zero AWS/external calls and 33 loopback requests, with servers closed.
It predates the HTTP factory/shared request-parser additions and must not be used
as their full-source proof. Subsequent focused and full results are separate.
The HTTP/shared-parser follow-up passes all 36 private-access tests and the
services TypeScript check. These use memory/scripted SDK responses only, with
no AWS credentials, network, live table or real browser cookie storage. The
current-source full-gate output is retained under ignored `outputs/local-gates/`;
require `completed`, `passed`, `sourceUnchanged` and matching current fingerprint
instead of relying on this earlier test-count paragraph for a deployment gate.

Logout denies subsequent admissions; it cannot retract a response admitted before
revocation. A separate CloudFront signed cookie, if implemented, is an independent
bearer whose cached/static access can persist until its policy expiry. Do not
claim a future session-row deletion instantly revokes CloudFront access. Both
lifetimes, browser clearing and key-level emergency revocation require explicit
review and separate evidence before deployment.
Cookie signing/issuance, secure bootstrap delivery, CSRF defenses at a real edge,
key custody/rotation, direct-origin denial and remote logout still need proof.
Do not create a globally readable bootstrap page or custom authentication system
by inference from this document. Review its exact scope and abuse cost first.

## TLS and cost hold

AWS still documents that the default CloudFront certificate forces its TLSv1
security policy. Merely setting a newer minimum in a template does not fix it.
The user chose **no domain purchase**. No authenticated hosted deployment is
performed while that TLS decision is unresolved. A future owned-domain/SNI/ACM
option needs actual domain control and a fresh cost/resource review. No dedicated
IP SSL, WAF, Cognito, DNS subscription, ALB, NAT or persistent service is added.

Session storage/authorizer and edge requests would add usage costs if deployed;
no free-use guarantee is inferred. Current implementation is local only. Existing
job/circuit/time/token controls must remain independent of session authorization.
The 64-read allowance is per session, not a global spending cap. Rejected/expired
requests, conditional write failures and repeated issuance may still incur costs.
No public authentication endpoint, new IAM grant or AWS table operation was made
for this local candidate. Deployment must first bound issuance, unauthenticated
abuse, API throughput and function concurrency without assuming TTL or a monthly
Budget stops charges.

Existing controller/worker template grants continue to restrict DynamoDB keys to
job/control namespaces; they do not grant `auth_*` access. This local assertion
does not inspect every effective live identity policy. A future narrowly scoped
session role would require separate underlying item-action permissions (not an
invented `dynamodb:TransactWriteItems` IAM action), verified isolation from all
workload/maintenance roles, and negative acceptance. Do not widen an existing
worker/controller role merely to make session tests pass.

## Sources checked 2026-10-25

- [CloudFront trusted key groups](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-trusted-signers.html)
- [Signed cookies and unsigned OPTIONS caveat](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html)
- [ViewerCertificate minimum policy limitation](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_ViewerCertificate.html)
- [HTTP API Lambda authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html)
- [Cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [DynamoDB TTL is eventual cleanup](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [DynamoDB atomic transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)

These describe service mechanisms. They do not approve the candidate architecture
or replace live acceptance. [ADR 0015](0015-owner-only-aws-practice.md) remains the
accepted product target; GitHub/publication and provider entitlement stay gated.

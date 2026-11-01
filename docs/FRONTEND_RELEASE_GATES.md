# Frontend release gates

## Current audience override — 2026-10-25

**Subsequent approved change:** The first release uses the owner's trusted local
workstation UI/broker with real AWS, without a domain purchase. Hosting/TLS gates
on this page apply only to the deferred CloudFront option. They must not be used
to block the local path or justify weaker remote TLS. The local path still needs
its own origin/capability, credential isolation, bounded calls, full product and
safe-stop acceptance. [ADR 0017](adr/0017-local-owner-aws-bridge.md).

The user authorizes real AWS for owner-only private practice, not an anonymous
service. [ADR 0015](adr/0015-owner-only-aws-practice.md) defines the target and
owner API preparation. The older public-rights gates below describe a possible
public release, not a requirement to purchase redistribution rights for this
private milestone. Personal/AI usage terms still apply. CloudFront stays disabled:
OAC protects the origin, not viewers. Private browser access is not complete.

The later same-day local revision requires a public viewer verification key and
trusted key group on all static behaviors. It remains disabled and undeployed.
The user has no owned domain and deferred purchase; the default-certificate TLS
minimum remains a hosting blocker. See [bounded session preparation](adr/0016-private-browser-session-preparation.md).

Local planning checkpoint: 2026-09-24. This is a checklist of existing project decisions, not approval to deploy, expose an API, purchase data rights, or publish the repository. Provider display terms were refreshed read-only in ADR 0003; public AWS pricing/TLS sources were rechecked for the 2026-09-24 hosting memo, but live account inventory, billing and account-specific prices were not audited.

## Separate the three outcomes

| Outcome | What it proves | What it does not prove |
| --- | --- | --- |
| Local fixture UI | Translated presentation, state transitions and browser behavior | Live market accuracy, cloud authorization or public data rights |
| Hosted fixture UI | Private S3 origin, CloudFront HTTPS and static delivery after approved deployment | End-user access to the signed developer API or live data permission |
| Live end-to-end product | Approved data display and authentication plus bounded worker execution | Unlimited public traffic or a hard monthly spending cap |

Do not describe a hosted fixture demonstration as the finished live product. Phase 10 static-hosting preparation can proceed locally without silently connecting the backend. Hosting deployment itself requires a cost/security review and explicit approval.

## Local preparation and remaining checks (no cloud login needed)

- Keep the browser fixture-only; preserve the existing credential-free browser client.
- Phase 10 infrastructure and release-order drafts now have local tests for private S3/OAC, HTTPS, security headers, SPA routing and versioned assets. Reinspect the exact synthesized policies and resource counts immediately before any deployment request.
- Keep deployment opt-in and separate from the default assembly. Do not introduce a service, ALB, NAT Gateway, custom domain or subscription as an incidental step.
- Record assistive-technology limitations. DOM live-region semantics and keyboard checks are not a real screen-reader audit.
- Re-run the full local checker after code changes; inspect the production bundle and secret-pattern report. A clean scan is not a guarantee that all sensitive data is absent.

## Before any hosting deployment

- The 2026-10-09 build additionally preserves complete pinned Vite/Rolldown
  producer documents and verifies the two known generated helper fingerprints
  and actual written chunk bytes. Run the composed current-artifact audit;
  the narrower declared-runtime diagnostic is not a substitute. Exact native
  source mapping/legal approval remain false. The notice artifact is still a
  required member of the same five-file allowlist; no old notice/four-file
  fallback is accepted. See [helper attribution](evidence/PHASE12_FRONTEND_HELPER_ATTRIBUTION_2026-10-09.md).

- The 2026-10-03 build adds a fixed plain-text runtime-notice artifact with
  complete installed frontend license bytes and a localized footer link. The
  current-artifact CLI matches it against the pinned documents; this does not
  approve license interpretation or publication. Serve it with explicit
  `text/plain; charset=utf-8` and revalidation, verify it before HTML, and retain
  matching notices with any rollback bundle. Earlier four-file manifests
  without notices fail the new gate rather than receiving invented coverage.
  See [the runtime attribution checkpoint](evidence/PHASE12_RUNTIME_ATTRIBUTION_2026-10-03.md).

- Phase 10 draft (2026-09-22) is isolated and disabled. Resolve the default-certificate TLS minimum decision in [ADR 0011](adr/0011-fixture-frontend-hosting-preparation.md) before enabling publication; HTTPS-only is not a TLS 1.2 minimum guarantee.
- Review current AWS identity/region, exact diff and proposed resources with fresh evidence.
- Explain storage/request/transfer costs, cleanup steps and retained resources; obtain bounded approval. Do not quote an unverified zero-cost guarantee.
- Review both CloudFront pay-as-you-go and newer flat-rate plan choices against the actual account and distribution. The current CDK stack does not subscribe to a plan; neither Price Class 200 nor a published $0/month tier proves this proposed deployment is free. See the [2026-09-24 decision precheck](evidence/PHASE10_HOSTING_DECISION_PRECHECK_2026-09-24.md).
- Make clear whether the approved target is a fixture-only demonstration or the live product.
- Verify S3 is not publicly readable, CloudFront uses the intended origin access, and the bundle contains no credentials or internal outputs.
- Define teardown and rollback before starting. Never leave a partially configured public resource as an unreported outcome.
- The local release sequence is a no-upload proposal only. Its optional [archive validation](evidence/PHASE10_LOCAL_ARCHIVE_VALIDATION_2026-09-24.md) proves only that local prior bytes match a reviewed manifest. Verify remote bytes/cache metadata and approve execution before a real update or rollback; the manifest alone is not a rollback artifact.
- The built social image is metadata-stripped, but the original source image retains embedded provenance. Review source and image rights/privacy separately before any GitHub publication.

## Additional gates before live browser/API connection

1. **Data rights:** a read-only 2026-09-23 provider-terms refresh in [ADR 0003](adr/0003-market-provider.md) still does not establish Basic-plan public-display rights. Record explicit written external-display rights for the intended audience and data before live browser use; do not enable display based on a flag or attribution alone.
2. **Authentication and abuse:** the initial API uses AWS IAM SigV4; the browser intentionally has no signing credentials. Decide and approve end-user access in an ADR. CORS is not authorization. Do not remove IAM authorization to make a demo work.
3. **Cost controls:** review admission limits, active-work slots, persistent circuit and bounded worker/model execution. Budget alerts and application limits are not an account-wide hard spending cap.
4. **Bounded acceptance:** approve the exact task count, model/provider calls and recovery plan, then verify the exact worker stopped, no work remains queued, gates are restored and credential sessions are closed as agreed.
5. **Truthful results:** verify symbol identity (including SPCX without substitution), provenance, time, freshness, error behavior and requested output language. Never reuse fixture values as live evidence.

## Publication remains separately gated

The user requested GitHub publication only after completion and a thorough security/privacy review. No push or repository publication is authorized by this checklist. Review source, history, reports, screenshots, generated bundles and infrastructure outputs before requesting publication approval.

The read-only 2026-09-23 [publication precheck](evidence/PHASE12_LOCAL_PUBLICATION_PRECHECK_2026-09-23.md) lists current candidate-file review items without sending data anywhere. It deliberately never returns publication approval.

## Sources of project decisions

- [Plan, Phases 9–12](../plan.md)
- [Provider decision](adr/0003-market-provider.md)
- [API exposure gate](adr/0009-controller-idempotency-and-api-exposure-gate.md)
- [Persistent circuit and capacity slots](adr/0010-persistent-circuit-and-capacity-slots.md)
- [API contract](api.md)

These are repository decisions and historical evidence; only the dated ADR 0003 terms refresh is a new read-only provider review. Pricing and account entitlements still require fresh confirmation before any purchase or live publication.

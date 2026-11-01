# ADR 0011: Isolated fixture frontend hosting preparation

Status: Local implementation proposal, 2026-09-22. **Not approved for deployment or publication.**

## Decision and boundary

Prepare a standalone `infrastructure/bin/frontend.ts` entry point. It requires `GMAI_ENABLE_FRONTEND=true` to synthesize and does not change the existing Foundation/Compute/API entry point. The proposed distribution is **disabled**. No object upload, deployment helper Lambda, API origin, CORS change, provider/model call, certificate purchase or DNS record is included.

The private S3 bucket blocks public access, enforces bucket-owner ownership and TLS, and uses S3-managed encryption. CloudFront gets `GetObject` through OAC with a distribution-specific source ARN condition. No OAI, website endpoint or public bucket policy is used.

The future fixture site accepts GET/HEAD over HTTPS only. HTML/default paths disable CloudFront caching; hashed `assets/*` use optimized caching. The release audit produces recommended browser cache metadata, not an upload: long immutable caching for hashed assets, revalidation for HTML and the stable social image. A future publisher must preserve old hashed assets while old HTML clients can still reference them; it must upload assets before HTML and verify hashes/metadata. No automated purge or invalidation is authorized here.

Local update 2026-09-23: the release planner now expresses that asset-first/HTML-last sequence and rejects changed content under an existing immutable asset key, still with zero AWS calls. Rollback remains unavailable without a separately archived previous bundle and fresh remote verification. The build removes the source social PNG's `caBX` provenance metadata from the generated copy only, and the release audit rejects an unstripped or malformed copy. The original asset and its provenance remain; publishing the repository needs its own metadata/rights review. See [local release sequence evidence](../evidence/PHASE10_LOCAL_RELEASE_SEQUENCE_2026-09-23.md).

The viewer-request function rewrites simple extensionless navigation to the root `index.html`, leaving file extensions, reserved `assets`/`api`/`v1` paths and unsafe/encoded paths unchanged. It does not turn every 403/404 into a 200. This is shell fallback, not a promise of a client-side router for every URL.

The response policy blocks framing and MIME sniffing, suppresses referrers, and disallows browser API connections with `connect-src 'none'`. Inline scripts/eval are not allowed. Inline style attributes remain allowed solely for current synthetic bar heights; style elements still require same-origin CSS. A focused local browser smoke with this exact CSP passed on 2026-09-22; deployed response-policy enforcement and exhaustive negative security tests remain pending.

## Deployment decisions still required

- **TLS minimum:** the draft uses the default CloudFront certificate. AWS documents that this forces the `TLSv1` security policy; HTTPS-only does not mean TLS 1.2-only. Do not label this a modern minimum-TLS enforcement. Before enabling publication, explicitly review accepting that limitation for a credential-free fixture demo versus a separately approved custom-domain/SNI certificate design. Do not quietly purchase a domain or enable dedicated-IP SSL.
- **Price class:** `PRICE_CLASS_200` is a local proposal for the Japan-oriented demonstration, not a quoted price or approved spending plan. Confirm current pricing, audience and request/transfer exposure before deployment.
- **Logging:** access logging is not enabled in the draft; no IP/cookie log store is added. Agree on bounded observability/retention during operations preparation.
- **Cleanup:** the bucket uses a destroy policy but no auto-delete custom resource. A nonempty bucket requires explicitly approved emptying before successful deletion; retained objects continue occupying storage. Disabling CloudFront alone is not complete teardown.
- **Live product:** IAM/API authentication, display rights and runtime limits remain unchanged and unresolved for public browser use. A hosted fixture demo does not complete the live product acceptance criteria.

## Sources checked on 2026-09-22

- [CDK S3BucketOrigin OAC API](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront_origins.S3BucketOrigin.html). Implementation validated against installed CDK 2.263.0, not an assumed latest package.
- [CloudFront URI rewrite example](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_url_rewrite_single_page_apps_section.html). The project uses a stricter root-shell rewrite, not the example's directory-index behavior.
- [CloudFront distribution certificate and security-policy settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html).

Related: [frontend release gates](../FRONTEND_RELEASE_GATES.md), ADR 0003 and ADR 0009. This proposal does not override the user's cost, security or GitHub approval requirements.

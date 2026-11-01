# Phase 10 hosting decision precheck — 2026-09-24

Local research and design review only. No AWS account query, deployment, subscription, purchase, object upload, distribution enablement, or GitHub publication was performed. This is **not** approval to publish a site.

## Exact local proposal

`infrastructure/lib/frontend-stack.ts` prepares a private S3 bucket, OAC-restricted CloudFront distribution, one viewer-request function and one response-headers policy. The distribution is synthesized **disabled**, with no object deployment, live API origin, custom domain, certificate or Route 53 record. It is fixture-only (`connect-src 'none'`); it must never be represented as the completed live application. The stack uses Price Class 200, not a dollar cap.

The release planner now checks archived previous bytes, hashes and cache metadata against a reviewed manifest when both are supplied. This proves only local archive consistency. It cannot assert remote object existence or authorize rollback. The full local checker passed **268 tests** on this date (221 service/contract, 19 infrastructure, 21 frontend, 7 publication); no AWS calls were made by the checker.

The static bundle audit was also tightened to reject single-quoted external/missing references and unquoted `src`/`href` references, in addition to its existing double-quoted checks. A subsequent local publication preflight examined 219 current Git candidates and still found 12 review items; `readyForPublication` remains false. That scan is not a complete rights, privacy, binary or Git-history review.

## Decision points before a deployment request

| Gate | Current fact or uncertainty | Required decision / evidence |
| --- | --- | --- |
| Minimum viewer TLS | AWS documents that its default `*.cloudfront.net` certificate forces the `TLSv1` security policy. HTTPS-only does not set a TLS 1.2 minimum. | Explicitly accept that limitation for a credential-free fixture demonstration, or separately approve a custom domain/certificate/SNI design after price and ownership review. Do not silently choose either. |
| CloudFront billing mode | AWS now offers both pay-as-you-go and flat-rate plans, including a $0/month Free tier. The local CDK stack has no pricing-plan subscription resource. A Free plan must **not** be inferred merely from `PRICE_CLASS_200` or an account's free-tier eligibility. | Inspect the actual distribution billing mode and account eligibility before creation. If proposing a plan, review its requirements/features and explicitly approve any subscription; otherwise calculate pay-as-you-go traffic and function/request exposure. Neither mode is an account-wide hard cost cap. |
| S3 and retained cost | S3 storage and request types are billable, independent of CloudFront viewer traffic. A disabled distribution does not remove a nonempty S3 bucket or other existing project resources. | Review current account inventory, Budget, estimated object bytes, expected traffic, and cleanup ownership. Do not promise zero cost; Budget alerts are delayed. |
| Public data/security | The template has a private origin and browser API connections disabled, but content itself would become public once enabled and objects uploaded. | Re-audit exact bundle and social image rights/privacy; confirm fixture-only labeling, security headers and no sensitive values. Live provider display/authentication are separate gates. |
| Reversibility | There is no automated rollback or teardown. AWS documents disabling then deleting CloudFront, and deletion of S3 objects/bucket for tutorial cleanup. | Verify archived prior bytes **and** remote bytes/metadata; document exact restore/disable/delete procedure and who executes it. Preserve old hashed assets until no longer referenced. |

## Official sources reviewed

- [CloudFront distribution TLS/certificate settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html)
- [CloudFront pricing: flat-rate and pay-as-you-go choices](https://aws.amazon.com/cloudfront/pricing/)
- [CloudFront flat-rate plan allowances, enrollment and unsupported features](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
- [Amazon S3 pricing and request charges](https://aws.amazon.com/s3/pricing/)
- [AWS CloudFront CLI tutorial cleanup sequence](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/get-started-cli-tutorial.html)

These public sources do not establish account-specific prices, current entitlements, the availability of any plan for this exact distribution, or the live state of existing resources. Recheck immediately before any paid/public action.

## Stop condition for today

Keep `GMAI_ENABLE_FRONTEND` opt-in and the distribution disabled. No CloudFront/S3 change, provider/model call, recurring schedule, paid plan, or public repository upload was initiated in this checkpoint. Existing retained AWS storage/log charges cannot be ruled out without a fresh account inventory.

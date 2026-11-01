import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { applyProjectTags } from "./tags.js";
import { FIXTURE_CSP, FIXTURE_PERMISSIONS_POLICY } from "../../shared/fixture-response-policy.mjs";
import { validatePrivateViewerPublicKey } from "./private-viewer-key.js";

// No blanket 403/404-to-200 mapping: missing assets and API paths remain errors.
export const SPA_REQUEST_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if ((request.method === 'GET' || request.method === 'HEAD') &&
      /^\\/(?:[A-Za-z0-9_-]+\\/)*[A-Za-z0-9_-]*$/.test(uri) &&
      !/^\\/(?:assets|api|v1|private)(?:\\/|$)/.test(uri)) {
    request.uri = '/index.html';
  }
  return request;
}`;

// Preserve the existing public export while sharing the exact policy with preview.
export { FIXTURE_CSP };

export interface FrontendStackProps extends StackProps {
  config: ProjectConfig;
  /** Public key only; issuance/private key custody is a separate release gate. */
  viewerPublicKeyPem: string;
}

/** Infrastructure only: no asset upload, bucket-deployment Lambda or API wiring. */
export class FrontendStack extends Stack {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    const { config, viewerPublicKeyPem, ...stackProps } = props;
    super(scope, id, stackProps);
    if (config.enablePublicLiveQuotes !== false || config.marketDataUsageMode !== "internal-development-only") {
      throw new Error("Frontend preparation is fixture-only; live display requires separate approval.");
    }
    const encodedKey = validatePrivateViewerPublicKey(viewerPublicKeyPem);
    applyProjectTags(this, config);
    const viewerKey = new cloudfront.PublicKey(this, "OwnerViewerKey", { encodedKey,
      comment: "Owner-private viewer signature verification; no private key in template" });
    const viewerKeys = new cloudfront.KeyGroup(this, "OwnerViewerKeys", { items: [viewerKey] });
    this.bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      // Explicit approved emptying is required before deletion; no destructive helper.
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: false,
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(1) }],
    });
    const headers = new cloudfront.ResponseHeadersPolicy(this, "FixtureHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: FIXTURE_CSP, override: true },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), override: true },
      },
      customHeadersBehavior: { customHeaders: [
        { header: "Permissions-Policy", value: FIXTURE_PERMISSIONS_POLICY, override: true },
      ] },
    });
    const route = new cloudfront.Function(this, "SpaRequest", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(SPA_REQUEST_CODE),
    });
    const origin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket);
    const common = {
      origin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      responseHeadersPolicy: headers,
      compress: true,
      // Apply to every behavior, including immutable JS/images. OAC alone only
      // protects S3; this also requires a valid viewer signature at CloudFront.
      trustedKeyGroups: [viewerKeys],
    };
    this.distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      comment: "Owner-private fixture frontend; disabled; no live API connection",
      // Preparation template is not a publication switch. Enable only after review.
      enabled: false,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        ...common,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: [{ function: route, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        "assets/*": { ...common, cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED },
      },
      // Default certificate does NOT enforce a TLS 1.2 minimum. See ADR 0011.
      // No custom domain/ACM/Route53 resources are introduced without approval.
      enableLogging: false,
    });
    new CfnOutput(this, "FrontendBucketName", { value: this.bucket.bucketName });
    new CfnOutput(this, "FrontendDistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "FrontendUrl", { value: `https://${this.distribution.distributionDomainName}` });
  }
}

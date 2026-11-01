import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { generateKeyPairSync } from "node:crypto";
import { App } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import { loadProjectConfig } from "../lib/config.js";
import { FIXTURE_CSP, FrontendStack, SPA_REQUEST_CODE } from "../lib/frontend-stack.js";
import { FIXTURE_CSP as SHARED_FIXTURE_CSP, FIXTURE_PERMISSIONS_POLICY } from "../../shared/fixture-response-policy.mjs";

const config = loadProjectConfig("infrastructure/environments/dev.example.json");
// Ephemeral test key, never saved or used for deployment.
const viewerPublicKeyPem=generateKeyPairSync("ec",{namedCurve:"prime256v1"}).publicKey.export({type:"spki",format:"pem"}).toString();
const template = Template.fromStack(new FrontendStack(new App(), "FrontendTest", { config, viewerPublicKeyPem }));

test("frontend bucket is private encrypted SSL-only with no automatic object deletion", () => {
  template.resourceCountIs("AWS::S3::Bucket", 1);
  template.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
    BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }] },
    WebsiteConfiguration: Match.absent(),
  });
  const policies = Object.values(template.findResources("AWS::S3::BucketPolicy")) as any[];
  const statements = policies.flatMap(p => p.Properties.PolicyDocument.Statement);
  assert.ok(statements.some(s => s.Effect === "Deny" && s.Condition?.Bool?.["aws:SecureTransport"] === "false"));
  const allows = statements.filter(s => s.Effect === "Allow");
  assert.equal(allows.length, 1);
  assert.equal(allows[0].Principal.Service, "cloudfront.amazonaws.com");
  assert.equal(allows[0].Action, "s3:GetObject");
  assert.ok(allows[0].Condition.StringEquals["AWS:SourceArn"]);
  template.resourceCountIs("Custom::S3AutoDeleteObjects", 0);
});

test("OAC always signs S3 requests and distribution exposes read-only HTTPS static behavior", () => {
  template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
    OriginAccessControlConfig: Match.objectLike({ OriginAccessControlOriginType: "s3", SigningBehavior: "always", SigningProtocol: "sigv4" }),
  });
  template.hasResourceProperties("AWS::CloudFront::Distribution", {
    DistributionConfig: Match.objectLike({
      DefaultRootObject: "index.html",
      Enabled: false,
      DefaultCacheBehavior: Match.objectLike({ AllowedMethods: ["GET", "HEAD"], ViewerProtocolPolicy: "https-only" }),
      CustomErrorResponses: Match.absent(),
      Aliases: Match.absent(),
    }),
  });
  const dist: any = Object.values(template.findResources("AWS::CloudFront::Distribution"))[0];
  assert.equal(dist.Properties.DistributionConfig.Origins.length, 1);
  const behavior = dist.Properties.DistributionConfig.CacheBehaviors[0];
  assert.equal(behavior.PathPattern, "assets/*");
  assert.equal(behavior.ViewerProtocolPolicy, "https-only");
  assert.notEqual(behavior.CachePolicyId, dist.Properties.DistributionConfig.DefaultCacheBehavior.CachePolicyId);
});

test("fixture response policy prevents API connections and executable inline content", () => {
  assert.equal(FIXTURE_CSP, SHARED_FIXTURE_CSP);
  assert.match(FIXTURE_CSP, /connect-src 'none'/);
  assert.match(FIXTURE_CSP, /script-src 'self';/);
  assert.doesNotMatch(FIXTURE_CSP, /unsafe-eval/);
  template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
    ResponseHeadersPolicyConfig: Match.objectLike({ SecurityHeadersConfig: Match.objectLike({
      ContentSecurityPolicy: { ContentSecurityPolicy: FIXTURE_CSP, Override: true },
      FrameOptions: { FrameOption: "DENY", Override: true },
      ContentTypeOptions: { Override: true },
    }), CustomHeadersConfig: {Items:[{Header:"Permissions-Policy",Value:FIXTURE_PERMISSIONS_POLICY,Override:true}]} }),
  });
});

test("SPA rewrite handles navigation without hiding missing files or API routes", () => {
  const handler = runInNewContext(`${SPA_REQUEST_CODE}; handler`);
  for (const uri of ["/", "/en", "/ja/market", "/ko/"]) {
    assert.equal(handler({ request: { uri, method: "GET" } }).uri, "/index.html");
    assert.equal(handler({ request: { uri, method: "HEAD" } }).uri, "/index.html");
  }
  for (const uri of ["/assets/missing.js", "/assets/missing", "/api", "/v1/jobs", "/private", "/private/v1/health", "/private/session/redeem", "/private/session/logout", "/index.html", "/missing.png", "/.env", "/%2eenv", "//en", "/../en"]) {
    assert.equal(handler({ request: { uri, method: "GET" } }).uri, uri);
  }
  assert.equal(handler({ request: { uri: "/en", method: "POST" } }).uri, "/en");
});

test("frontend is isolated from paid worker and deployment helper resources", () => {
  const types = Object.values(template.toJSON().Resources).map((r: any) => r.Type);
  assert.deepEqual([...new Set(types)].sort(), [
    "AWS::CloudFront::Distribution", "AWS::CloudFront::Function", "AWS::CloudFront::OriginAccessControl",
    "AWS::CloudFront::ResponseHeadersPolicy", "AWS::S3::Bucket", "AWS::S3::BucketPolicy",
    "AWS::CloudFront::PublicKey", "AWS::CloudFront::KeyGroup",
  ].sort());
  assert.doesNotMatch(JSON.stringify(template.toJSON()), /ssm:|bedrock:|ecs:|execute-api|api-key/);
});

test("frontend refuses an accidental live-display configuration", () => {
  assert.throws(() => new FrontendStack(new App(), "Invalid", {
    config: { ...config, enablePublicLiveQuotes: true } as any,
    viewerPublicKeyPem,
  }), /fixture-only/);
});

test("every viewer behavior requires the one trusted key group, without a public bypass",()=>{
  template.resourceCountIs("AWS::CloudFront::PublicKey",1);template.resourceCountIs("AWS::CloudFront::KeyGroup",1);
  const dist:any=Object.values(template.findResources("AWS::CloudFront::Distribution"))[0];
  const groupId=Object.keys(template.findResources("AWS::CloudFront::KeyGroup"))[0];
  for(const behavior of [dist.Properties.DistributionConfig.DefaultCacheBehavior,...dist.Properties.DistributionConfig.CacheBehaviors]){
    assert.deepEqual(behavior.TrustedKeyGroups,[{Ref:groupId}]);
    assert.equal(behavior.TrustedSigners,undefined);
  }
  assert.equal(dist.Properties.DistributionConfig.Enabled,false);
  assert.doesNotMatch(JSON.stringify(template.toJSON()),/PRIVATE KEY|AWS::Lambda::|AWS::Cognito::|AWS::Route53::|AWS::CertificateManager::/);
  assert.throws(()=>new FrontendStack(new App(),"MissingOwnerKey",{config,viewerPublicKeyPem:""}),/PRIVATE_VIEWER_PUBLIC_KEY_INVALID/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib/core";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ApiStack } from "../lib/api-stack.js";
import { ComputeStack } from "../lib/compute-stack.js";
import { parseProjectConfig, type ProjectConfig } from "../lib/config.js";
import { FoundationStack } from "../lib/foundation-stack.js";

const rawConfig = {
  environment: "dev",
  region: "ap-northeast-1",
  projectName: "global-market-ai-insight",
  owner: "portfolio-developer",
  bedrockModelAlias: "nova-lite-candidate",
  bedrockModelId: "amazon.nova-lite-v1:0",
  providerApiKeyParameterName: "/global-market-ai-insight/dev/market-data/api-key",
  marketDataUsageMode: "internal-development-only",
  enablePublicLiveQuotes: false,
  jobTimeoutSeconds: 90,
  jobTtlDays: 7,
  logRetentionDays: 7,
  maxActiveJobs: 2,
  maxJobsPerMinute: 2,
  bedrockMaxOutputTokens: 512,
  enableNatGateway: false,
  enableAlb: false,
  enableEcsService: false,
} as const;

function config(): ProjectConfig {
  return parseProjectConfig(rawConfig);
}

test("rejects cost-unsafe main-stack feature flags and mutable image tags", () => {
  assert.throws(() => parseProjectConfig({ ...rawConfig, enableNatGateway: true }), /must remain false/);
  assert.throws(() => parseProjectConfig({ ...rawConfig, workerImageDigest: "latest" }), /sha256 digest/);
  assert.throws(() => parseProjectConfig({ ...rawConfig, owner: "person@example.com" }), /non-sensitive/);
  assert.throws(() => parseProjectConfig({ ...rawConfig, providerApiKeyParameterName: "/another-project/dev/key" }), /safe path/);
  assert.throws(() => parseProjectConfig({ ...rawConfig, marketDataUsageMode: "public-display" }), /internal-development-only/);
  assert.throws(() => parseProjectConfig({ ...rawConfig, enablePublicLiveQuotes: true }), /must remain false/);
});

test("private owner config is exact and omission does not select a permissive wildcard", () => {
  assert.equal(config().ownerIamUserName, undefined);
  assert.equal(parseProjectConfig({ ...rawConfig, ownerIamUserName: "local-owner" }).ownerIamUserName, "local-owner");
  for (const ownerIamUserName of ["", "*", "owner/*", "owner\n", "x".repeat(65), null, true, []]) {
    assert.throws(() => parseProjectConfig({ ...rawConfig, ownerIamUserName }), /ownerIamUserName/);
  }
});

test("foundation enables immutable scan-on-push ECR with bounded retention", () => {
  const app = new App();
  const stack = new FoundationStack(app, "Foundation", { config: config() });
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::ECR::Repository", 1);
  template.hasResourceProperties("AWS::ECR::Repository", {
    ImageScanningConfiguration: { ScanOnPush: true },
    ImageTagMutability: "IMMUTABLE",
    LifecyclePolicy: Match.objectLike({ LifecyclePolicyText: Match.stringLikeRegexp("countNumber.*3") }),
  });
  template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 7 });
  template.resourceCountIs("AWS::DynamoDB::Table", 1);
  template.hasResourceProperties("AWS::DynamoDB::Table", {
    BillingMode: "PAY_PER_REQUEST",
    KeySchema: [{ AttributeName: "jobId", KeyType: "HASH" }],
    TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    SSESpecification: { SSEEnabled: true },
  });

  const json = template.toJSON();
  const repository = Object.values(json.Resources).find((resource: any) => resource.Type === "AWS::ECR::Repository") as any;
  assert.equal(repository.DeletionPolicy, "Delete");
});

test("compute defines one hardened production one-shot Fargate task and no always-on resources", () => {
  const app = new App();
  const foundation = new FoundationStack(app, "Foundation", { config: config() });
  const stack = new ComputeStack(app, "Compute", {
    config: config(),
    workerRepository: foundation.workerRepository,
    workerLogGroup: foundation.workerLogGroup,
    jobsTable: foundation.jobsTable,
    workerImageDigest: `sha256:${"a".repeat(64)}`,
  });
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ECS::TaskDefinition", 1);
  template.resourceCountIs("AWS::ECS::Service", 0);
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::EC2::VPCEndpoint", 1);
  template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  template.resourceCountIs("AWS::EC2::SecurityGroupIngress", 0);

  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Cpu: "256",
    Memory: "512",
    NetworkMode: "awsvpc",
    RequiresCompatibilities: ["FARGATE"],
    RuntimePlatform: { CpuArchitecture: "X86_64", OperatingSystemFamily: "LINUX" },
    ContainerDefinitions: [Match.objectLike({
      Essential: true,
      ReadonlyRootFilesystem: true,
      User: "65532:65532",
      PortMappings: Match.absent(),
      Secrets: [{
        Name: "TWELVE_DATA_API_KEY",
        ValueFrom: Match.anyValue(),
      }],
    })],
  });
  template.hasResourceProperties("AWS::EC2::SecurityGroup", {
    SecurityGroupIngress: Match.absent(),
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "global-market-ai-insight-dev-controller",
    Runtime: "nodejs22.x",
    MemorySize: 128,
    Timeout: 15,
    Handler: "main.handler",
    Environment: {
      Variables: Match.objectLike({
        JOB_TIMEOUT_SECONDS: "90",
        JOB_TTL_SECONDS: "604800",
        MAX_JOBS_PER_MINUTE: "2",
        MAX_ACTIVE_JOBS: "2",
        CIRCUIT_STATE: "CLOSED",
        API_AUTH_MODE: "AWS_IAM",
        PRIVATE_OWNER_USER_ARN: "",
        ENABLE_PROVIDER_BACKED_JOBS: "false",
        ENABLE_LIVE_RESULT_DISPLAY: "false",
      }),
    },
    VpcConfig: Match.absent(),
    ReservedConcurrentExecutions: Match.absent(),
  });
  template.hasResourceProperties("AWS::EC2::VPCEndpoint", {
    VpcEndpointType: "Gateway",
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([Match.objectLike({
        Action: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        Effect: "Allow",
        Principal: { AWS: "*" },
        Condition: Match.objectLike({
          StringEquals: Match.objectLike({ "aws:PrincipalArn": Match.anyValue() }),
        }),
      })]),
    }),
  });

  const computeResources = template.toJSON().Resources as Record<string, any>;
  const endpoint = Object.values(computeResources).find((resource: any) => resource.Type === "AWS::EC2::VPCEndpoint") as any;
  const workerSecurityGroup = Object.values(computeResources).find((resource: any) => resource.Type === "AWS::EC2::SecurityGroup") as any;
  assert.equal(endpoint.Properties.RouteTableIds.length, 2);
  const endpointPolicy = JSON.stringify(endpoint.Properties.PolicyDocument);
  assert.equal(endpointPolicy.includes('"AWS":"*"'), true);
  assert.equal(endpointPolicy.includes('"aws:PrincipalArn"'), true);
  assert.equal(endpointPolicy.includes("WorkerTaskRole"), true);
  assert.equal(workerSecurityGroup.Properties.SecurityGroupEgress.some(
    (rule: any) => rule.IpProtocol === "tcp" && rule.FromPort === 80,
  ), false);

  const rendered = JSON.stringify(template.toJSON());
  assert.equal(rendered.includes(`sha256:${"a".repeat(64)}`), true);
  assert.equal(rendered.includes("bedrock:InvokeModel"), true);
  assert.equal(rendered.includes("amazon.nova-lite-v1:0"), true);
  assert.equal(rendered.includes("dynamodb:GetItem"), true);
  assert.equal(rendered.includes("dynamodb:UpdateItem"), true);
  assert.equal(rendered.includes("dynamodb:DeleteItem"), false);
  assert.equal(rendered.includes("dynamodb:Scan"), false);
  assert.equal(rendered.includes("secretsmanager:"), false);
  assert.equal(rendered.includes("ssm:GetParameters"), true);
  assert.equal(rendered.includes("/global-market-ai-insight/dev/market-data/api-key"), true);
  assert.equal(rendered.includes("test-only-key"), false);
  assert.equal(rendered.includes("LOCAL_JOB_FIXTURE_JSON"), false);
  assert.equal(rendered.includes('"APP_ENV","Value":"aws"'), true);
});

test("internal acceptance opt-in never enables browser result display", () => {
  const app = new App();
  const foundation = new FoundationStack(app, "InternalFoundation", { config: config() });
  const stack = new ComputeStack(app, "InternalCompute", {
    config: config(),
    workerRepository: foundation.workerRepository,
    workerLogGroup: foundation.workerLogGroup,
    jobsTable: foundation.jobsTable,
    workerImageDigest: `sha256:${"d".repeat(64)}`,
    internalJobExecutionEnabled: true,
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::Lambda::Function", {
    Environment: { Variables: Match.objectLike({
      API_AUTH_MODE: "AWS_IAM",
      ENABLE_PROVIDER_BACKED_JOBS: "true",
      ENABLE_LIVE_RESULT_DISPLAY: "false",
      MAX_ACTIVE_JOBS: "2",
    }) },
  });
  template.resourceCountIs("AWS::ECS::Service", 0);
  template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
});

test("owner binding adds only a controller environment setting and never permissions or admission", () => {
  function synth(ownerIamUserName?: string) {
    const app = new App();
    const options = ownerIamUserName === undefined ? config() : { ...config(), ownerIamUserName };
    const env = { account: "000000000000", region: "ap-northeast-1" };
    const foundation = new FoundationStack(app, "OwnerFoundation", { config: options, env });
    return Template.fromStack(new ComputeStack(app, "OwnerCompute", { config: options, env,
      workerRepository: foundation.workerRepository, workerLogGroup: foundation.workerLogGroup,
      jobsTable: foundation.jobsTable, workerImageDigest: `sha256:${"d".repeat(64)}` })).toJSON();
  }
  const before = synth(), after = synth("local-owner");
  const resources = after.Resources as Record<string, any>;
  const controllers = Object.values(resources).filter(r => r.Type === "AWS::Lambda::Function" &&
    r.Properties.FunctionName === "global-market-ai-insight-dev-controller");
  assert.equal(controllers.length, 1);
  const controller = controllers[0];
  assert.ok(controller);
  assert.deepEqual(controller.Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN, {
    "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":iam::000000000000:user/local-owner"]],
  });
  assert.equal(controller.Properties.Environment.Variables.ENABLE_PROVIDER_BACKED_JOBS, "false");
  assert.equal(controller.Properties.Environment.Variables.ENABLE_LIVE_RESULT_DISPLAY, "false");
  controller.Properties.Environment.Variables.PRIVATE_OWNER_USER_ARN = "";
  assert.deepEqual(after, before);
});

test("IAM roles keep injected-secret, worker, and controller capabilities separate", () => {
  const app = new App();
  const foundation = new FoundationStack(app, "Foundation", { config: config() });
  const stack = new ComputeStack(app, "Compute", {
    config: config(),
    workerRepository: foundation.workerRepository,
    workerLogGroup: foundation.workerLogGroup,
    jobsTable: foundation.jobsTable,
    workerImageDigest: `sha256:${"b".repeat(64)}`,
  });
  const resources = Template.fromStack(stack).toJSON().Resources as Record<string, any>;

  const policyFor = (rolePrefix: string) => JSON.stringify(Object.entries(resources)
    .filter(([logicalId, resource]) => logicalId.startsWith(rolePrefix) && resource.Type === "AWS::IAM::Policy")
    .map(([, resource]) => resource.Properties.PolicyDocument));

  const actionsFor = (rolePrefix: string): string[] => Object.entries(resources)
    .filter(([logicalId, resource]) => logicalId.startsWith(rolePrefix) && resource.Type === "AWS::IAM::Policy")
    .flatMap(([, resource]) => resource.Properties.PolicyDocument.Statement)
    .flatMap((statement: any) => Array.isArray(statement.Action) ? statement.Action : [statement.Action])
    .sort();

  const executionPolicy = policyFor("WorkerExecutionRole");
  const workerPolicy = policyFor("WorkerTaskRole");
  const controllerPolicy = policyFor("ControllerRole");

  assert.match(executionPolicy, /ssm:GetParameters/);
  assert.deepEqual(actionsFor("WorkerExecutionRole").filter((action) => action.startsWith("ssm:")), ["ssm:GetParameters"]);
  assert.match(executionPolicy, /ecr:GetAuthorizationToken/);
  assert.doesNotMatch(executionPolicy, /dynamodb:/);
  assert.doesNotMatch(executionPolicy, /bedrock:/);

  assert.match(workerPolicy, /dynamodb:GetItem/);
  assert.match(workerPolicy, /dynamodb:UpdateItem/);
  assert.match(workerPolicy, /bedrock:InvokeModel/);
  assert.doesNotMatch(workerPolicy, /dynamodb:PutItem/);
  assert.doesNotMatch(workerPolicy, /ssm:/);
  assert.doesNotMatch(workerPolicy, /ecs:RunTask/);
  assert.doesNotMatch(workerPolicy, /iam:PassRole/);

  assert.match(controllerPolicy, /ecs:RunTask/);
  assert.doesNotMatch(controllerPolicy, /dynamodb:TransactWriteItems/);
  assert.match(controllerPolicy, /dynamodb:PutItem/);
  assert.match(controllerPolicy, /dynamodb:ConditionCheckItem/);
  assert.match(controllerPolicy, /dynamodb:EnclosingOperation/);
  const controllerStatements = Object.entries(resources)
    .filter(([id, resource]) => id.startsWith("ControllerRole") && resource.Type === "AWS::IAM::Policy")
    .flatMap(([, resource]) => resource.Properties.PolicyDocument.Statement);
  const circuitCheck = controllerStatements.find(statement => [statement.Action].flat().includes("dynamodb:ConditionCheckItem"));
  assert.deepEqual(circuitCheck.Condition["ForAllValues:StringLike"], { "dynamodb:LeadingKeys": ["control_circuit"] });
  assert.equal(circuitCheck.Condition["ForAnyValue:StringEquals"], undefined);
  assert.deepEqual(circuitCheck.Condition.Null, { "dynamodb:LeadingKeys": "false" });
  for (const statement of controllerStatements) {
    const actions = [statement.Action].flat();
    if (!actions.some((action: string) => action.startsWith("dynamodb:"))) continue;
    const keys = statement.Condition?.["ForAllValues:StringLike"]?.["dynamodb:LeadingKeys"];
    assert.ok(Array.isArray(keys));
    assert.equal(keys.includes("*"), false);
    if (actions.some((action: string) => ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"].includes(action))) {
      assert.equal(keys.includes("control_circuit"), false);
    }
  }
  assert.match(controllerPolicy, /iam:PassRole/);
  assert.match(controllerPolicy, /ecs-tasks.amazonaws.com/);
  assert.doesNotMatch(controllerPolicy, /ssm:/);
  assert.doesNotMatch(controllerPolicy, /bedrock:/);
  // Local private-session experiments must not silently grant current workload
  // roles access to auth_* records in this same table. This is a template
  // assertion, not a live IAM simulator/second-principal acceptance claim.
  const workloadStatements = Object.entries(resources)
    .filter(([id, resource]) => /^(?:ControllerRole|WorkerTaskRole)/.test(id) && resource.Type === "AWS::IAM::Policy")
    .flatMap(([, resource]) => resource.Properties.PolicyDocument.Statement);
  const allowedKeyPatterns = new Set(["job_*", "gmai-*", "control_circuit", "control_rate_*", "control_slot_0", "control_slot_1"]);
  for (const statement of workloadStatements) {
    if (![statement.Action].flat().some((action: string) => action.startsWith("dynamodb:"))) continue;
    const keys = statement.Condition?.["ForAllValues:StringLike"]?.["dynamodb:LeadingKeys"];
    assert.ok(Array.isArray(keys) && keys.length > 0);
    assert.ok(keys.every((key: string) => allowedKeyPatterns.has(key)));
    assert.equal(statement.Condition.Null?.["dynamodb:LeadingKeys"], "false");
  }
});

test("API stack exposes only the four contract routes with bounded CORS and throttling", () => {
  const app = new App();
  const foundation = new FoundationStack(app, "Foundation", { config: config() });
  const compute = new ComputeStack(app, "Compute", {
    config: config(),
    workerRepository: foundation.workerRepository,
    workerLogGroup: foundation.workerLogGroup,
    jobsTable: foundation.jobsTable,
    workerImageDigest: `sha256:${"c".repeat(64)}`,
  });
  const api = new ApiStack(app, "Api", { config: config(), controllerFunction: compute.controllerFunction });
  const template = Template.fromStack(api);

  template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
  template.resourceCountIs("AWS::ApiGatewayV2::Route", 4);
  template.resourceCountIs("AWS::ApiGatewayV2::Stage", 1);
  template.resourceCountIs("AWS::ApiGatewayV2::Authorizer", 0);
  template.resourceCountIs("AWS::Logs::LogGroup", 1);
  template.resourceCountIs("AWS::WAFv2::WebACL", 0);
  template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
    ProtocolType: "HTTP",
    CorsConfiguration: {
      AllowHeaders: ["content-type", "idempotency-key"],
      AllowMethods: ["GET", "POST", "OPTIONS"],
      AllowOrigins: ["http://127.0.0.1:4173", "http://localhost:4173"],
      MaxAge: 3600,
    },
  });
  template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
    AutoDeploy: true,
    DefaultRouteSettings: {
      DetailedMetricsEnabled: false,
      ThrottlingBurstLimit: 2,
      ThrottlingRateLimit: 1,
    },
    AccessLogSettings: Match.objectLike({ DestinationArn: Match.anyValue() }),
  });
  template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 7 });

  const rendered = JSON.stringify(template.toJSON());
  for (const route of ["GET /v1/assets", "POST /v1/jobs", "GET /v1/jobs/{jobId}", "GET /v1/health"]) {
    assert.equal(rendered.includes(route), true);
  }
  const routeResources = Object.values(template.toJSON().Resources as Record<string, any>)
    .filter((resource: any) => resource.Type === "AWS::ApiGatewayV2::Route");
  assert.equal(routeResources.every((route: any) => route.Properties.AuthorizationType === "AWS_IAM"), true);
});

test("foundation-only app assembly contains no compute stack without a digest", () => {
  const app = new App();
  new FoundationStack(app, "FoundationOnly", { config: config() });
  const assembly = app.synth();
  assert.equal(assembly.stacks.length, 1);
  assert.equal(assembly.stacks[0]?.stackName, "FoundationOnly");
});

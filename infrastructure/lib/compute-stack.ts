import { resolve } from "node:path";
import { Arn, ArnFormat, CfnOutput, Duration, Fn, RemovalPolicy, Size, Stack, type StackProps } from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { validateWorkerImageDigest } from "./config.js";
import { applyProjectTags } from "./tags.js";

export interface ComputeStackProps extends StackProps {
  config: ProjectConfig;
  workerRepository: ecr.IRepository;
  workerLogGroup: logs.ILogGroup;
  jobsTable: dynamodb.ITable;
  workerImageDigest: string;
  /** Explicit, temporary, IAM-only internal acceptance gate. Public result display remains disabled. */
  internalJobExecutionEnabled?: boolean;
}

export class ComputeStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly controllerRole: iam.Role;
  readonly controllerFunction: lambda.Function;
  readonly controllerLogGroup: logs.LogGroup;
  readonly workerExecutionRole: iam.Role;
  readonly workerTaskRole: iam.Role;
  readonly workerSecurityGroup: ec2.SecurityGroup;
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    const { config, workerRepository, workerLogGroup, jobsTable, workerImageDigest, internalJobExecutionEnabled = false, ...stackProps } = props;
    super(scope, id, stackProps);
    applyProjectTags(this, config);
    validateWorkerImageDigest(workerImageDigest);

    const prefix = `${config.projectName}-${config.environment}`;
    this.vpc = new ec2.Vpc(this, "WorkerVpc", {
      vpcName: `${prefix}-worker`,
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/24"),
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [{ name: "public-worker", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 28 }],
    });

    const dynamoDbEndpoint = this.vpc.addGatewayEndpoint("DynamoDbGatewayEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
    });

    this.workerSecurityGroup = new ec2.SecurityGroup(this, "WorkerSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: `${prefix}-worker-egress-only`,
      description: "No ingress; bounded worker egress only",
      allowAllOutbound: false,
    });
    this.workerSecurityGroup.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "External provider and AWS HTTPS");
    this.workerSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.udp(53), "VPC DNS UDP");
    this.workerSecurityGroup.addEgressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(53), "VPC DNS TCP fallback");

    this.cluster = new ecs.Cluster(this, "WorkerCluster", {
      clusterName: `${prefix}-worker`,
      vpc: this.vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const providerApiKey = ssm.StringParameter.fromSecureStringParameterAttributes(this, "ProviderApiKeyParameter", {
      parameterName: config.providerApiKeyParameterName,
    });

    this.workerExecutionRole = new iam.Role(this, "WorkerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "ECS agent permissions for one-shot worker image, logs, and injected provider secret",
    });
    this.workerExecutionRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["ecr:GetAuthorizationToken"],
      resources: ["*"],
    }));
    this.workerExecutionRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"],
      resources: [workerRepository.repositoryArn],
    }));
    this.workerExecutionRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${workerLogGroup.logGroupArn}:*`],
    }));
    this.workerExecutionRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["ssm:GetParameters"],
      resources: [providerApiKey.parameterArn],
    }));

    this.workerTaskRole = new iam.Role(this, "WorkerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Application permissions for one-shot market insight worker",
    });
    this.workerTaskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [jobsTable.tableArn],
      conditions: {
        "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["job_*", "gmai-*"] },
        Null: { "dynamodb:LeadingKeys": "false" },
      },
    }));
    const bedrockModelArn = Arn.format({
      partition: Stack.of(this).partition,
      service: "bedrock",
      region: config.region,
      account: "",
      resource: "foundation-model",
      resourceName: config.bedrockModelId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
    this.workerTaskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [bedrockModelArn],
    }));
    dynamoDbEndpoint.addToPolicy(new iam.PolicyStatement({
      // Gateway endpoint policies require Principal "*". Restrict the caller
      // with aws:PrincipalArn so an ECS assumed-role session matches the
      // underlying worker role without granting other VPC principals access.
      principals: [new iam.AnyPrincipal()],
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [jobsTable.tableArn],
      conditions: {
        StringEquals: { "aws:PrincipalArn": this.workerTaskRole.roleArn },
      },
    }));

    this.taskDefinition = new ecs.FargateTaskDefinition(this, "WorkerTaskDefinition", {
      family: `${prefix}-worker`,
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: this.workerExecutionRole,
      taskRole: this.workerTaskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
    });
    this.taskDefinition.addContainer("Worker", {
      containerName: "worker",
      image: ecs.ContainerImage.fromEcrRepository(workerRepository, workerImageDigest),
      essential: true,
      readonlyRootFilesystem: true,
      user: "65532:65532",
      stopTimeout: Duration.seconds(30),
      environment: {
        APP_ENV: "aws",
        JOBS_TABLE_NAME: jobsTable.tableName,
        BEDROCK_MODEL_ID: config.bedrockModelId,
        BEDROCK_MAX_OUTPUT_TOKENS: String(config.bedrockMaxOutputTokens),
      },
      logging: ecs.LogDrivers.awsLogs({
        logGroup: workerLogGroup,
        streamPrefix: "worker",
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: Size.mebibytes(1),
      }),
    });

    // ecs.Secret.fromSsmParameter() automatically grants the broader
    // GetParameter/GetParameterHistory/DescribeParameters set. ECS secret
    // injection only needs the batch GetParameters action, so keep the
    // container definition at L1 and the execution-role grant exact.
    const cfnTaskDefinition = this.taskDefinition.node.defaultChild as ecs.CfnTaskDefinition;
    cfnTaskDefinition.addPropertyOverride("ContainerDefinitions.0.Secrets", [{
      Name: "TWELVE_DATA_API_KEY",
      ValueFrom: providerApiKey.parameterArn,
    }]);

    this.controllerRole = new iam.Role(this, "ControllerRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "API controller permissions without provider-secret or Bedrock access",
    });
    // Transactions authorize each underlying item operation; there is no
    // dynamodb:TransactWriteItems IAM action. Control-item writes are excluded.
    const keyedGrant = (actions: string[], keys: string[], transactional = false) => {
      this.controllerRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions, resources: [jobsTable.tableArn],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": keys },
          Null: { "dynamodb:LeadingKeys": "false" },
          ...(transactional ? { "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } : {}),
        },
      }));
    };
    keyedGrant(["dynamodb:GetItem"], ["job_*", "gmai-*", "control_circuit"]);
    keyedGrant(["dynamodb:UpdateItem"], ["job_*"]);
    keyedGrant(["dynamodb:UpdateItem"], ["control_rate_*"], true);
    keyedGrant(["dynamodb:PutItem"], ["job_*", ...Array.from({ length: config.maxActiveJobs }, (_, slot) => `control_slot_${slot}`)], true);
    // This transaction-only IAM action has no standalone API and does not
    // support EnclosingOperation. Exact table/circuit LeadingKeys still
    // prevent checking jobs or slots, and confer no control-item writes.
    keyedGrant(["dynamodb:ConditionCheckItem"], ["control_circuit"]);
    this.controllerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [this.taskDefinition.taskDefinitionArn],
      conditions: { ArnEquals: { "ecs:cluster": this.cluster.clusterArn } },
    }));
    this.controllerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [this.workerExecutionRole.roleArn, this.workerTaskRole.roleArn],
      conditions: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
    }));

    this.controllerLogGroup = new logs.LogGroup(this, "ControllerLogGroup", {
      logGroupName: `/aws/lambda/${prefix}-controller`,
      retention: config.logRetentionDays === 14 ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.controllerRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${this.controllerLogGroup.logGroupArn}:*`],
    }));

    this.controllerFunction = new lambda.Function(this, "ControllerFunction", {
      functionName: `${prefix}-controller`,
      description: "Validated asynchronous job API controller; never reads provider secrets or invokes Bedrock",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      handler: "main.handler",
      code: lambda.Code.fromAsset(resolve("services/controller/bundle")),
      role: this.controllerRole,
      logGroup: this.controllerLogGroup,
      memorySize: 128,
      timeout: Duration.seconds(15),
      tracing: lambda.Tracing.DISABLED,
      environment: {
        JOBS_TABLE_NAME: jobsTable.tableName,
        WORKER_CLUSTER: this.cluster.clusterArn,
        WORKER_TASK_DEFINITION: this.taskDefinition.taskDefinitionArn,
        WORKER_SUBNET_IDS: Fn.join(",", this.vpc.publicSubnets.map((subnet) => subnet.subnetId)),
        WORKER_SECURITY_GROUP_ID: this.workerSecurityGroup.securityGroupId,
        JOB_TIMEOUT_SECONDS: String(config.jobTimeoutSeconds),
        JOB_TTL_SECONDS: String(config.jobTtlDays * 86_400),
        MAX_JOBS_PER_MINUTE: String(config.maxJobsPerMinute),
        MAX_ACTIVE_JOBS: String(config.maxActiveJobs),
        CIRCUIT_STATE: "CLOSED",
        API_AUTH_MODE: "AWS_IAM",
        PRIVATE_OWNER_USER_ARN: config.ownerIamUserName === undefined ? "" : this.formatArn({
          service: "iam", region: "", resource: "user", resourceName: config.ownerIamUserName,
          arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        }),
        ENABLE_PROVIDER_BACKED_JOBS: String(internalJobExecutionEnabled),
        ENABLE_LIVE_RESULT_DISPLAY: "false",
      },
    });

    new CfnOutput(this, "ClusterName", { value: this.cluster.clusterName });
    new CfnOutput(this, "TaskDefinitionArn", { value: this.taskDefinition.taskDefinitionArn });
    new CfnOutput(this, "WorkerSecurityGroupId", { value: this.workerSecurityGroup.securityGroupId });
    new CfnOutput(this, "PublicSubnetIds", { value: Fn.join(",", this.vpc.publicSubnets.map((subnet) => subnet.subnetId)) });
    new CfnOutput(this, "ControllerRoleArn", { value: this.controllerRole.roleArn });
    new CfnOutput(this, "ControllerFunctionName", { value: this.controllerFunction.functionName });
  }
}

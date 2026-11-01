import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { applyProjectTags } from "./tags.js";

export interface MaintenanceStackProps extends StackProps {
  config: ProjectConfig;
  jobsTable: dynamodb.ITable | ((scope: Construct) => dynamodb.ITable);
  cluster: ecs.ICluster | ((scope: Construct) => ecs.ICluster);
  handlerCode: lambda.Code;
}

/** Disabled schedule and no notification; deploying even this draft requires approval. */
export class MaintenanceStack extends Stack {
  constructor(scope: Construct, id: string, props: MaintenanceStackProps) {
    const { config, jobsTable, cluster, handlerCode, ...stackProps } = props;
    super(scope, id, stackProps);
    applyProjectTags(this, config);
    const ownedTable = typeof jobsTable === "function" ? jobsTable(this) : jobsTable;
    const ownedCluster = typeof cluster === "function" ? cluster(this) : cluster;
    const prefix = `${config.projectName}-${config.environment}`;
    const slots = Array.from({ length: config.maxActiveJobs }, (_, n) => `control_slot_${n}`);

    const role = new iam.Role(this, "MaintenanceRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Exact-slot stale-job inspection, exact ECS task stop and conditional cleanup only",
    });
    const keyedGrant = (actions: string[], keys: string[], transactional = false) => {
      role.addToPrincipalPolicy(new iam.PolicyStatement({
        actions, resources: [ownedTable.tableArn],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": keys },
          Null: { "dynamodb:LeadingKeys": "false" },
          ...(transactional ? { "ForAnyValue:StringEquals": { "dynamodb:EnclosingOperation": ["TransactWriteItems"] } } : {}),
        },
      }));
    };
    keyedGrant(["dynamodb:GetItem"], ["job_*", ...slots]);
    keyedGrant(["dynamodb:UpdateItem"], ["job_*"]);
    // ConditionCheckItem is an IAM permission used by TransactWriteItems,
    // not a standalone API. Unlike DeleteItem, its service authorization
    // entry does not support EnclosingOperation. Keep exact table/job keys;
    // applying that unsupported condition would silently deny recovery.
    keyedGrant(["dynamodb:ConditionCheckItem"], ["job_*"]);
    keyedGrant(["dynamodb:DeleteItem"], slots, true);

    const taskArnPattern = `arn:${Stack.of(this).partition}:ecs:${config.region}:${Stack.of(this).account}:task/${ownedCluster.clusterName}/*`;
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["ecs:DescribeTasks", "ecs:StopTask"],
      resources: [taskArnPattern],
      conditions: { ArnEquals: { "ecs:cluster": ownedCluster.clusterArn } },
    }));

    const logGroup = new logs.LogGroup(this, "MaintenanceLogs", {
      logGroupName: `/aws/lambda/${prefix}-maintenance`,
      retention: config.logRetentionDays === 14 ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${logGroup.logGroupArn}:*`],
    }));
    const fn = new lambda.Function(this, "MaintenanceFunction", {
      functionName: `${prefix}-maintenance`,
      description: "Exact-slot deadline sweep and stopped-task reconciliation; schedule disabled pending approval",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      handler: "main.handler",
      code: handlerCode,
      role,
      logGroup,
      memorySize: 128,
      timeout: Duration.seconds(45),
      tracing: lambda.Tracing.DISABLED,
      environment: {
        JOBS_TABLE_NAME: ownedTable.tableName,
        WORKER_CLUSTER_ARN: ownedCluster.clusterArn,
        MAX_ACTIVE_JOBS: String(config.maxActiveJobs),
      },
    });
    const rule = new events.Rule(this, "MaintenanceSchedule", {
      ruleName: `${prefix}-maintenance`,
      description: "Disabled draft: exact-slot stale-job sweep. Enable only after cost/security review.",
      schedule: events.Schedule.rate(Duration.minutes(5)),
      enabled: false,
    });
    rule.addTarget(new targets.LambdaFunction(fn, { retryAttempts: 0, maxEventAge: Duration.minutes(5) }));
  }
}

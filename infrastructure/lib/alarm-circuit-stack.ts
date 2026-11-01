import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { operationsAlarmNames } from "./operations-alarm-catalog.js";
import { applyProjectTags } from "./tags.js";

export interface AlarmCircuitStackProps extends StackProps {
  config: ProjectConfig;
  jobsTable: dynamodb.ITable | ((scope: Stack) => dynamodb.ITable);
  handlerCode: lambda.Code;
  /** Temporary development drill only; not a function-level concurrency cap. */
  unreservedDrill?: boolean;
}

/**
 * Explicit opt-in fail-safe automation. It can only move the application/cost
 * circuit to OPEN; manual recovery remains a separately confirmed operation.
 */
export class AlarmCircuitStack extends Stack {
  constructor(scope: Construct, id: string, props: AlarmCircuitStackProps) {
    const { config, jobsTable: sourceTable, handlerCode, unreservedDrill = false, ...stackProps } = props;
    if (typeof unreservedDrill !== "boolean" || (unreservedDrill && `${config.projectName}-${config.environment}` !== "global-market-ai-insight-dev")) {
      throw new Error("Unreserved alarm concurrency is limited to the explicit development drill.");
    }
    super(scope, id, stackProps);
    const jobsTable = typeof sourceTable === "function" ? sourceTable(this) : sourceTable;
    applyProjectTags(this, config);
    const prefix = `${config.projectName}-${config.environment}`;
    const alarmNames = operationsAlarmNames(config);

    const role = new iam.Role(this, "AlarmCircuitRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "Read and conditionally open only the application/cost circuit item",
    });
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [jobsTable.tableArn],
      conditions: {
        "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["control_circuit"] },
        Null: { "dynamodb:LeadingKeys": "false" },
      },
    }));

    const logGroup = new logs.LogGroup(this, "AlarmCircuitLogs", {
      logGroupName: `/aws/lambda/${prefix}-alarm-circuit`,
      retention: config.logRetentionDays === 14 ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
      resources: [`${logGroup.logGroupArn}:*`],
    }));

    const fn = new lambda.Function(this, "AlarmCircuitFunction", {
      functionName: `${prefix}-alarm-circuit`,
      description: "Allowlisted CloudWatch ALARM events can open, but never close, the application/cost circuit",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      handler: "main.handler",
      code: handlerCode,
      role,
      logGroup,
      memorySize: 128,
      timeout: Duration.seconds(5),
      reservedConcurrentExecutions: unreservedDrill ? undefined : 1,
      tracing: lambda.Tracing.DISABLED,
      environment: {
        JOBS_TABLE_NAME: jobsTable.tableName,
        EXPECTED_ACCOUNT_ID: this.account,
        ALLOWED_ALARM_NAMES_JSON: JSON.stringify(alarmNames),
      },
    });
    fn.configureAsyncInvoke({
      retryAttempts: 1,
      maxEventAge: Duration.minutes(1),
    });

    const rule = new events.Rule(this, "AlarmCircuitRule", {
      ruleName: `${prefix}-alarm-circuit`,
      description: "Exact project alarms in ALARM may only open the application/cost circuit",
      eventPattern: {
        source: ["aws.cloudwatch"],
        detailType: ["CloudWatch Alarm State Change"],
        detail: {
          alarmName: alarmNames,
          state: { value: ["ALARM"] },
        },
      },
    });
    rule.addTarget(new targets.LambdaFunction(fn, {
      retryAttempts: 1,
      maxEventAge: Duration.minutes(1),
    }));
  }
}

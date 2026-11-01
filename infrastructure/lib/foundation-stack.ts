import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { applyProjectTags } from "./tags.js";

export interface FoundationStackProps extends StackProps {
  config: ProjectConfig;
}

function retention(days: ProjectConfig["logRetentionDays"]): logs.RetentionDays {
  return days === 14 ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK;
}

export class FoundationStack extends Stack {
  readonly workerRepository: ecr.Repository;
  readonly workerLogGroup: logs.LogGroup;
  readonly jobsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    const { config, ...stackProps } = props;
    super(scope, id, stackProps);
    applyProjectTags(this, config);

    const prefix = `${config.projectName}-${config.environment}`;
    this.workerRepository = new ecr.Repository(this, "WorkerRepository", {
      repositoryName: `${prefix}-worker`,
      encryption: ecr.RepositoryEncryption.AES_256,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ description: "Retain only the three newest dev images", maxImageCount: 3 }],
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    this.workerLogGroup = new logs.LogGroup(this, "WorkerLogGroup", {
      logGroupName: `/aws/ecs/${prefix}/worker`,
      retention: retention(config.logRetentionDays),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.jobsTable = new dynamodb.Table(this, "JobsTable", {
      tableName: `${prefix}-jobs`,
      partitionKey: { name: "jobId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "WorkerRepositoryName", { value: this.workerRepository.repositoryName });
    new CfnOutput(this, "WorkerRepositoryUri", { value: this.workerRepository.repositoryUri });
    new CfnOutput(this, "WorkerLogGroupName", { value: this.workerLogGroup.logGroupName });
    new CfnOutput(this, "JobsTableName", { value: this.jobsTable.tableName });
  }
}

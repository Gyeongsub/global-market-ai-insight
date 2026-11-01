import { ArnFormat, Duration, RemovalPolicy, Stack, Token, type StackProps } from "aws-cdk-lib/core";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import type { Construct } from "constructs";
import { diagnosticQueryCatalog, projectLogGroups } from "../../services/operations/log_queries/src/query-catalog.js";
import { OPERATIONAL_FAILURE_METRICS } from "../../services/operations/metrics/src/error-metric-catalog.js";
import type { ProjectConfig } from "./config.js";
import { operationsAlarmName } from "./operations-alarm-catalog.js";
import { applyProjectTags } from "./tags.js";

export interface OperationsResources {
  controllerFunction: lambda.IFunction;
  httpApi: apigwv2.IHttpApi;
  apiAccessLogGroup: logs.ILogGroup;
  controllerLogGroup: logs.ILogGroup;
  workerLogGroup: logs.ILogGroup;
}

type OperationsResourceSource = OperationsResources | { resourceFactory: (scope: Stack) => OperationsResources };

export type OperationsStackProps = StackProps & OperationsResourceSource & {
  config: ProjectConfig;
  notificationsEnabled?: boolean;
  customMetricsEnabled?: boolean;
};

/** Opt-in observability draft; notifications need a separate cost acknowledgement. */
export class OperationsStack extends Stack {
  constructor(scope: Construct, id: string, props: OperationsStackProps) {
    const { config, notificationsEnabled = false, customMetricsEnabled = false, ...rest } = props;
    const stackProps = "resourceFactory" in rest
      ? (({ resourceFactory: _factory, ...options }) => options)(rest)
      : (({ controllerFunction: _controller, httpApi: _api, apiAccessLogGroup: _apiLogs, controllerLogGroup: _controllerLogs, workerLogGroup: _workerLogs, ...options }) => options)(rest);
    super(scope, id, stackProps);
    const { controllerFunction, httpApi, apiAccessLogGroup, controllerLogGroup, workerLogGroup } = "resourceFactory" in props
      ? props.resourceFactory(this)
      : props;
    applyProjectTags(this, config);

    const prefix = `${config.projectName}-${config.environment}`;
    const fiveMinutes = Duration.minutes(5);
    const errors = controllerFunction.metricErrors({ period: fiveMinutes, statistic: "Sum" });
    const throttles = controllerFunction.metricThrottles({ period: fiveMinutes, statistic: "Sum" });
    const serverErrors = httpApi.metricServerError({ period: fiveMinutes, statistic: "Sum" });
    const duration = controllerFunction.metricDuration({ period: fiveMinutes, statistic: "p95" });
    const requests = httpApi.metricCount({ period: fiveMinutes, statistic: "Sum" });

    const expectedGroups = projectLogGroups(config.projectName, config.environment);
    const actualGroups = {
      apiAccess: apiAccessLogGroup.logGroupName,
      controller: controllerLogGroup.logGroupName,
      worker: workerLogGroup.logGroupName,
    };
    // Keep the catalog's reviewed names and the actual stack dependencies tied
    // together. Cross-stack tokens resolve at deploy time; local literal names
    // are checked directly when available.
    for (const key of Object.keys(expectedGroups) as Array<keyof typeof expectedGroups>) {
      if (!Token.isUnresolved(actualGroups[key]) && actualGroups[key] !== expectedGroups[key]) {
        throw new Error(`Unexpected ${key} log group for operations queries.`);
      }
    }
    const summaries = diagnosticQueryCatalog(actualGroups).map(plan => new cloudwatch.LogQueryWidget({
      title: plan.purpose,
      logGroupNames: plan.logGroups,
      queryLines: plan.query.split("\n"),
      view: cloudwatch.LogQueryVisualizationType.TABLE,
      width: 8,
      height: 6,
    }));

    new cloudwatch.Dashboard(this, "OperationsDashboard", {
      dashboardName: `${prefix}-operations`,
      defaultInterval: Duration.minutes(15),
      widgets: [
        [new cloudwatch.GraphWidget({ title: "API requests and 5xx", left: [requests, serverErrors], width: 12 })],
        [new cloudwatch.GraphWidget({ title: "Controller errors and throttles", left: [errors, throttles], width: 12 })],
        [new cloudwatch.GraphWidget({ title: "Controller p95 duration (ms)", left: [duration], width: 12 })],
        summaries,
      ],
    });

    const notificationKey = notificationsEnabled
      ? new kms.Key(this, "AlarmNotificationKey", {
          alias: `alias/${prefix}-alarm-notifications`,
          description: "Opt-in key for CloudWatch alarm messages to the project SNS topic.",
          enableKeyRotation: true,
          removalPolicy: RemovalPolicy.DESTROY,
          pendingWindow: Duration.days(7),
        })
      : undefined;
    if (notificationKey) {
      notificationKey.addToResourcePolicy(new iam.PolicyStatement({
        sid: "AllowProjectCloudWatchAlarms",
        principals: [new iam.ServicePrincipal("cloudwatch.amazonaws.com")],
        actions: ["kms:Decrypt", "kms:GenerateDataKey*"],
        resources: ["*"],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: {
            "aws:SourceArn": this.formatArn({
              service: "cloudwatch",
              resource: "alarm",
              resourceName: `${prefix}-*`,
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            }),
          },
        },
      }));
    }
    const notificationTopic = notificationKey
      ? new sns.Topic(this, "AlarmNotificationTopic", {
          topicName: `${prefix}-alarms`,
          displayName: `${prefix} alarm notifications`,
          enforceSSL: true,
          masterKey: notificationKey,
        })
      : undefined;

    const attachNotification = (alarm: cloudwatch.Alarm) => {
      if (notificationTopic) alarm.addAlarmAction(new cloudwatchActions.SnsAction(notificationTopic));
    };

    for (const [name, metric] of [["ControllerErrors", errors], ["ControllerThrottles", throttles], ["ApiServerErrors", serverErrors]] as const) {
      const alarm = new cloudwatch.Alarm(this, name, {
        alarmName: operationsAlarmName(config, name),
        alarmDescription: notificationTopic
          ? "Opt-in operations alarm. Topic has no subscription in this stack."
          : "Local observability draft. No action or notification is configured.",
        metric,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        threshold: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        actionsEnabled: notificationTopic !== undefined,
      });
      attachNotification(alarm);
    }

    if (customMetricsEnabled) {
      const metricNamespace = `${config.projectName}/${config.environment}`;
      for (const definition of OPERATIONAL_FAILURE_METRICS) {
        const logGroup = definition.service === "controller" ? controllerLogGroup : workerLogGroup;
        new logs.MetricFilter(this, `${definition.suffix}MetricFilter`, {
          filterName: `${prefix}-${definition.suffix}`,
          logGroup,
          filterPattern: logs.FilterPattern.stringValue(`$.${definition.field}`, "=", definition.value),
          metricNamespace,
          metricName: definition.suffix,
          metricValue: "1",
          defaultValue: 0,
        });
        const metric = new cloudwatch.Metric({
          namespace: metricNamespace,
          metricName: definition.suffix,
          period: fiveMinutes,
          statistic: "Sum",
        });
        const alarm = new cloudwatch.Alarm(this, `${definition.suffix}Alarm`, {
          alarmName: operationsAlarmName(config, definition.suffix),
          alarmDescription: notificationTopic
            ? "Opt-in structured-log metric alarm. Topic has no subscription in this stack."
            : "Opt-in structured-log metric alarm. No action or notification is configured.",
          metric,
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          threshold: 2,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          actionsEnabled: notificationTopic !== undefined,
        });
        attachNotification(alarm);
      }
    }
  }
}

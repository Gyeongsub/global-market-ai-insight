import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpIamAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import type { ProjectConfig } from "./config.js";
import { applyProjectTags } from "./tags.js";

export interface ApiStackProps extends StackProps {
  config: ProjectConfig;
  controllerFunction: lambda.IFunction;
}

export class ApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi;
  readonly accessLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    const { config, controllerFunction, ...stackProps } = props;
    super(scope, id, stackProps);
    applyProjectTags(this, config);

    const prefix = `${config.projectName}-${config.environment}`;
    this.accessLogGroup = new logs.LogGroup(this, "ApiAccessLogGroup", {
      logGroupName: `/aws/apigateway/${prefix}-api-access`,
      retention: config.logRetentionDays === 14 ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${prefix}-api`,
      description: "Bounded asynchronous market-insight API",
      createDefaultStage: true,
      corsPreflight: {
        allowOrigins: ["http://127.0.0.1:4173", "http://localhost:4173"],
        allowHeaders: ["content-type", "idempotency-key"],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        maxAge: Duration.hours(1),
      },
    });

    const integration = new integrations.HttpLambdaIntegration("ControllerIntegration", controllerFunction, {
      payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
      timeout: Duration.seconds(15),
    });
    const authorizer = new HttpIamAuthorizer();
    this.httpApi.addRoutes({ path: "/v1/assets", methods: [apigwv2.HttpMethod.GET], integration, authorizer });
    this.httpApi.addRoutes({ path: "/v1/jobs", methods: [apigwv2.HttpMethod.POST], integration, authorizer });
    this.httpApi.addRoutes({ path: "/v1/jobs/{jobId}", methods: [apigwv2.HttpMethod.GET], integration, authorizer });
    this.httpApi.addRoutes({ path: "/v1/health", methods: [apigwv2.HttpMethod.GET], integration, authorizer });

    const stage = this.httpApi.defaultStage?.node.defaultChild as apigwv2.CfnStage | undefined;
    if (!stage) throw new Error("HTTP API default stage is required.");
    stage.defaultRouteSettings = {
      detailedMetricsEnabled: false,
      throttlingBurstLimit: 2,
      throttlingRateLimit: 1,
    };
    stage.accessLogSettings = {
      destinationArn: this.accessLogGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        responseLength: "$context.responseLength",
      }),
    };

    new CfnOutput(this, "HttpApiEndpoint", { value: this.httpApi.apiEndpoint });
  }
}

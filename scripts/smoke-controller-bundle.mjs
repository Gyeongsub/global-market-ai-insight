process.env.AWS_REGION = "ap-northeast-1";
process.env.JOBS_TABLE_NAME = "global-market-ai-insight-dev-jobs";
// Synthetic all-zero account. OPEN and disabled provider execution mean zero AWS calls.
process.env.WORKER_CLUSTER = "arn:aws:ecs:ap-northeast-1:000000000000:cluster/local-contract-cluster";
process.env.WORKER_TASK_DEFINITION = "arn:aws:ecs:ap-northeast-1:000000000000:task-definition/local-contract-task:1";
process.env.WORKER_SUBNET_IDS = "subnet-0123456789abcdef0";
process.env.WORKER_SECURITY_GROUP_ID = "sg-0123456789abcdef0";
process.env.JOB_TIMEOUT_SECONDS = "90";
process.env.JOB_TTL_SECONDS = "604800";
process.env.MAX_JOBS_PER_MINUTE = "2";
process.env.MAX_ACTIVE_JOBS = "2";
// OPEN is a local kill switch and short-circuits the persistent AWS read.
process.env.CIRCUIT_STATE = "OPEN";
process.env.API_AUTH_MODE = "AWS_IAM";
process.env.PRIVATE_OWNER_USER_ARN = "arn:aws:iam::000000000000:user/local-owner";
process.env.ENABLE_PROVIDER_BACKED_JOBS = "false";
process.env.ENABLE_LIVE_RESULT_DISPLAY = "false";

const { handler } = await import(new URL("../services/controller/bundle/main.mjs", import.meta.url));
const denied = await handler({ routeKey: "GET /v1/health", requestContext: { requestId: "local-denial" } });
if (denied.statusCode !== 403 || JSON.parse(denied.body).error?.code !== "ACCESS_DENIED") throw new Error("Controller bundle owner denial failed.");
const result = await handler({ version: "2.0", routeKey: "GET /v1/health", requestContext: {
  requestId: "local-smoke", accountId: "000000000000", authorizer: { iam: {
    userArn: process.env.PRIVATE_OWNER_USER_ARN, accountId: "000000000000",
  } },
} });
if (result.statusCode !== 200) throw new Error("Controller bundle health smoke failed.");
const body = JSON.parse(result.body);
if (body.status !== "ok" || body.circuit !== "OPEN" || body.jobCreationEnabled !== false) throw new Error("Controller bundle returned an invalid health response.");
console.log(JSON.stringify({ controllerBundleSmoke: "passed", awsCalls: 0, taskLaunches: 0 }));

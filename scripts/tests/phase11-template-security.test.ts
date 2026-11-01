import assert from "node:assert/strict";
import test from "node:test";
import { inspectAlarmCircuitSecurity } from "../phase11-drill-preflight.js";

const prefix = "global-market-ai-insight-dev";
const account = ["123456", "789012"].join("");
const names = ["ControllerErrors", "ControllerThrottles", "ApiServerErrors", "TaskLaunchFailures", "ProviderFailures", "ModelFailures"].map(suffix => `${prefix}-${suffix}`);
function template(): any {
  return { Resources: {
    Role: { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Action: "sts:AssumeRole", Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" } }] } } },
    Logs: { Type: "AWS::Logs::LogGroup", Properties: { LogGroupName: `/aws/lambda/${prefix}-alarm-circuit`, RetentionInDays: 7 } },
    Policy: { Type: "AWS::IAM::Policy", Properties: { Roles: [{ Ref: "Role" }], PolicyDocument: { Version: "2012-10-17", Statement: [
      { Action: ["dynamodb:GetItem", "dynamodb:UpdateItem"], Effect: "Allow", Resource: { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:dynamodb:ap-northeast-1:${account}:table/${prefix}-jobs`]] },
        Condition: { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["control_circuit"] }, Null: { "dynamodb:LeadingKeys": "false" } } },
      { Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Effect: "Allow", Resource: { "Fn::Join": ["", [{ "Fn::GetAtt": ["Logs", "Arn"] }, ":*"]] } },
    ] } } },
    Function: { Type: "AWS::Lambda::Function", Properties: { FunctionName: `${prefix}-alarm-circuit`, Role: { "Fn::GetAtt": ["Role", "Arn"] }, Runtime: "nodejs22.x", Architectures: ["x86_64"], MemorySize: 128, Timeout: 5, ReservedConcurrentExecutions: 1,
      Environment: { Variables: { JOBS_TABLE_NAME: `${prefix}-jobs`, EXPECTED_ACCOUNT_ID: account, ALLOWED_ALARM_NAMES_JSON: JSON.stringify(names) } } } },
    Invoke: { Type: "AWS::Lambda::EventInvokeConfig", Properties: { FunctionName: { Ref: "Function" }, Qualifier: "$LATEST", MaximumRetryAttempts: 1, MaximumEventAgeInSeconds: 60 } },
    Rule: { Type: "AWS::Events::Rule", Properties: { Name: `${prefix}-alarm-circuit`, State: "ENABLED", EventPattern: { source: ["aws.cloudwatch"], "detail-type": ["CloudWatch Alarm State Change"], detail: { alarmName: [...names], state: { value: ["ALARM"] } } },
      Targets: [{ Arn: { "Fn::GetAtt": ["Function", "Arn"] }, Id: "Target0", RetryPolicy: { MaximumEventAgeInSeconds: 60, MaximumRetryAttempts: 1 } }] } },
    Permission: { Type: "AWS::Lambda::Permission", Properties: { Action: "lambda:InvokeFunction", FunctionName: { "Fn::GetAtt": ["Function", "Arn"] }, Principal: "events.amazonaws.com", SourceArn: { "Fn::GetAtt": ["Rule", "Arn"] } } },
  } };
}

test("local template security accepts only the exact role, table item, group and invocation links", () => {
  const report = inspectAlarmCircuitSecurity(template());
  assert.equal(report.exactRoleTrustAndAttachments, true);
  assert.equal(report.invocationScopedToExactRule, true);
  assert.equal(report.logStreamWildcardScopedToNewGroup, true);
  assert.equal(JSON.stringify(report).includes(account), false);
});

test("private account-specific inspection binds both table permission and handler identity to the verified account", () => {
  const verified = ["987654", "321098"].join("");
  const source = template();
  source.Resources.Policy.Properties.PolicyDocument.Statement[0].Resource["Fn::Join"][1][2] = `:dynamodb:ap-northeast-1:${verified}:table/${prefix}-jobs`;
  source.Resources.Function.Properties.Environment.Variables.EXPECTED_ACCOUNT_ID = verified;
  const report = inspectAlarmCircuitSecurity(source, verified);
  assert.equal(JSON.stringify(report).includes(verified), false);
  assert.throws(() => inspectAlarmCircuitSecurity(source, account));
  source.Resources.Function.Properties.Environment.Variables.EXPECTED_ACCOUNT_ID = account;
  assert.throws(() => inspectAlarmCircuitSecurity(source, verified));
  for (const invalid of ["", "0".repeat(12), "PRIVATE_VALUE", "1".repeat(13)]) {
    assert.throws(() => inspectAlarmCircuitSecurity(template(), invalid));
  }
});

test("unreserved temporary drill requires explicit inspection mode and no disguised concurrency value", () => {
  const source = template();
  delete source.Resources.Function.Properties.ReservedConcurrentExecutions;
  assert.throws(() => inspectAlarmCircuitSecurity(source));
  const report = inspectAlarmCircuitSecurity(source, account, true) as any;
  assert.equal(report.lambda.reservedConcurrency, null);
  assert.equal(report.lambda.accountSharedConcurrencyDrill, true);
  for (const value of [0, 1, 10, null]) {
    source.Resources.Function.Properties.ReservedConcurrentExecutions = value;
    assert.throws(() => inspectAlarmCircuitSecurity(source, account, true));
  }
});

test("wildcards hidden in arrays or intrinsics and foreign table/log references are rejected", () => {
  for (const value of ["*", ["*"], { "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, ":dynamodb:*:*:table/*"]] },
    { "Fn::ImportValue": "another-foundation:ExportsOutputFnGetAttJobsTable1970BC16ArnC40C1624" }]) {
    const source = template(); source.Resources.Policy.Properties.PolicyDocument.Statement[0].Resource = value;
    assert.throws(() => inspectAlarmCircuitSecurity(source));
  }
  const source = template(); source.Resources.Policy.Properties.PolicyDocument.Statement[1].Resource = { "Fn::Join": ["", [{ "Fn::GetAtt": ["OtherLogs", "Arn"] }, ":*"]] };
  assert.throws(() => inspectAlarmCircuitSecurity(source));
});

test("missing Null condition, extra leading keys or broader key operators cannot pass by text matching", () => {
  for (const value of [{ "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["control_circuit"] } },
    { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["control_circuit", "control_slot_0"] }, Null: { "dynamodb:LeadingKeys": "false" } },
    { "ForAnyValue:StringLike": { "dynamodb:LeadingKeys": ["control_circuit*"] }, Null: { "dynamodb:LeadingKeys": "false" } }]) {
    const source = template(); source.Resources.Policy.Properties.PolicyDocument.Statement[0].Condition = value;
    assert.throws(() => inspectAlarmCircuitSecurity(source));
  }
});

test("broader role trust, managed policies and unreviewed attachments fail closed", () => {
  for (const change of [
    (source: any) => { source.Resources.Role.Properties.AssumeRolePolicyDocument.Statement[0].Principal = { AWS: "*" }; },
    (source: any) => { source.Resources.Role.Properties.ManagedPolicyArns = ["AdministratorAccess"]; },
    (source: any) => { source.Resources.Role.Properties.Policies = [{}]; },
    (source: any) => { source.Resources.Policy.Properties.Users = ["unrelated"]; },
    (source: any) => { source.Resources.Policy.Properties.Roles.push({ Ref: "AnotherRole" }); },
    (source: any) => { source.Resources.Function.Properties.Role = { "Fn::GetAtt": ["AnotherRole", "Arn"] }; },
  ]) { const source = template(); change(source); assert.throws(() => inspectAlarmCircuitSecurity(source)); }
});

test("foreign or broadened rule invocation cannot hide behind a valid retry limit", () => {
  for (const change of [
    (source: any) => { source.Resources.Permission.Properties.SourceArn = "*"; },
    (source: any) => { source.Resources.Permission.Properties.Principal = "*"; },
    (source: any) => { source.Resources.Rule.Properties.Targets[0].Arn = { "Fn::GetAtt": ["AnotherFunction", "Arn"] }; },
    (source: any) => { source.Resources.Rule.Properties.EventPattern.detail.alarmName[0] = "another-ControllerErrors"; },
    (source: any) => { source.Resources.Function.Properties.Environment.Variables.ALLOWED_ALARM_NAMES_JSON = JSON.stringify([...names.slice(1), "another-ControllerErrors"]); },
  ]) { const source = template(); change(source); assert.throws(() => inspectAlarmCircuitSecurity(source)); }
});

test("a controlled cross-stack import is accepted but only with the exact jobs table ARN/name shapes", () => {
  const source = template();
  source.Resources.Policy.Properties.PolicyDocument.Statement[0].Resource = { "Fn::ImportValue": `${prefix}-foundation:ExportsOutputFnGetAttJobsTable1970BC16ArnC40C1624` };
  source.Resources.Function.Properties.Environment.Variables.JOBS_TABLE_NAME = { "Fn::ImportValue": `${prefix}-foundation:ExportsOutputRefJobsTable1970BC16EDB4A824` };
  assert.equal(inspectAlarmCircuitSecurity(source).dynamodbLeadingKey, "control_circuit");
  source.Resources.Function.Properties.Environment.Variables.JOBS_TABLE_NAME = { "Fn::ImportValue": `${prefix}-foundation:OtherTable` };
  assert.throws(() => inspectAlarmCircuitSecurity(source));
});

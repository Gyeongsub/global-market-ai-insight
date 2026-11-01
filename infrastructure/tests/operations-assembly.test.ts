import assert from "node:assert/strict";
import test from "node:test";
import { buildPhase11LocalApprovalPacket } from "../../scripts/phase11-drill-preflight.js";

test("credential-free approved operations plan synthesizes only the intended five-stack assembly", () => {
  const packet = buildPhase11LocalApprovalPacket() as {
    awsCalls: number;
    cloudMutations: number;
    credentialsLoaded: boolean;
    intendedTargetStacks: string[];
    deploymentOrder: string[];
    teardownOrder: string[];
    resourceInventory: { operations: Record<string, number>; alarmCircuit: Record<string, number> };
    alarmCircuitSecurity: {
      allowedIamActions: string[];
      wildcardResources: boolean;
      ecsRunTaskAllowed: boolean;
      passRoleAllowed: boolean;
      environmentSecretValues: boolean;
      lambda: { timeoutSeconds: number; reservedConcurrency: number; asyncRetryAttempts: number };
      eventRule: { alarmNames: number; state: string; targetRetryAttempts: number };
    };
    teardownSafety: {
      retainedOrSnapshottedResources: number;
      explicitDeleteResources: number;
      alarmCircuitLogGroupDeletionPolicy: string;
      alarmCircuitLogGroupUpdateReplacePolicy: string;
    };
    controlledSignalStage: { internalJobsEnabled: boolean; syntheticLogEvents: number; safeEndState: string };
    crossStackImports: { distinctImports: number; unresolvedImports: number; liveExportInventoryComplete: boolean; missingImports: number | null; readyForExclusiveTargetDiff: boolean; readyForDeployment: boolean };
  };
  assert.equal(packet.awsCalls, 0);
  assert.equal(packet.cloudMutations, 0);
  assert.equal(packet.credentialsLoaded, false);
  assert.deepEqual(packet.intendedTargetStacks, [
    "global-market-ai-insight-dev-operations",
    "global-market-ai-insight-dev-alarm-circuit",
  ]);
  assert.deepEqual(packet.deploymentOrder, [
    "global-market-ai-insight-dev-operations",
    "global-market-ai-insight-dev-alarm-circuit",
  ]);
  assert.deepEqual(packet.teardownOrder, [
    "global-market-ai-insight-dev-alarm-circuit",
    "global-market-ai-insight-dev-operations",
  ]);
  assert.deepEqual(packet.resourceInventory.operations, {
    "AWS::CloudWatch::Alarm": 6,
    "AWS::CloudWatch::Dashboard": 1,
    "AWS::Logs::MetricFilter": 3,
  });
  assert.deepEqual(packet.resourceInventory.alarmCircuit, {
    "AWS::Events::Rule": 1,
    "AWS::IAM::Policy": 1,
    "AWS::IAM::Role": 1,
    "AWS::Lambda::EventInvokeConfig": 1,
    "AWS::Lambda::Function": 1,
    "AWS::Lambda::Permission": 1,
    "AWS::Logs::LogGroup": 1,
  });
  assert.deepEqual(packet.alarmCircuitSecurity.allowedIamActions, [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
  ]);
  assert.equal(packet.alarmCircuitSecurity.wildcardResources, false);
  assert.equal(packet.alarmCircuitSecurity.ecsRunTaskAllowed, false);
  assert.equal(packet.alarmCircuitSecurity.passRoleAllowed, false);
  assert.equal(packet.alarmCircuitSecurity.environmentSecretValues, false);
  assert.equal(packet.alarmCircuitSecurity.lambda.timeoutSeconds, 5);
  assert.equal(packet.alarmCircuitSecurity.lambda.reservedConcurrency, 1);
  assert.equal(packet.alarmCircuitSecurity.lambda.asyncRetryAttempts, 1);
  assert.equal(packet.alarmCircuitSecurity.eventRule.alarmNames, 6);
  assert.equal(packet.alarmCircuitSecurity.eventRule.state, "ALARM");
  assert.equal(packet.alarmCircuitSecurity.eventRule.targetRetryAttempts, 1);
  assert.equal(packet.teardownSafety.retainedOrSnapshottedResources, 0);
  assert.equal(packet.teardownSafety.explicitDeleteResources, 1);
  assert.equal(packet.teardownSafety.alarmCircuitLogGroupDeletionPolicy, "Delete");
  assert.equal(packet.teardownSafety.alarmCircuitLogGroupUpdateReplacePolicy, "Delete");
  assert.equal(packet.controlledSignalStage.internalJobsEnabled, false);
  assert.equal(packet.controlledSignalStage.syntheticLogEvents, 2);
  assert.equal(packet.controlledSignalStage.safeEndState, "OPEN");
  assert.ok(packet.crossStackImports.distinctImports > 0);
  assert.equal(packet.crossStackImports.unresolvedImports, 0);
  assert.equal(packet.crossStackImports.liveExportInventoryComplete, false);
  assert.equal(packet.crossStackImports.missingImports, null);
  assert.equal(packet.crossStackImports.readyForExclusiveTargetDiff, false);
  assert.equal(packet.crossStackImports.readyForDeployment, false);
});

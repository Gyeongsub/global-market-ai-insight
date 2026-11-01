import { SYNTHETIC_LAB_ROLE_NAME, syntheticRoleTrust, syntheticSessionPolicy, validateSyntheticOwner } from "./synthetic-lab-policy.js";

const fail = () => Error("SYNTHETIC_ALTERNATE_PRINCIPAL_INVALID");

/** Pure, non-executable candidate. The existing model role cannot be its own
 * trust probe: its explicit non-model denial would mask trust-policy behavior.
 * A separately reviewed temporary role may only attempt the exact target role.
 * Neither this builder nor its plan creates roles, assumes them or calls AWS. */
export function syntheticAlternatePrincipalSpec(input: {
  account: unknown; ownerArn: unknown; nonce: unknown; startedAt: unknown;
}) {
  try {
    const owner = validateSyntheticOwner(input.ownerArn, input.account);
    if (typeof input.nonce !== "string" || !/^[a-f0-9]{32}$/.test(input.nonce)) throw fail();
    // Reuse canonical, bounded ISO-window validation, not the model permissions.
    syntheticSessionPolicy(input.startedAt);
    const startedAt = input.startedAt as string;
    const expiresAt = new Date(Date.parse(startedAt) + 300000).toISOString();
    const roleName = `gmai-synthetic-principal-${input.nonce}`;
    const roleArn = `arn:aws:iam::${input.account}:role/${roleName}`;
    const targetRoleArn = `arn:aws:iam::${input.account}:role/${SYNTHETIC_LAB_ROLE_NAME}`;
    const baseTrust = syntheticRoleTrust(owner, input.account);
    const trust = { ...baseTrust, Statement: baseTrust.Statement.map(statement => ({ ...statement,
      Condition: { ...statement.Condition,
        DateGreaterThanEquals: { "aws:CurrentTime": startedAt },
        DateLessThan: { "aws:CurrentTime": expiresAt },
      },
    })) };
    const permissions = { Version: "2012-10-17", Statement: [
      { Sid: "OnlyExactTargetAssumption", Effect: "Allow", Action: "sts:AssumeRole", Resource: targetRoleArn },
      { Sid: "DenyOtherActions", Effect: "Deny", NotAction: "sts:AssumeRole", Resource: "*" },
      { Sid: "DenyOtherTargets", Effect: "Deny", Action: "sts:AssumeRole", NotResource: targetRoleArn },
      { Sid: "DenyOtherRegions", Effect: "Deny", Action: "*", Resource: "*",
        Condition: { StringNotEquals: { "aws:RequestedRegion": "ap-northeast-1" } } },
      { Sid: "DenyInsecureTransport", Effect: "Deny", Action: "*", Resource: "*",
        Condition: { BoolIfExists: { "aws:SecureTransport": "false" } } },
      { Sid: "DenyBeforeWindow", Effect: "Deny", Action: "*", Resource: "*",
        Condition: { DateLessThan: { "aws:CurrentTime": startedAt } } },
      { Sid: "DenyAtOrAfterWindow", Effect: "Deny", Action: "*", Resource: "*",
        Condition: { DateGreaterThanEquals: { "aws:CurrentTime": expiresAt } } },
    ] };
    const denyAll = { Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: "*", Resource: "*" }] };
    const policy = JSON.stringify(permissions);
    if (policy.length > 2048 || roleName.length > 64) throw fail();
    return {
      roleName, roleArn, targetRoleArn, startedAt, expiresAt, trust, permissions,
      maxSessionDuration: 3600,
      tags: [{ Key: "Project", Value: "global-market-ai-insight" },
        { Key: "Purpose", Value: "alternate-principal-denial" }, { Key: "ProbeId", Value: input.nonce }],
      sourceSessionRequest: { RoleArn: roleArn, RoleSessionName: `gmai-synthetic-${input.nonce}`,
        DurationSeconds: 900, Policy: policy },
      // Even unexpected assumption success must yield no usable model access.
      // The future adapter must project credentials out and never use them.
      targetSessionRequest: { RoleArn: targetRoleArn, RoleSessionName: `gmai-synthetic-${input.nonce}`,
        DurationSeconds: 900, Policy: JSON.stringify(denyAll) },
    };
  } catch { throw fail(); }
}

export function syntheticAlternatePrincipalPlan() {
  return { mode: "local-candidate", awsCalls: 0, deploymentExecutable: false,
    proposedAdditionalTemporaryRolesMax: 1, totalTemporaryRolesIncludingTargetMax: 2,
    proposedSourceAssumptionsMax: 1, proposedTargetAssumptionsMax: 1,
    targetSuccessPolicy: "explicit-deny-all", returnedTargetCredentialsUsed: false,
    inferenceCalls: 0, providerCalls: 0, computeCalls: 0,
    existingTargetTrustModified: false, liveForeignPrincipalDenialVerified: false,
    sourceAndTargetIndependentCleanupRequired: true };
}

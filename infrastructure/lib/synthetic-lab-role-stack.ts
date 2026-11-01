import { CfnRole } from "aws-cdk-lib/aws-iam";
import { CfnDeletionPolicy, Stack, type StackProps } from "aws-cdk-lib/core";
import type { Construct } from "constructs";
import { SYNTHETIC_LAB_ROLE_NAME, syntheticModelPolicy, syntheticRoleTrust, validateSyntheticOwner } from "../../shared/security/synthetic-lab-policy.js";

interface SyntheticLabRoleProps extends StackProps { ownerUserArn: string; }

/** Isolated, NOT connected to the default CDK app or current lab runner.
 * The separate bounded rehearsal requires source/cloud gates and teardown. */
export class SyntheticLabRoleStack extends Stack {
  constructor(scope: Construct, id: string, props: SyntheticLabRoleProps) {
    const owner = validateSyntheticOwner(props.ownerUserArn, props.env?.account);
    if (props.env?.region !== "ap-northeast-1") throw Error("SYNTHETIC_POLICY_REGION_INVALID");
    super(scope, id, props);
    const role = new CfnRole(this, "SyntheticLabRole", {
      roleName: SYNTHETIC_LAB_ROLE_NAME,
      description: "Private synthetic learning: Tokyo Nova Lite only; not a deployment or provider role",
      maxSessionDuration: 3600,
      assumeRolePolicyDocument: syntheticRoleTrust(owner, props.env!.account!),
      policies: [{ policyName: "TokyoNovaLiteOnly", policyDocument: syntheticModelPolicy() }],
      tags: [
        { key: "Project", value: "global-market-ai-insight" }, { key: "Environment", value: "dev" },
        { key: "Owner", value: "portfolio-developer" }, { key: "ManagedBy", value: "CDK" },
        { key: "Purpose", value: "synthetic-bedrock-learning" },
      ],
    });
    role.cfnOptions.deletionPolicy = CfnDeletionPolicy.DELETE;
    role.cfnOptions.updateReplacePolicy = CfnDeletionPolicy.DELETE;
  }
}

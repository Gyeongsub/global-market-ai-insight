import { Tags } from "aws-cdk-lib/core";
import type { IConstruct } from "constructs";
import type { ProjectConfig } from "./config.js";

export function applyProjectTags(scope: IConstruct, config: ProjectConfig): void {
  const tags = {
    Project: config.projectName,
    Environment: config.environment,
    Owner: config.owner,
    ManagedBy: "CDK",
    Purpose: "portfolio-learning",
  };
  for (const [key, value] of Object.entries(tags)) Tags.of(scope).add(key, value);
}

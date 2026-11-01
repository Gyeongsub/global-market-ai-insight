# IAM least-privilege validation — 2026-08-30

## Scope

The deployed execution, worker, and controller roles were evaluated with IAM
Policy Simulator. This was a read-only policy evaluation: no denied action was
actually invoked, no role or policy changed, and no billable workload ran.

## Results

All 17 expected decisions matched.

| Role | Capability | Expected result |
|---|---|---|
| Worker | exact jobs-table `GetItem` / `UpdateItem` | allowed |
| Worker | exact Nova Lite `InvokeModel` | allowed |
| Worker | `ecs:RunTask`, `iam:PassRole`, provider parameter read | implicit deny |
| Controller | exact table `PutItem` | allowed |
| Controller | exact task definition on the exact cluster | allowed |
| Controller | same task definition on an unapproved cluster | implicit deny |
| Controller | pass exact execution/worker roles to ECS tasks | allowed |
| Controller | pass role without `iam:PassedToService` context | implicit deny |
| Controller | provider parameter or Bedrock access | implicit deny |
| Execution | exact provider parameter `GetParameters` | allowed |
| Execution | jobs-table or Bedrock access | implicit deny |

The initial controller `RunTask` simulation without request context returned
implicit deny and reported the missing `ecs:cluster` key. Supplying the exact
cluster context allowed the action; supplying a different cluster continued to
deny it. This confirms that the cluster condition is active rather than merely
present in the policy document.

## Evidence boundary

Policy Simulator evaluates the supplied identity policies and context. It does
not by itself prove every organization SCP, resource policy, or runtime network
path. The previously completed bounded Fargate acceptance provides complementary
runtime evidence that ECR pull, Parameter Store injection, and exact DynamoDB
access work with the deployed roles. Together, these checks satisfy the Phase 5
required-workflow and negative-capability criteria without calling a denied API.

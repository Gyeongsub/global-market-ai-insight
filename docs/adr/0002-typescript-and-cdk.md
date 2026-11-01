# ADR 0002: TypeScript workspace and AWS CDK

- Status: Accepted
- Date: 2026-08-08

## Decision

Use TypeScript/Node.js for frontend, controller, worker, operations and AWS CDK. Use React/Vite for a static SPA, a pnpm workspace and shared machine-readable contracts.

## Why

A single type system reduces contract drift across the browser, Lambda and container. CDK allows IAM and architecture assertions in the same language while keeping generated CloudFormation reviewable.

## Constraints

- Domain modules cannot depend directly on AWS SDK clients.
- AWS adapters are added after account guardrails and region checks.
- The frontend remains a static export for S3/CloudFront.
- CDK is the only IaC tool; console/CLI may be used for learning and verification, not as undocumented final state.

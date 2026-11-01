# ADR 0006: Bundle the modular Bedrock Runtime SDK into the one-shot worker

- Status: Accepted
- Date: 2026-08-22

## Context

The distroless worker image previously copied TypeScript compiler output without `node_modules`. A production Bedrock transport therefore could not import the AWS SDK at runtime. Copying the repository's complete dependency tree would also include build and infrastructure packages that the one-shot process does not need.

The application must keep one analysis request to one model attempt unless a later, explicitly cost-reviewed retry policy is approved.

## Decision

- Use the modular `@aws-sdk/client-bedrock-runtime` package, currently pinned with the DynamoDB client to `3.1116.0`.
- Import only `BedrockRuntimeClient` and `ConverseCommand`.
- Configure `maxAttempts: 1`; do not embed credentials and rely on the ECS worker task role provider chain.
- Bundle the worker and SDK into one Node.js 22 ESM file with pinned `esbuild` `0.28.1`.
- Copy only the bundle, third-party notice, and upstream Apache-2.0 license into the distroless runtime image.
- Preserve the adapter's timeout, token boundaries, forced tool-use validation, and sanitized errors above the SDK transport.

## Consequences

- The runtime contains no package manager, build toolchain, source tree, or general repository `node_modules` directory.
- After adding the DynamoDB repository, the current bundle is approximately 1.47 MB before container-layer compression.
- AWS SDK default credentials are resolved only when the production transport is used; local contract tests inject a fake sender and make no AWS request.
- Any SDK upgrade changes the bundle and must repeat version, license, Node compatibility, vulnerability, size, and regression review.
- Retry behavior remains deliberately conservative. A future retry requires a separate cost and duplicate-work analysis.

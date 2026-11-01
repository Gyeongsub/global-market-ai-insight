# Local worker image evidence — 2026-08-29

## Build

- Local tag: `gmai-worker:pre-ecr-20260829`
- Platform: `linux/amd64`
- Image size: `54,833,510` bytes
- Image ID: recorded locally only; the immutable ECR digest will be recorded after an approved push
- Build inputs: digest-pinned Node.js and distroless base images, frozen `pnpm` lockfile
- Build context exclusions: `.git`, `.env*`, dependency caches, frontend build output, logs, and docs

## Runtime smoke

The QLD fixture one-shot operation reached `SUCCEEDED` under all of the following controls:

- user `65532:65532`
- `--network none`
- `--read-only`
- non-executable 16 MiB temporary filesystem
- all Linux capabilities dropped
- no-new-privileges
- 0.25 CPU, 512 MiB memory, and 64 PID limits

No AWS, Twelve Data, or Bedrock call was made. No credential was passed to the build or container.

## ECR pre-push gate

- Project repository exists and currently contains zero images.
- Registry scanning type is `BASIC`, not Amazon Inspector enhanced scanning.
- Repository settings remain immutable, AES-256 encrypted, scan-on-push, and latest-three-image retention.
- ECR push is a separate AWS mutation and storage-cost gate requiring explicit user approval.

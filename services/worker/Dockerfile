# Node.js v22.23.4 security release; fixed linux/amd64 build manifest.
FROM node:22.23.4-bookworm-slim@sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09 AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.16.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.services.json ./
COPY frontend/package.json ./frontend/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY scripts/build-worker-bundle.mjs ./scripts/build-worker-bundle.mjs
COPY scripts/backend-bundle-build.mjs ./scripts/backend-bundle-build.mjs
COPY services ./services
COPY shared ./shared

RUN pnpm exec tsc -p services/worker/tsconfig.build.json
RUN node scripts/build-worker-bundle.mjs

# The runtime contains Node.js and its required libraries only: no shell,
# package manager, or build toolchain. The nonroot tag resolves to uid 65532.
# 2026-10-22: Node 22.23.4 + Debian CA 20250419+deb13u1 (DSA-6572-1).
# The reviewed base retains Node's bundled default; active trust is tested too.
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:eed5cbf9fcdb7f97de1fb39adde1972efa57df1085c0c76a5ea17c7c27ff8f6c AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=65532:65532 /workspace/services/worker/bundle ./

USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node", "main.mjs"]

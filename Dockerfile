# ── Build stage ──────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /build

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy package.json files for dependency installation
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/plugin/package.json packages/plugin/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/ packages/

# Build client (produces packages/client/dist/)
RUN pnpm --filter @collab/client build

# Build server (produces packages/server/dist/)
RUN pnpm --filter @collab/server build

# ── Production stage ─────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/plugin/package.json packages/plugin/

# Install production deps only
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Copy built artifacts
COPY --from=builder /build/packages/server/dist/ packages/server/dist/
COPY --from=builder /build/packages/client/dist/ packages/client/dist/

# Create data directory
RUN mkdir -p /app/data/uploads

EXPOSE 4900

ENV NODE_ENV=production
ENV PORT=4900
ENV DATABASE_PATH=/app/data/collab.db
ENV UPLOAD_DIR=/app/data/uploads

CMD ["node", "packages/server/dist/index.js"]

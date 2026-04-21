# ── Build stage ──────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /build

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy package.json files for dependency installation (plugin excluded — built separately for OpenClaw)
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install dependencies (server + client only)
RUN pnpm install --frozen-lockfile --filter @collab/server --filter @collab/client --filter collab || pnpm install --filter @collab/server --filter @collab/client --filter collab

# Copy source code
COPY packages/ packages/

# Build client (produces packages/client/dist/)
RUN pnpm --filter @collab/client build

# Build server (produces packages/server/dist/)
RUN pnpm --filter @collab/server build

# ── Production stage ─────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install production deps only
RUN pnpm install --prod --frozen-lockfile --filter @collab/server --filter collab || pnpm install --prod --filter @collab/server --filter collab

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

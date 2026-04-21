# ── Build stage ──────────────────────────────────────────
ARG BASE_TAG=latest
FROM harbor.coretrek.cn/library/collab-base:${BASE_TAG} AS builder
WORKDIR /build

COPY packages/ packages/

RUN pnpm --filter @collab/client build
RUN pnpm --filter @collab/server build

# ── Production stage ─────────────────────────────────────
ARG BASE_TAG=latest
FROM harbor.coretrek.cn/library/collab-base:${BASE_TAG}
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

RUN pnpm install --prod --frozen-lockfile --filter @collab/server --filter collab || pnpm install --prod --filter @collab/server --filter collab

COPY --from=builder /build/packages/server/dist/ packages/server/dist/
COPY --from=builder /build/packages/client/dist/ packages/client/dist/

RUN mkdir -p /app/data/uploads

EXPOSE 4900

ENV NODE_ENV=production
ENV PORT=4900
ENV DATABASE_PATH=/app/data/collab.db
ENV UPLOAD_DIR=/app/data/uploads

CMD ["node", "packages/server/dist/index.js"]

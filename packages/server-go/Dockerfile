# syntax=docker/dockerfile:1.7
# Build context = monorepo root (e.g. docker build -f packages/server-go/Dockerfile .)

FROM node:22-bookworm AS client-builder
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/client/package.json packages/client/package.json
RUN npm ci
COPY packages/client packages/client
RUN npm run --workspace packages/client build

FROM golang:1.22-bookworm AS go-builder
WORKDIR /src/packages/server-go
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev sqlite3 libsqlite3-dev \
  && rm -rf /var/lib/apt/lists/*
COPY packages/server-go/go.mod packages/server-go/go.sum ./
RUN go mod download
COPY packages/server-go ./
RUN CGO_ENABLED=1 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/collab ./cmd/collab

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates sqlite3 libsqlite3-0 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -r -u 10001 -g root collab
WORKDIR /app
COPY --from=go-builder /out/collab /app/collab
COPY --from=client-builder /src/packages/client/dist /app/client/dist
RUN mkdir -p /app/data/uploads /app/data/workspaces && chown -R 10001:0 /app/data
USER 10001
ENV HOST=0.0.0.0 PORT=4900 DATABASE_PATH=/app/data/collab.db UPLOAD_DIR=/app/data/uploads WORKSPACE_DIR=/app/data/workspaces CLIENT_DIST=/app/client/dist NODE_ENV=production
EXPOSE 4900
ENTRYPOINT ["/app/collab"]

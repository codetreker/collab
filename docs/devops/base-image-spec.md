# 基础镜像自动构建方案

## 目标

预装系统依赖 + node_modules 到基础镜像，日常 CI 只装 app 代码，加速 pipeline。

## 方案

### Dockerfile.base

基于 `node:22-slim`，预装：
- 系统依赖：python3 + make + g++（native modules 编译）
- pnpm（corepack）
- 项目 node_modules（pnpm install）

文件列表：`Dockerfile.base`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/server/package.json`, `packages/client/package.json`

### Tag 策略

对影响基础镜像的文件算 SHA256 hash，取前 8 字符作为 tag：
- `collab-base:<hash8>`
- 影响文件：`Dockerfile.base` + `pnpm-lock.yaml`（这两个变了才需要重建）

### Pipeline 流程

```
1. base_hash = sha256sum(Dockerfile.base, pnpm-lock.yaml)[:8]
2. docker pull collab-base:<base_hash>
   - 成功 → 跳过 base build
   - 失败 → docker build -f Dockerfile.base → push collab-base:<base_hash>
3. docker build --build-arg BASE_TAG=<base_hash> → push collab:<timestamp>
```

### Dockerfile 改造

**Dockerfile.base**（新建）:
```dockerfile
FROM node:22-slim
WORKDIR /build

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all deps (dev + prod, for build stage)
RUN pnpm install --frozen-lockfile --filter @collab/server --filter @collab/client --filter collab || pnpm install --filter @collab/server --filter @collab/client --filter collab
```

**Dockerfile**（改造）:
```dockerfile
# ── Build stage ──
ARG BASE_TAG=latest
FROM harbor.codetrek.cn/library/collab-base:${BASE_TAG} AS builder
WORKDIR /build

COPY packages/ packages/
RUN pnpm --filter @collab/client build
RUN pnpm --filter @collab/server build

# ── Production stage ──
ARG BASE_TAG=latest
FROM harbor.codetrek.cn/library/collab-base:${BASE_TAG}
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
```

### deploy.yml 改造

在 `deploy-staging` job 里，`Build and push` step 前加：

```yaml
- name: Build base image if needed
  run: |
    BASE_HASH=$(cat Dockerfile.base pnpm-lock.yaml | sha256sum | cut -c1-8)
    echo "base_hash=$BASE_HASH" >> "$GITHUB_OUTPUT"
    if docker pull ${{ env.REGISTRY }}/library/collab-base:${BASE_HASH} 2>/dev/null; then
      echo "✅ Base image exists, skipping build"
    else
      echo "🔨 Building base image..."
      docker build -f Dockerfile.base \
        -t ${{ env.REGISTRY }}/library/collab-base:${BASE_HASH} .
      docker push ${{ env.REGISTRY }}/library/collab-base:${BASE_HASH}
    fi
  id: base

- name: Build and push
  run: |
    docker build \
      --build-arg BASE_TAG=${{ steps.base.outputs.base_hash }} \
      -t ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ steps.tag.outputs.build_tag }} \
      -t ${{ env.REGISTRY }}/${{ env.IMAGE }}:staging \
      .
    docker push ...
```

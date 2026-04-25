FROM node:20-slim AS client-builder
WORKDIR /build
COPY ../client/package*.json ./
RUN npm ci
COPY ../client/ .
RUN npm run build

FROM golang:1.25 AS go-builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 go build -o collab-server ./cmd/collab/

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates sqlite3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=go-builder /build/collab-server .
COPY --from=client-builder /build/dist ./client-dist
EXPOSE 4900
ENV NODE_ENV=production
CMD ["./collab-server"]

#!/bin/bash
set -e
export TMPDIR="${TMPDIR:-/tmp/go-test}"
mkdir -p "$TMPDIR"
cd "$(dirname "$0")/.."
go test ./... -race -coverprofile=coverage.out
go tool cover -func=coverage.out | tail -1

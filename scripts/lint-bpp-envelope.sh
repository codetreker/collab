#!/usr/bin/env bash
# scripts/lint-bpp-envelope.sh — BPP-1 (#274/#280) envelope CI lint.
# Drives the reflection lint (TestBPPEnvelope*) which itself enforces:
#   ① RT-0 byte-identical dispatcher prefix
#   ② control-plane 6-frame direction lock (Server→Plugin)
#   ③ data-plane 3-frame direction lock (Plugin→Server)
#   ④ frame-name whitelist closure
#   ⑤ godoc anchor `BPP-1.*byte-identical.*RT-0` count >= 1
#   反约束 — no implicit full-replay default (`replay_mode = "full"`,
#            `default.*ResumeModeFull`, `defaultReplayMode`).
# Referenced by .github/workflows/ci.yml `bpp-envelope-lint`.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> BPP-1 envelope reflection lint + reverse-grep guard"
( cd packages/server-go && go test -run 'TestBPPEnvelope' -count=1 -v ./internal/bpp/... )

echo "OK"

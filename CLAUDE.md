# Borgee 协作约定

## 跑 test 必须加 timeout

血账: 战马 e 跑 test 卡 40 分钟无响应, 拖死整个 milestone 推进.

**硬规**: 任何 `go test` / `npm test` / `pnpm test` / `playwright test` / `vitest` 调用 **必须**加 timeout, 不留无界 hang 路径.

```bash
# Go
go test -timeout=120s ./...
go test -timeout=120s -race -coverprofile=coverage.out ./...

# Playwright (默认有 30s per-test, 但整 suite 加 --max-failures + 总超时)
pnpm exec playwright test --timeout=30000

# Vitest
pnpm vitest run --testTimeout=10000
```

**Bash 工具调用**也必须设 `timeout` 参数 (max 600000ms = 10min):
- 单个 test 包: 2-3 min
- 全套 test: 5-10 min
- **绝不无 timeout 跑 test**, 卡住 = 整个 agent 浪费

如 test 真需要 >10min, 用 `run_in_background: true` 提交后做别的, 不阻塞主线.

# HB-2 host-bridge daemon — acceptance template v0 (Go binary, HB stack Go 重审)

> Anchor: `docs/implementation/modules/hb-2-spec.md` v1 §3-§4 + §5.5 Go 包结构 + §5.6 HB-2.0 prerequisite
> Mode: docs-only acceptance v0 — 真测在 HB-2.1..HB-2.6 实施 follow-up PR 落 (HB-1 #589 ship 后启).
> 跟 HB-1 acceptance template 同模式 (字面 byte-identical 跟 HB-2 spec drift 防御).

## §1 IPC contract (drift-防御; spec §3.1)

- **§1.1** Request schema 4 字段锁 (`request_id / action / agent_id / params`) — byte-identical
- **§1.2** Response schema 4 字段锁 (`request_id / status / reason / data / audit_log_id`) — byte-identical
- **§1.3** action 枚举 v1 = 3 项 (`list_files / read_file / network_egress`) — 反向枚举写类 8 action 全 reject

## §2 reason 8-dict (spec §3.3, 字典分立)

- **§2.1** 8 reason 字面: `path_outside_grants / grant_expired / grant_not_found / host_exceeds_max_bytes / egress_domain_not_whitelisted / cross_agent_reject / io_failed / ok` — byte-identical
- **§2.2** 跟 HB-1 7-dict 字典分立 — HB-2 8 reason 字面在 `packages/borgee-helper/install-butler/` 0 hit
- **§2.3** 跟 AL-1a 6-dict 字典分立 — HB-2 8 reason 字面在 `packages/server-go/internal/...runtime audit` 0 hit

## §3 反约束 (spec §4)

- **§3.1** 零写命令 — `exec.Command|os/exec.Cmd|sh -c` 在 `packages/borgee-helper/host-bridge/src` 0 hit
- **§3.2** 路径越界 100% reject — ≥10 case (`../` / 符号链接 / Unicode normalization / 绝对路径 outside grants / null byte / /proc / 设备文件)
- **§3.3** grants 不缓存 — 撤销 < 100ms; 反向 grep `grantsCache | cachedGrants` 0 hit
- **§3.4** cross-agent ACL — IPC `agent_id` 跟握手 agent_id 不一致 → reject `cross_agent_reject`
- **§3.5** 沙箱 user — daemon 跑 `borgee-helper` (反向 grep `User=root | sudo` 在 systemd/launchd unit 0 hit)
- **§3.6** 写类 IPC 100% reject — ≥8 写法 (`write_file / delete_file / chmod / chown / mkdir / rmdir / mv / cp`)

## §4 Go 包结构 + sandbox build tag (spec §5.5, HB stack Go 重审)

- **§4.1** 包结构: `packages/borgee-helper/host-bridge/` 独立 Go module (separate go.mod 防 server-go binary bloat)
- **§4.2** sandbox build tag 拆 3 文件: `sandbox_linux.go` (landlock LSM + AppArmor fallback) + `sandbox_darwin.go` (sandbox-exec) + `sandbox_other.go` (Windows + 其他 no-op)
- **§4.3** Linux sandbox: `github.com/landlock-lsm/go-landlock` (反 cgroups, cgroups 不限 mmap/exec)
- **§4.4** Windows IPC pipe: `github.com/Microsoft/go-winio` (反 raw syscall.CreateNamedPipe)
- **§4.5** Borgee Helper 命名拆死: daemon binary `borgee-helper` (OS user/systemd unit), PWA UI 不复用 (反向 grep client UI `Borgee Helper` 字面 0 hit, 反混淆)

## §5 HB-2.0 prerequisite (spec §5.6, CI matrix)

- **§5.1** CI matrix 3 OS (ubuntu-latest + macos-latest + windows-latest) × sandbox build tag 全 PASS (release-gate.yml step `hb-stack-go-matrix` 守门)
- **§5.2** 3 IPC unit 真挂: `ipc_uds_test.go` (Linux+macOS) + `ipc_winpipe_test.go` (Windows go-winio) + `ipc_dispatch_test.go` (跨平台 request_id 多路复用 + 11 reason 8-dict byte-identical)
- **§5.3** HB-2.1..HB-2.6 任一 PR merge 前, HB-2.0 CI matrix 必跑过 (反向: 缺 HB-2.0 CI step 阻 HB-2.1..6 任一 merge)

## §6 跨 milestone byte-identical 链 (spec §5)

- **§6.1** HB-1 audit log schema = HB-2 audit log schema (改一处改两处, packages/borgee-helper/install-butler/audit.go ↔ packages/borgee-helper/host-bridge/audit.go)
- **§6.2** HB-3 host_grants schema 字面 byte-identical (read-only 消费方)
- **§6.3** HB-4 §1.5 release gate 第 5 行 (撤销 < 100ms) + 第 6 行 (写类 100% reject)
- **§6.4** HB-1 #589 cross-check (战马D 1 行 verify, audit log JSON 字段顺序 byte-identical)

## REG 占号 (HB-2 真实施落地后翻 ⚪→🟢)

| Reg ID | Source | Test path | Owner | Status |
|---|---|---|---|---|
| REG-HB2-001 | spec §4 ① + acceptance §3.1 — 零写命令路径 (Go binary) | `host-bridge/internal/no_exec_test.go` (反向 grep) | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-002 | spec §4 ② + acceptance §3.2 — 路径越界 100% reject | `host-bridge/internal/path_traversal_test.go` (≥10 case) | 战马 / 飞马 / 烈马 | ⚪ pending impl |
| REG-HB2-003 | spec §4 ③ + acceptance §3.3 — grants 不缓存 + 撤销 < 100ms | `host-bridge/internal/grant_revoke_propagation_test.go` | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-004 | spec §4 ⑦ + acceptance §3.6 — 写类 IPC 100% reject | `host-bridge/internal/write_action_reject_test.go` (≥8 enum) | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-005 | spec §3.3 + acceptance §2 — 8/7/6-dict 字典分立 | `host-bridge/internal/dict_isolation_test.go` (跨模块 grep) | 战马 / 飞马 | ⚪ pending impl |
| REG-HB2-006 | acceptance §4.2 — sandbox build tag 拆 3 文件 (linux/darwin/other) | `find host-bridge -name 'sandbox_*.go'` ≥3 | 战马 / 飞马 | ⚪ pending impl |
| REG-HB2-007 | acceptance §4.3+§4.4 — landlock + go-winio 包锁 | `go.mod` grep `landlock-lsm/go-landlock` + `Microsoft/go-winio` ≥2 | 战马 / 飞马 | ⚪ pending impl |
| REG-HB2-008 | acceptance §5.1+§5.2 — HB-2.0 CI matrix + 3 IPC unit prerequisite | `.github/workflows/hb-stack-go.yml` matrix 3 OS + 3 IPC unit | 战马 / 飞马 | ⚪ pending impl |

## 退出条件 (HB-2 docs PR close)

- §1-§6 全锁定字面
- REG-HB2-001..008 占号 ⚪ pending impl

## 退出条件 (HB-2 实施 PR — HB-1 #589 ship 后启)

- §3 反约束 6 项全绿 (Go binary)
- HB-4 §1.5 release gate 第 5+6 行 真测 PASS
- 合约测试: 路径 traversal ≥10 case + 写类 ≥8 action 全 reject
- HB-2.0 CI matrix 3 OS PASS (HB-2.1..HB-2.6 prerequisite)
- REG-HB2-001..008 翻 🟢 active

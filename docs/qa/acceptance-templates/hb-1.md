# HB-1 install-butler — acceptance template v0 (Go binary, HB stack Go 重审)

> Anchor: `docs/implementation/modules/hb-1-spec.md` v0 §3-§4 + §5.5 Go 包锁 + §6.5 一键安装脚本立场
> Mode: docs-only acceptance v0 — 真测在 HB-1.1..HB-1.5 实施 follow-up PR 落 (DL-4 ship 后启).
> 跟 HB-2 acceptance template 同模式 (字面 byte-identical 跟 HB-1 spec drift 防御).

## §1 IPC contract (drift-防御; spec §3)

- **§1.1** Request schema 4 字段锁 (`request_id / action / params / agent_id`) — byte-identical
- **§1.2** Response schema 5 字段锁 (`request_id / status / reason / data / audit_log_id`) — byte-identical
- **§1.3** action 枚举 v1 = 3 项 (`install / uninstall / list_installed`) — 反向枚举写类 0 hit (HB-1 仅装/卸/列, 不直接 exec 业务命令)

## §2 reason 7-dict (spec §3.3, 字典分立)

- **§2.1** 7 reason 字面: `manifest_signature_invalid / manifest_url_not_whitelisted / sha256_mismatch / binary_gpg_invalid / disk_full / install_path_not_writable / ok` — byte-identical
- **§2.2** 跟 HB-2 8-dict 字典分立 — HB-1 7 reason 字面在 `packages/borgee-helper/host-bridge/` 0 hit
- **§2.3** 跟 AL-1a 6-dict 字典分立 — HB-1 7 reason 字面在 `packages/server-go/internal/...runtime audit` 0 hit

## §3 反约束 (spec §4)

- **§3.1** 零写命令 — `exec.Command|os/exec.Cmd|sh -c` 在 `packages/borgee-helper/install-butler/src` 0 hit (除 systemd/launchd unit 启动)
- **§3.2** GPG 双签 fail-closed — manifest signature OR binary signature 任一失败 → reject + 不安装
- **§3.3** SHA256 单源 (反 GPG 单签) — `sha256_mismatch` reason 真挂 unit
- **§3.4** install 路径白名单 — 仅装到 `~/.borgee/plugins/<plugin_id>/` (反向 grep `os.WriteFile.*\\$HOME[^/]\\|os.WriteFile.*Documents` 0 hit)
- **§3.5** audit log 5 字段 byte-identical 跟 HB-2/BPP-4/HB-3 同源
- **§3.6** 沙箱 user — daemon 跑 `borgee-helper` (跟 HB-2 同 OS user)
- **§3.7** 一键安装脚本域名锁 — `borgee.cloud` (反向 grep `borgee\.io` 0 hit, 跟 spec §6.5 同源)

## §4 Go 三方包锁 (spec §5.5, HB stack Go 重审)

- **§4.1** GPG verify: `github.com/ProtonMail/go-crypto/openpgp` (反 deprecated `golang.org/x/crypto/openpgp`)
- **§4.2** Linux sandbox: `github.com/landlock-lsm/go-landlock` + AppArmor fallback (kernel <5.13)
- **§4.3** Windows IPC pipe: `github.com/Microsoft/go-winio` (反 raw syscall)
- **§4.4** build tag 拆: `sandbox_linux.go` + `sandbox_darwin.go` + `sandbox_other.go`
- **§4.5** 包结构: `packages/borgee-helper/install-butler/` 独立 Go module (separate go.mod 防 server-go binary bloat)

## §5 跨 milestone byte-identical 链 (spec §5)

- **§5.1** DL-4 manifest contract byte-identical (HB-1 消费方 + DL-4 提供方)
- **§5.2** HB-2/HB-3/HB-4/BPP-4 audit log schema 5 字段 byte-identical
- **§5.3** HB-4 §1.5 release gate 第 3 行 (签名校验失败率 0%) + 第 4 行 (audit schema 锁定)

## REG 占号 (HB-1 真实施落地后翻 ⚪→🟢)

| Reg ID | Source | Test path | Owner | Status |
|---|---|---|---|---|
| REG-HB1-001 | spec §4 ① + acceptance §3.1 — 零写命令路径 (Go binary) | `install-butler/internal/no_exec_test.go` (反向 grep) | 战马 / 烈马 | ⚪ pending impl |
| REG-HB1-002 | spec §4 ② + acceptance §3.2 — GPG 双签 fail-closed | `install-butler/internal/gpg_double_sig_test.go` | 战马 / 飞马 / 烈马 | ⚪ pending impl |
| REG-HB1-003 | spec §4 ③ + acceptance §3.4 — install 路径白名单 | `install-butler/internal/path_whitelist_test.go` (≥10 case) | 战马 / 飞马 / 烈马 | ⚪ pending impl |
| REG-HB1-004 | acceptance §4.1 — GPG 包锁 ProtonMail/go-crypto/openpgp | `go.mod` grep `ProtonMail/go-crypto` ≥1 + 反向 `golang.org/x/crypto/openpgp` 0 hit | 战马 / 飞马 | ⚪ pending impl |
| REG-HB1-005 | acceptance §4.4 — sandbox build tag 拆 (Linux/Darwin/Other 3 文件) | `find install-butler -name 'sandbox_*.go'` ≥3 + go test 跨平台 PASS | 战马 / 飞马 | ⚪ pending impl |
| REG-HB1-006 | acceptance §3.7 + spec §6.5 — 一键安装脚本域名锁 borgee.cloud | install.sh grep `borgee.cloud` + 反向 `borgee\.io` 0 hit | 战马 / 野马 | ⚪ pending impl |

## 退出条件 (HB-1 docs PR close)

- §1-§5 全锁定字面
- REG-HB1-001..006 占号 ⚪ pending impl

## 退出条件 (HB-1 实施 PR — DL-4 ship 后启)

- §3 反约束 7 项全绿
- HB-4 §1.5 release gate 第 3+4 行 真测 PASS
- 合约测试: GPG 双签 fail-closed + path 白名单 + SHA256 单源
- REG-HB1-001..006 翻 🟢 active

# HB-2 host-bridge daemon — acceptance template v0 (docs-only milestone)

> Anchor: `docs/implementation/modules/hb-2-spec.md` v1 §3-§4
> Stance: `docs/qa/hb-2-stance-checklist.md` §1-§2
> Mode: docs-only acceptance — 真测在 HB-2.1..HB-2.6 实施 follow-up PR
> 落 (HB-1 #589 ship 后启). 本模板锁住 IPC contract + 反约束 grep + REG
> 占号.

## §1 IPC contract (drift-防御; spec §3.1)

- **§1.1** Request schema 4 字段锁 (`request_id / action / agent_id /
  params`) — 字面 byte-identical (改 = 改 spec §3.1 + 实施 + 本模板三处)
- **§1.2** Response schema 4 字段锁 (`request_id / status / reason /
  data / audit_log_id`) — 字面 byte-identical
- **§1.3** action 枚举 v1 = 3 项 (`list_files / read_file /
  network_egress`) — 反向枚举写类 8 action 全 reject

**测**: HB-2.2 IPC server 落地后, contract conformance unit test
(serde JSON round-trip 4 字段必填) PASS.

## §2 reason 8-dict (spec §3.3, 字典分立)

- **§2.1** 8 reason 字面: `path_outside_grants / grant_expired /
  grant_not_found / host_exceeds_max_bytes / egress_domain_not_whitelisted
  / cross_agent_reject / io_failed / ok` — byte-identical
- **§2.2** 跟 HB-1 7-dict 字典分立 — HB-2 8 reason 字面在
  `packages/install-butler/` 0 hit (反向 grep)
- **§2.3** 跟 AL-1a 6-dict 字典分立 — HB-2 8 reason 字面在
  `packages/server-go/internal/...runtime audit` 0 hit

**测**: HB-2.6 acceptance script 跑跨模块 grep + 字面对照单测 PASS.

## §3 反约束 (spec §4 + stance §1)

- **§3.1** 零写命令 (stance §1 ②) — `exec\.Cmd | process::Command |
  Command::new | sh -c` 在 `packages/host-bridge/host-bridge/src` 0 hit
- **§3.2** 路径越界 reject (stance §1 ③) — 合约测试枚举 ≥10 case
  (`../` / 符号链接 / Unicode normalization / 绝对路径 outside grants /
  null byte injection / 长 path / case-insensitive bypass / .git 路径 /
  /proc 路径 / device 文件) 全 reject reason `path_outside_grants`
- **§3.3** grants 不缓存 (stance §1 ④) — 撤销 grant → 下次 IPC call
  < 100ms reject; 反向 grep `grantsCache | cachedGrants | grant_cache` 0 hit
- **§3.4** cross-agent ACL (spec §4 ④) — IPC call 携带 `agent_id`,
  daemon 校验跟 plugin 握手 agent_id 一致, 不一致 reject reason
  `cross_agent_reject`
- **§3.5** 沙箱 user (stance §1 ①) — daemon 跑用户 `borgee-helper` (反向
  grep `User=root | sudo` 在 systemd/launchd unit 0 hit)
- **§3.6** 写类 IPC 100% reject (stance §1 ⑦) — 反向枚举 ≥8 写法尝试
  (`write_file / delete_file / chmod / chown / mkdir / rmdir / mv / cp`)
  全 reject

## §4 跨 milestone byte-identical 链 (spec §5)

- **§4.1** HB-1 audit log schema = HB-2 audit log schema (复用 SSOT
  `actor / action / target / when / scope`, 改一处改两处)
- **§4.2** HB-3 host_grants schema 字面 byte-identical (host-bridge
  read-only 消费方)
- **§4.3** HB-4 §1.5 release gate 第 5 行 (撤销 < 100ms) + 第 6 行 (写类
  100% reject) byte-identical

## REG 占号 (HB-2.6 实施落地后翻 ⚪→🟢)

| Reg ID | Source | Test path | Owner | Status |
|---|---|---|---|---|
| REG-HB2-001 | hb-2-spec.md §4 ① + stance §1 ② — 零写命令路径 | `host-bridge/tests/no_exec_grep.rs` (反向 grep 0 hit) | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-002 | hb-2-spec.md §4 ② + stance §1 ③ — 路径越界 100% reject | `host-bridge/tests/path_traversal.rs` (≥10 case) | 战马 / 飞马 / 烈马 | ⚪ pending impl |
| REG-HB2-003 | hb-2-spec.md §4 ③ + stance §1 ④ — grants 不缓存 + 撤销 < 100ms | `host-bridge/tests/grant_revoke_propagation.rs` | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-004 | hb-2-spec.md §4 ⑦ + stance §1 ⑦ — 写类 IPC 100% reject | `host-bridge/tests/write_action_reject.rs` (≥8 enum) | 战马 / 烈马 | ⚪ pending impl |
| REG-HB2-005 | hb-2-spec.md §3.3 + stance §1 ⑤ — 8/7/6-dict 字典分立 | `host-bridge/tests/dict_isolation.rs` (跨模块 grep) | 战马 / 飞马 | ⚪ pending impl |
| REG-HB2-006 | hb-2-spec.md §4 ⑥ + stance §1 ① — 沙箱 user 独立 | systemd unit + launchd unit + sandbox-exec profile audit | 战马 / 飞马 | ⚪ pending impl |
| REG-HB2-007 | hb-2-spec.md §4 ④ + stance §1 ⑥ — cross-agent ACL + cgroups + sandbox-exec | `host-bridge/tests/cross_agent_acl.rs` + sandbox profile audit | 战马 / 飞马 | ⚪ pending impl |

## 退出条件 (HB-2 docs PR close)

- §1-§3 IPC contract + reason 字典 + 反约束 7 项全锁定字面
- 4 件套 spec/stance/acceptance + content-lock 不需要 (无 UI)
- REG-HB2-001..007 占号 ⚪ pending impl (HB-1 ship 后翻 🟢)

## 退出条件 (HB-2 实施 PR — HB-1 ship 后启)

- §3 反约束 7 项全绿 (`packages/host-bridge/host-bridge/`)
- HB-4 §1.5 release gate 第 5+6 行 真测 PASS
- 合约测试: 路径 traversal ≥10 case 全 reject + 写类 ≥8 action 全 reject
- 跨字典分立反向 grep 0 hit
- REG-HB2-001..007 翻 🟢 active

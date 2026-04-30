# HB-2 host-bridge daemon — PM stance checklist v1

> Owner: 野马 PM (yema) prep / 飞马 review 安全 / 烈马 acceptance hook
> Anchor: `docs/implementation/modules/hb-2-spec.md` v1 §1-§9
> Mode: docs-only milestone (4 件套 spec/stance/acceptance + 反约束锁) —
> Rust crate 实施待 HB-1 #589 ship 后单独 PR.

## 1. 立场 (PM 视角 7 项)

1. **常驻 borgee-helper 独立 user** (蓝图 §1.2 ② 进程沙箱) — daemon 跑在
   `borgee-helper` OS user/group, **不是 root, 不是 login user**. systemd
   unit + launchd unit 启动配置自动校验. 反向: `User=root | sudo` 启动
   配置 0 hit.
2. **零写命令 / shell exec** (蓝图 §1.4 第 3 行) — 反向 grep
   `exec\.Cmd | process::Command | Command::new | sh -c` 在
   `packages/host-bridge/host-bridge/src` 0 hit (除 daemon 自身的
   systemd/launchd 启动 unit 文件).
3. **路径越界 100% reject** (HB-4 §1.5 release gate) — 任何 path 不在
   HB-3 grants scope 内一律 reject; `../` 路径分量 + 符号链接遍历 +
   Unicode normalization bypass **全部** reject (合约测试枚举 ≥10 case).
4. **grants 不缓存** (HB-3 SSOT 单源) — 每次 IPC call 重新查 host_grants
   表, 撤销 grant → 下次 IPC call < 100ms 内拒绝 (HB-4 §1.5 第 5 行).
   反向 grep `grantsCache | cachedGrants | grant_cache` 0 hit.
5. **HB-2 8-dict + HB-1 7-dict + AL-1a 6-dict 三字典分立** — reason 字典
   不混; HB-2 host IPC 路径 8 reason / HB-1 install 路径 7 reason / AL-1a
   runtime 路径 6 reason. 跨字典反向 grep: HB-2 8 reason 字面在
   HB-1 + AL-1a 模块 0 hit (字典分立锁).
6. **沙箱 cgroups + sandbox-exec** (蓝图 §1.2 ②) — Linux cgroups 限
   daemon CPU/memory/IO + macOS sandbox-exec profile 限文件系统写白名单
   仅 `audit log + tmp 缓存` 两路径; 反向断言 daemon 写 `~/Documents` /
   `~/Library/Application Support/` 等 user 路径 → IO failed.
7. **写类 IPC 100% reject** (HB-4 §1.5 第 6 行) — 任何写类 action 一律
   reject (v1 仅读). 反向枚举单测覆盖 ≥8 写法尝试: `write_file /
   delete_file / chmod / chown / mkdir / rmdir / mv / cp` 全 reject 字面
   `unsupported_write_action` 或 cross-checked dict reason byte-identical.

## 2. 黑名单 grep (反向断言, 0 hit)

| Pattern | 模块 | 立场来源 |
|---|---|---|
| `User=root\|sudo\|setuid` 在 systemd/launchd unit | `packages/host-bridge/host-bridge/` | §1 ① 沙箱 user |
| `exec\.Cmd\|process::Command\|Command::new\|sh -c` | `packages/host-bridge/host-bridge/src` | §1 ② 零写命令 |
| `grantsCache\|cachedGrants\|grant_cache` | `packages/host-bridge/host-bridge/src` | §1 ④ grants 不缓存 |
| `write_file\|delete_file\|chmod\|chown\|mkdir\|rmdir` action 字面 (除 reject 列表) | `packages/host-bridge/host-bridge/src` | §1 ⑦ 写类 reject |
| HB-2 8-dict reason 字面在 HB-1 / AL-1a 模块 | `packages/install-butler/` + `packages/server-go/internal/...runtime` | §1 ⑤ 字典分立 |

## 3. 不在范围 (留 v2+)

- 写命令 / shell exec (蓝图 §1.4 v2 路径单独立项)
- 进程查看 (蓝图 §1.4 v2 表第 4 行)
- 屏幕/键盘 (不在路线图)
- Windows 支持 (v2 重新设计 sandbox-exec equivalent)
- HB-3 授权弹窗 (HB-3 范围)
- BPP 协议本身 (BPP 模块负责)
- v2 命令通道 (蓝图 §1.4 v2 单独立项)

## 4. 验收挂钩

- §1 ②③④⑦ 反约束 → REG-HB2-001..004 (acceptance template 占号)
- §1 ⑤ 字典分立 → REG-HB2-005
- §1 ① 沙箱 user → REG-HB2-006 (HB-1 ship 后真启 unit 测)
- §1 ⑥ cgroups + sandbox-exec → REG-HB2-007 (HB-1 ship 后)

## 5. v0 → v1 transition criteria

- HB-1 #589 merged (install-butler crate + audit log schema 锁定)
- HB-2 spec brief v0 → v1 (本 PR 升级)
- 烈马 acceptance template v0 占号 (本 PR)
- 实施拆 follow-up PR: HB-2.1 daemon skeleton → HB-2.2 IPC server →
  HB-2.3 路径 + grants → HB-2.4 网络出站 → HB-2.5 沙箱 → HB-2.6 acceptance
- HB-3 grants schema 待 HB-3 spec brief 落 (并行起, 不 block HB-2 docs)

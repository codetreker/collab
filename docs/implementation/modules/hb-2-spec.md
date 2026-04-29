# HB-2 host-bridge daemon — spec brief v0 (read-only IPC contract lock)

> Owner: 战马A 起 v0 spec / 飞马 review 安全模型 / 烈马 acceptance
> Blueprint锚: `docs/blueprint/host-bridge.md` §1.4 + §2 信任五支柱
> Module ref: `docs/implementation/modules/host-bridge.md` §HB-2
> 依赖: **HB-1 install-butler** (装好 plugin runtime 后才有 host-bridge
> 跑) + plugin (BPP) 提需求方
> Status: **🚧 spec brief v0** — code stub deferred until HB-1 lands.
> 跟 HB-1 spec brief (#491 81a41fa) 同模式 — 锁住 IPC contract + 反约束防
> drift, 真 Rust crate 实施等 HB-1 落.

## 1. 一句话定义

host-bridge 是 Borgee Helper 内部**常驻**无 sudo daemon, 跑在独立 OS
user/group, 给 plugin (OpenClaw 等 runtime) 提供受控 host 资源访问 (v1
仅文件读 + 网络出站白名单, **零写命令**). 跟 install-butler (短命 + 需
sudo) 拆开两进程, UI 合一为 "Borgee Helper".

## 2. 范围 / 不在范围

### 在范围 (HB-2 v0)

1. **daemon lifecycle**: 常驻进程 (systemd unit Linux / launchd unit
   macOS), 启停由 install-butler 在装/卸时拉起 (蓝图 §1.1)
2. **IPC server**: plugin (BPP runtime) ↔ host-bridge UDS / Named Pipe
   server. 仅接 "读类" request — list_files / read_file / network_egress.
3. **文件读路径**: 走授权目录 (HB-3 grants 的 scope), 反向断言路径在
   grants 白名单内, 越界 reject (蓝图 §1.4 v1 表第 1 行)
4. **网络出站白名单**: HTTP/HTTPS 出站走 outbound proxy 控制 (蓝图
   §1.4 v1 表第 2 行)
5. **审计日志**: 每次 IPC call (含 reject) 写本地 JSON line, 跟 HB-1
   audit log schema byte-identical (蓝图 §2 信任五支柱第 3 条 + HB-4
   §1.5 release gate 第 4 行)
6. **沙箱守**: Linux cgroups + macOS sandbox-exec profile, 限制 daemon
   只能写 audit log + 临时缓存路径, 不能写用户家目录任何处 (蓝图
   §1.2 ② "进程沙箱")

### 不在范围

- **写命令 / shell exec ❌** (v1 立场承袭, 蓝图 §1.4 第 3 行 "Borgee
  不直接跑命令; 命令走 OpenClaw runtime 自带 shell tool 沙箱内")
- 进程查看 ❌ (v2+, 蓝图 §1.4 v1 表第 4 行)
- 屏幕/键盘 ❌ (不在路线图, 蓝图 §1.4 v1 表第 5 行)
- Windows ❌ (v2 重新设计 sandbox-exec equivalent, 跟 HB-1 同模式)
- HB-3 授权弹窗 + grants 持久化 ❌ (HB-3 范围, HB-2 仅消费 grants)
- BPP 协议本身 ❌ (BPP 模块负责; HB-2 仅提供受控 host 资源)
- v2 命令通道 ❌ (蓝图 §1.4 "v2 路径" 单独立项)

## 3. 接口边界 (interface stub, lock-in 防 drift)

### 3.1 plugin → host-bridge IPC contract

常驻 daemon, 长连接 IPC. JSON line request/response, 单连接多路复用
(request_id correlate).

#### Request (plugin → host-bridge)

```json
{
  "request_id": "<uuid>",
  "action": "list_files" | "read_file" | "network_egress",
  "agent_id": "<uuid>",      // 调用 agent (cross-agent ACL 守)
  "params": {
    // list_files:    {"path": "/abs/path/to/dir"}
    // read_file:     {"path": "/abs/path/to/file", "max_bytes": 1048576}
    // network_egress: {"url": "https://api.example.com/..."}
  }
}
```

#### Response (host-bridge → plugin)

```json
{
  "request_id": "<uuid>",
  "status": "ok" | "rejected" | "failed",
  "reason": "path_outside_grants" |
            "grant_expired" |
            "grant_not_found" |
            "host_exceeds_max_bytes" |
            "egress_domain_not_whitelisted" |
            "cross_agent_reject" |
            "io_failed" |
            "ok",
  "data": <action-specific>,    // when status=ok
  "audit_log_id": "<uuid>"
}
```

### 3.2 host-bridge → HB-3 grants store contract (read-only consumer)

host-bridge **不写 grants** — 只读. HB-3 持有 `host_grants` 表 SSOT;
host-bridge 在每次 IPC call 时按 `(agent_id, scope)` 查询并校验 TTL.

```sql
-- HB-3 owns this schema; HB-2 reads via host-bridge daemon process.
SELECT scope, ttl_until FROM host_grants
WHERE agent_id = ? AND scope = ? AND ttl_until > strftime('%s', 'now') * 1000
LIMIT 1;
```

### 3.3 reason 字典 (跟 HB-1 7-dict + AL-1a 6-dict 字典分立, 不混)

8 字典 (HB-2 host-bridge 专属, install/runtime 路径不混):

- `path_outside_grants`         — 请求 path 不在 HB-3 grants 白名单 scope
- `grant_expired`               — grants 行存在但 TTL 过期 (HB-3 §1.3)
- `grant_not_found`             — `(agent_id, scope)` 无 grant 行
- `host_exceeds_max_bytes`      — read_file 超过 caller `max_bytes` 限
- `egress_domain_not_whitelisted` — 出站 URL domain 不在 outbound 白名单
- `cross_agent_reject`          — agent_id 跟 IPC 来源 plugin 注册 agent_id 不匹配
- `io_failed`                   — host 端 OS 错误 (read failed / network connect failed)
- `ok`                          — 成功

## 4. 反约束 (acceptance v0 锚)

1. **零写命令路径**: 反向 grep `exec\.Cmd\|process::Command\|Command::new\|sh -c` 0 hit (除 daemon 自身的 systemd/launchd unit 启动). 蓝图 §1.4 第 3 行 "Borgee 不直接跑命令" 字面立场守.
2. **路径越界 100% reject**: 任何 path 不在 grants scope 内 → reject. 反向断言: `../` 路径分量 + 符号链接遍历 + Unicode normalization bypass 全 reject (合约测试).
3. **grants 不缓存**: 每次 IPC call 重新查 host_grants 表 (HB-3 SSOT 单源, 跟 HB-1 manifest 不缓存同模式). 反向 grep `grantsCache\|cachedGrants` 0 hit. 撤销 grant → 下次 IPC call < 100ms 内拒绝 (HB-4 §1.5 release gate 第 5 行)
4. **cross-agent ACL**: IPC call 携带 `agent_id`, daemon 校验跟 plugin 连接时握手 agent_id 一致, 不一致 reject (REG-INV-002 fail-closed 同模式, anchor #360 owner-only 立场延伸到 host 层).
5. **审计日志 schema 锁定**: 跟 HB-1 audit log schema byte-identical (`actor / action / target / when / scope`), 改 = 改两处 (HB-1 install + HB-2 host-bridge IPC) 单测锁. HB-4 §1.5 release gate 第 4 行守.
6. **沙箱守**: 反向断言 daemon 跑用户 = `borgee-helper` (独立 OS user), 不是 root, 不是当前 login user. systemd unit + launchd unit 启动配置自动校验 (合约测试).
7. **写类 IPC 100% reject**: HB-4 §1.5 release gate 第 6 行 "任何写类 IPC 调用一律拒绝 (v1 仅读)". 单测覆盖每种写法尝试 — `write_file / delete_file / chmod / chown / mkdir / rmdir / mv / cp` action 全 reject (反向枚举).

## 5. 跨 milestone byte-identical 链

| Milestone   | 关系                                                           | 字面承袭                              |
|-------------|----------------------------------------------------------------|---------------------------------------|
| **HB-1**    | install-butler 装好 plugin runtime 后, 拉起 host-bridge daemon | install-butler audit log schema byte-identical (HB-2 复用) |
| **HB-3**    | host-bridge 消费 host_grants 表 (read-only); HB-3 持 schema + 弹窗写路径 | `host_grants(agent_id, scope, ttl_until, granted_at)` schema 字面 |
| **HB-4** ⭐ | release gate 第 5 行 (撤销 < 100ms) + 第 6 行 (写类 100% reject) | gate 数字 + 反向枚举 byte-identical |
| **AL-1a**   | reason 字典分立 (HB-2 8-dict 是 host IPC 路径; HB-1 7-dict 是 install 路径; AL-1a 6-dict 是 runtime 路径; 不混) | 字典分立反约束 |
| **BPP**     | host-bridge 仅给 BPP runtime (plugin) 用; 不给 server-go 直接调 | 单源 plugin → host-bridge IPC, server 不绕过 |
| **anchor #360 owner-only** | cross-agent ACL 立场承袭到 host 层 — agent 持的 grants 是 owner 授的, 跨 agent 调用 reject | 反向断言同源 |

## 6. 实施切入路线 (HB-1 落地后)

1. HB-1 ship install-butler crate + audit log schema 锁.
2. HB-2.1 daemon skeleton: Rust crate `packages/host-bridge/host-bridge/`
   (跟 install-butler 同 workspace, 复用 cargo lockfile + audit log).
3. HB-2.2 IPC server (UDS + serde JSON, request_id 多路复用).
4. HB-2.3 文件读路径 + grants 校验 + 路径 normalization (anti-traversal).
5. HB-2.4 网络出站白名单 + outbound proxy.
6. HB-2.5 沙箱配置 (systemd unit + launchd unit + sandbox-exec profile).
7. HB-2.6 acceptance (反约束 grep + 合约测试 + e2e 8 reason × 3 action).

## 7. 退出条件 (HB-2 v0 close)

- §3 IPC contract + HB-3 grants store contract 双向 byte-identical
- §4 反约束 7 项全绿 (零写命令 + 路径越界 reject + grants 不缓存 +
  cross-agent ACL + audit schema 锁 + 沙箱守 + 写类 IPC 100% reject)
- HB-4 release gate 第 5 行 (撤销 < 100ms) 真测 PASS
- HB-4 release gate 第 6 行 (写类 IPC 100% reject) 反向枚举单测 PASS
- 合约测试: 路径 traversal (../, symlink, Unicode normalization) 全 reject

## 8. 现状 (本 stub v0)

- ✅ spec brief 锁
- ✅ §3 IPC contract + HB-3 grants store contract 字面锁 (drift 防御)
- ✅ §4 反约束 7 项 acceptance v0
- ⏸️ Rust crate skeleton — 等 HB-1 落地真启
- ⏸️ acceptance template `docs/qa/acceptance-templates/hb-2.md` v0 —
  本 brief §4 升级为正式 acceptance template 时同步起
- ⏸️ HB-3 grants schema 真定义 — HB-3 spec brief 待起 (跟 HB-1/HB-2 同
  模式)

## 9. 跨 spec 反查 (跟 HB-1 + DL-4 spec 锁互校)

- HB-1 §3.3 reason 7-dict (install) ≠ HB-2 §3.3 reason 8-dict (host IPC) —
  字典分立反约束, 不混 (跟 AL-1a 6-dict runtime 也分立)
- HB-1 audit log schema = HB-2 audit log schema (复用同 SSOT —
  `actor / action / target / when / scope`, 改一处改两处)
- DL-4 ↔ HB-1 drift anchor (8a35589) 模式 — 命名相近 endpoint 必须
  cross-PR review 锁; 本 doc 跟 HB-1 spec 是兄弟范围, 已分立, 不需 anchor.

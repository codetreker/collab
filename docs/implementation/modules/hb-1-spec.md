# HB-1 install-butler — spec brief v0 (pre-DL-4 stub)

> Owner: 战马A 起 v0 spec / 飞马 review 安全模型 / 烈马 acceptance
> Blueprint锚: `docs/blueprint/host-bridge.md` §1.1 + §1.2 安全四件套
> Module ref: `docs/implementation/modules/host-bridge.md` §HB-1
> 依赖: **DL-4 server-side-services** (plugin manifest API, gating)
> Status: **🚧 spec brief v0** — code stub deferred until DL-4 lands real
> manifest endpoint. This doc locks the interface boundary so HB-1
> implementation can begin the moment DL-4 ships.

## 1. 一句话定义

install-butler 是 Borgee Helper 内部短命 daemon, 负责 plugin runtime 二进制
的下载 / 校验 (SHA256 + GPG 双签) / 安装 / 卸载. 任务完即退, 不常驻. 跟
host-bridge daemon (常驻 + 无 sudo) 拆开, 两进程 UI 合一为 "Borgee Helper".

## 2. 范围 / 不在范围

### 在范围 (HB-1 v0)

1. **daemon lifecycle**: 短命进程, IPC server (UDS / Named Pipe) 启停; 任
   务完即 shutdown (反约束: 不常驻, 攻击面减半 — 蓝图 §1.1)
2. **从 server 拉 manifest**: HTTP GET DL-4 manifest endpoint
   (`/api/v1/plugin-manifest`, schema TBD by DL-4); 校验响应 GPG 签名 (蓝图
   §1.2 ①)
3. **plugin 二进制下载 + 校验**: 按 manifest entry 下载到临时目录, SHA256
   比对 + GPG 二次签名校验 (双签). 任一失败 → reject + 不安装 (fail-closed,
   蓝图 §1.2 ① "白名单 + 双签")
4. **安装到本地 well-known 路径**: 跨平台路径 (Linux:
   `~/.local/share/borgee/plugins/<id>/`; macOS:
   `~/Library/Application Support/Borgee/plugins/<id>/`; Windows: 推 v2)
5. **卸载**: 按 plugin id 删本地路径 + 注册表 (信任底线, 蓝图 §1.2 ④
   "一键完全卸载")
6. **审计日志**: 每次 install/uninstall 写本地 JSON line (蓝图 §1.2 + HB-4
   §1.5 release gate "审计日志格式锁定")

### 不在范围

- v1 不自动更新 (反模式, 蓝图 §1.2 ③ "自动更新 = 反模式")
- 多源 registry ❌ (仅 Borgee 签名 manifest, v1)
- Windows 支持 (v2 重新设计 sandbox)
- shell exec / 写命令 (HB-2 也禁, v2 才推)
- BPP 协议握手 (BPP 模块负责)
- server 端 manifest API 本身 (DL-4 负责; HB-1 仅消费)

## 3. 接口边界 (interface stub, lock-in 防 drift)

### 3.1 daemon IPC contract (host-bridge ↔ install-butler)

短命 daemon 走单连接 IPC (UDS Linux/macOS, Named Pipe Windows v2).
Request/response JSON line, daemon 处理完单 request 即退.

#### Request (host-bridge → install-butler)

```json
{
  "request_id": "<uuid>",
  "action": "install" | "uninstall" | "verify",
  "plugin_id": "openclaw",
  "version": "1.0.0",          // optional for uninstall
  "manifest_url": "https://api.borgee.io/api/v1/plugin-manifest"
}
```

#### Response (install-butler → host-bridge)

```json
{
  "request_id": "<uuid>",
  "status": "ok" | "rejected" | "failed",
  "reason": "manifest_signature_invalid" |
            "binary_sha256_mismatch" |
            "binary_gpg_invalid" |
            "manifest_fetch_failed" |
            "disk_write_failed" |
            "unknown_plugin" |
            "ok",
  "installed_path": "/abs/path/to/plugin/binary",   // when status=ok
  "audit_log_id": "<uuid>"
}
```

### 3.2 DL-4 manifest endpoint contract (server → install-butler)

> **TBD by DL-4 follow-up** — locked here to prevent drift. install-butler
> reads this shape. **不要** 跟 DL-4 PWA endpoint `GET /api/v1/manifest/
> plugins` 混 (两个 endpoint, 两个范围, 安全模型不同). 详 cross-PR drift
> 锚: [`dl-4-hb-1-drift-anchor.md`](dl-4-hb-1-drift-anchor.md).

```json
GET /api/v1/plugin-manifest
Authorization: Bearer <user-api-key>

200 OK
Content-Type: application/json

{
  "manifest_version": 1,
  "issued_at": 1735689600000,
  "expires_at": 1735776000000,
  "gpg_signature": "<base64 detached signature over canonical JSON>",
  "plugins": [
    {
      "id": "openclaw",
      "version": "1.0.0",
      "binary_url": "https://cdn.borgee.io/plugins/openclaw-1.0.0-linux-x64",
      "sha256": "<hex>",
      "gpg_signature": "<base64 detached signature over binary>",
      "platforms": ["linux-x64", "darwin-x64", "darwin-arm64"]
    }
  ]
}
```

### 3.3 reason 字典 (跟 AL-1a 6-dict 同模式, fail-closed 字面锁)

7 字典 (HB-1 install-butler 专属, 不复用 AL-1a runtime reason):

- `manifest_signature_invalid` — manifest GPG 签名校验失败
- `binary_sha256_mismatch`     — plugin 二进制 SHA256 不匹配 manifest
- `binary_gpg_invalid`         — plugin 二进制 GPG 签名校验失败
- `manifest_fetch_failed`      — manifest endpoint HTTP 失败
- `disk_write_failed`          — 安装路径写失败 (权限 / 磁盘满)
- `unknown_plugin`             — manifest 不含请求的 plugin_id
- `ok`                         — 成功

## 4. 反约束 (acceptance v0 锚)

1. **fail-closed double-check**: SHA256 单独 PASS 且 GPG 单独 PASS, 二者
   缺一 reject. 单签不接受 (蓝图 §1.2 ① "双签校验")
2. **manifest 不缓存**: 每次 install 重新拉 + 重新校验 expires_at; 反向
   grep `manifestCache\|cachedManifest` 0 hit
3. **daemon 不常驻**: 反向 grep `for.*loop\|select.*Done\|常驻` 0 hit (短命
   生命周期, 任务完即退)
4. **无写命令路径**: 反向 grep `exec.Cmd\|Command(.*shell` 0 hit (除
   binary 自己 chmod +x), v1 不跑用户命令
5. **未签 binary 100% reject**: 合约测试 — 篡改 binary 1 byte → reject;
   伪造 signature → reject. CI lock-in.
6. **卸载完整**: 卸载后反向断言 `installed_path` 不存在 + 注册表清; 信任
   底线 (蓝图 §1.2 ④ "一键完全卸载")
7. **审计日志 schema 锁定**: 每条 audit log 含 `actor / action / target /
   when / scope`, schema 文件 + 校验单测 (HB-4 §1.5 release gate 第 4 行)

## 5. 跨 milestone byte-identical 链

| Milestone   | 关系                                                  | 字面承袭                          |
|-------------|-------------------------------------------------------|-----------------------------------|
| **DL-4**    | server 端 manifest API 提供方; HB-1 消费, 不开新写路径 | manifest JSON schema byte-identical |
| **HB-2**    | 装好 plugin 后, host-bridge 启 plugin 走 BPP 接 server | install-path SSOT 路径 byte-identical |
| **HB-3**    | install/uninstall 都走情境化授权 (一次性 sudo)         | 授权 scope 跟 host_grants 同源     |
| **HB-4** ⭐ | 5 行 release gate 第 3/4 行 (签名校验失败率 / 审计日志) | gate 数字字面 byte-identical       |
| **AL-1a**   | reason 字典分立 (HB-1 7-dict 是 install 路径, AL-1a 6-dict 是 runtime 路径); 不混 | 字典分立反约束 |

## 6. 实施切入路线 (DL-4 落地后)

1. DL-4 ship `/api/v1/plugin-manifest` endpoint (interface §3.2 byte-
   identical) + GPG signing 服务.
2. HB-1.1 daemon skeleton: Rust crate `packages/host-bridge/install-butler/`
   (跟 packages/remote-agent Tauri shell 同 workspace, 复用 cargo lockfile).
3. HB-1.2 IPC contract impl (UDS server + serde JSON).
4. HB-1.3 manifest fetch + GPG verify + SHA256.
5. HB-1.4 install/uninstall + audit log.
6. HB-1.5 acceptance (反约束 grep + 合约测试 + e2e 7 reason × 3 plugin).

## 7. 退出条件 (HB-1 v0 close)

- §3 IPC contract + DL-4 manifest contract 双向 byte-identical (HB-1
  消费方 + DL-4 提供方 review 闭环)
- §4 反约束 7 项全绿
- HB-4 release gate 第 3 行 (签名校验失败率 0%) 真测 PASS
- HB-4 release gate 第 4 行 (audit log schema) 锁定 + 单测
- 审计日志 e2e (install → log line written; uninstall → log line written)

## 8. 现状 (本 stub v0)

- ✅ spec brief 锁
- ✅ §3 IPC contract + DL-4 manifest contract 字面锁 (drift 防御)
- ✅ §4 反约束 7 项 acceptance v0
- ⏸️ Rust crate skeleton — 等 DL-4 落地真启
- ⏸️ acceptance template `docs/qa/acceptance-templates/hb-1.md` v0 —
  本 brief §4 升级为正式 acceptance template 时同步起

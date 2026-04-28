# server-go — agent runtime 三态 (AL-1a)

> AL-1a (#R3 Phase 2 起步) · 蓝图 `agent-lifecycle.md §2.3` · 不持久化, AL-3 才落表

## 1. 适用范围

Phase 2 只承诺 **online / offline + error 旁路** 三态. busy / idle 跟 BPP 同期 (Phase 4 AL-1) 落地——因为 source 必须是 plugin 上行 frame, 没 BPP 就只能 stub, stub 上 v1 要拆掉 = 白写 (2026-04-28 4 人 review #5 决议).

## 2. 服务端 API

| 文件 | 角色 |
|------|------|
| `internal/agent/state.go` | `RuntimeState` enum + `Reason*` 常量 + `Tracker` (error map) + `ClassifyProxyError` |
| `internal/api/agents.go` | `AgentRuntimeProvider` interface + `withState` JSON 折入 + plugin 调用故障旁路 |
| `internal/server/server.go` | `agentRuntimeAdapter` 把 `*ws.Hub.GetPlugin` + `*agent.Tracker` 合成单次查询 |

行为:

- **online**: `hub.GetPlugin(agentID) != nil` 且无 error 记录.
- **offline**: 没 plugin 在线, 也没 error 记录. 默认值.
- **error**: `Tracker.SetError(id, reason)` 写入. 优先级最高 (有 error 记录无视 plugin presence, 防 owner 看到"绿点 + 实际不通").
- **disabled**: `users.disabled = true` 时强制 offline (蓝图 §2.4 禁用 = 停接消息).

## 3. 故障旁路触发点

`handleGetAgentFiles` 调 `Hub.ProxyPluginRequest`, 失败时 `ClassifyProxyError(status, err)` 分类:

| 信号 | reason |
|------|--------|
| `status == 401` 或 err 含 "api key" / "unauthorized" | `api_key_invalid` |
| `status == 429` | `quota_exceeded` |
| `status >= 500` | `runtime_crashed` |
| err 含 "timeout" / "deadline exceeded" | `runtime_timeout` |
| err 含 "not connected" / "connection refused" / "unreachable" | `network_unreachable` |
| 其它非空 err | `unknown` |

非空 reason → `setter.SetAgentError(id, reason)`. owner 下次 GET 立即看到红条 + 修复入口.

## 4. JSON wire schema

GET `/api/v1/agents` / GET `/api/v1/agents/{id}` 在原 sanitize 字段上多加:

```
state              : "online" | "offline" | "error"   (always emit)
reason             : string (仅 error 态)
state_updated_at   : Unix ms (仅 error 态, error 时刻)
```

文案锁见 `packages/client/src/lib/agent-state.ts` (野马 #190 §11): "在线" / "已离线" / "故障 (api_key_invalid)" 等. 改 reason 字符串 = 改两边 + 改 `__tests__/agent-state.test.ts` 锁断言.

## 5. 不在范围

- 不带 migration. 状态全部驻 `Tracker` map (内存). 重启全清, owner 触发任意 plugin 调用即重新分类.
- 不实现 busy / idle. 没 BPP 不能 stub.
- 不主动 push state 变更. 客户端依赖 RT-0 (#40) 已有的 `/events` long-poll wakeup 路径; AL-1b (Phase 4 BPP cutover) 再考虑专属 frame.

# Agent Config Panel (AL-2a.3 client SPA, PR #447)

> 蓝图: `agent-lifecycle.md §2.1` (用户完全自主决定 agent 的 name/prompt/能力/model) + `plugin-protocol.md §1.4` (Borgee=SSOT 字段划界) + §1.5 (热更新分级 — AL-2a 不含 BPP frame, 走轮询 reload, BPP frame `agent_config_update` 留 AL-2b + BPP-3 同合)
> Server 锚: `docs/current/server/README.md §Agent config SSOT (AL-2a.2)` + `docs/current/server/data-model.md::agent_configs` (v=20)
> Component: `packages/client/src/components/AgentConfigPanel.tsx`
> API: `packages/client/src/lib/api.ts::fetchAgentConfig` + `updateAgentConfig`
> Tests: `packages/client/src/__tests__/al-2a-content-lock.test.ts` (8 cases)

## 1. 入口与场景

owner 在 agent settings 下编辑本人 agent 的配置 SSOT — name / avatar / prompt / model / capabilities / enabled / memory_ref 7 字段。Save 提交 PATCH `/api/v1/agents/{id}/config`，server schema_version 严格递增 (server-stamp monotonic UPSERT)。

```
+──────────────────────────────────────────────────+
│  Agent 配置                              [v3]   │
├──────────────────────────────────────────────────┤
│  名称       [_________________________________]  │
│  头像 URL   [_________________________________]  │
│  Prompt     ┌───────────────────────────────┐   │
│             │                               │   │
│             └───────────────────────────────┘   │
│  模型       [_________________________________]  │
│  memory_ref [_________________________________]  │
│  启用       [✓]                                  │
│                                                  │
│                                       [ 保存 ]   │
+──────────────────────────────────────────────────+
```

## 2. 文案锁 (byte-identical 跨层同源)

| 文案 | 出处 | 同源锚 |
|---|---|---|
| `agent 配置保存失败, 请重试` | `AGENT_CONFIG_SAVE_TOAST` const | server-go `agentConfigSaveErrorMsg` const + al-2a-content-lock.test.ts case ① |
| 加载中... | render loading state | DOM `data-agent-config="loading"` 锚 |
| Agent 配置 / 名称 / 头像 URL / Prompt / 模型 / memory_ref / 启用 / 保存 / 保存中... | form labels | byte-identical literal 锁 in AgentConfigPanel.tsx |

## 3. DOM attr 锁 (反 drift)

- `data-agent-config="root"` — section 容器
- `data-agent-config="loading"` — 加载态
- `data-agent-config-version` — schema_version 显示元素
- `data-agent-config-field="{name|avatar|prompt|model|memory_ref|enabled}"` — 6 form input
- `data-agent-config-action="save"` — 保存按钮

## 4. 数据流

```
onMount → fetchAgentConfig(agentId) → GET /api/v1/agents/{id}/config
       → setConfig({schema_version, blob, updated_at})
       → setDraft(config.blob)

onSave → updateAgentConfig(agentId, draft) → PATCH /api/v1/agents/{id}/config
      → response: {schema_version: prev+1, blob, updated_at}
      → setConfig(updated) + setDraft(updated.blob) (re-fetch 防 cache 不刷)
      → 失败: showToast(AGENT_CONFIG_SAVE_TOAST)
```

`onMount + Save 后 re-fetch` 是 acceptance §4.1.d agent 端轮询 reload drift 锚 — 走 GET, 不订阅 WS push frame (蓝图 §1.5 BPP `agent_config_update` 留 AL-2b)。

## 5. 反约束 (蓝图 §1.4 SSOT + §1.5 BPP frame 反约束)

UI 层 + server 层双层 fail-closed:
- `data-agent-config-field="{api_key|temperature|token_limit|retry_policy}"` count==0 — runtime-only 字段 UI **不渲染** form input (UI 层 fail-closed); server `allowedConfigKeys` whitelist reject 400 with code `agent_config.runtime_field_rejected` (server 层 fail-closed)
- 不订阅 ws push — 反向 grep: `subscribeWS` / `hub.subscribe` count==0 in AgentConfigPanel.tsx
- BPP frame `'agent_config_update'` 单引号字面 (代码使用形式) count==0 — 仅 doc comment 出现说明立场, 不在代码路径

## 6. ADM-0 红线 (admin god-mode 不挂)

`/admin-api/v1/agents/{id}/config` 路径**不**挂 (跟 ADM-0 §1.3 + AL-3 #303 ⑦ 同模式)。client 的 `fetchAgentConfig` / `updateAgentConfig` 只调 `/api/v1/agents/{id}/config` (owner-only ACL, server 校验 owner.id == agent.OwnerID)。Cross-owner 调用 → 403。

## 7. 跟 server 字段映射 (byte-identical 锁)

| client `ALLOWED_CONFIG_KEYS` | server `allowedConfigKeys` | 蓝图 §1.4 |
|---|---|---|
| `name` | `name` | "归 Borgee 管" |
| `avatar` | `avatar` | "归 Borgee 管" |
| `prompt` | `prompt` | "归 Borgee 管" |
| `model` | `model` | identifier 字符串 (非 LLM 调用参数) |
| `capabilities` | `capabilities` | 能力开关 |
| `enabled` | `enabled` | 启用状态 |
| `memory_ref` | `memory_ref` | SSOT 立场 |

改 list = 改 server map + 改 al-2a-content-lock.test.ts 字面锁 + 改 acceptance §数据契约 row 2 三处同步。

## 8. 测试

`packages/client/src/__tests__/al-2a-content-lock.test.ts` 8 cases:
- ① toast 字面 byte-identical
- ② allowedConfigKeys 7 字段
- ③ data-agent-config-field 二态锁
- ④ DOM root + version + save action
- ⑤ API endpoint path + method 跟 server 同源
- 反约束 runtime-only 4 字段不渲染
- 反约束 不订阅 push frame
- 反约束 toast 同义词漂移 0 hit

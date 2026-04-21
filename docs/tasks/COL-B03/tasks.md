Now I have all the context needed. Here's the detailed task breakdown:

---

## COL-B03: 公开频道预览 + 加入 — Task Breakdown

### T1: 后端 — 频道列表返回未加入的公开频道
| 项 | 详情 |
|---|---|
| **文件** | `packages/server/src/queries.ts` (修改 `listChannelsWithUnread`), `packages/server/src/routes/channels.ts` (确保 response 包含 `is_member`) |
| **预估** | ~30 行 |
| **做什么** | 将现有查询改为 UNION：已加入频道 + 未加入的公开频道 (`visibility='public'`)，附带 `is_member` 标记 |
| **验证** | 1) `curl GET /api/v1/channels` 返回已加入 + 未加入公开频道 2) `is_member` 值正确 3) 私有频道不返回给非成员 |
| **依赖** | 无 |

---

### T2: 后端 — 频道预览 API
| 项 | 详情 |
|---|---|
| **文件** | `packages/server/src/routes/channels.ts` (新路由), `packages/server/src/queries.ts` (新查询函数) |
| **预估** | ~40 行 |
| **做什么** | 新增 `GET /api/v1/channels/:channelId/preview`，返回频道信息 + 最近 24h 消息（上限 50 条）。私有频道返回 404 |
| **验证** | 1) 公开频道返回消息列表 2) 私有频道 404 3) 消息数 ≤50 且在 24h 内 |
| **依赖** | 无 |

---

### T3: 后端 — 确认自加入公开频道逻辑
| 项 | 详情 |
|---|---|
| **文件** | `packages/server/src/routes/channels.ts` (`POST /channels/:id/members` 路由) |
| **预估** | ~15 行 |
| **做什么** | 审查现有 member-add 逻辑，确保：用户可将自己加入公开频道；私有频道拒绝自加入（非管理员） |
| **验证** | 1) 用户自加入公开频道成功 2) 自加入私有频道返回 403 |
| **依赖** | 无 |

---

### T4: 前端 — 侧边栏显示未加入频道
| 项 | 详情 |
|---|---|
| **文件** | `packages/client/src/components/Sidebar.tsx`, `packages/client/src/index.css` |
| **预估** | ~40 行 |
| **做什么** | 频道列表分两组（已加入 / 可预览）。未加入频道半透明 + "预览" 标签。点击时设为当前频道 |
| **验证** | 1) 侧边栏可见未加入公开频道 2) 样式与已加入明确区分 3) 分组正确 |
| **依赖** | T1（需要后端返回未加入频道） |

---

### T5: 前端 — 预览模式 + 加入按钮
| 项 | 详情 |
|---|---|
| **文件** | `packages/client/src/components/ChannelView.tsx`, `packages/client/src/components/MessageInput.tsx`, `packages/client/src/context/AppContext.tsx`, `packages/client/src/lib/api.ts` |
| **预估** | ~80 行 |
| **做什么** | 1) `api.ts`: 新增 `fetchChannelPreview(id)` 和 `joinChannel(channelId, userId)` 2) `AppContext.tsx`: 新增 `JOIN_CHANNEL` action（`is_member` → true）3) `ChannelView.tsx`: 非成员时调用 preview API、显示顶部 banner "你正在预览 #频道名" 4) `MessageInput.tsx`: 非成员时替换为居中 "加入频道" 按钮 5) 加入后：dispatch JOIN_CHANNEL → 刷新频道 → WS subscribe |
| **验证** | 1) 点击未加入频道 → 只读消息列表 + banner 2) 无法输入/发送 3) 点击"加入频道" → 成为成员 → 输入框恢复 → 可正常发消息 |
| **依赖** | T1, T2, T3 |

---

### 执行顺序

```
T1 ─┐
T2 ─┼─→ T4 ─→ T5
T3 ─┘
```

T1/T2/T3 互相独立可并行，T4 依赖 T1，T5 依赖全部后端任务 + T4。总预估 **~205 行改动**。

# COL-B26 / B27: 频道拖动排序 + 自定义分组 — PRD

日期：2026-04-25 | 状态：Draft

## 背景

Collab 的左侧 sidebar 频道列表目前按最近活跃时间排序，不支持手动排序和分组。随着频道增多，用户无法按项目/话题组织频道，也无法把最常用的频道固定在顶部。

建军要求：
1. 频道可以拖动调整顺序（B26）
2. 频道可以自定义分组，类似 Discord 的 Category（B27）

## 目标用户

- **Admin（管理员）**：管理频道排序、创建/编辑/删除分组、调整分组内频道顺序
- **普通用户（Member）**：查看分组结构、折叠/展开分组

## 现状

参见 `packages/client/src/components/Sidebar.tsx`：

- 频道列表 `sortedChannels` 按 `last_message_at` 降序排列
- 已加入频道平铺显示，未加入公开频道在 "公开频道" 分隔线下方
- DM 列表独立区域
- 无任何排序/分组概念，服务端无 `position` 或 `group` 字段

---

## 需求 1：频道拖动排序（B26）

### 用户故事

> 作为 Admin，我想拖动频道调整它在 sidebar 的显示顺序，以便把最重要的频道放在最容易看到的位置。

### 功能描述

| 项 | 说明 |
|---|---|
| 谁能排序 | **仅 Admin**。普通用户看到 Admin 设定的全局排序 |
| 排序范围 | 全局排序（非每人独立），所有用户看到相同顺序 |
| 拖动交互 | 桌面端：鼠标按住拖动；移动端：长按 ≥300ms 触发拖动 |
| 视觉反馈 | 拖影（半透明的频道项跟随光标/手指）+ 插入位置指示器（蓝色细线） |
| 持久化 | 排序结果存服务端，`channels` 表增加 `position` 字段 |
| 与分组关系 | 频道可在分组之间拖动（B27），拖入分组 = 设置 `group_id` + 更新 `position` |
| 新建频道 | 默认 `position` 为最大值 +1（排在末尾） |

### 验收标准

- [ ] Admin 在 sidebar 可拖动频道，松手后顺序即时生效
- [ ] 拖动过程有拖影和插入位置蓝线指示
- [ ] 刷新页面后排序不变（服务端持久化）
- [ ] 其他在线用户实时看到排序变更（通过 WS 推送 `channel_reorder` 事件）
- [ ] 非 Admin 用户无法触发拖动（拖动手柄不显示 / 拖动无效）
- [ ] 移动端长按 ≥300ms 可触发拖动
- [ ] 新建频道自动排在所属分组末尾

---

## 需求 2：频道自定义分组（B27）

### 用户故事

> 作为 Admin，我想创建分组（Category）并把频道归入不同分组，以便按项目或话题组织频道。

> 作为普通用户，我想折叠/展开分组，以便隐藏不关注的频道、减少视觉噪音。

### 功能描述

| 项 | 说明 |
|---|---|
| 分组概念 | 类似 Discord 的 Category：一个有名字的容器，包含若干频道 |
| 谁能管理 | **仅 Admin** 可创建/重命名/删除分组 |
| 分组排序 | 分组之间可拖动排序（同 B26 拖动交互） |
| 频道归属 | 每个频道可属于一个分组，也可不属于任何分组 |
| 未分组频道 | 显示在所有分组上方的 "未分组" 区域（无 header） |
| 折叠/展开 | 所有用户均可折叠/展开分组，折叠状态存客户端本地（localStorage） |
| 创建分组 | Admin 在 sidebar 点 "+" → 弹窗输入分组名 → 创建 |
| 重命名 | 右键分组 header → "重命名" → inline 编辑 |
| 删除分组 | 右键分组 header → "删除分组" → 确认弹窗 → 组内频道回到 "未分组" |
| 嵌套 | **不支持**——分组不能嵌套分组 |

### 数据模型（建议）

```
channel_groups 表:
  id          TEXT PRIMARY KEY
  name        TEXT NOT NULL
  position    INTEGER NOT NULL DEFAULT 0
  created_at  INTEGER NOT NULL
  updated_at  INTEGER NOT NULL

channels 表新增:
  group_id    TEXT REFERENCES channel_groups(id) ON DELETE SET NULL
  position    INTEGER NOT NULL DEFAULT 0
```

### API（建议）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/admin/channel-groups` | 创建分组 |
| PATCH | `/api/v1/admin/channel-groups/:id` | 重命名分组 |
| DELETE | `/api/v1/admin/channel-groups/:id` | 删除分组（频道回到未分组） |
| PUT | `/api/v1/admin/channel-groups/reorder` | 批量更新分组排序 |
| PUT | `/api/v1/admin/channels/reorder` | 批量更新频道排序 + 分组归属 |

### WS 事件

| 事件 | Payload | 说明 |
|---|---|---|
| `channel_group_created` | `{ group }` | 新建分组 |
| `channel_group_updated` | `{ group }` | 分组重命名/排序变更 |
| `channel_group_deleted` | `{ groupId }` | 分组删除 |
| `channel_reorder` | `{ channels: [{ id, group_id, position }] }` | 频道排序/归属变更 |

### 验收标准

- [ ] Admin 可创建分组，输入名称后 sidebar 即时出现新分组 header
- [ ] Admin 可将频道拖入/拖出分组
- [ ] 分组 header 显示名称 + 折叠箭头（▾ / ▸）
- [ ] 所有用户可折叠/展开分组，刷新后折叠状态保持
- [ ] Admin 右键分组 header 可重命名、删除
- [ ] 删除分组后，原组内频道自动回到 "未分组" 区域
- [ ] 未分组频道显示在所有分组上方
- [ ] 分组不能嵌套分组
- [ ] 其他在线用户通过 WS 实时看到分组变更

---

## 不在 v1 范围

- 频道嵌套（分组不能再嵌套分组）
- 自动分组规则（按标签/类型自动归组）
- 每用户独立排序（v1 仅全局排序）
- 每用户独立分组视图
- DM 列表排序/分组
- 频道置顶/收藏功能（可作为后续需求）

## 成功指标

| 指标 | 目标 |
|---|---|
| Admin 能在 10 秒内完成一次频道拖动排序 | ≤ 10s |
| Admin 能在 30 秒内创建分组并拖入 3 个频道 | ≤ 30s |
| 所有在线用户在 2 秒内看到排序/分组变更 | ≤ 2s |
| 折叠/展开操作无感知延迟 | ≤ 100ms |

## 开放问题

1. ~~排序全局还是每人独立？~~ → 全局，仅 Admin 可改
2. 是否需要拖动权限细分（如 Moderator 也能排序）？→ v1 仅 Admin
3. 分组数量上限？→ v1 不限制，后续根据使用情况决定

## UI 设计稿

→ [频道排序与分组 UI 线框图](../../ui/channel-sort-groups.md)

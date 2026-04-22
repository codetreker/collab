# COL-B20: Channel Workspace — 方向文档

日期：2026-04-22 | 状态：Discussion

## 概述
频道级文件存储——每个 channel 可以有自己的文件空间，存放不适合放 git 的项目文档。

## 核心设计决策（已确认）
- **频道级**：每个 channel 可创建 workspace
- **支持文件夹**
- **所有文件类型**，单文件上限 10MB
- **存储**：v1 本地磁盘（`/data/workspaces/{userId}/{channelId}/`），元数据存 SQLite
- **冲突处理**：同名文件自动加后缀 `file (1).md`，除非明确 replace
- **消息附件自动存入 Workspace**
- **在线编辑 Markdown**
- **聊天可引用/嵌入 Workspace 文件**
- **统一管理页面**：所有 channel 的 workspace 汇总，按 user 隔离

## 文件渲染
共享 FileViewer 组件（同 Remote Explorer）

## UI
- 侧边栏文件树，Remote / Workspace 两个 tab
- 统一管理页面（/workspaces）

## 不在 v1 范围
- 版本历史
- S3 对象存储
- 多人协同编辑

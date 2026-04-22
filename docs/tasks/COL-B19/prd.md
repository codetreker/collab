# COL-B19: Remote Explorer — 方向文档

日期：2026-04-22 | 状态：Discussion

## 概述
远程文件浏览器——让用户在 Collab 浏览器端查看远程机器上的文件，不需要 SSH。

## 核心设计决策（已确认）
- **只读** v1
- **Owner only**：channel 级绑定，但只对 owner 可见（API 校验）
- **多机器支持**：一个 owner 可绑多台机器（如"我的阿里云"、"我的 oc-apps"）
- **连接模型**：机器上跑轻量 agent，主动 WS 连到 Collab server，带唯一 ID + 机器名
- **目录绑定**：用户手工指定要暴露的目录，可绑多个
- **v1 手动刷新**，不做实时文件监听
- **安全**：agent 连接需 token 认证（owner 在 UI 生成 connection token）

## 存储
- Server 端：SQLite
  - `remote_nodes (id, user_id, machine_name, last_seen_at)`
  - `remote_bindings (id, node_id, channel_id, path, label)`
- Agent 端：本地配置文件

## 文件渲染（共享 FileViewer 组件）
- `.md` → Markdown 渲染
- `.ts/.js/.py/...` → 代码高亮（Shiki）
- `.png/.jpg/.gif` → 图片查看器
- 文本检测 → 纯文本 fallback
- 二进制 → 提示"不支持预览"

## UI
- 侧边栏文件树，Remote / Workspace 两个 tab
- Channel 绑定目录作为快捷入口

## 不在 v1 范围
- 文件编辑（写）
- 实时文件监听（fs.watch）
- 消息中本地路径自动转文件链接（独立 feature）

## Agent 进程
- 独立 npm 包 `@collab/remote-agent`
- 一行命令启动：`npx @collab/remote-agent --server wss://collab.codetrek.cn --token xxx --dirs /workspace/collab,/var/log`

# Collab Task Board

> **BOARD.md 是任务状态的唯一 SOT（Single Source of Truth）**
> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner。
> 状态：Backlog → Ready → In Progress → In Review → Done → Archive
> Done/Archive 的任务移到 [`ARCHIVE.md`](ARCHIVE.md)

## Bugs

| ID | Bug | 状态 | Owner | PR | 备注 |
|----|-----|------|-------|----|------|
| COL-BUG-001 | 删除消息权限：用户能删别人的消息 | Backlog | — | — | 应只允许删自己的消息（admin 除外） |

## Features

| ID | 任务 | 状态 | Owner | PR | 文档 | 备注 |
|----|------|------|-------|----|------|------|
| COL-B01 | 私有频道 E2E 加密 | Backlog | 野马 | — | — | 复杂，需建军定方向 |
| COL-B05 | Agent 运行平台 | Backlog | 野马 | — | — | |
| COL-B06 | 基础镜像优化 | Backlog | 飞马 | — | — | CI build 加速 |
| COL-B07 | Agent 自定义 Slash Commands | Backlog | 野马 | — | — | P6 v2 |
| COL-B08 | /status /clear /nick 命令 | Backlog | 野马 | — | — | P6 v2 |
| COL-B09 | 已读回执（✓✓） | Backlog | 野马 | — | — | P5 v2 |
| COL-B11 | 画布 + 文档协作 | Backlog | 野马 | — | — | |
| COL-B13 | DB 操作改用 ORM | Backlog | 飞马 | — | — | 技术债 |
| COL-B15 | Collab Plugin Skill | Backlog | 野马 | — | — | 教 Agent 怎么用 Collab 功能 |
| COL-B16 | 移动端适配 + PWA | In Review | 野马 | #58 | [design](COL-B16/design.md) | staging 验收通过 |
| COL-B17 | @mention 输入过滤 | In Review | 野马 | #60 | [design](COL-B17/design.md) | staging 验收通过 |
| COL-B18 | 富文本/Markdown 输入 | In Review | 野马 | #62 | [design](COL-B18/design.md) | staging 验收中 |
| COL-B19 | Remote Explorer | Backlog | 野马 | — | [direction](COL-B19/direction.md) | 远程文件浏览，只读 v1 |
| COL-B20 | Channel Workspace | Backlog | 野马 | — | [direction](COL-B20/direction.md) | 频道级文件存储 |
| COL-B21 | Plugin SSE → WS 升级 | In Progress | 战马 | — | [design](COL-B21/design.md) | 开发中 |
| COL-B22 | 消息路径文件链接 | Backlog | 野马 | — | [direction](COL-B22/direction.md) | 依赖 B21 |

# Collab Task Board

> **BOARD.md 是任务状态的唯一 SOT（Single Source of Truth）**
> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner。
> 状态：Backlog → Ready → In Progress → In Review → Done → Archive
> Done/Archive 的任务移到 [`ARCHIVE.md`](ARCHIVE.md)

## Bugs

| ID | Bug | 状态 | Owner | PR | 备注 |
|----|-----|------|-------|----|------|
| COL-BUG-001 | 删除消息权限：用户能删别人的消息 | In Progress | 战马 | — | 只允许删自己的（admin 除外） |
| COL-BUG-002 | 文件路径没有变成可点击链接 | Backlog | 飞马 | — | B22 需求，prod 上路径未自动链接化 |
| COL-BUG-003 | 亮色主题下侧边栏和 Workspace 仍是暗色 | Backlog | 飞马 | — | CSS 主题变量未覆盖 |
| COL-BUG-004 | Enter/Ctrl+Enter 键位对调 | Backlog | 飞马 | — | 应 Enter=发送、Ctrl+Enter=换行（和其它 IM 一致） |
| COL-BUG-005 | Markdown 渲染异常 | Backlog | 飞马 | — | 输入框和聊天历史 Markdown 渲染不对 |
| COL-BUG-006 | WS apiKey 从 query string 读取不安全 | Ready | 战马 | — | ws-plugin.ts 改为读 Authorization header，建军指出 |

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
| COL-B19 | Remote Explorer | Backlog | 野马 | — | [direction](COL-B19/direction.md) | 远程文件浏览，只读 v1 |
| COL-B23 | 聊天记录分页加载 | Backlog | 野马 | — | — | 初始加载最近100条，往上滚动增量加载 |
| COL-B24 | 集成测试覆盖 | In Progress | 战马 | [#95](https://github.com/codetreker/collab/pull/95) | [prd](COL-B24/prd.md) [design](COL-B24/design.md) | 真实 server 模式重构中 |
| COL-B25 | 复杂场景集成测试 | Ready | 战马 | — | [prd](COL-B25/prd.md) | 8 个跨模块端到端场景，B24 重构后开始 |

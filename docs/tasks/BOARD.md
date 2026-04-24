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
| COL-BUG-004 | Enter/Ctrl+Enter 键位对调 | Backlog | 飞马 | — | 应 Enter=发送、Ctrl+Enter=换行 |
| COL-BUG-005 | Markdown 代码块渲染 | Done | 战马 | [#105](https://github.com/codetreker/collab/pull/105) | Tiptap hardBreak 导致正则失败 |
| COL-BUG-006 | WS apiKey query string | Done | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | 改为 Authorization header |
| COL-BUG-007 | 通用 WS token query string | Done | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | 改为 Authorization header |
| COL-BUG-008 | Remote WS token query string | Done | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | 改为 Authorization header |
| COL-BUG-009 | SSE api_key query string | Done | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | 改为 Authorization header |
| COL-BUG-010 | Dev 模式 WS 绕过认证 | Backlog | 飞马 | — | NODE_ENV=development 时绕过 |
| COL-BUG-011 | iOS PWA 顶部 safe area | Done | 战马 | [#104](https://github.com/codetreker/collab/pull/104) | viewport-fit + padding-top |
| COL-BUG-012 | iOS PWA 底部留白 | Done | 战马 | [#110](https://github.com/codetreker/collab/pull/110) | safe-area padding 修正 |
| COL-BUG-013 | 窄屏边栏点外不关闭 | Done | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | overlay z-index 修复 |
| COL-BUG-014 | 非聊天页面点频道不切回 | Done | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | closeAllViews 回调 |
| COL-BUG-015 | Remote Node token 明文 + 删除按钮无文字 | Done | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | token 遮掩 + "Delete" 文字 |
| COL-BUG-016 | btn-danger 红字红底文字不可见 | Done | 战马 | [#112](https://github.com/codetreker/collab/pull/112) | PR #111 引入的 CSS 冲突 |
| COL-BUG-017 | Agent 不能指定自定义 ID | Done | 战马 | [#113](https://github.com/codetreker/collab/pull/113) | PR #4 删了 AdminPage customId |
| COL-BUG-018 | Mention 显示 [mention] 纯文本 | Done | 战马 | [#114](https://github.com/codetreker/collab/pull/114) | tiptap-markdown 不识别 Mention node |
| COL-BUG-019 | @ 选人回车直接发送 | Done | 战马 | [#114](https://github.com/codetreker/collab/pull/114) | mentionActiveRef 守卫 Enter |

## UX 优化

| ID | 优化 | 状态 | Owner | PR | 备注 |
|----|------|------|-------|----|------|
| UX-001 | Reaction 占空间太大 | Done | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | hover 显示 + badge 缩小 |
| UX-002 | 代码块边框太宽 | Done | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | padding 收紧 |
| UX-003 | 汉堡按钮不对齐 | Done | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | align-items center |
| UX-004 | 整体布局松散 | Done | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | 间距收紧 |
| UX-005 | 私信+在线列表重复 | Done | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | 合并 + 绿色状态点 |

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
| COL-B23 | 聊天记录分页加载 | Backlog | 野马 | — | — | 初始加载最近100条 |
| COL-B24 | 集成测试覆盖 | Done | 战马 | [#95](https://github.com/codetreker/collab/pull/95) | [prd](COL-B24/prd.md) [design](COL-B24/design.md) | 真实 server 模式 |
| COL-B25 | 复杂场景集成测试 | Done | 战马 | [#101](https://github.com/codetreker/collab/pull/101) | [prd](COL-B25/prd.md) [design](COL-B25/design.md) | 20 个端到端场景 |

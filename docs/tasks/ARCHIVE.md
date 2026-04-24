# Collab Task Archive

> 已完成的任务从 BOARD.md 移到这里。

## Bugs (Done)

| ID | Bug | Owner | PR | 备注 |
|----|-----|-------|----|------|
| COL-BUG-001 | 删除消息权限 | 战马 | — | 代码已有正确权限控制，不可复现 |
| COL-BUG-002 | 文件路径链接化 | 烈马 | [#119](https://github.com/codetreker/collab/pull/119) | 移除 agentId 条件 |
| COL-BUG-003 | 亮色主题 CSS | 战马 | — | 不可复现 |
| COL-BUG-004 | Enter/Ctrl+Enter 键位 | 战马 | — | 不可复现 |
| COL-BUG-005 | Markdown 代码块渲染 | 战马 | [#105](https://github.com/codetreker/collab/pull/105) | Tiptap hardBreak |
| COL-BUG-006 | WS apiKey query string | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | → Authorization header |
| COL-BUG-007 | WS token query string | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | → Authorization header |
| COL-BUG-008 | Remote WS token query string | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | → Authorization header |
| COL-BUG-009 | SSE api_key query string | 战马 | [#100](https://github.com/codetreker/collab/pull/100) | → Authorization header |
| COL-BUG-010 | Dev 模式 WS 绕过认证 | 战马 | [#121](https://github.com/codetreker/collab/pull/121) | 双条件 opt-in |
| COL-BUG-011 | iOS PWA 顶部 safe area | 战马 | [#104](https://github.com/codetreker/collab/pull/104) | viewport-fit + padding-top |
| COL-BUG-012 | iOS PWA 底部留白 | 战马 | [#110](https://github.com/codetreker/collab/pull/110) | safe-area padding |
| COL-BUG-013 | 窄屏边栏点外不关闭 | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | overlay z-index |
| COL-BUG-014 | 非聊天页面点频道不切回 | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | closeAllViews |
| COL-BUG-015 | Remote Node token 明文 | 战马 | [#109](https://github.com/codetreker/collab/pull/109) | token 遮掩 |
| COL-BUG-016 | btn-danger CSS 冲突 | 战马 | [#112](https://github.com/codetreker/collab/pull/112) | PR #111 引入 |
| COL-BUG-017 | Agent 自定义 ID | 战马 | [#113](https://github.com/codetreker/collab/pull/113) | AdminPage customId |
| COL-BUG-018 | Mention 纯文本 | 战马 | [#114](https://github.com/codetreker/collab/pull/114) | MentionWithMarkdown |
| COL-BUG-019 | @ 选人回车发送 | 战马 | [#114](https://github.com/codetreker/collab/pull/114) | mentionActiveRef |

## UX 优化 (Done)

| ID | 优化 | Owner | PR | 备注 |
|----|------|-------|----|------|
| UX-001 | Reaction 占空间太大 | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | hover + badge 缩小 |
| UX-002 | 代码块边框太宽 | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | padding 收紧 |
| UX-003 | 汉堡按钮不对齐 | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | align-items |
| UX-004 | 整体布局松散 | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | 间距收紧 |
| UX-005 | 私信+在线列表重复 | 战马 | [#111](https://github.com/codetreker/collab/pull/111) | 合并 + 绿色点 |

## Features (Done)

| ID | 任务 | Owner | PR | 文档 | 备注 |
|----|------|-------|----|------|------|
| COL-B15 | Collab Plugin Skill | 飞马 | [#122](https://github.com/codetreker/collab/pull/122) | [prd](COL-B15/prd.md) | Plugin 内置 skill |
| COL-B23 | 聊天记录分页加载 | 战马 | [#81](https://github.com/codetreker/collab/pull/81) | — | 初始加载最近100条 |
| COL-B24 | 集成测试覆盖 | 战马 | [#95](https://github.com/codetreker/collab/pull/95) | [prd](COL-B24/prd.md) [design](COL-B24/design.md) | 真实 server，313 tests |
| COL-B25 | 复杂场景集成测试 | 战马 | [#101](https://github.com/codetreker/collab/pull/101) | [prd](COL-B25/prd.md) [design](COL-B25/design.md) | 20 场景，408 tests |

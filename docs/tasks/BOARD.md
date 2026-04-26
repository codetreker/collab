# Collab → Borgee Task Board

> **BOARD.md 是任务状态的唯一 SOT（Single Source of Truth）**
> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner。
> 状态：Backlog → Ready → In Progress → In Review → Done → Archive
> Done 的任务移到 [`ARCHIVE.md`](ARCHIVE.md)
> **一任务一分支**：任务开始时创建分支，PRD/设计/开发/测试全程在同一分支，QA 验收 + review 通过后才合并。

## Features

| ID | 任务 | 状态 | Owner | Branch | PR | 文档 | 备注 |
|----|------|------|-------|--------|----|----- |------|
| COL-B07 | Agent 自定义 Slash Commands | Done | 飞马 | `feat/b07-slash-commands` | [#126](https://github.com/codetreker/collab/pull/126) | [prd](COL-B07/prd.md) [design](COL-B07/design.md) [ui](../ui/slash-commands.md) | P6 v2 |
| COL-B08 | /status /clear /nick 命令 | Done | 飞马 | `feat/b07-slash-commands` | [#126](https://github.com/codetreker/collab/pull/126) | [prd](COL-B08/prd.md) [ui](../ui/slash-commands.md) | 与 B07 同 PR |
| COL-R01 | Server Go 重写 | Ready | 飞马 | `feat/go-server-rewrite` | — | [prd](COL-R01/prd.md) | 纯 server 重写，API+WS+DB 1:1 对等 |
| COL-B01 | 私有频道 E2E 加密 | Backlog | 野马 | — | — | — | 复杂，需建军定方向 |
| COL-B05 | Agent 运行平台 | Backlog | 野马 | — | — | — | |
| COL-B06 | 基础镜像优化 | Backlog | 飞马 | — | — | — | CI build 加速 |
| COL-B09 | 已读回执（✓✓） | Backlog | 野马 | — | — | — | P5 v2 |
| COL-B11 | 画布 + 文档协作 | Backlog | 野马 | — | — | — | |
| COL-B13 | DB 操作改用 ORM | Backlog | 飞马 | — | — | — | 技术债 |
| COL-B19 | Remote Explorer | Backlog | 野马 | — | — | [direction](COL-B19/direction.md) | 远程文件浏览，只读 v1 |
| COL-B26 | 频道拖动排序 | Backlog | 野马 | — | — | — | 侧边栏频道拖动调整顺序 |
| COL-B27 | Admin API 独立 + 权限拆分 + 管理后台重新设计 | Backlog | 野马 | — | — | [prd](COL-B27/prd.md) | admin 接口统一迁移到 /admin-api/v1/xxx；管理后台和用户页面分开（建军 04-26 提） |
| COL-B28 | 项目改名 collab → borgee | Ready | 飞马 | — | — | — | 全面改名：repo/域名/Docker/CI/代码/文档（建军 04-26 决定） |

## Bugs

| ID | Bug | 状态 | Owner | Branch | PR | 备注 |
|----|-----|------|-------|--------|----|----- |
| COL-BUG-020 | PWA 轻 app 非聊天页面 header 重叠 | Done | 战马 | `fix/bug-020-pwa-header` | [#131](https://github.com/codetreker/collab/pull/131) | CSS padding-left + safe-area |
| COL-BUG-021 | Admin 管理页显示已删除用户和频道 | Done | 战马 | `fix/bug-021-admin-deleted` | [#132](https://github.com/codetreker/collab/pull/132) | WHERE deleted_at IS NULL |
| COL-BUG-022 | Admin Create User 不应允许创建 agent；user 列表不应显示 agent | Backlog | 战马 | — | — | agent 由用户自己创建，Admin UI 的 Create User 禁止选 agent；user 列表只显示用户不显示 agent |
| COL-BUG-023 | 默认管理员 userid 用整个邮箱，应只取 @ 前面部分 | Backlog | 战马 | — | — | 创建默认 admin 时 userid 取 email 的 local-part（建军 04-26 提） |
| COL-BUG-024 | /api/v1/users 缺 admin 权限校验，member 能看到所有用户 | Backlog | 战马 | — | — | P0 安全问题：admin 接口需完全独立，/users 只允许 admin 访问（建军 04-26 提，关联 COL-B27） |
| COL-BUG-025 | Prod WS 连接断开（“连接已断开”红色横幅） | Backlog | 战马 | — | — | prod 上 WebSocket 断连，实时消息不可用（建军 04-26 发现） |

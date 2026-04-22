# Collab Task Board

> **BOARD.md 是任务状态的唯一 SOT（Single Source of Truth）**
> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner。
> 状态：Backlog → Ready → In Progress → In Review → Done → Archive
> Done/Archive 的任务移到 [`ARCHIVE.md`](ARCHIVE.md)

| ID | 任务 | 状态 | Owner | PR | 备注 | 文档 |
|----|------|------|-------|----|------|------|
| COL-B12 | 测试覆盖度提升 | Ready | 飞马 | — | 80%+ 目标，CI 检查 | [design](COL-B12/design.md) |
| COL-B01 | 私有频道 E2E 加密 | Backlog | 野马 | — | 复杂，需建军定方向 | |
| COL-B05 | Agent 运行平台 | Backlog | 野马 | — | | |
| COL-B06 | 基础镜像优化 | Backlog | 飞马 | — | CI build 加速 | |
| COL-B07 | Agent 自定义 Slash Commands | Backlog | 野马 | — | P6 v2 | |
| COL-B08 | /status /clear /nick 命令 | Backlog | 野马 | — | P6 v2 | |
| COL-B09 | 已读回执（✓✓） | Backlog | 野马 | — | P5 v2 | |
| COL-B11 | 画布 + 文档协作 | Backlog | 野马 | — | | |
| COL-B13 | DB 操作改用 ORM | Backlog | 飞马 | — | 技术债 | |
| COL-B15 | Collab Plugin Skill | Backlog | 野马 | — | 教 Agent 怎么用 Collab 功能 | |
| COL-B16 | 移动端适配 + PWA | Backlog | 野马 | — | 响应式 + manifest + 汉堡菜单 | |
| COL-B17 | @mention 键盘过滤 | Backlog | 野马 | — | 输入过滤 ID 和名字 | |
| COL-B18 | 富文本/Markdown 输入 | Backlog | 野马 | — | 输入框 Markdown 预览或富文本 | |
| COL-B19 | Remote Explorer | Backlog | 野马 | — | 远程文件浏览器，只读，owner only | [prd](COL-B19/prd.md) · [direction](COL-B19/direction.md) |
| COL-B20 | Channel Workspace | Backlog | 野马 | — | 频道级文件存储 | [prd](COL-B20/prd.md) · [direction](COL-B20/direction.md) |
| COL-B21 | Plugin SSE → WS 升级 | Backlog | 飞马 | — | 基础设施，B22/B19 前置 | [direction](COL-B21/direction.md) |
| COL-B22 | 消息路径文件链接 | Backlog | 野马 | — | 依赖 B21，Agent 消息路径可点击 | [direction](COL-B22/direction.md) |

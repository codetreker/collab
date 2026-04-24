# Collab Task Board

> **BOARD.md 是任务状态的唯一 SOT（Single Source of Truth）**
> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner。
> 状态：Backlog → Ready → In Progress → In Review → Done → Archive
> Done 的任务移到 [`ARCHIVE.md`](ARCHIVE.md)
> **一任务一分支**：任务开始时创建分支，PRD/设计/开发/测试全程在同一分支，QA 验收 + review 通过后才合并。

## Features

| ID | 任务 | 状态 | Owner | Branch | PR | 文档 | 备注 |
|----|------|------|-------|--------|----|----- |------|
| COL-B07 | Agent 自定义 Slash Commands | In Progress | 战马 | `feat/b07-slash-commands` | — | [prd](COL-B07/prd.md) [design](COL-B07/design.md) [ui](../ui/slash-commands.md) | P6 v2，等建军 review |
| COL-B08 | /status /clear /nick 命令 | In Progress | 战马 | `feat/b07-slash-commands` | — | [prd](COL-B08/prd.md) [ui](../ui/slash-commands.md) | 与 B07 同分支 |
| COL-B01 | 私有频道 E2E 加密 | Backlog | 野马 | — | — | — | 复杂，需建军定方向 |
| COL-B05 | Agent 运行平台 | Backlog | 野马 | — | — | — | |
| COL-B06 | 基础镜像优化 | Backlog | 飞马 | — | — | — | CI build 加速 |
| COL-B09 | 已读回执（✓✓） | Backlog | 野马 | — | — | — | P5 v2 |
| COL-B11 | 画布 + 文档协作 | Backlog | 野马 | — | — | — | |
| COL-B13 | DB 操作改用 ORM | Backlog | 飞马 | — | — | — | 技术债 |
| COL-B19 | Remote Explorer | Backlog | 野马 | — | — | [direction](COL-B19/direction.md) | 远程文件浏览，只读 v1 |

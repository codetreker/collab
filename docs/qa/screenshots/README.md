# G3.4 Phase 3 Demo 截屏路径预备 (野马签依据)

> **状态**: v0 (野马, 2026-04-29)
> **目的**: Phase 3 章程退出闸三签野马签依据 — 7 milestone × 多视角 demo 截屏路径锁字面 byte-identical 跟各 milestone 文案锁同源, CI Playwright `page.screenshot()` 主动入 git 防伪造.
> **关联**: G2.4#5 (#275) / G2.5 (#305) / G2.6 (#314) demo 联签同模式; CHN-4 文案锁 #382 ⑥ 双截屏锚 + CV-3 文案锁 #370 G3.4 三张 + CV-4 文案锁 #380 G3.4 四张 + DM-2 #314 G2.6 五张承袭.

---

## 1. 截屏路径锁 (各 milestone 文案锁 §6 截屏挂钩 byte-identical 同源)

| Milestone | 截屏文件 | 验内容 (野马签依据) | 文案锁源 |
|-----------|---------|--------------------|----------|
| **CHN-4** | `g3.4-chn4-chat.png` | "聊天" tab active + agent 🤖 二元角标 + 私信不混排 | #382 ⑥ |
| **CHN-4** | `g3.4-chn4-workspace.png` | "工作区" tab active + artifact list `data-artifact-kind` 三态 + iterate 按钮 🔄 owner 视角 | #382 ⑥ |
| **CV-2** | `g3.4-cv2-anchor-entry.png` | 段落锚点入口 💬 + tooltip "评论此段" | #355 ① |
| **CV-2** | `g3.4-cv2-thread-bubble.png` | 锚点对话气泡 + header "段落讨论" | #355 ② |
| **CV-2** | `g3.4-cv2-agent-reply.png` | agent 锚点回复 🤖 + author_kind="agent" | #355 ④ |
| **CV-2** | `g3.4-cv2-resolved.png` | "标为已解决" thread + `data-resolved="true"` 灰底降权 | #355 ⑥ |
| **CV-3** | `g3.4-cv3-markdown.png` | markdown artifact 渲染 + `data-artifact-kind="markdown"` | #370 ① |
| **CV-3** | `g3.4-cv3-code-go-highlight.png` | code artifact + 语言徽标 `GO` + prism 高亮 | #370 ② |
| **CV-3** | `g3.4-cv3-image-embed.png` | image_link artifact + `<img loading="lazy">` https only | #370 ④ |
| **CV-4** | `g3.4-cv4-iterate-trigger.png` | iterate 按钮 🔄 owner-only DOM omit + 输入框 placeholder "告诉 agent 你希望它做什么…" | #380 ①② |
| **CV-4** | `g3.4-cv4-running-state.png` | state running "agent 正在迭代…" + 进度条 | #380 ③ |
| **CV-4** | `g3.4-cv4-completed-newversion.png` | state completed "已生成 v{N}" + 自动跳新版 + kindBadge 🤖 | #380 ④ |
| **CV-4** | `g3.4-cv4-diff-view.png` | "对比" tab + jsdiff 蓝绿配色 + ARIA label | #380 ⑤ |
| **CHN-2** | `g3.x-dm-sidebar-section.png` | 侧栏 "私信" 分组 + DM 行无 `#` 频道前缀 | #354 ① |
| **CHN-2** | `g3.x-dm-view-no-workspace.png` | DM 视图反向断言无 workspace tab + 无 channel-only 控件 | #354 ④ + 7 源同根 |
| **CHN-2** | `g3.x-dm-mention-third-blocked.png` | DM `@<3rd_user>` 候选空 + placeholder "私信仅限两人..." | #354 ⑤ |
| **CHN-3** | `g3.x-chn3-sidebar-reorder.png` | sidebar 拖拽 reorder + group ▼/▶ 折叠 + DM 行无拖拽 handle | #371 §3 + #366 ④ |
| **DM-2** | `g2.6-mention-render.png` | `<span data-mention-id>@{display_name}</span>` 蓝色高亮 + raw UUID 仅 attr | #314 ① |
| **DM-2** | `g2.6-mention-candidate.png` | textarea `@` 候选列表 + agent 🤖 角标 | #314 ② |
| **DM-2** | `g2.6-offline-fallback-dm.png` | system DM "{agent_name} 当前离线，#{channel} 中有人 @ 了它，你可能需要处理" byte-identical | #314 ③ |
| **DM-2** | `g2.6-sender-no-hint.png` | 发送方 UI 无任何离线提示 (反向断言 toast/inline/banner 0 hit) | #314 ④ |
| **DM-2** | `g2.6-online-ping.png` | 在线 target → MentionPushedFrame ≤3s 实时刷 + notification | #314 + #372 ee2aeb2 |

---

## 2. CI 主动截屏机制 (反 PS 修改)

```typescript
// packages/e2e/tests/g3-4-collab-skeleton.spec.ts (CHN-4.3 闸位)
await page.screenshot({path: 'docs/qa/screenshots/g3.4-chn4-chat.png', fullPage: true});
await page.screenshot({path: 'docs/qa/screenshots/g3.4-chn4-workspace.png', fullPage: true});
```

跟 G2.4 #275 模式 byte-identical: **截屏文件入 git** (二进制 LFS 或直接 commit), CI Playwright run 主动覆盖, 反人工 PS 修改。

---

## 3. 文案锁验机制 (野马签三段)

每张截屏野马签 = 三段验:
1. **DOM 字面验**: 截屏对应 DOM `data-*` attr / class / aria-label 跟文案锁字面 byte-identical
2. **文本节点验**: 截屏中文中文/英文/emoji 字面跟文案锁 byte-identical (反同义词漂移)
3. **反约束验**: 反向断言 — 截屏内**不应**出现的字面 (e.g. `data-tab="workspace"` 在 DM 视图内 / `"重试"` 按钮在 failed state)

签字依据: 三段验全过 → 野马签 PR description "✅ 截屏文案锁验 byte-identical".

---

## 4. 三签机制 (跟 G2.4#5 / G2.5 / G2.6 同模式)

- **战马**: e2e 真过 ≤3s 各 tab (CHN-4.3 / CV-2.3 / CV-3.3 / CV-4.3 PR)
- **烈马**: acceptance template 段对齐 (#353/#358/#371/#376/#381 已就位, REG-* 翻 🟢)
- **野马**: 双 tab / 多视角截屏文案锁验 byte-identical (本 doc 是签字依据)

缺一签 → Phase 3 退出公告不落. 跟 G2.x 联签历史一致 (G1 / G2 都三签链入 closure announcement PR).

---

## 5. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-29 | 野马 | v0, 22 张截屏路径锁 (CHN-4 双 / CV-2 四 / CV-3 三 / CV-4 四 / CHN-2 三 / CHN-3 一 / DM-2 五) byte-identical 跟各 milestone 文案锁 §6 同源 + CI 主动截屏机制 + 三段验 + 三签机制 |

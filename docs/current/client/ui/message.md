# 4. 消息气泡

## 4a. 普通消息

```
┌──┐  Username                      2:30 PM
│AV│  This is a normal text message that can span
└──┘  multiple lines if the content is long enough.
                                      [😀] [✏️] [🗑]  ← hover 才显示
      👍 3   🎉 1                     ← Reactions
```

## 4b. 代码块消息

```
┌──┐  🤖 AgentX                     2:31 PM
│AV│  Here are the test results:
└──┘
      ┌─────────────────────────────────────────────────────────┐
      │ ```typescript                                           │
      │ describe('auth', () => {                                │
      │   it('should login with valid credentials', () => {     │
      │     expect(result.status).toBe(200);                    │
      │   });                                                   │
      │ });                                                     │
      │ ```                                                     │
      └─────────────────────────────────────────────────────────┘
```

## 4c. @Mention

```
┌──┐  Bob                           2:33 PM
│AV│  @Alice great work on the PR! The @AgentX
└──┘  review comments were helpful too.
       ↑                                ↑
       高亮蓝色背景                      Agent mention 带 🤖 标记
```

- **头像（AV）**：圆角方形，32px，Agent 头像带 🤖 标记
- **用户名 + 时间戳**：用户名加粗，时间戳灰色右对齐
- **Reactions**：消息底部，emoji + 计数，点击可切换
- **Hover 操作**：鼠标悬浮时右上角浮现 React / Edit / Delete 按钮

---

## 4f. BPP-3.2.2 — Capability grant DM 三按钮 (Phase 5)

> BPP-3.2.2 (#494 follow-up) · 蓝图 [`auth-permissions.md`](../../../blueprint/auth-permissions.md) §1.3 主入口 + content-lock [`bpp-3.2-content-lock.md`](../../../qa/bpp-3.2-content-lock.md) §3 DOM 字面锁.

owner 收 system DM (BPP-3.2.1 server 写) → SystemMessageBubble (`packages/client/src/components/SystemMessageBubble.tsx`) 检测 quick_action JSON 是 BPP-3.2 shape (含 `action ∈ grant/reject/snooze` + 4 必填字段) → 渲染**三按钮**:

```
┌──┐  System                          2:30 PM
│SY│  AgentX 想 commit_artifact 但缺权限 commit_artifact
└──┘  ┌──────┐ ┌──────┐ ┌──────┐
      │ 授权 │ │ 拒绝 │ │ 稍后 │
      └──────┘ └──────┘ └──────┘
```

DOM 字面锁 byte-identical 跟 content-lock §3 (改 = 改两处: content-lock + SystemMessageBubble.tsx):

| label | data-action | data-bpp32-button | 视觉 |
|---|---|---|---|
| `授权` | `grant` | `primary` | 主按钮 (绿色) |
| `拒绝` | `reject` | `danger` | 次按钮 (红色) |
| `稍后` | `snooze` | `ghost` | 弱按钮 (灰色) |

点击 → `postMeGrant({...payload, action})` → POST `/api/v1/me/grants` → server 真改 user_permissions (action='grant') 或 audit-only (reject/snooze, v1 不持久化 deny list).

**反约束 (content-lock §3 同义词反向 grep)**: 12 词禁出现在 button label — 批准/授予/同意/许可 (替 "授权") / 驳回/拒接/否决/不允许 (替 "拒绝") / 稍候/延后/推迟/暂缓/过会儿 (替 "稍后"). 单测 `SystemMessageBubble.bpp32.test.tsx` 守.

CM-onboarding 既有单按钮 (`{kind: 'button', label, action}`) 路径不变 — `isBPP32GrantPayload` type guard 区分 shape.

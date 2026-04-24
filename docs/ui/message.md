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

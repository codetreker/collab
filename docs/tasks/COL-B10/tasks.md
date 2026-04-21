Here's the full task breakdown for COL-B10 (消息编辑与删除):

---

## COL-B10 Task List

### T1: DB Migration — `deleted_at` column
| | |
|---|---|
| **Files** | `packages/server/src/db.ts` |
| **Est. lines** | ~5 |
| **What** | Add `ALTER TABLE messages ADD COLUMN deleted_at INTEGER` in `migrate()` |
| **Verify** | Unit test: create message → query → confirm `deleted_at` is null; manual: `.schema messages` shows column |
| **Depends on** | None |

---

### T2: Backend — Edit API + WS broadcast
| | |
|---|---|
| **Files** | `packages/server/src/routes/messages.ts` (+50), `packages/server/src/queries.ts` (+25), `packages/server/src/ws.ts` (+5) |
| **Est. lines** | ~80 |
| **What** | `PUT /api/v1/messages/:messageId` — validate content non-empty, check `sender_id === currentUser.id`, reject if `deleted_at` set, UPDATE `content` + `edited_at`, call `broadcastToChannel('message_edited', ...)` |
| **Verify** | `curl -X PUT` own message → 200 + updated fields; edit other's → 403; edit deleted → 400; WS client receives `message_edited` |
| **Depends on** | T1 (needs `deleted_at` check) |

---

### T3: Backend — Delete API + WS broadcast + list filter
| | |
|---|---|
| **Files** | `packages/server/src/routes/messages.ts` (+45), `packages/server/src/queries.ts` (+30) |
| **Est. lines** | ~75 |
| **What** | `DELETE /api/v1/messages/:messageId` — check own OR admin, soft-delete via `UPDATE deleted_at = now()`, broadcast `message_deleted`. Modify `getMessages()` in queries.ts: when `deleted_at` is set, replace `content` with `""` in response. |
| **Verify** | Delete own → 204; admin delete other's → 204; non-admin delete other's → 403; re-delete → 204 (idempotent); GET messages shows empty content for deleted |
| **Depends on** | T1 |

---

### T4: Frontend — State + WS handlers for edit/delete
| | |
|---|---|
| **Files** | `packages/client/src/context/AppContext.tsx` (+30), `packages/client/src/hooks/useWebSocket.ts` (+20), `packages/client/src/lib/api.ts` (+20) |
| **Est. lines** | ~70 |
| **What** | Add `EDIT_MESSAGE` / `DELETE_MESSAGE` reducer cases (update message in `state.messages` Map). Add `message_edited` / `message_deleted` handlers in useWebSocket. Add `editMessage(id, content)` and `deleteMessage(id)` API functions. |
| **Verify** | Open two browser tabs → edit in tab A → tab B updates in real-time; same for delete |
| **Depends on** | T2, T3 (backend APIs must exist) |

---

### T5: Frontend — Message action bar + inline edit UI
| | |
|---|---|
| **Files** | `packages/client/src/components/MessageItem.tsx` (+120), `packages/client/src/index.css` (+40) |
| **Est. lines** | ~160 |
| **What** | On hover: show action bar (✏️ edit, 🗑️ delete) alongside existing ReactionBar ➕. Edit button → swap content to `<textarea>`, Enter saves (calls PUT API + dispatches EDIT_MESSAGE), Esc cancels. Show "(已编辑)" when `edited_at` is set. Delete button → `window.confirm()` → calls DELETE API. Deleted messages render "此消息已删除" in gray italic. Visibility: edit only on own messages; delete on own + admin on all. |
| **Verify** | Browser: hover shows buttons; click edit → inline textarea → Enter saves + "(已编辑)" appears; Esc cancels; delete → confirm → gray "此消息已删除"; admin sees delete on others' messages |
| **Depends on** | T4 (needs reducer + API functions) |

---

### T6: SSE/Plugin — edit/delete events + system message injection
| | |
|---|---|
| **Files** | `packages/server/src/routes/messages.ts` (+15, insert events), `packages/server/src/queries.ts` (+20, system message helper), `packages/server/src/routes/stream.ts` (+10, event filtering) |
| **Est. lines** | ~45 |
| **What** | When a message is edited/deleted, INSERT into `events` table with kind `'message_edited'` / `'message_deleted'` so SSE/poll consumers (agents) receive them. **System message injection** (per your note): also INSERT a real `messages` row with `sender_id = 'system'` and content like `"用户 A 编辑了消息：[新内容]"` / `"用户 A 删除了一条消息"` + corresponding `new_message` event — this way agents see the change in the normal message stream without needing special event parsing. |
| **Verify** | Agent SSE stream: edit a message → agent receives both `message_edited` event AND a system message in the channel; same for delete. Agent calls `PUT /api/v1/messages/:id` on own message → works; on others' → 403. |
| **Depends on** | T2, T3 |

---

### Execution Order (dependency graph)

```
T1 (DB migration)
├── T2 (Edit API)      ─┐
├── T3 (Delete API)     ├── T4 (Frontend state) ── T5 (UI)
└───────────────────────┘
    T2 + T3 ── T6 (SSE + system messages)
```

**Recommended sequence**: T1 → T2+T3 (parallel) → T4+T6 (parallel) → T5

Total estimated: **~435 lines** of new/modified code across 9 files.

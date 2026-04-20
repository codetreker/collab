# Channel Membership Review — PR1 (T1–T6) + PR2 (T7–T11)

Reviewer: Claude | Date: 2026-04-20 | Branch: `feat/collab-v1`

---

## P0 — Must Fix Before Merge

### 1. `user_joined` / `user_left` WS event field names inconsistent between backend and frontend

**Backend** (`channels.ts:209–216`) broadcasts `channel_id`, `user_id`, `display_name`:
```json
{ "type": "user_joined", "channel_id": "...", "user_id": "...", "display_name": "..." }
```

**Frontend** (`useWebSocket.ts:174–175`) reads `data.channelId` and `data.userId` (camelCase):
```ts
const joinedChannelId = data.channelId as string;  // always undefined
const joinedUserId = data.userId as string;         // always undefined
```

Same issue for `user_left` at line 185 (`data.channelId`).

**Impact**: Join/leave events are silently dropped on the frontend — channel member count and online indicators never update in real time from these events.

**Fix**: Frontend should read `data.channel_id` and `data.user_id` (snake_case), matching the backend payload.

---

### 2. `POST /api/v1/channels/:channelId/messages` — missing private channel access control

**File**: `messages.ts:84–97`

The create-message endpoint checks `isChannelMember` (line 95) but does **not** call `canAccessChannel` first. This means:
- Public channel non-members correctly get 403 (membership check).
- Private channel non-members get **403 "Not a member"** instead of **404 "Channel not found"**.

Per the design doc (§ Access Control): non-members accessing private channels must receive **404** to avoid leaking channel existence.

**Fix**: Add `canAccessChannel` check before the membership check, returning 404 if denied.

---

### 3. Dead code: `addUserToDefaultChannel` still exported in `queries.ts:418–429`

No callers remain (all replaced by `addUserToPublicChannels`). This is dead code that could confuse future developers into using the wrong function.

**Fix**: Remove `addUserToDefaultChannel`.

---

## P1 — Should Fix

### 4. Private channel `channel_created` broadcast leaks channel existence

**File**: `channels.ts:66–69`

When creating a **private** channel, `broadcastToChannel` sends `channel_created` to all subscribers of that channel. Since the channel was just created, the only subscribers are the creator and invited members — so this is safe at creation time.

However, the broadcast happens **after** the transaction, at which point `addAllUsersToChannel` (for public) or member adds (for private) have completed. For private channels `broadcastToChannel` will only reach people who subscribed, and no one has subscribed yet, so the event is effectively a no-op for private channels. This is not harmful but is wasteful.

**Recommendation**: For private channels, use `broadcastToUser` to each initial member instead, or skip the broadcast since the creator already has the response.

### 5. `#general` channel creation lacks explicit `visibility: 'public'`

**File**: `seed.ts:53–54`

```ts
createChannel(db, 'general', 'General discussion', adminId);
```

The `visibility` parameter defaults to `'public'` in `createChannel`, so this works. But if the default ever changes, `#general` would be created as private. Explicit is better.

### 6. Admin can see private channels but `channel_added` not sent on visibility toggle for admin non-members

**File**: `channels.ts:143–174`

When a channel switches private→public, `broadcastToUser` sends `channel_added` to newly added users. But when a channel switches public→private, existing non-admin members who were just removed from visibility don't receive `channel_removed`. Their sidebar will show the channel until they refresh.

**Design doc** says "公开→私有保留已有成员" — so members aren't removed, just future users won't auto-join. This means the current behavior is correct per spec, but the sidebar for non-members (e.g., users who left the public channel before it went private) could still show a stale entry. Edge case, but worth noting.

### 7. No `#general` protection on channel creation

**File**: `channels.ts:22–72`

The update endpoint correctly blocks `visibility: 'private'` for `#general` (line 127–129). But the create endpoint does **not** prevent creating a channel named `general` with `visibility: 'private'`. The name dedup check (line 40–43) will catch a second `general`, but if `#general` doesn't exist yet (fresh DB, seed hasn't run), someone could create a private `#general`.

**Fix**: Add validation in create: if `cleanName === 'general'` and `vis === 'private'`, return 403.

### 8. `visibility_changed` broadcast goes to channel subscribers but private channel non-members may be subscribed

When changing public→private, existing subscribers (from when the channel was public) will receive the `visibility_changed` event. Users who are members will correctly see the update; users who left the channel but still have a stale WS subscription will also see it. Low risk but inconsistent with "private channels invisible to non-members."

---

## P2 — Nice to Have

### 9. Performance: `addAllUsersToChannel` and `addUserToPublicChannels` use unbatched loops

**Files**: `queries.ts:448–460`, `queries.ts:431–446`

Both functions iterate over all users/channels and INSERT one row at a time. For current scale (<20 users) this is fine. For larger deployments, a single `INSERT INTO ... SELECT` would be more efficient.

### 10. `listDmChannelsForUser` has N+1 query for `last_message`

**File**: `queries.ts:635–637`

Each DM channel fires a separate query for the last message. Could be a subquery in the main SELECT. Low priority at current scale.

### 11. Frontend `ChannelMembersModal` doesn't refresh visibility state after toggle

**File**: `ChannelMembersModal.tsx:63–75`

After `handleVisibilitySwitch`, it calls `actions.loadChannels()` to refresh the channel list, but the modal's local `channelVisibility` prop won't update until the parent re-renders. The modal stays open showing the old visibility label until closed and reopened. Minor UX issue.

### 12. WebSocket `subscribe` allows admin to subscribe to private channels but doesn't distinguish read-only vs full access

**File**: `ws.ts:171–176`

Admin non-members can subscribe (correct per design) and will receive all messages. The `send_message` handler (line 210) checks `isChannelMember` — so admin can't post via WS without being a member. This matches the design doc. No issue, just confirming.

### 13. DM routes unaffected — Confirmed

**File**: `dm.ts` — No visibility-related changes. DM creation and listing use `type = 'dm'` filtering, completely separate from the visibility system. All channel listing queries filter `type = 'channel' OR type IS NULL`. No regressions.

### 14. Poll endpoint correctly scoped — Confirmed

**File**: `poll.ts:65` — Uses `channel_members` table to scope events to user's channels. Since private channels only have actual members in `channel_members`, poll automatically excludes private channel events from non-members. No changes needed.

---

## Summary

| Priority | Count | Key Issues |
|----------|-------|------------|
| P0       | 3     | WS event field mismatch (silent data loss), missing 404-vs-403 on message create, dead code |
| P1       | 5     | Broadcast leak, seed explicitness, visibility toggle edge cases, #general creation guard |
| P2       | 6     | Performance, UX polish, confirmations |

**Overall Assessment**: The implementation closely follows the design doc. Access control via `canAccessChannel` is applied correctly across channel detail, messages GET, search, and member list routes. The `broadcastToUser` mechanism works for `channel_added`/`channel_removed`. The P0 field name mismatch (snake_case vs camelCase) is the most critical issue — it silently breaks real-time membership updates on the frontend.

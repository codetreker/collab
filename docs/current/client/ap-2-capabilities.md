# AP-2 client — capability 透明 UI 无角色名 (≤40 行)

> 落地: feat/ap-2 AP2.2 (`lib/capabilities.ts` + `components/PermissionsView.tsx` + 15 vitest)
> 关联: server `docs/current/server/ap-2.md` /api/v1/me/permissions response shape

## 1. capability label SSOT — `lib/capabilities.ts`

```ts
export const CAPABILITY_TOKENS = [...] as const; // 14 字面 byte-identical 跟 server auth.ALL
export type CapabilityToken = (typeof CAPABILITY_TOKENS)[number];
export function capabilityLabel(token: string): string;        // 14 中文字面 LABEL_MAP + 未知 forward-compat
export function isKnownCapability(token: string): boolean;     // 反向断言 helper
```

LABEL_MAP 14 字面 byte-identical (跟 content-lock §1):
- read_channel → 查看频道 / write_channel → 在频道发消息 / delete_channel → 删除频道
- read_artifact → 查看产物 / write_artifact → 编辑产物 / commit_artifact → 提交产物
- iterate_artifact → 迭代产物 / rollback_artifact → 回滚产物
- mention_user → 提及用户 / read_dm → 查看私信 / send_dm → 发送私信
- manage_members → 管理频道成员 / invite_user → 邀请用户 / change_role → 调整成员能力

## 2. component — `components/PermissionsView.tsx`

DOM data-attr SSOT (跟 content-lock §2 byte-identical):
- `data-ap2-permissions-view` (root list)
- `data-ap2-capability-row` + `data-ap2-capability-token` + `data-ap2-scope` + `data-ap2-known`
- `data-ap2-capability-label` + `data-ap2-capability-scope`
- 5 态: `data-ap2-empty` / `data-ap2-loading` / `data-ap2-error` + 多行 + wildcard `*` 渲染 `完整能力`

## 3. 反约束

- ❌ RBAC 角色名漂入 (英 admin/editor/viewer/owner + 中 管理员/编辑者/查看者) 0 hit
- ❌ inline 字面散落 (capabilityLabel SSOT 单源 production 仅 1 hit)
- ❌ admin god-mode UI 永久独立 (capabilityLabel 不挂 components/admin/* 路径)
- ❌ thought-process 5-pattern + typing-indicator 漂入 (跟 RT-3 #616 承袭)

## 4. tests

- `__tests__/ap-2-capabilities.test.ts` 5 vitest (14 token 顺序 + 14 中文 label + unknown forward-compat + isKnownCapability + 反 RBAC 7 词)
- `__tests__/PermissionsView.test.tsx` 5 vitest (5 态 DOM + multi-row 反 RBAC)
- `__tests__/ap-2-reverse-grep.test.ts` 5 vitest (14 const 字面 + 反 RBAC 英 4 词 + 反 RBAC 中 3 词 + admin god-mode 独立 + capabilityLabel SSOT 单源)

# AP-2 server — capability 透明 UI response shape (≤40 行)

> 落地: feat/ap-2 AP2.1 (`internal/api/users.go` /api/v1/me/permissions 加 capabilities 字段 + deriveAP2Capabilities helper + 5 unit)
> 关联: client `docs/current/client/ap-2-capabilities.md` (14 const + LABEL_MAP byte-identical)

## 1. response shape — `/api/v1/me/permissions`

```json
{
  "user_id": "...",
  "role": "member",          // legacy caller 兼容 — UI 不显此字段
  "permissions": ["*"],
  "details": [...],
  "capabilities": [           // AP-2 SSOT (新加, 走 14 const byte-identical 跟 auth.ALL)
    "read_channel", "write_channel", "delete_channel",
    "read_artifact", "write_artifact", "commit_artifact",
    "iterate_artifact", "rollback_artifact",
    "mention_user", "read_dm", "send_dm",
    "manage_members", "invite_user", "change_role"
  ]
}
```

## 2. helper — `deriveAP2Capabilities(role, permissions)`

- member + `["*"]` → 全 14 const (AP-0 default)
- agent / bundle-narrowed → permissions[] prefix 解析 + auth.IsValidCapability 反向断言 + dedupe + unknown forward-compat drop

## 3. 反约束

- ❌ response 不暴露 RBAC role:value (admin/editor/viewer/owner) 字面 (反 role bleed)
- ❌ admin god-mode UI 永久独立 (`/admin-api/users/*` 不走本 helper)
- ❌ 0 schema / 0 endpoint URL / 0 routes.go 改

## 4. tests

- `internal/api/ap_2_capabilities_test.go` 5 unit (member full grant 14 const 顺序 + agent narrowed + agent no grant + only known tokens 反 RBAC + response JSON 反 RBAC role 字面)

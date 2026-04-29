// Package auth — abac.go: AP-1 立场 ② ABAC capability check 单 SSOT.
//
// 单 helper `HasCapability(ctx, permission, scope) bool` — 所有 endpoint
// authz 走此一处, 不字面 hardcode permission name (反 grep 守 spec §2 #1).
//
// SSOT: `user_permissions(user_id, permission, scope)` 表 (蓝图 §1.1
// + data-layer.md). agent 是 user_id 一种, 同 ABAC.
//
// Spec锚: docs/implementation/modules/ap-1-spec.md §1 立场 ② + §3 文件
// 清单 (`internal/auth/abac.go` 单 SSOT).
//
// 蓝图锚: docs/blueprint/auth-permissions.md §1.1 (ABAC source of truth)
// + §1.2 (Scope 三层 v1: `*` / `channel:<id>` / `artifact:<id>`).
//
// 反约束: bundle 字面不入 server (spec §2 #3 — bundle 是 client UI 糖,
// server 端只看 capability list); admin god-mode 不入此 ABAC (spec §2
// #5 — admin 走 /admin-api/* 单独 mw, ADM-0 §1.3 红线).
package auth

import (
	"context"
	"fmt"
	"net/http"

	"borgee-server/internal/store"
)

// HasCapability is the single SSOT capability check — all endpoint
// authz routes through this helper. Returns true iff the user (from
// context) has been granted (permission, scope), with the v1 scope
// fallback hierarchy:
//
//   - explicit (permission, scope) row → grant
//   - explicit (permission, "*") row → grant (wildcard scope)
//   - explicit ("*", "*") wildcard row → grant (human admin / AP-0
//     default; agent 不享, 蓝图 §1.4 字面承袭, 见 IsAgent 守)
//
// 反约束 (spec §2 + 蓝图 §1.4 + §2 不变量):
//   - admin 不入此路径 — admin god-mode 走 /admin-api/* (ADM-0 §1.3).
//   - agent 不享 (*,*) wildcard — IsAgent 守, owner 即使误 grant 也 403.
//   - bundle 字面不入 — bundle 是 client UI 糖, server 只看 capability.
//
// Returns (granted bool). Use store.Store.ListUserPermissions through
// the package var hook so tests can swap.
func HasCapability(ctx context.Context, s *store.Store, permission, scope string) bool {
	user := UserFromContext(ctx)
	if user == nil {
		return false
	}
	perms, err := s.ListUserPermissions(user.ID)
	if err != nil {
		return false
	}
	isAgent := user.Role == "agent"
	for _, p := range perms {
		// agent 不享 (*,*) 短路 — 蓝图 §1.4 立场字面.
		if !isAgent {
			if p.Permission == "*" && p.Scope == "*" {
				return true
			}
		}
		if p.Permission == permission && (p.Scope == "*" || p.Scope == scope) {
			return true
		}
	}
	return false
}

// ChannelScopeStr / ArtifactScopeStr build canonical scope strings
// for use as the `scope` argument to HasCapability. Mirrors the
// existing channelScope() pattern in api/channels.go (single source).
func ChannelScopeStr(channelID string) string  { return fmt.Sprintf("channel:%s", channelID) }
func ArtifactScopeStr(artifactID string) string { return fmt.Sprintf("artifact:%s", artifactID) }

// ArtifactScope is a request-time helper: extracts {artifactId}
// PathValue and returns "artifact:{id}". Mirrors channelScope() for
// use as the scopeResolver in middleware-style call sites.
func ArtifactScope(r *http.Request) string {
	return ArtifactScopeStr(r.PathValue("artifactId"))
}

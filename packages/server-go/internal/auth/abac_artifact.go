// Package auth — abac_artifact.go: AP-1.2 artifact-scope ABAC enforcer
// + agent strict-403 helper. Companion to permissions.go RequirePermission.
//
// Blueprint锚: docs/blueprint/auth-permissions.md §1.2 (Scope 层级 v1
// 三层 — `*` / `channel:<id>` / `artifact:<id>` 全 ✅) + §1.4 (跨 org
// 只能减权 — owner-only path) + §2 不变量 (Agent 默认最小 + 跨 org 只
// 减不加 + Permission denied 走 BPP 路由 owner DM) + §5 与现状的差距
// (artifact:<id> 渲染逻辑 + permission_denied BPP frame 留账).
//
// Spec: AP-1 milestone v0 — 8/8 Phase 4 entry 收口.
//
// What this file does:
//   1. ArtifactScope(r) string — `artifact:{id}` resolver matching the
//      channelScope() pattern in api/channels.go for use with
//      RequirePermission middleware.
//   2. RequireAgentStrict403 — 反约束 helper: agent 角色 (users.role='agent')
//      跨 scope 严格 403, 不 fallback 到 wildcard `(*,*)` 短路 (蓝图 §1.4
//      "跨 org 只能减权"立场承袭 — agent 不能借 wildcard 越权).
//   3. HasAgentScope(s, agentID, perm, scope) — store-side helper for BPP
//      permission_denied frame routing (蓝图 §2 不变量 "Permission denied
//      走 BPP" — 协议层路由, 此处 server 端校验).
//
// 反约束 (auth-permissions.md §1 立场 + §2 不变量):
//   - agent 不享 `(*,*)` 短路: wildcard 是人类 admin 的特权 (AP-0 注册
//     时 grant), agent 只能凭显式 (permission, scope) 行通过. 反向 grep
//     CI lint 守 RequireAgentStrict403 路径不 short-circuit.
//   - artifact:<id> scope 不替代 channel:<id> — 两层并存, RequirePermission
//     scopeResolver 选 artifactScope 时校 artifact:<id> 行 + channel:<id>
//     行 + `*` 行任一 grant 即过 (跟 channelScope 同模式).
//   - 跨 org 不加权: owner-only grant 路径在 api/admin.go handleGrantPermission
//     已锁 (admin only); 此处不重复, 但 strict403 helper 反向防 agent
//     借短路绕 (即使有 wildcard 行也 403, 防 owner 误 grant).
package auth

import (
	"fmt"
	"net/http"
	"time"

	"borgee-server/internal/store"
)

// ArtifactScope returns `artifact:{artifactId}` for use as the
// scopeResolver in RequirePermission. Mirrors channelScope() in
// api/channels.go — keeps the scope-string convention single-sourced.
//
// PathValue("artifactId") matches the route pattern
// `/api/v1/artifacts/{artifactId}/...` declared in api/artifacts.go.
func ArtifactScope(r *http.Request) string {
	return fmt.Sprintf("artifact:%s", r.PathValue("artifactId"))
}

// RequireAgentStrict403 is a stricter variant of RequirePermission used
// on agent-write paths (artifact.edit_content / artifact.modify_structure
// / channel.invite_agent etc.). It enforces:
//
//  1. user MUST be authenticated (else 401 — same as RequirePermission)
//  2. if user.role == "agent": NO `(*,*)` wildcard short-circuit; agent
//     MUST have an explicit (permission, scope) row matching the request
//     (蓝图 §1.4 "跨 org 只能减权" 字面承袭 — agent 默认最小, owner 显式
//     grant 才放过).
//  3. for non-agent users: identical to RequirePermission semantics
//     (wildcard short-circuit allowed for human owners).
//
// 反约束: agent 即使 owner 误 grant 了 (*,*) 也仍 403 — 防御 grant 路径
// 误操作. wildcard 是人类 admin 特权 (AP-0 注册时 grant), 不该流向 agent.
func RequireAgentStrict403(s *store.Store, permission string, scopeResolver func(r *http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil {
				writeJSON401(w)
				return
			}

			perms, err := s.ListUserPermissions(user.ID)
			if err != nil {
				writeJSON401(w)
				return
			}

			scope := ""
			if scopeResolver != nil {
				scope = scopeResolver(r)
			}

			isAgent := user.Role == "agent"
			now := time.Now().UnixMilli()

			for _, p := range perms {
				// AP-1: skip expired permissions (蓝图 §1.2 expires_at
				// schema 保留 — v1 schema 加列, server 端守过期 reject).
				if p.ExpiresAt != nil && *p.ExpiresAt > 0 && *p.ExpiresAt <= now {
					continue
				}

				// agent 不享 wildcard 短路 — 立场 ① 反约束.
				if !isAgent {
					if p.Permission == "*" && p.Scope == "*" {
						next.ServeHTTP(w, r)
						return
					}
				}
				if p.Permission == permission && (p.Scope == "*" || p.Scope == scope) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// 403 + machine-readable hint for BPP permission_denied frame
			// (蓝图 §2 "Permission denied 走 BPP" — body keys
			// {required_capability, current_scope} byte-identical 跟蓝图
			// §4.1 frame 字段名).
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprintf(w, `{"error":"Forbidden","required_capability":%q,"current_scope":%q}`,
				permission, scope)
		})
	}
}

// HasAgentScope checks whether agentID has been granted (perm, scope)
// — used by BPP permission_denied frame routing path (server 端校验
// 后再决定是否触发 owner DM 通知). Returns true iff:
//
//   - explicit (permission=perm, scope=scope) row exists, OR
//   - explicit (permission=perm, scope='*') row exists,
//   - AND row is not expired (expires_at NULL or > now).
//
// 反约束: 此 helper 不查 (*,*) wildcard — agent strict 立场承袭
// RequireAgentStrict403, BPP frame 路由不能因 owner 误 grant wildcard
// 而漏报 permission_denied (蓝图 §2 "Permission denied 走 BPP" 不变量).
func HasAgentScope(s *store.Store, agentID, perm, scope string) (bool, error) {
	perms, err := s.ListUserPermissions(agentID)
	if err != nil {
		return false, err
	}
	now := time.Now().UnixMilli()
	for _, p := range perms {
		if p.ExpiresAt != nil && *p.ExpiresAt > 0 && *p.ExpiresAt <= now {
			continue
		}
		if p.Permission != perm {
			continue
		}
		if p.Scope == "*" || p.Scope == scope {
			return true, nil
		}
	}
	return false, nil
}

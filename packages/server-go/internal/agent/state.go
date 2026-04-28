// Package agent — AL-1a (#R3 Phase 2 起步) agent runtime 三态.
//
// Phase 2 只承诺 online / offline + error 旁路 (busy / idle 等 BPP/Phase 4 的
// task_started / task_finished frame, 没 BPP 不能 stub — 见 docs/blueprint/
// agent-lifecycle.md §2.3 + 2026-04-28 4 人 review #5 决议).
//
// 设计:
//
//   - online / offline 由 hub plugin presence 推导 (GetPlugin(id) != nil),
//     不存进 Tracker — 这样 reconnect 不会窗口期 mismatch.
//   - error 是 Tracker 唯一持久状态. SetError(id, reason) 来自 runtime 故障
//     旁路 (HTTP 500 / api_key_invalid / network_unreachable / runtime_crashed).
//     Clear(id) 在重新建立连接 (RegisterPlugin) 时调用.
//   - 不持久化 — Phase 2 是 runtime memory; AL-3 才落表.
//
// 文案锁 (野马 #190 §11): "在线" / "已离线" / "故障 (api_key_invalid)" 等.
// 客户端见 packages/client/src/components/AgentManager.tsx + Sidebar.tsx.
package agent

import (
	"strings"
	"sync"
	"time"
)

// RuntimeState — Phase 2 三态.
type RuntimeState string

const (
	StateOnline  RuntimeState = "online"
	StateOffline RuntimeState = "offline"
	StateError   RuntimeState = "error"
)

// Reason codes — 故障原因. UI 直达修复入口 (蓝图 §2.3 关键设计).
// 字符串面跟客户端文案表绑定, 改这里 = 改 AgentManager.tsx 的 reasonLabel.
const (
	ReasonAPIKeyInvalid     = "api_key_invalid"
	ReasonQuotaExceeded     = "quota_exceeded"
	ReasonNetworkUnreachable = "network_unreachable"
	ReasonRuntimeCrashed    = "runtime_crashed"
	ReasonRuntimeTimeout    = "runtime_timeout"
	ReasonUnknown           = "unknown"
)

// Snapshot — 单次查询结果, JSON 直接 marshal 到 GET /api/v1/agents 的
// agent.state / agent.reason 字段.
type Snapshot struct {
	State     RuntimeState `json:"state"`
	Reason    string       `json:"reason,omitempty"`
	UpdatedAt int64        `json:"updated_at,omitempty"` // Unix ms; 0 表示未更新过 (默认 offline)
}

// Tracker — agentID → error snapshot 的 thread-safe 内存 map.
// online / offline 不进 Tracker (从 hub presence 推导).
type Tracker struct {
	mu       sync.RWMutex
	errors   map[string]Snapshot
	now      func() time.Time // 注入用; 默认 time.Now.
}

// NewTracker — production 构造器.
func NewTracker() *Tracker {
	return &Tracker{
		errors: make(map[string]Snapshot),
		now:    time.Now,
	}
}

// SetError — 标 agent 进 error 态. 空 reason 兜底为 ReasonUnknown.
func (t *Tracker) SetError(agentID, reason string) {
	if agentID == "" {
		return
	}
	if reason == "" {
		reason = ReasonUnknown
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.errors[agentID] = Snapshot{
		State:     StateError,
		Reason:    reason,
		UpdatedAt: t.now().UnixMilli(),
	}
}

// Clear — 清掉 error (新连接成功 / owner 手动 reset). agentID 为空 noop.
func (t *Tracker) Clear(agentID string) {
	if agentID == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.errors, agentID)
}

// Lookup — 查 agent 错误态. ok=false 表示 "无错误记录" — 调用方应根据
// hub presence 判 online vs offline.
func (t *Tracker) Lookup(agentID string) (Snapshot, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	s, ok := t.errors[agentID]
	return s, ok
}

// Resolve — 给定 agentID + 当前 plugin presence (online bool), 返回最终
// snapshot. error 优先级 > online > offline (有 error 记录则 error 显示;
// 无 error 但 plugin 在线则 online; 都没有则 offline).
//
// 这是 GET /api/v1/agents 的唯一查询入口.
func (t *Tracker) Resolve(agentID string, hasPlugin bool) Snapshot {
	if s, ok := t.Lookup(agentID); ok {
		return s
	}
	if hasPlugin {
		return Snapshot{State: StateOnline}
	}
	return Snapshot{State: StateOffline}
}

// ClassifyProxyError — runtime 故障旁路: 把 ProxyPluginRequest 返回的
// (status, err) 分类为 reason code. 调用方收到非空 reason 时应 SetError.
//
// 规则 (蓝图 §2.3 故障态原因码):
//   - status == 401 或 err 含 "api key" → api_key_invalid
//   - status == 429 → quota_exceeded
//   - status >= 500 → runtime_crashed
//   - err 含 "timeout" / "deadline" → runtime_timeout
//   - err 含 "not connected" / "no route" → network_unreachable
//   - 其它非 nil err → unknown
//   - 都不命中 → "" (no error).
func ClassifyProxyError(status int, err error) string {
	if err == nil && status < 400 {
		return ""
	}
	if status == 401 {
		return ReasonAPIKeyInvalid
	}
	if status == 429 {
		return ReasonQuotaExceeded
	}
	if err != nil {
		msg := strings.ToLower(err.Error())
		if containsAny(msg, "api key", "api_key", "unauthorized") {
			return ReasonAPIKeyInvalid
		}
		if containsAny(msg, "timeout", "deadline exceeded") {
			return ReasonRuntimeTimeout
		}
		if containsAny(msg, "not connected", "no route", "connection refused", "unreachable") {
			return ReasonNetworkUnreachable
		}
	}
	if status >= 500 {
		return ReasonRuntimeCrashed
	}
	if err != nil {
		return ReasonUnknown
	}
	return ""
}

// containsAny — true if s contains any of subs. Caller passes pre-lowercased s
// for case-insensitive matching.
func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

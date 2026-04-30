// Package store_test — admin_actions_audit_pusher_test.go: AL-9.2
// audit fan-out seam test (acceptance §2.1 + §2.3).
package store_test

import (
	"sync"
	"testing"

	"borgee-server/internal/store"
)

// fakeAuditPusher records all PushAuditEvent calls for assertion.
type fakeAuditPusher struct {
	mu    sync.Mutex
	calls []fakeAuditCall
}

type fakeAuditCall struct {
	ActionID, ActorID, Action, TargetUserID string
	CreatedAt                               int64
}

func (f *fakeAuditPusher) PushAuditEvent(actionID, actorID, action, targetUserID string, createdAt int64) (int64, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, fakeAuditCall{actionID, actorID, action, targetUserID, createdAt})
	return int64(len(f.calls)), true
}

// TestAL92_InsertTriggersPush — InsertAdminAction → auditPusher seam.
func TestAL92_InsertTriggersPush(t *testing.T) {
	t.Parallel()
	s := openMigratedStore(t)
	p := &fakeAuditPusher{}
	s.SetAuditPusher(p)

	id, err := s.InsertAdminAction("admin-1", "user-1", "delete_channel", "")
	if err != nil {
		t.Fatalf("insert: %v", err)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.calls) != 1 {
		t.Fatalf("expected 1 push call, got %d", len(p.calls))
	}
	c := p.calls[0]
	if c.ActionID != id {
		t.Errorf("ActionID = %q, want %q", c.ActionID, id)
	}
	if c.ActorID != "admin-1" || c.Action != "delete_channel" || c.TargetUserID != "user-1" {
		t.Errorf("call fields drift: %+v", c)
	}
	if c.CreatedAt == 0 {
		t.Error("CreatedAt should be > 0")
	}
}

// TestAL92_NilPusherSafeNoPanic — nil pusher = silent no-op (立场 ⑧).
func TestAL92_NilPusherSafeNoPanic(t *testing.T) {
	t.Parallel()
	s := openMigratedStore(t)
	// SetAuditPusher never called — auditPusher is nil.
	id, err := s.InsertAdminAction("admin-1", "user-1", "delete_channel", "")
	if err != nil {
		t.Fatalf("insert with nil pusher: %v", err)
	}
	if id == "" {
		t.Error("audit row should still be written even with nil pusher")
	}
}

// TestAL92_PushFiveFieldByteIdentical — 5 字段 byte-identical 跟 ADM-2.1
// admin_actions schema 同源 (action_id / actor_id / action / target_user_id
// / created_at). Acceptance §2.2.
func TestAL92_PushFiveFieldByteIdentical(t *testing.T) {
	t.Parallel()
	s := openMigratedStore(t)
	p := &fakeAuditPusher{}
	s.SetAuditPusher(p)

	cases := []struct {
		actor, target, action string
	}{
		{"a1", "u1", "delete_channel"},
		{"a2", "u2", "suspend_user"},
		{"a3", "u3", "change_role"},
		{"a4", "u4", "reset_password"},
		{"a5", "u5", "start_impersonation"},
	}
	for _, c := range cases {
		_, err := s.InsertAdminAction(c.actor, c.target, c.action, "")
		if err != nil {
			t.Fatalf("insert %s: %v", c.action, err)
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.calls) != len(cases) {
		t.Fatalf("expected %d push calls, got %d", len(cases), len(p.calls))
	}
	for i, c := range cases {
		got := p.calls[i]
		if got.ActorID != c.actor || got.TargetUserID != c.target || got.Action != c.action {
			t.Errorf("[%d] drift: got %+v, want actor=%s target=%s action=%s", i, got, c.actor, c.target, c.action)
		}
	}
}

// openMigratedStore is a shared test helper — use in-memory store with full migrate.
func openMigratedStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := s.Migrate(); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

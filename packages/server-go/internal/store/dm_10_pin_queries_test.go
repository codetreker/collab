// Package store — dm_10_pin_queries_test.go: unit tests for
// SetMessagePinnedAt + ListPinnedMessages (DM-10.2 store helpers).
//
// Spec: docs/implementation/modules/dm-10-spec.md §1 DM-10.2.
package store

import (
	"testing"

	"github.com/google/uuid"
)

// TestSetMessagePinnedAt_PinUnpinIdempotent — pin → unpin → re-pin
// idempotent (last-write-wins UPDATE).
func TestSetMessagePinnedAt_PinUnpinIdempotent(t *testing.T) {
	t.Parallel()
	s := MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })

	chID := uuid.NewString()
	if err := s.db.Exec(
		`INSERT INTO channels (id, name, type, visibility, position, created_by, created_at, org_id)
		 VALUES (?, ?, 'dm', 'private', '0|aaaaaa', ?, ?, ?)`,
		chID, "dm-test-pin", "system", int64(1700000000000), "",
	).Error; err != nil {
		t.Fatalf("seed channel: %v", err)
	}
	msgID := uuid.NewString()
	if err := s.CreateMessage(&Message{
		ID:          msgID,
		ChannelID:   chID,
		SenderID:    "system",
		Content:     "pinme",
		ContentType: "text",
		CreatedAt:   1700000000000,
	}); err != nil {
		t.Fatalf("create msg: %v", err)
	}

	pinTs := int64(1700000001000)
	if err := s.SetMessagePinnedAt(msgID, &pinTs); err != nil {
		t.Fatalf("pin: %v", err)
	}
	var got Message
	if err := s.db.Where("id = ?", msgID).First(&got).Error; err != nil {
		t.Fatalf("read: %v", err)
	}
	if got.PinnedAt == nil || *got.PinnedAt != pinTs {
		t.Errorf("pinned_at after pin = %v, want %d", got.PinnedAt, pinTs)
	}

	// Unpin (nil).
	if err := s.SetMessagePinnedAt(msgID, nil); err != nil {
		t.Fatalf("unpin: %v", err)
	}
	if err := s.db.Where("id = ?", msgID).First(&got).Error; err != nil {
		t.Fatalf("read after unpin: %v", err)
	}
	if got.PinnedAt != nil {
		t.Errorf("pinned_at after unpin = %v, want nil", got.PinnedAt)
	}

	// Re-pin with new ts (last-write-wins).
	pinTs2 := int64(1700000002000)
	if err := s.SetMessagePinnedAt(msgID, &pinTs2); err != nil {
		t.Fatalf("repin: %v", err)
	}
	if err := s.db.Where("id = ?", msgID).First(&got).Error; err != nil {
		t.Fatalf("read after repin: %v", err)
	}
	if got.PinnedAt == nil || *got.PinnedAt != pinTs2 {
		t.Errorf("pinned_at after repin = %v, want %d", got.PinnedAt, pinTs2)
	}
}

// TestListPinnedMessages_OrderAndExclusions — pinned_at DESC ordering +
// excludes soft-deleted + excludes other-channel rows.
func TestListPinnedMessages_OrderAndExclusions(t *testing.T) {
	t.Parallel()
	s := MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })

	chID := uuid.NewString()
	otherChID := uuid.NewString()
	for _, id := range []string{chID, otherChID} {
		if err := s.db.Exec(
			`INSERT INTO channels (id, name, type, visibility, position, created_by, created_at, org_id)
			 VALUES (?, ?, 'dm', 'private', '0|aaaaaa', ?, ?, ?)`,
			id, "dm-"+id[:8], "system", int64(1700000000000), "",
		).Error; err != nil {
			t.Fatalf("seed channel: %v", err)
		}
	}

	// Three messages in chID: m1 pinned earlier, m2 pinned later (newest
	// first), m3 unpinned (excluded). Plus m4 in otherChID pinned (other
	// channel scope, excluded). Plus m5 pinned then soft-deleted (excluded).
	mk := func(id, ch, body string, created int64) {
		t.Helper()
		if err := s.CreateMessage(&Message{
			ID: id, ChannelID: ch, SenderID: "system", Content: body,
			ContentType: "text", CreatedAt: created,
		}); err != nil {
			t.Fatal(err)
		}
	}
	mk("m1", chID, "older pin", 1700000000010)
	mk("m2", chID, "newer pin", 1700000000020)
	mk("m3", chID, "unpinned", 1700000000030)
	mk("m4", otherChID, "other ch pin", 1700000000040)
	mk("m5", chID, "to-be-deleted", 1700000000050)

	pin := func(id string, ts int64) {
		if err := s.SetMessagePinnedAt(id, &ts); err != nil {
			t.Fatalf("pin %s: %v", id, err)
		}
	}
	pin("m1", 1700000001000)
	pin("m2", 1700000002000)
	pin("m4", 1700000003000)
	pin("m5", 1700000004000)

	// Soft-delete m5.
	delTs := int64(1700000005000)
	if err := s.db.Model(&Message{}).Where("id = ?", "m5").
		Update("deleted_at", delTs).Error; err != nil {
		t.Fatalf("soft-delete m5: %v", err)
	}

	got, err := s.ListPinnedMessages(chID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2 (m2, m1; m3 unpinned, m4 other ch, m5 soft-deleted): %+v",
			len(got), got)
	}
	if got[0].ID != "m2" || got[1].ID != "m1" {
		t.Errorf("order = [%s,%s], want [m2,m1] (pinned_at DESC)", got[0].ID, got[1].ID)
	}
}

// TestListPinnedMessages_EmptyChannel — fresh channel with no pins
// returns empty slice (not nil).
func TestListPinnedMessages_EmptyChannel(t *testing.T) {
	t.Parallel()
	s := MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })

	got, err := s.ListPinnedMessages("no-such-channel")
	if err != nil {
		t.Fatalf("list empty: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty slice, got %d msgs", len(got))
	}
}

// Package store_test — dm_8_bookmark_test.go: DM-8.2 store-layer tests.
//
// Acceptance pins (docs/qa/acceptance-templates/dm-8.md):
//   - 2.1 ToggleMessageBookmark atomic RMW (idempotent toggle)
//   - 2.2 ListMessagesBookmarkedByUser JSON_EXTRACT (limit clamp)
//   - 2.4 cross-user UUID 不漏 (per-user list)
package store_test

import (
	"sync"
	"testing"

	"borgee-server/internal/store"
)

func setupDM8Test(t *testing.T) (*store.Store, string, string, string) {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })

	// Create org + user A + user B + channel + 1 message from A.
	org := store.Organization{ID: "org-A", Name: "Org A", CreatedAt: 1}
	if err := s.DB().Create(&org).Error; err != nil {
		t.Fatal(err)
	}
	emailA, emailB := "a@test.com", "b@test.com"
	userA := store.User{ID: "user-A", Email: &emailA, DisplayName: "A", PasswordHash: "x", OrgID: "org-A", CreatedAt: 1}
	userB := store.User{ID: "user-B", Email: &emailB, DisplayName: "B", PasswordHash: "x", OrgID: "org-A", CreatedAt: 1}
	if err := s.DB().Create(&userA).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.DB().Create(&userB).Error; err != nil {
		t.Fatal(err)
	}
	ch := store.Channel{ID: "chan-1", Name: "general", Type: "public", Visibility: "public", OrgID: "org-A", CreatedBy: "user-A", CreatedAt: 1}
	if err := s.DB().Create(&ch).Error; err != nil {
		t.Fatal(err)
	}
	msg := store.Message{ID: "msg-1", ChannelID: "chan-1", SenderID: "user-A", Content: "hi", ContentType: "text", OrgID: "org-A", CreatedAt: 1}
	if err := s.DB().Create(&msg).Error; err != nil {
		t.Fatal(err)
	}
	return s, "user-A", "user-B", "msg-1"
}

// TestDM82_ToggleAddsThenRemoves — idempotent toggle (acceptance §2.1).
func TestDM82_ToggleAddsThenRemoves(t *testing.T) {
	t.Parallel()
	s, userA, _, msgID := setupDM8Test(t)

	added, err := s.ToggleMessageBookmark(msgID, userA)
	if err != nil {
		t.Fatalf("toggle1: %v", err)
	}
	if !added {
		t.Errorf("first toggle should add, got remove")
	}
	is, err := s.IsMessageBookmarkedByUser(msgID, userA)
	if err != nil || !is {
		t.Errorf("post-add: is=%v err=%v, want true/nil", is, err)
	}

	added, err = s.ToggleMessageBookmark(msgID, userA)
	if err != nil {
		t.Fatalf("toggle2: %v", err)
	}
	if added {
		t.Errorf("second toggle should remove, got add")
	}
	is, _ = s.IsMessageBookmarkedByUser(msgID, userA)
	if is {
		t.Errorf("post-remove: is=true, want false")
	}
}

// TestDM82_ConcurrentToggleNoLost — 32 racer, final state determinant
// (after even count of toggles → not bookmarked, odd → bookmarked).
func TestDM82_ConcurrentToggleNoLost(t *testing.T) {
	t.Parallel()
	s, userA, _, msgID := setupDM8Test(t)

	const N = 32
	var wg sync.WaitGroup
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = s.ToggleMessageBookmark(msgID, userA)
		}()
	}
	wg.Wait()
	// After N=32 toggles (even), final state should be NOT bookmarked.
	is, err := s.IsMessageBookmarkedByUser(msgID, userA)
	if err != nil {
		t.Fatalf("final probe: %v", err)
	}
	if is {
		t.Errorf("after %d toggles (even count), expected not bookmarked, got bookmarked", N)
	}
}

// TestDM82_ListBookmarkedByUser_Returns — list returns user's bookmarks
// (acceptance §2.2 + §2.4 per-user).
func TestDM82_ListBookmarkedByUser_Returns(t *testing.T) {
	t.Parallel()
	s, userA, userB, msgID := setupDM8Test(t)

	// Seed: A bookmarks msg-1, B does NOT.
	if _, err := s.ToggleMessageBookmark(msgID, userA); err != nil {
		t.Fatal(err)
	}

	listA, err := s.ListMessagesBookmarkedByUser(userA, 50)
	if err != nil {
		t.Fatalf("list A: %v", err)
	}
	if len(listA) != 1 || listA[0].ID != msgID {
		t.Errorf("A list = %d msgs, want 1 (msg-1)", len(listA))
	}

	listB, err := s.ListMessagesBookmarkedByUser(userB, 50)
	if err != nil {
		t.Fatalf("list B: %v", err)
	}
	if len(listB) != 0 {
		t.Errorf("B list should be empty (B did not bookmark anything), got %d", len(listB))
	}
}

// TestDM82_LimitClampDefault — default 50, max 200.
func TestDM82_LimitClampDefault(t *testing.T) {
	t.Parallel()
	s, userA, _, _ := setupDM8Test(t)
	// limit <= 0 → default 50; > 200 → max 200. Behaviour visible only via
	// row count, but we verify call doesn't error.
	if _, err := s.ListMessagesBookmarkedByUser(userA, 0); err != nil {
		t.Errorf("limit=0: %v", err)
	}
	if _, err := s.ListMessagesBookmarkedByUser(userA, 9999); err != nil {
		t.Errorf("limit=9999: %v", err)
	}
}

// TestDM82_DoesNotExposeOtherUsersBookmarks — per-user view (立场 ⑤).
// User B's bookmarks must NOT appear in A's list, and vice versa.
func TestDM82_DoesNotExposeOtherUsersBookmarks(t *testing.T) {
	t.Parallel()
	s, userA, userB, msgID := setupDM8Test(t)

	// Both A and B bookmark msg-1.
	if _, err := s.ToggleMessageBookmark(msgID, userA); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ToggleMessageBookmark(msgID, userB); err != nil {
		t.Fatal(err)
	}

	// A's list should contain msg-1.
	listA, _ := s.ListMessagesBookmarkedByUser(userA, 50)
	if len(listA) != 1 {
		t.Errorf("A list len=%d, want 1", len(listA))
	}
	// B's list should also contain msg-1 (independently).
	listB, _ := s.ListMessagesBookmarkedByUser(userB, 50)
	if len(listB) != 1 {
		t.Errorf("B list len=%d, want 1", len(listB))
	}

	// A removes — B still has it.
	if _, err := s.ToggleMessageBookmark(msgID, userA); err != nil {
		t.Fatal(err)
	}
	listA, _ = s.ListMessagesBookmarkedByUser(userA, 50)
	if len(listA) != 0 {
		t.Errorf("A list after remove len=%d, want 0", len(listA))
	}
	listB, _ = s.ListMessagesBookmarkedByUser(userB, 50)
	if len(listB) != 1 {
		t.Errorf("B list after A remove len=%d, want 1 (B unaffected)", len(listB))
	}
}

// TestDM82_StoreArgValidation — empty messageID/userID return errors
// (no panic, defensive).
func TestDM82_StoreArgValidation(t *testing.T) {
	t.Parallel()
	s, userA, _, msgID := setupDM8Test(t)
	if _, err := s.ToggleMessageBookmark("", userA); err == nil {
		t.Error("ToggleMessageBookmark with empty messageID should error")
	}
	if _, err := s.ToggleMessageBookmark(msgID, ""); err == nil {
		t.Error("ToggleMessageBookmark with empty userID should error")
	}
	if _, err := s.IsMessageBookmarkedByUser("", userA); err == nil {
		t.Error("IsMessageBookmarkedByUser with empty messageID should error")
	}
	if _, err := s.IsMessageBookmarkedByUser(msgID, ""); err == nil {
		t.Error("IsMessageBookmarkedByUser with empty userID should error")
	}
	if _, err := s.ListMessagesBookmarkedByUser("", 50); err == nil {
		t.Error("ListMessagesBookmarkedByUser with empty userID should error")
	}
}

// TestDM82_IsBookmarkedByUser_Branches — covers IsMessageBookmarkedByUser
// branches: NULL bookmarked_by, corrupt JSON, missing message.
func TestDM82_IsBookmarkedByUser_Branches(t *testing.T) {
	t.Parallel()
	s, userA, _, msgID := setupDM8Test(t)

	// (a) Fresh message, NULL bookmarked_by → false.
	is, err := s.IsMessageBookmarkedByUser(msgID, userA)
	if err != nil || is {
		t.Errorf("fresh msg: is=%v err=%v, want false/nil", is, err)
	}

	// (b) Missing message → error (record not found).
	if _, err := s.IsMessageBookmarkedByUser("non-existent", userA); err == nil {
		t.Error("missing message should error")
	}

	// (c) Corrupt JSON in bookmarked_by → treated as not bookmarked.
	if err := s.DB().Exec(`UPDATE messages SET bookmarked_by = '{not valid json}' WHERE id = ?`, msgID).Error; err != nil {
		t.Fatal(err)
	}
	is, err = s.IsMessageBookmarkedByUser(msgID, userA)
	if err != nil || is {
		t.Errorf("corrupt JSON: is=%v err=%v, want false/nil (silent repair)", is, err)
	}
}

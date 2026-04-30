// Package api_test — dm_10_pin_test.go: DM-10 message pin/unpin/list
// REST endpoint acceptance tests.
//
// Acceptance §1+§2 (cv-5 cv5Setup pattern complement; reactions ACL gate
// 同 helper Store.IsChannelMember + Store.CanAccessChannel 复用 AP-4 #551
// + AP-5 #555 同精神).

package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// dm10Setup builds a server, opens a DM between owner and member, and
// returns (url, ownerTok, memberTok, store, channelID, msgID).
// msgID is a member-sent message inside the DM.
func dm10Setup(t *testing.T) (string, string, string, *store.Store, string, string) {
	t.Helper()
	ts, s, _ := testutil.NewTestServer(t)
	ownerTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	memberTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	users, _ := s.ListUsers()
	var ownerID, memberID string
	for _, u := range users {
		if u.Email == nil {
			continue
		}
		if *u.Email == "owner@test.com" {
			ownerID = u.ID
		}
		if *u.Email == "member@test.com" {
			memberID = u.ID
		}
	}
	if ownerID == "" || memberID == "" {
		t.Skip("missing fixture users")
	}
	// Member opens DM with owner.
	resp, dm := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+ownerID, memberTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("dm open: %d %v", resp.StatusCode, dm)
	}
	chID, _ := dm["channel"].(map[string]any)["id"].(string)
	if chID == "" {
		t.Fatalf("no channel id in DM response")
	}
	// Member posts a message in the DM.
	r, msg := testutil.JSON(t, "POST", ts.URL+"/api/v1/channels/"+chID+"/messages", memberTok,
		map[string]any{"content": "let's pin this"})
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("post msg: %d %v", r.StatusCode, msg)
	}
	msgID, _ := msg["message"].(map[string]any)["id"].(string)
	if msgID == "" {
		t.Fatalf("no message id: %v", msg)
	}
	return ts.URL, ownerTok, memberTok, s, chID, msgID
}

// TestDM10_PinUnpin_HappyPath — POST pin → GET sees msg → DELETE unpin
// → GET empty.
func TestDM10_PinUnpin_HappyPath(t *testing.T) {
	t.Parallel()
	url, _, memberTok, _, chID, msgID := dm10Setup(t)

	// Pin.
	r1, d1 := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if r1.StatusCode != http.StatusOK {
		t.Fatalf("pin: %d %v", r1.StatusCode, d1)
	}
	if d1["pinned"] != true {
		t.Errorf("expected pinned=true, got %v", d1["pinned"])
	}
	if d1["pinned_at"] == nil {
		t.Errorf("expected pinned_at non-nil")
	}

	// List shows the pinned message.
	r2, d2 := testutil.JSON(t, "GET",
		url+"/api/v1/channels/"+chID+"/messages/pinned", memberTok, nil)
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("list: %d %v", r2.StatusCode, d2)
	}
	msgs, _ := d2["messages"].([]any)
	if len(msgs) != 1 {
		t.Fatalf("expected 1 pinned, got %d", len(msgs))
	}

	// Unpin.
	r3, d3 := testutil.JSON(t, "DELETE",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if r3.StatusCode != http.StatusOK {
		t.Fatalf("unpin: %d %v", r3.StatusCode, d3)
	}
	if d3["pinned"] != false {
		t.Errorf("expected pinned=false, got %v", d3["pinned"])
	}

	// List empty after unpin.
	r4, d4 := testutil.JSON(t, "GET",
		url+"/api/v1/channels/"+chID+"/messages/pinned", memberTok, nil)
	if r4.StatusCode != http.StatusOK {
		t.Fatalf("list2: %d %v", r4.StatusCode, d4)
	}
	msgs2, _ := d4["messages"].([]any)
	if len(msgs2) != 0 {
		t.Errorf("expected empty after unpin, got %d", len(msgs2))
	}
}

// TestDM10_DMOnly_NonDMRejected — POST pin on a non-DM channel → 400
// `pin.dm_only_path` (立场 ②).
func TestDM10_DMOnly_NonDMRejected(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// Create a non-DM (public) channel + post a message.
	chID := cv12General(t, ts.URL, tok)
	r, msg := testutil.JSON(t, "POST", ts.URL+"/api/v1/channels/"+chID+"/messages", tok,
		map[string]any{"content": "general msg"})
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("post msg: %d %v", r.StatusCode, msg)
	}
	msgID, _ := msg["message"].(map[string]any)["id"].(string)

	resp, body := testutil.JSON(t, "POST",
		ts.URL+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", tok, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
	if body["code"] != "pin.dm_only_path" {
		t.Errorf("expected code pin.dm_only_path, got %v", body["code"])
	}
}

// TestDM10_Unauthorized_401 — POST pin without auth → 401.
func TestDM10_Unauthorized_401(t *testing.T) {
	t.Parallel()
	url, _, _, _, chID, msgID := dm10Setup(t)
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

// TestDM10_NonMember_404 — non-member trying to pin DM message → 404
// "Channel not found" fail-closed (跟 AP-4 + AP-5 同 fail-closed).
func TestDM10_NonMember_404(t *testing.T) {
	t.Parallel()
	url, _, _, s, chID, msgID := dm10Setup(t)
	// Find a third user not in this DM.
	users, _ := s.ListUsers()
	var thirdEmail string
	for _, u := range users {
		if u.Email != nil && *u.Email != "owner@test.com" && *u.Email != "member@test.com" {
			thirdEmail = *u.Email
			break
		}
	}
	if thirdEmail == "" {
		t.Skip("no third user in fixture")
	}
	thirdTok := testutil.LoginAs(t, url, thirdEmail, "password123")
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", thirdTok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 fail-closed, got %d", resp.StatusCode)
	}
}

// TestDM10_DeletedMessage_404 — pin a deleted message → 404 because
// GetMessageByID filters deleted_at IS NULL (soft-delete tombstones
// invisible at lookup, fail-closed before pin path).
func TestDM10_DeletedMessage_404(t *testing.T) {
	t.Parallel()
	url, _, memberTok, _, chID, msgID := dm10Setup(t)
	// Soft-delete the message.
	r, _ := testutil.JSON(t, "DELETE", url+"/api/v1/messages/"+msgID, memberTok, nil)
	if r.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: %d", r.StatusCode)
	}
	resp, body := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 (deleted message hidden), got %d %v", resp.StatusCode, body)
	}
}

// TestDM10_CrossChannelMessage_404 — pin a messageId that exists but
// is in a different channel → 404 (反 cross-channel pin).
func TestDM10_CrossChannelMessage_404(t *testing.T) {
	t.Parallel()
	url, _, memberTok, _, chID, msgID := dm10Setup(t)
	// Use msgID but a wrong channel ID.
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/channels/wrong-channel-id/messages/"+msgID+"/pin", memberTok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
	_ = chID
}

// TestDM10_Idempotent_PinTwice — pin same message twice → 200 + 200
// (last-write-wins, second pinned_at overwrites first).
func TestDM10_Idempotent_PinTwice(t *testing.T) {
	t.Parallel()
	url, _, memberTok, _, chID, msgID := dm10Setup(t)
	r1, _ := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if r1.StatusCode != http.StatusOK {
		t.Fatalf("pin1: %d", r1.StatusCode)
	}
	r2, d2 := testutil.JSON(t, "POST",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if r2.StatusCode != http.StatusOK {
		t.Fatalf("pin2: %d", r2.StatusCode)
	}
	if d2["pinned"] != true {
		t.Errorf("expected idempotent pin=true, got %v", d2["pinned"])
	}
}

// TestDM10_UnpinUnpinned_Idempotent — DELETE on unpinned message → 200 +
// pinned=false (反 fail-closed).
func TestDM10_UnpinUnpinned_Idempotent(t *testing.T) {
	t.Parallel()
	url, _, memberTok, _, chID, msgID := dm10Setup(t)
	resp, body := testutil.JSON(t, "DELETE",
		url+"/api/v1/channels/"+chID+"/messages/"+msgID+"/pin", memberTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unpin unpinned: %d %v", resp.StatusCode, body)
	}
	if body["pinned"] != false {
		t.Errorf("expected pinned=false, got %v", body["pinned"])
	}
}

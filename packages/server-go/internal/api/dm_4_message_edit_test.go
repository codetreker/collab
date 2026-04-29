// Package api_test — DM-4.1 server PATCH endpoint tests.
//
// 立场反查 (跟 dm-4-stance-checklist.md §1+§3+§4):
//   ① RT-3 既有 fan-out 复用 — events INSERT op="edit" 真写入
//   ③ thinking 5-pattern 反约束延伸第 3 处 — dm_4*.go 反向 grep 0 hit
//   ④ DM-only path — channel.Type != "dm" reject 403
//   ⑤ owner-only ACL — sender != caller → 403
//
// 跨 milestone byte-identical: events 表 op="edit" 复用既有 message_edited
// kind (跟 messages.go::handleUpdateMessage 同源, 不另起 dictionary);
// useDMSync (DM-3 #508) 客户端订阅 channel events backfill 自动多端 derive.

package api_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// dm4SetupOwnerAndDM seeds owner + agent + DM channel + one initial
// message from owner. Returns ownerToken, dmChannelID, messageID.
func dm4SetupOwnerAndDM(t *testing.T, ts *httptest.Server, s *store.Store) (string, string, string) {
	t.Helper()
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	owner, _ := s.GetUserByEmail("owner@test.com")

	agentEmail := "agent-dm4@test.com"
	agentRole := "agent"
	agent := &store.User{
		DisplayName: "AgentDM4",
		Role:        agentRole,
		Email:       &agentEmail,
		OrgID:       owner.OrgID,
		OwnerID:     &owner.ID,
	}
	if err := s.CreateUser(agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}

	dm := &store.Channel{
		Name:       "dm-owner-agentdm4",
		Visibility: "private",
		CreatedBy:  owner.ID,
		Type:       "dm",
		Position:   store.GenerateInitialRank(),
		OrgID:      owner.OrgID,
	}
	if err := s.CreateChannel(dm); err != nil {
		t.Fatalf("create dm: %v", err)
	}
	_ = s.AddChannelMember(&store.ChannelMember{ChannelID: dm.ID, UserID: owner.ID})
	_ = s.AddChannelMember(&store.ChannelMember{ChannelID: dm.ID, UserID: agent.ID})

	resp, body := testutil.JSON(t, "POST",
		ts.URL+"/api/v1/channels/"+dm.ID+"/messages", ownerToken,
		map[string]any{"content": "original content", "content_type": "text"})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("seed POST /messages: status %d body %v", resp.StatusCode, body)
	}
	msg, ok := body["message"].(map[string]any)
	if !ok {
		t.Fatalf("seed response missing message: %v", body)
	}
	messageID, _ := msg["id"].(string)
	if messageID == "" {
		t.Fatalf("seed messageID empty: %v", msg)
	}
	return ownerToken, dm.ID, messageID
}

// TestDM41_HappyPath — acceptance §1.1 owner edits own message in DM,
// returns 200 + content updated.
func TestDM41_HappyPath(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken, dmID, messageID := dm4SetupOwnerAndDM(t, ts, s)

	resp, body := testutil.JSON(t, "PATCH",
		ts.URL+"/api/v1/channels/"+dmID+"/messages/"+messageID, ownerToken,
		map[string]any{"content": "edited content via DM-4"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH happy: status %d body %v", resp.StatusCode, body)
	}
	msg, ok := body["message"].(map[string]any)
	if !ok {
		t.Fatalf("response missing message: %v", body)
	}
	if got, want := msg["content"], "edited content via DM-4"; got != want {
		t.Errorf("content: got %q, want %q", got, want)
	}
}

// TestDM41_NonOwnerRejected — acceptance §1.1 立场 ⑤ owner-only ACL.
// member@test.com is added as DM member to keep channel ACL satisfied
// but is not the original sender, so PATCH must 403.
func TestDM41_NonOwnerRejected(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	_, dmID, messageID := dm4SetupOwnerAndDM(t, ts, s)

	member, _ := s.GetUserByEmail("member@test.com")
	if member == nil {
		t.Fatalf("member@test.com seed missing")
	}
	_ = s.AddChannelMember(&store.ChannelMember{ChannelID: dmID, UserID: member.ID})
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	resp, _ := testutil.JSON(t, "PATCH",
		ts.URL+"/api/v1/channels/"+dmID+"/messages/"+messageID, memberToken,
		map[string]any{"content": "not allowed"})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("non-owner: got status %d, want 403", resp.StatusCode)
	}
}

// TestDM41_NonDMReject — acceptance §1.1 立场 ④ DM-only path.
// PATCH /api/v1/channels/{publicChannelId}/messages/{id} → 403
// `dm.edit_only_in_dm`.
func TestDM41_NonDMReject(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	owner, _ := s.GetUserByEmail("owner@test.com")

	pub := &store.Channel{
		Name:       "general-dm4",
		Visibility: "public",
		CreatedBy:  owner.ID,
		Type:       "channel",
		Position:   store.GenerateInitialRank(),
		OrgID:      owner.OrgID,
	}
	if err := s.CreateChannel(pub); err != nil {
		t.Fatalf("create public channel: %v", err)
	}
	_ = s.AddChannelMember(&store.ChannelMember{ChannelID: pub.ID, UserID: owner.ID})

	resp, body := testutil.JSON(t, "POST",
		ts.URL+"/api/v1/channels/"+pub.ID+"/messages", ownerToken,
		map[string]any{"content": "in public", "content_type": "text"})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("POST public: %d %v", resp.StatusCode, body)
	}
	msg, _ := body["message"].(map[string]any)
	messageID, _ := msg["id"].(string)

	resp2, body2 := testutil.JSON(t, "PATCH",
		ts.URL+"/api/v1/channels/"+pub.ID+"/messages/"+messageID, ownerToken,
		map[string]any{"content": "edited"})
	if resp2.StatusCode != http.StatusForbidden {
		t.Errorf("PATCH on public channel: got status %d, want 403 (dm.edit_only_in_dm)", resp2.StatusCode)
	}
	if msg, ok := body2["error"].(string); !ok || !strings.Contains(msg, "dm.edit_only_in_dm") {
		t.Errorf("expected error sentinel `dm.edit_only_in_dm`, got %v", body2)
	}
}

// TestDM41_Unauthorized401 — acceptance §1.1 unauth → 401.
func TestDM41_Unauthorized401(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	_, dmID, messageID := dm4SetupOwnerAndDM(t, ts, s)

	resp, _ := testutil.JSON(t, "PATCH",
		ts.URL+"/api/v1/channels/"+dmID+"/messages/"+messageID, "",
		map[string]any{"content": "x"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauth: got status %d, want 401", resp.StatusCode)
	}
}

// TestDM41_NotFound404 — acceptance §1.1 message id mismatch → 404.
func TestDM41_NotFound404(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken, dmID, _ := dm4SetupOwnerAndDM(t, ts, s)

	resp, _ := testutil.JSON(t, "PATCH",
		ts.URL+"/api/v1/channels/"+dmID+"/messages/nonexistent-id", ownerToken,
		map[string]any{"content": "x"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("nonexistent message: got status %d, want 404", resp.StatusCode)
	}
}

// TestDM41_NoThinkingPatternInBody — acceptance §1.3 立场 ③
// thinking subject 5-pattern 反约束延伸第 3 处 (RT-3 第 1 + DM-3
// 第 2 + DM-4 第 3). dm_4*.go 反向 grep 5 字面 0 hit (production
// .go 不含 thinking 状态字面).
func TestDM41_NoThinkingPatternInBody(t *testing.T) {
	forbidden := []string{
		`"processing"`,
		`"responding"`,
		`"thinking"`,
		`"analyzing"`,
		`"planning"`,
	}
	dir := "../api"
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	hits := []string{}
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "dm_4") {
			continue
		}
		if !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		content := string(b)
		for _, bad := range forbidden {
			if strings.Contains(content, bad) {
				hits = append(hits, path+":"+bad)
			}
		}
	}
	if len(hits) > 0 {
		t.Errorf("DM-4 立场 ③ broken: thinking 5-pattern literal in dm_4*.go production: %v", hits)
	}
}

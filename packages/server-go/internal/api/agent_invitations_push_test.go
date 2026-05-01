// agent_invitations_push_test.go — RT-0 (#40) handler-level push tests.
//
// Goal: assert the handler invokes the AgentInvitationPusher seam with the
// right (userID, frame) tuple on both branches:
//   - handleCreate → 1× call to the agent owner with a *pending* frame.
//   - handlePatch (approve/reject) → 2× calls (requester + owner) with a
//     *decided* frame whose state matches the body.
//
// We use a fakeInvitationPusher capturing calls. Auth is wired with the
// real auth.AuthMiddleware against a fresh in-memory Store so we exercise
// the full request path (cookie → user → handler → pusher) — same shape
// as internal_coverage_test.go's setupFullTestServer.
package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"time"

	"golang.org/x/crypto/bcrypt"

	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"
	"borgee-server/internal/ws"

	"github.com/golang-jwt/jwt/v5"
)

func mintJWT(t *testing.T, secret string, u *store.User) string {
	t.Helper()
	email := ""
	if u.Email != nil {
		email = *u.Email
	}
	claims := &auth.Claims{
		UserID: u.ID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed
}

type pushCall struct {
	UserID string
	Frame  any
}

type fakeInvitationPusher struct {
	mu    sync.Mutex
	calls []pushCall
}

func (f *fakeInvitationPusher) PushAgentInvitationPending(userID string, frame *ws.AgentInvitationPendingFrame) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, pushCall{UserID: userID, Frame: frame})
}

func (f *fakeInvitationPusher) PushAgentInvitationDecided(userID string, frame *ws.AgentInvitationDecidedFrame) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, pushCall{UserID: userID, Frame: frame})
}

func (f *fakeInvitationPusher) snapshot() []pushCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]pushCall, len(f.calls))
	copy(out, f.calls)
	return out
}

func setupPushTest(t *testing.T) (*httptest.Server, *store.Store, *fakeInvitationPusher, string, string, string, string) {
	t.Helper()
	s := store.MigratedStoreFromTemplate(t)

	cfg := &config.Config{
		JWTSecret: "test-secret",
		NodeEnv:   "development",
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	// Two real users: requester (channel member) + owner (of the agent).
	reqHashBytes, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	reqHash := string(reqHashBytes)
	reqEmail := "requester@test.com"
	requester := &store.User{
		DisplayName:  "Requester",
		Role:         "member",
		Email:        &reqEmail,
		PasswordHash: reqHash,
	}
	if err := s.CreateUser(requester); err != nil {
		t.Fatalf("create requester: %v", err)
	}
	if err := s.GrantDefaultPermissions(requester.ID, "member"); err != nil {
		t.Fatalf("grant requester perms: %v", err)
	}

	ownerHashBytes, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	ownerHash := string(ownerHashBytes)
	ownerEmail := "agent-owner@test.com"
	owner := &store.User{
		DisplayName:  "AgentOwner",
		Role:         "member",
		Email:        &ownerEmail,
		PasswordHash: ownerHash,
	}
	if err := s.CreateUser(owner); err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := s.GrantDefaultPermissions(owner.ID, "member"); err != nil {
		t.Fatalf("grant owner perms: %v", err)
	}

	// Agent owned by `owner`.
	agent := &store.User{
		DisplayName: "TestAgent",
		Role:        "agent",
		OwnerID:     &owner.ID,
	}
	if err := s.CreateUser(agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}

	// Private channel, requester is the only member.
	ch := &store.Channel{
		Name:       "priv-push",
		Visibility: "private",
		CreatedBy:  requester.ID,
		Type:       "channel",
		Position:   store.GenerateInitialRank(),
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatalf("create channel: %v", err)
	}
	if err := s.AddChannelMember(&store.ChannelMember{
		ChannelID: ch.ID,
		UserID:    requester.ID,
	}); err != nil {
		t.Fatalf("add channel member: %v", err)
	}

	pusher := &fakeInvitationPusher{}
	h := &AgentInvitationHandler{Store: s, Logger: logger, Hub: pusher}

	mux := http.NewServeMux()
	authMw := auth.AuthMiddleware(s, cfg)
	h.RegisterRoutes(mux, authMw)

	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)

	// Mint JWTs directly — no /auth/login endpoint mounted.
	reqTok := mintJWT(t, cfg.JWTSecret, requester)
	ownerTok := mintJWT(t, cfg.JWTSecret, owner)

	return ts, s, pusher, reqTok, ownerTok, ch.ID, agent.ID
}

func bearerJSON(t *testing.T, method, url, token string, body any) (*http.Response, map[string]any) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, url, rd)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	var result map[string]any
	json.Unmarshal(respBody, &result)
	return resp, result
}

func TestPushOnCreate_PendingFrameToAgentOwner(t *testing.T) {
	t.Parallel()
	ts, _, pusher, reqTok, _, channelID, agentID := setupPushTest(t)

	resp, body := bearerJSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", reqTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	inv := body["invitation"].(map[string]any)
	invID := inv["id"].(string)

	calls := pusher.snapshot()
	if len(calls) != 1 {
		t.Fatalf("want 1 push call, got %d (%v)", len(calls), calls)
	}
	got := calls[0]
	frame, ok := got.Frame.(*ws.AgentInvitationPendingFrame)
	if !ok {
		t.Fatalf("frame type = %T, want *ws.AgentInvitationPendingFrame", got.Frame)
	}
	if frame.Type != ws.FrameTypeAgentInvitationPending {
		t.Errorf("frame.Type = %q, want %q", frame.Type, ws.FrameTypeAgentInvitationPending)
	}
	if frame.InvitationID != invID {
		t.Errorf("frame.InvitationID = %q, want %q", frame.InvitationID, invID)
	}
	if frame.AgentID != agentID {
		t.Errorf("frame.AgentID = %q, want %q", frame.AgentID, agentID)
	}
	if frame.ChannelID != channelID {
		t.Errorf("frame.ChannelID = %q, want %q", frame.ChannelID, channelID)
	}
	// Recipient must be the agent owner.
	if got.UserID == "" {
		t.Error("recipient userID is empty")
	}
	if frame.RequesterUserID == "" {
		t.Error("requester_user_id missing on frame")
	}
	if got.UserID == frame.RequesterUserID {
		t.Error("pending frame must go to the AGENT OWNER, not the requester")
	}
}

func TestPushOnPatch_DecidedFrameToBothParties(t *testing.T) {
	t.Parallel()
	for _, target := range []string{"approved", "rejected"} {
		t.Run(target, func(t *testing.T) {
			ts, _, pusher, reqTok, ownerTok, channelID, agentID := setupPushTest(t)

			resp, body := bearerJSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", reqTok,
				map[string]any{"channel_id": channelID, "agent_id": agentID})
			if resp.StatusCode != http.StatusCreated {
				t.Fatalf("create: %d %v", resp.StatusCode, body)
			}
			inv := body["invitation"].(map[string]any)
			invID := inv["id"].(string)
			pendingCall := pusher.snapshot()[0] // owner recipient
			ownerID := pendingCall.UserID
			requesterID := pendingCall.Frame.(*ws.AgentInvitationPendingFrame).RequesterUserID

			// Decide.
			resp, body = bearerJSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+invID, ownerTok,
				map[string]string{"state": target})
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("patch %s: %d %v", target, resp.StatusCode, body)
			}

			calls := pusher.snapshot()
			// 1 pending + 2 decided.
			if len(calls) != 3 {
				t.Fatalf("want 3 push calls, got %d", len(calls))
			}
			decided := calls[1:]
			seen := map[string]bool{}
			for _, c := range decided {
				frame, ok := c.Frame.(*ws.AgentInvitationDecidedFrame)
				if !ok {
					t.Fatalf("decided frame wrong type %T", c.Frame)
				}
				if frame.Type != ws.FrameTypeAgentInvitationDecided {
					t.Errorf("type = %q, want %q", frame.Type, ws.FrameTypeAgentInvitationDecided)
				}
				if frame.State != target {
					t.Errorf("state = %q, want %q", frame.State, target)
				}
				if frame.InvitationID != invID {
					t.Errorf("invitation_id = %q, want %q", frame.InvitationID, invID)
				}
				if frame.DecidedAt == 0 {
					t.Error("decided_at must be stamped")
				}
				seen[c.UserID] = true
			}
			if !seen[requesterID] {
				t.Errorf("decided frame not delivered to requester %q (got recipients %v)", requesterID, seen)
			}
			if !seen[ownerID] {
				t.Errorf("decided frame not delivered to owner %q (got recipients %v)", ownerID, seen)
			}
		})
	}
}

// Nil-Hub handler must not panic — push is best-effort, the persisted row
// is the source of truth. Belt-and-suspenders for the helper's nil guard.
func TestPushNilHub_NoPanic(t *testing.T) {
	t.Parallel()
	h := &AgentInvitationHandler{}
	h.pushPending("user-1", &ws.AgentInvitationPendingFrame{Type: ws.FrameTypeAgentInvitationPending})
	h.pushDecided("user-1", &ws.AgentInvitationDecidedFrame{Type: ws.FrameTypeAgentInvitationDecided})
	// no assertion — purely a no-panic guard
}

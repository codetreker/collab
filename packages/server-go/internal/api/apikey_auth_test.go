package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP0APIKeyAuthScenarios(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, adminToken)

	agent := testutil.CreateAgent(t, ts.URL, adminToken, "API Key Bot")
	agentID := stringField(t, agent, "id")
	apiKey := stringField(t, agent, "api_key")

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/users/me", apiKey, nil)
	requireStatus(t, resp, http.StatusOK, data)
	me := data["user"].(map[string]any)
	if me["id"] != agentID || me["role"] != "agent" {
		t.Fatalf("expected agent identity from api key, got %v", me)
	}

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/messages", apiKey, map[string]string{"content": "from api key"})
	requireStatus(t, resp, http.StatusCreated, data)
	messageID := stringField(t, data["message"].(map[string]any), "id")

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/poll", apiKey, map[string]any{"cursor": 0, "timeout_ms": 0, "channel_ids": []string{channelID}})
	requireStatus(t, resp, http.StatusOK, data)
	if events := data["events"].([]any); len(events) == 0 {
		t.Fatalf("expected poll events for api key user after message %s", messageID)
	}

	conn := testutil.DialWS(t, ts.URL, "/ws", apiKey)
	testutil.WSWriteJSON(t, conn, map[string]string{"type": "ping"})
	if msg := testutil.WSReadUntil(t, conn, "pong"); msg["type"] != "pong" {
		t.Fatalf("expected api key websocket pong, got %v", msg)
	}

	sse := testutil.DialSSE(t, ts.URL, apiKey)
	sse.Close()

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agents/"+agentID+"/rotate-api-key", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	rotated := stringField(t, data, "api_key")
	if rotated == apiKey {
		t.Fatal("expected rotated api key to change")
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/users/me", apiKey, nil)
	requireStatus(t, resp, http.StatusUnauthorized, data)
	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/users/me", rotated, nil)
	requireStatus(t, resp, http.StatusOK, data)
}

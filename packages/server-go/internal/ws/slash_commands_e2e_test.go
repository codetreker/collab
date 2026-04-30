package ws_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1SlashCommandsE2E(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, adminToken)

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agents", adminToken, map[string]any{
		"display_name": "Deploy Bot",
		"permissions":  []map[string]string{{"permission": "message.send", "scope": "channel:" + channelID}},
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create agent status %d: %v", resp.StatusCode, data)
	}
	agent := data["agent"].(map[string]any)
	agentKey := agent["api_key"].(string)

	agentConn := testutil.DialWS(t, ts.URL, "/ws", agentKey)
	testutil.WSWriteJSON(t, agentConn, map[string]any{
		"type": "register_commands",
		"commands": []map[string]any{{
			"name":        "deploy",
			"description": "Deploy an environment",
			"usage":       "/deploy <env>",
			"params":      []map[string]any{{"name": "env", "type": "string", "required": true}},
		}},
	})
	registered := testutil.WSReadUntil(t, agentConn, "commands_registered")
	if !wsStringSliceContains(registered["registered"].([]any), "deploy") {
		t.Fatalf("agent command was not registered: %v", registered)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/commands", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list commands status %d: %v", resp.StatusCode, data)
	}
	if !hasAgentCommand(data["agent"].([]any), "Deploy Bot", "deploy") {
		t.Fatalf("registered slash command missing from command list: %v", data)
	}

	userConn := testutil.DialWS(t, ts.URL, "/ws", adminToken)
	testutil.WSWriteJSON(t, userConn, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, userConn, "subscribed")
	testutil.WSWriteJSON(t, userConn, map[string]string{
		"type":              "send_message",
		"channel_id":        channelID,
		"content":           "/deploy staging",
		"client_message_id": "slash-1",
	})
	ack := testutil.WSReadUntil(t, userConn, "message_ack")
	message := ack["message"].(map[string]any)
	if message["content_type"] != "command" || message["content"] != "/deploy staging" {
		t.Fatalf("slash command was not persisted as command content: %v", ack)
	}
}

func wsStringSliceContains(items []any, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func hasAgentCommand(groups []any, agentName, commandName string) bool {
	for _, raw := range groups {
		group := raw.(map[string]any)
		if group["agent_name"] != agentName {
			continue
		}
		for _, cmdRaw := range group["commands"].([]any) {
			cmd := cmdRaw.(map[string]any)
			if cmd["name"] == commandName {
				return true
			}
		}
	}
	return false
}

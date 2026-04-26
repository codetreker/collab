package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1ChannelReorderLexoRankScenarios(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	a := testutil.CreateChannel(t, ts.URL, token, "Rank Alpha", "public")
	b := testutil.CreateChannel(t, ts.URL, token, "Rank Beta", "public")
	c := testutil.CreateChannel(t, ts.URL, token, "Rank Gamma", "public")
	aID := stringField(t, a, "id")
	bID := stringField(t, b, "id")
	cID := stringField(t, c, "id")

	resp, data := testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/reorder", token, map[string]any{"channel_id": cID})
	requireStatus(t, resp, http.StatusOK, data)
	frontRank := stringField(t, data["channel"].(map[string]any), "position")
	if frontRank >= stringField(t, a, "position") {
		t.Fatalf("expected gamma to move before alpha, got %q >= %q", frontRank, a["position"])
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/reorder", token, map[string]any{"channel_id": bID, "after_id": cID})
	requireStatus(t, resp, http.StatusOK, data)
	midRank := stringField(t, data["channel"].(map[string]any), "position")
	if !(frontRank < midRank && midRank < stringField(t, a, "position")) {
		t.Fatalf("expected beta between gamma and alpha, ranks gamma=%q beta=%q alpha=%q", frontRank, midRank, a["position"])
	}

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channel-groups", token, map[string]string{"name": "Grouped Rank"})
	requireStatus(t, resp, http.StatusCreated, data)
	groupID := stringField(t, data["group"].(map[string]any), "id")

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/reorder", token, map[string]any{"channel_id": aID, "group_id": groupID})
	requireStatus(t, resp, http.StatusOK, data)
	if data["channel"].(map[string]any)["group_id"] != groupID {
		t.Fatalf("expected alpha assigned to group: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	channels := data["channels"].([]any)
	if !channelHasGroup(channels, aID, groupID) {
		t.Fatalf("group assignment missing from channel list: %v", channels)
	}
}

func channelHasGroup(channels []any, channelID, groupID string) bool {
	for _, raw := range channels {
		ch, ok := raw.(map[string]any)
		if ok && ch["id"] == channelID && ch["group_id"] == groupID {
			return true
		}
	}
	return false
}

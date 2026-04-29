package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1ChannelGroupsCRUD(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channel-groups", token, map[string]string{"name": "Projects"})
	requireStatus(t, resp, http.StatusCreated, data)
	projects := data["group"].(map[string]any)
	projectsID := stringField(t, projects, "id")

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channel-groups", token, map[string]string{"name": "Archive"})
	requireStatus(t, resp, http.StatusCreated, data)
	archiveID := stringField(t, data["group"].(map[string]any), "id")

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channel-groups/"+projectsID, token, map[string]string{"name": "Active Projects"})
	requireStatus(t, resp, http.StatusOK, data)
	if data["group"].(map[string]any)["name"] != "Active Projects" {
		t.Fatalf("rename failed: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channel-groups/reorder", token, map[string]any{"group_id": archiveID})
	requireStatus(t, resp, http.StatusOK, data)
	archiveRank := stringField(t, data["group"].(map[string]any), "position")
	if archiveRank >= stringField(t, projects, "position") {
		t.Fatalf("expected archive to move before projects, got %q >= %q", archiveRank, projects["position"])
	}

	ch := testutil.CreateChannel(t, ts.URL, token, "Grouped Channel", "public")
	chID := stringField(t, ch, "id")
	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/reorder", token, map[string]any{"channel_id": chID, "group_id": projectsID})
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channel-groups/"+projectsID, token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	ids := data["ungrouped_channel_ids"].([]any)
	if len(ids) != 1 || ids[0] != chID {
		t.Fatalf("expected deleted group to ungroup %s, got %v", chID, ids)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channel-groups", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if containsObjectWithID(data["groups"].([]any), projectsID) {
		t.Fatalf("deleted group still listed: %v", data)
	}
}

package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestRemoteNodesCRUD(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	var nodeID string

	t.Run("CreateNode", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/remote/nodes", adminToken, map[string]string{
			"machine_name": "test-machine",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %v", resp.StatusCode, data)
		}
		node := data["node"].(map[string]any)
		nodeID = node["id"].(string)
		if nodeID == "" {
			t.Fatal("expected node id")
		}
	})

	t.Run("CreateNodeMissingName", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/remote/nodes", adminToken, map[string]string{})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("ListNodes", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		nodes := data["nodes"].([]any)
		if len(nodes) == 0 {
			t.Fatal("expected at least 1 node")
		}
	})

	t.Run("NodeStatus", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/status", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["online"] != false {
			t.Fatal("expected online=false")
		}
	})

	t.Run("OtherUserCannotDeleteNode", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/remote/nodes/"+nodeID, memberToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("NodeLsOffline", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/ls?path=/", adminToken, nil)
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("expected 503, got %d", resp.StatusCode)
		}
	})

	t.Run("NodeReadOffline", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/read?path=/test", adminToken, nil)
		if resp.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("expected 503, got %d", resp.StatusCode)
		}
	})

	var bindingID string

	t.Run("CreateBinding", func(t *testing.T) {
		_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", adminToken, nil)
		channels := chData["channels"].([]any)
		var generalID string
		for _, c := range channels {
			cm := c.(map[string]any)
			if cm["name"] == "general" {
				generalID = cm["id"].(string)
				break
			}
		}

		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/bindings", adminToken, map[string]string{
			"channel_id": generalID,
			"path":       "/home/user/project",
			"label":      "my project",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %v", resp.StatusCode, data)
		}
		binding := data["binding"].(map[string]any)
		bindingID = binding["id"].(string)
	})

	t.Run("CreateBindingMissingFields", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/bindings", adminToken, map[string]string{
			"channel_id": "",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("ListBindings", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/bindings", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		bindings := data["bindings"].([]any)
		if len(bindings) == 0 {
			t.Fatal("expected at least 1 binding")
		}
	})

	t.Run("ListChannelBindings", func(t *testing.T) {
		_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", adminToken, nil)
		channels := chData["channels"].([]any)
		var generalID string
		for _, c := range channels {
			cm := c.(map[string]any)
			if cm["name"] == "general" {
				generalID = cm["id"].(string)
				break
			}
		}
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+generalID+"/remote-bindings", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["bindings"] == nil {
			t.Fatal("expected bindings key")
		}
	})

	t.Run("OtherUserCannotListBindings", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/bindings", memberToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("DeleteBinding", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/remote/nodes/"+nodeID+"/bindings/"+bindingID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("DeleteNode", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/remote/nodes/"+nodeID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("DeleteNodeNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/remote/nodes/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("NodeStatusNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/remote/nodes/nonexistent/status", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

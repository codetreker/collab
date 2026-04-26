package api_test

import (
	"io"
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1WorkspaceFullFlow(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	status, uploadData := uploadWorkspaceFile(t, ts.URL, token, channelID, "notes.txt", "draft")
	if status != http.StatusCreated {
		t.Fatalf("upload status %d: %v", status, uploadData)
	}
	file := uploadData["file"].(map[string]any)
	fileID := stringField(t, file, "id")
	if file["name"] != "notes.txt" || file["size_bytes"].(float64) != 5 {
		t.Fatalf("unexpected uploaded file metadata: %v", file)
	}

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/workspace", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if files := data["files"].([]any); !containsObjectWithID(files, fileID) {
		t.Fatalf("uploaded file missing from workspace list: %v", files)
	}

	req, err := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+fileID, nil)
	if err != nil {
		t.Fatalf("new download request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
	downloadResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("download workspace file: %v", err)
	}
	body, _ := io.ReadAll(downloadResp.Body)
	downloadResp.Body.Close()
	if downloadResp.StatusCode != http.StatusOK || string(body) != "draft" {
		t.Fatalf("download got status %d body %q", downloadResp.StatusCode, body)
	}

	resp, data = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+fileID, token, map[string]string{"name": "final.txt"})
	requireStatus(t, resp, http.StatusOK, data)
	if data["file"].(map[string]any)["name"] != "final.txt" {
		t.Fatalf("rename failed: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+fileID, token, map[string]string{"content": "final copy"})
	requireStatus(t, resp, http.StatusOK, data)
	if data["file"].(map[string]any)["size_bytes"].(float64) != 10 {
		t.Fatalf("update did not adjust size: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/workspace/mkdir", token, map[string]string{"name": "docs"})
	requireStatus(t, resp, http.StatusCreated, data)
	dirID := stringField(t, data["file"].(map[string]any), "id")

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+fileID+"/move", token, map[string]string{"parentId": dirID})
	requireStatus(t, resp, http.StatusOK, data)
	if data["file"].(map[string]any)["parent_id"] != dirID {
		t.Fatalf("move did not set parent: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/workspace?parentId="+dirID, token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if files := data["files"].([]any); !containsObjectWithID(files, fileID) {
		t.Fatalf("moved file missing from directory listing: %v", files)
	}

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+fileID, token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channels/"+channelID+"/workspace/files/"+dirID, token, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/workspace", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if files := data["files"].([]any); containsObjectWithID(files, fileID) || containsObjectWithID(files, dirID) {
		t.Fatalf("deleted workspace entries still listed: %v", files)
	}
}

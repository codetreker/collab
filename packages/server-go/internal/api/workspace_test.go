package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func uploadWorkspaceFile(t *testing.T, serverURL, token, channelID, filename, content string) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, err := w.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	part.Write([]byte(content))
	w.Close()

	req, _ := http.NewRequest("POST", serverURL+"/api/v1/channels/"+channelID+"/workspace/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("upload request: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]any
	readBody(resp, &result)
	return resp.StatusCode, result
}

func readBody(resp *http.Response, v *map[string]any) {
	buf := new(bytes.Buffer)
	buf.ReadFrom(resp.Body)
	if buf.Len() > 0 {
		var m map[string]any
		if err := json.Unmarshal(buf.Bytes(), &m); err == nil {
			*v = m
		}
	}
}

func TestWorkspacePermissions(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	privCh := testutil.CreateChannel(t, ts.URL, adminToken, "private-ws", "private")
	privID := privCh["id"].(string)

	status, data := uploadWorkspaceFile(t, ts.URL, adminToken, privID, "test.txt", "hello")
	if status != http.StatusCreated {
		t.Fatalf("upload failed: %d %v", status, data)
	}
	fileData := data["file"].(map[string]any)
	fileID := fileData["id"].(string)

	t.Run("NonMemberCannotDownload", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+privID+"/workspace/files/"+fileID, memberToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("CrossChannelReturns404", func(t *testing.T) {
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
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+generalID+"/workspace/files/"+fileID, adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("OwnerCanDelete", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/channels/"+privID+"/workspace/files/"+fileID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("ListWorkspaceFiles", func(t *testing.T) {
		_, uploadData := uploadWorkspaceFile(t, ts.URL, adminToken, privID, "list-test.txt", "data")
		if uploadData["file"] == nil {
			t.Skip("upload failed")
		}
		resp, listData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+privID+"/workspace", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		files := listData["files"].([]any)
		if len(files) == 0 {
			t.Fatal("expected at least one file")
		}
	})

	t.Run("ListAllWorkspaces", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/workspaces", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["files"] == nil {
			t.Fatal("expected files key")
		}
	})

	t.Run("Mkdir", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/channels/"+privID+"/workspace/mkdir", adminToken, map[string]string{
			"name": "test-dir",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		dir := data["file"].(map[string]any)
		if dir["is_directory"] != true {
			t.Fatal("expected is_directory=true")
		}
	})

	t.Run("RenameFile", func(t *testing.T) {
		_, uploadData := uploadWorkspaceFile(t, ts.URL, adminToken, privID, "rename-me.txt", "data")
		f := uploadData["file"].(map[string]any)
		fID := f["id"].(string)
		resp, rData := testutil.JSON(t, "PATCH", fmt.Sprintf("%s/api/v1/channels/%s/workspace/files/%s", ts.URL, privID, fID), adminToken, map[string]string{
			"name": "renamed.txt",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		renamed := rData["file"].(map[string]any)
		if renamed["name"] != "renamed.txt" {
			t.Fatalf("expected renamed.txt, got %v", renamed["name"])
		}
	})
}

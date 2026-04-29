package api_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"

	"github.com/google/uuid"
)

// CM-3 reverse 403 assertions — backed by docs/qa/cm-3-resource-ownership-checklist.md §3.
//
// These lock the cross-org contract: a user from orgB getting at orgA-owned
// resource must see HTTP 403, not 200, not 404, not 500. The 404 vs 403 split
// matters because v0 explicitly tolerates existence leakage in exchange for
// a stable, auditable forbidden response (#200 §1 row ①).

// TestCrossOrgRead403 — PUT/DELETE on a foreign-org message both return 403.
func TestCrossOrgRead403(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	generalID := testutil.GetGeneralChannelID(t, ts.URL, ownerToken)

	// Owner posts a message in orgA. Sender is owner → message.OrgID = ownerOrg.
	msg := testutil.PostMessage(t, ts.URL, ownerToken, generalID, "orgA secret")
	messageID := msg["id"].(string)

	// Foreign user in a brand-new org tries to PUT and DELETE.
	foreign := testutil.SeedForeignOrgUser(t, s, "Foreign User", "foreign-msg@test.com")
	foreignToken := testutil.LoginAs(t, ts.URL, "foreign-msg@test.com", "password123")
	_ = foreign // silence unused if needed

	t.Run("PUT cross-org → 403", func(t *testing.T) {
		resp, _ := testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/messages/"+messageID, foreignToken, map[string]string{
			"content": "tampered",
		})
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("DELETE cross-org → 403", func(t *testing.T) {
		resp, _ := testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/messages/"+messageID, foreignToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})
}

// TestCrossOrgChannel403 — GET on a foreign-org channel returns 403, not 404,
// and the body must not leak raw org_id (sanitizer reverse).
func TestCrossOrgChannel403(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	priv := testutil.CreateChannel(t, ts.URL, ownerToken, "orga-private", "private")
	channelID := priv["id"].(string)

	_ = testutil.SeedForeignOrgUser(t, s, "Foreign Ch", "foreign-ch@test.com")
	foreignToken := testutil.LoginAs(t, ts.URL, "foreign-ch@test.com", "password123")

	resp, body := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID, foreignToken, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (body=%v)", resp.StatusCode, body)
	}
	for k := range body {
		if strings.EqualFold(k, "org_id") {
			t.Fatalf("response body must not expose org_id (blueprint §1.1), got key %q", k)
		}
	}
}

// TestCrossOrgFile403 — GET on a foreign-org workspace_files row returns 403.
func TestCrossOrgFile403(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	generalID := testutil.GetGeneralChannelID(t, ts.URL, ownerToken)

	owner, err := s.GetUserByEmail("owner@test.com")
	if err != nil {
		t.Fatalf("get owner: %v", err)
	}
	// Direct insert bypassing handler (handler upload covered separately).
	f := &store.WorkspaceFile{
		ID:        uuid.NewString(),
		UserID:    owner.ID,
		ChannelID: generalID,
		Name:      "secret.txt",
		MimeType:  "text/plain",
		SizeBytes: 5,
		Source:    "upload",
		OrgID:     owner.OrgID,
	}
	if _, err := s.InsertWorkspaceFile(f); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	_ = testutil.SeedForeignOrgUser(t, s, "Foreign File", "foreign-file@test.com")
	foreignToken := testutil.LoginAs(t, ts.URL, "foreign-file@test.com", "password123")

	url := fmt.Sprintf("%s/api/v1/channels/%s/workspace/files/%s", ts.URL, generalID, f.ID)
	resp, _ := testutil.JSON(t, http.MethodGet, url, foreignToken, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

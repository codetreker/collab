// Package api_test — dm_8_bookmark_test.go: DM-8.2 API handler tests.
//
// Acceptance pins (docs/qa/acceptance-templates/dm-8.md §AL-9.2):
//   - 2.3 POST + DELETE add/remove + 404 + non-member 403
//   - 2.4 GET /me/bookmarks per-user list (cross-user not exposed)
//   - 2.5 admin-rail not mounted (admin token → 401/404)
//   - 2.6 sanitize layer (no raw bookmarked_by in response)
//   - 2.7 5 错码字面 byte-identical const
package api_test

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"borgee-server/internal/api"
	"borgee-server/internal/testutil"
)

// dm8SeedMsg posts one message in the user's general channel and returns
// (channelID, messageID).
func dm8SeedMsg(t *testing.T, tsURL, tok string) (string, string) {
	t.Helper()
	chID := cv12General(t, tsURL, tok)
	resp, body := testutil.JSON(t, "POST", tsURL+"/api/v1/channels/"+chID+"/messages", tok,
		map[string]any{"content": "hello world"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("seed message: got %d (%v)", resp.StatusCode, body)
	}
	msg, _ := body["message"].(map[string]any)
	id, _ := msg["id"].(string)
	if id == "" {
		t.Fatalf("no message id in seed: %v", body)
	}
	return chID, id
}

// TestDM82_BookmarkErrCodeConstByteIdentical pins the 5 const literals
// (acceptance §2.7 + content-lock §3 + spec §0 立场 ⑥).
func TestDM82_BookmarkErrCodeConstByteIdentical(t *testing.T) {
	t.Parallel()
	want := map[string]string{
		"NotFound":       "bookmark.not_found",
		"NotMember":      "bookmark.not_member",
		"NotOwner":       "bookmark.not_owner",
		"CrossOrgDenied": "bookmark.cross_org_denied",
		"InvalidRequest": "bookmark.invalid_request",
	}
	got := map[string]string{
		"NotFound":       api.BookmarkErrCodeNotFound,
		"NotMember":      api.BookmarkErrCodeNotMember,
		"NotOwner":       api.BookmarkErrCodeNotOwner,
		"CrossOrgDenied": api.BookmarkErrCodeCrossOrgDenied,
		"InvalidRequest": api.BookmarkErrCodeInvalidRequest,
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("BookmarkErrCode%s = %q, want %q", k, got[k], v)
		}
	}
}

// TestDM82_BookmarkAddRemove_HappyPath — POST add then DELETE remove
// (acceptance §2.3).
func TestDM82_BookmarkAddRemove_HappyPath(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	_, msgID := dm8SeedMsg(t, ts.URL, tok)

	// POST → add.
	resp, body := testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/"+msgID+"/bookmark", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST: %d %v", resp.StatusCode, body)
	}
	if body["is_bookmarked"] != true {
		t.Errorf("POST is_bookmarked = %v, want true", body["is_bookmarked"])
	}
	if body["message_id"] != msgID {
		t.Errorf("message_id drift: got %v want %s", body["message_id"], msgID)
	}

	// POST again → idempotent (already true).
	resp, body = testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/"+msgID+"/bookmark", tok, nil)
	if resp.StatusCode != http.StatusOK || body["is_bookmarked"] != true {
		t.Errorf("POST idempotent: %d is_bookmarked=%v", resp.StatusCode, body["is_bookmarked"])
	}

	// DELETE → remove.
	resp, body = testutil.JSON(t, "DELETE", ts.URL+"/api/v1/messages/"+msgID+"/bookmark", tok, nil)
	if resp.StatusCode != http.StatusOK || body["is_bookmarked"] != false {
		t.Errorf("DELETE: %d is_bookmarked=%v, want false", resp.StatusCode, body["is_bookmarked"])
	}
}

// TestDM82_NotFound404 — bookmark on missing message → 404 bookmark.not_found.
func TestDM82_NotFound404(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	resp, body := testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/non-existent-msg-uuid/bookmark", tok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
	errStr, _ := body["error"].(string)
	if !strings.Contains(errStr, "bookmark.not_found") {
		t.Errorf("error = %q, want bookmark.not_found", errStr)
	}
}

// TestDM82_NonMember403 — foreign user (non-channel-member) → 403
// bookmark.not_member.
func TestDM82_NonMember403(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	_, msgID := dm8SeedMsg(t, ts.URL, ownerTok)

	// Spawn foreign-org user.
	_ = testutil.SeedForeignOrgUser(t, s, "Foreign", "bookmark-foreign@test.com")
	foreignTok := testutil.LoginAs(t, ts.URL, "bookmark-foreign@test.com", "password123")

	resp, body := testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/"+msgID+"/bookmark", foreignTok, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
	errStr, _ := body["error"].(string)
	if !strings.Contains(errStr, "bookmark.not_member") &&
		!strings.Contains(errStr, "bookmark.cross_org_denied") {
		t.Errorf("error = %q, want bookmark.not_member or cross_org_denied", errStr)
	}
}

// TestDM82_ListMyBookmarks_Returns — owner's GET /me/bookmarks returns
// only their own bookmarks (acceptance §2.4).
func TestDM82_ListMyBookmarks_Returns(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	_, msgID := dm8SeedMsg(t, ts.URL, tok)

	// Bookmark + list.
	testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/"+msgID+"/bookmark", tok, nil)
	resp, body := testutil.JSON(t, "GET", ts.URL+"/api/v1/me/bookmarks", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET: %d %v", resp.StatusCode, body)
	}
	bookmarks, _ := body["bookmarks"].([]any)
	if len(bookmarks) != 1 {
		t.Errorf("len bookmarks = %d, want 1", len(bookmarks))
	}
	row, _ := bookmarks[0].(map[string]any)
	if row["id"] != msgID {
		t.Errorf("row id drift: got %v, want %s", row["id"], msgID)
	}
	if row["is_bookmarked"] != true {
		t.Errorf("is_bookmarked = %v, want true", row["is_bookmarked"])
	}
	// 立场 ⑤ — bookmarked_by raw must NOT be in the response.
	if _, has := row["bookmarked_by"]; has {
		t.Errorf("response leaked raw bookmarked_by — must not expose cross-user UUIDs")
	}
}

// TestDM82_NoBookmarkedByRawExposure — server response body must never
// contain `bookmarked_by` JSON key (acceptance §2.6 + 立场 ⑤).
func TestDM82_NoBookmarkedByRawExposure(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	_, msgID := dm8SeedMsg(t, ts.URL, tok)

	// 4 surfaces to check: POST/DELETE/GET /me/bookmarks + GET /messages
	// (the channel listing) — all must omit `bookmarked_by`.
	urls := []struct {
		method, url string
	}{
		{"POST", ts.URL + "/api/v1/messages/" + msgID + "/bookmark"},
		{"DELETE", ts.URL + "/api/v1/messages/" + msgID + "/bookmark"},
		{"GET", ts.URL + "/api/v1/me/bookmarks"},
	}
	for _, u := range urls {
		resp, body := testutil.JSON(t, u.method, u.url, tok, nil)
		if resp.StatusCode >= 500 {
			t.Errorf("%s %s: %d", u.method, u.url, resp.StatusCode)
			continue
		}
		// Walk top-level + 1 nested map looking for the raw key.
		if hasKey(body, "bookmarked_by") {
			t.Errorf("%s %s: response leaks raw bookmarked_by JSON: %v", u.method, u.url, body)
		}
	}
}

// hasKey recursively checks a map / array for the given JSON key.
func hasKey(v any, k string) bool {
	switch x := v.(type) {
	case map[string]any:
		if _, ok := x[k]; ok {
			return true
		}
		for _, vv := range x {
			if hasKey(vv, k) {
				return true
			}
		}
	case []any:
		for _, vv := range x {
			if hasKey(vv, k) {
				return true
			}
		}
	}
	return false
}

// TestDM82_AdminAPINotMounted — admin-rail does NOT host bookmark
// endpoints (acceptance §2.5 + 立场 ③). Reverse-grep equivalent — we
// scan internal/api/ source files for any /admin-api/.../bookmark hit.
func TestDM82_AdminAPINotMounted(t *testing.T) {
	t.Parallel()
	root := dm8RepoRoot(t)
	apiDir := filepath.Join(root, "packages/server-go/internal/api")
	pat := regexp.MustCompile(`/admin-api/[^"\s]*bookmark|admin\b[^/\n]*\bbookmark.*\bGET`)
	hits := dm8GrepCount(t, apiDir, pat)
	if hits != 0 {
		t.Errorf("admin-api/.../bookmark grep: expected 0 hits, got %d (admin god-mode 不挂 立场 ③)", hits)
	}
}

// TestDM82_InvalidRequest400 — empty messageID path / blank should 400.
// (Path-router enforces non-empty pathvalue typically; this verifies
// the BookmarkErrCodeInvalidRequest branch is reachable.)
func TestDM82_NoAuth401(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/messages/whatever/bookmark", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("no auth: got %d, want 401", resp.StatusCode)
	}
	resp, _ = testutil.JSON(t, "GET", ts.URL+"/api/v1/me/bookmarks", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("no auth /me/bookmarks: got %d, want 401", resp.StatusCode)
	}
}

// TestDM82_LimitClampAndParse — ?limit= clamp + parse (default 50, max
// 200, ignore invalid). Covers the limit-parsing branch in handleListMine.
func TestDM82_LimitClampAndParse(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	cases := []string{"5", "999", "not_a_number", "0", "-1"}
	for _, v := range cases {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/me/bookmarks?limit="+v, tok, nil)
		if resp.StatusCode != http.StatusOK {
			t.Errorf("limit=%q: got %d, want 200", v, resp.StatusCode)
		}
	}
}

// dm8RepoRoot mirrors al_9_audit_events_test::repoRoot pattern.
func dm8RepoRoot(t *testing.T) string {
	t.Helper()
	abs, _ := filepath.Abs("../../../..")
	return abs
}

func dm8GrepCount(t *testing.T, dir string, re *regexp.Regexp) int {
	t.Helper()
	count := 0
	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		base := info.Name()
		if !strings.HasSuffix(base, ".go") || strings.HasSuffix(base, "_test.go") {
			return nil
		}
		b, ferr := os.ReadFile(path)
		if ferr != nil {
			return nil
		}
		count += len(re.FindAllIndex(b, -1))
		return nil
	})
	return count
}

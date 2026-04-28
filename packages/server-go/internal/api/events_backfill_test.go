package api_test

// RT-1.2 (#290 follow) — server-side acceptance pin for the
// `GET /api/v1/events?since=N` backfill endpoint that the client
// calls on WS reconnect to fill any gap missed during disconnect.
//
// Reverse约束 (RT-1 spec §1.2): server NEVER returns events with
// `cursor <= since`. Without this, the client's `last_seen_cursor`
// dedup is no longer fail-closed (re-renders + flicker on reconnect).

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func TestEventsBackfillSinceCursor(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// Find owner so we can scope events to their channels.
	users, _ := s.ListUsers()
	var ownerID string
	for _, u := range users {
		if u.Email != nil && *u.Email == "owner@test.com" {
			ownerID = u.ID
			break
		}
	}
	if ownerID == "" {
		t.Fatal("owner user not found")
	}
	chans := s.GetUserChannelIDs(ownerID)
	if len(chans) == 0 {
		t.Skip("test fixture has no channel for owner — backfill needs a membership")
	}
	channelID := chans[0]

	// Seed three events. cursor MAX before any test calls is 'pre'.
	pre := s.GetLatestCursor()
	for i := 0; i < 3; i++ {
		if err := s.CreateEvent(&store.Event{
			Kind:      "artifact_updated",
			ChannelID: channelID,
			Payload:   `{"v":` + itoa(int64(i+1)) + `}`,
		}); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("returns_events_strictly_after_since", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/events?since="+itoa(pre), token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("want 200, got %d", resp.StatusCode)
		}
		evs, _ := data["events"].([]any)
		if len(evs) == 0 {
			t.Fatal("expected backfill events after pre-seeded cursor")
		}
		for _, raw := range evs {
			ev, _ := raw.(map[string]any)
			c, _ := ev["cursor"].(float64)
			if int64(c) <= pre {
				t.Fatalf("server MUST NOT return events with cursor <= since; got %v <= %d", c, pre)
			}
		}
	})

	t.Run("empty_when_since_is_current_max", func(t *testing.T) {
		max := s.GetLatestCursor()
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/events?since="+itoa(max), token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("want 200, got %d", resp.StatusCode)
		}
		evs, _ := data["events"].([]any)
		if len(evs) != 0 {
			t.Fatalf("want empty backfill at high-water mark; got %d events", len(evs))
		}
		if c, _ := data["cursor"].(float64); int64(c) != max {
			t.Fatalf("want echoed cursor=%d, got %v", max, c)
		}
	})

	t.Run("missing_since_400", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/events", token, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("want 400 without since, got %d", resp.StatusCode)
		}
	})

	t.Run("invalid_since_400", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/events?since=abc", token, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("want 400 with non-numeric since, got %d", resp.StatusCode)
		}
	})

	t.Run("unauth_401", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/events?since=0", "", nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("want 401 without auth, got %d", resp.StatusCode)
		}
	})
}

// itoa — local strconv-free helper to keep this test file self-contained.
func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + itoa(-n)
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

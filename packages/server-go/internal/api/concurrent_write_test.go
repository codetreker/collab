package api_test

import (
	"fmt"
	"net/http"
	"sync"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP2ConcurrentWriteControl(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, adminToken)

	type writeCase struct {
		token   string
		content string
	}

	const writeCount = 24
	writes := make([]writeCase, 0, writeCount)
	for i := 0; i < writeCount; i++ {
		token := adminToken
		if i%2 == 1 {
			token = memberToken
		}
		writes = append(writes, writeCase{token: token, content: fmt.Sprintf("concurrent-write-%02d", i)})
	}

	var wg sync.WaitGroup
	errs := make(chan string, len(writes))
	ids := make(chan string, len(writes))
	for _, write := range writes {
		wg.Add(1)
		go func(write writeCase) {
			defer wg.Done()
			resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/messages", write.token, map[string]string{"content": write.content})
			if resp.StatusCode != http.StatusCreated {
				errs <- fmt.Sprintf("write %q status %d body %v", write.content, resp.StatusCode, data)
				return
			}
			msg := data["message"].(map[string]any)
			if msg["content"] != write.content || msg["channel_id"] != channelID {
				errs <- fmt.Sprintf("write %q response mismatch: %v", write.content, msg)
				return
			}
			ids <- stringField(t, msg, "id")
		}(write)
	}
	wg.Wait()
	close(errs)
	close(ids)
	for err := range errs {
		t.Error(err)
	}

	seenIDs := map[string]bool{}
	for id := range ids {
		if seenIDs[id] {
			t.Fatalf("duplicate message id %s", id)
		}
		seenIDs[id] = true
	}
	if len(seenIDs) != writeCount {
		t.Fatalf("expected %d successful writes, got %d", writeCount, len(seenIDs))
	}

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages?limit=50", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	seenContent := map[string]bool{}
	for _, raw := range data["messages"].([]any) {
		msg := raw.(map[string]any)
		if content, ok := msg["content"].(string); ok {
			seenContent[content] = true
		}
	}
	for _, write := range writes {
		if !seenContent[write.content] {
			t.Fatalf("missing persisted concurrent write %q", write.content)
		}
	}
}

package api_test

import (
	"fmt"
	"net/http"
	"sync"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP2ThreeChannelConcurrentMessagesConsistency(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	channelIDs := []string{
		stringField(t, testutil.CreateChannel(t, ts.URL, token, "p2 three alpha", "public"), "id"),
		stringField(t, testutil.CreateChannel(t, ts.URL, token, "p2 three beta", "public"), "id"),
		stringField(t, testutil.CreateChannel(t, ts.URL, token, "p2 three gamma", "public"), "id"),
	}

	const perChannel = 8
	wantByChannel := make([]map[string]bool, len(channelIDs))
	for i := range wantByChannel {
		wantByChannel[i] = make(map[string]bool, perChannel)
	}

	var wg sync.WaitGroup
	errs := make(chan string, len(channelIDs)*perChannel)
	var mu sync.Mutex
	for channelIndex, channelID := range channelIDs {
		for i := 0; i < perChannel; i++ {
			content := fmt.Sprintf("three-channel-%d-%02d", channelIndex, i)
			mu.Lock()
			wantByChannel[channelIndex][content] = true
			mu.Unlock()

			wg.Add(1)
			go func(channelIndex int, channelID, content string) {
				defer wg.Done()
				msg := testutil.PostMessage(t, ts.URL, token, channelID, content)
				if msg["channel_id"] != channelID || msg["content"] != content {
					errs <- fmt.Sprintf("unexpected message for channel %d: %v", channelIndex, msg)
				}
			}(channelIndex, channelID, content)
		}
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}

	for channelIndex, channelID := range channelIDs {
		resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages?limit=50", token, nil)
		requireStatus(t, resp, http.StatusOK, data)
		seen := map[string]bool{}
		for _, raw := range data["messages"].([]any) {
			msg := raw.(map[string]any)
			if msg["channel_id"] != channelID {
				t.Fatalf("channel %s listed message from another channel: %v", channelID, msg)
			}
			if content, ok := msg["content"].(string); ok {
				seen[content] = true
			}
		}
		for content := range wantByChannel[channelIndex] {
			if !seen[content] {
				t.Fatalf("channel %s missing %q in %v", channelID, content, data["messages"])
			}
		}
	}
}

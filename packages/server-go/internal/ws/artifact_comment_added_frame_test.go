// Package ws_test — artifact_comment_added_frame_test.go: CV-5.2
// envelope byte-identity lock + Push test seam coverage.
package ws_test

import (
	"encoding/json"
	"testing"

	"borgee-server/internal/ws"
)

// TestArtifactCommentAddedFrameFieldOrder pins the byte-identical
// envelope order (跟 CV-2.2 AnchorCommentAdded + DM-2.2 MentionPushed
// + RT-3 AgentTaskStateChanged 同模式). Reorder caught here pre-merge.
func TestArtifactCommentAddedFrameFieldOrder(t *testing.T) {
	t.Parallel()
	frame := ws.ArtifactCommentAddedFrame{
		Type:        ws.FrameTypeArtifactCommentAdded,
		Cursor:      42,
		CommentID:   "msg-1",
		ArtifactID:  "art-X",
		ChannelID:   "ch-Y",
		SenderID:    "u-1",
		SenderRole:  "human",
		BodyPreview: "ship it",
		CreatedAt:   1700000000000,
	}
	b, err := json.Marshal(&frame)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"type":"artifact_comment_added","cursor":42,"comment_id":"msg-1","artifact_id":"art-X","channel_id":"ch-Y","sender_id":"u-1","sender_role":"human","body_preview":"ship it","created_at":1700000000000}`
	if string(b) != want {
		t.Fatalf("ArtifactCommentAdded envelope byte-identity broken:\n got: %s\nwant: %s", string(b), want)
	}
}

// TestPushArtifactCommentAdded_NilCursorsEarlyReturn — exercises the
// nil-cursors test seam branch (early return cursor=0 sent=false).
func TestPushArtifactCommentAdded_NilCursorsEarlyReturn(t *testing.T) {
	t.Parallel()
	h := &ws.Hub{} // cursors == nil by default
	cur, sent := h.PushArtifactCommentAdded("c1", "a1", "ch1", "u1", "human", "preview", 1700000000000)
	if sent {
		t.Errorf("expected sent=false on nil cursors, got true")
	}
	if cur != 0 {
		t.Errorf("expected cursor=0 on nil cursors, got %d", cur)
	}
}

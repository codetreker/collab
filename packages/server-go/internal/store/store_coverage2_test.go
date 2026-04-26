package store

import (
	"testing"
)

func TestListUsersFunc(t *testing.T) {
	s := migratedStore(t)
	createUser(t, s, "list1", "member")
	createUser(t, s, "list2", "admin")

	users, err := s.ListUsers()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) < 2 {
		t.Fatalf("expected at least 2 users, got %d", len(users))
	}
}

func TestGetEventCursorForMessage(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "evtcursor", "member")
	ch := &Channel{Name: "cursor-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: GenerateInitialRank()}
	s.CreateChannel(ch)
	s.AddChannelMember(&ChannelMember{ChannelID: ch.ID, UserID: u.ID})

	msg, _ := s.CreateMessageFull(ch.ID, u.ID, "cursor test", "text", nil, nil)
	s.CreateEvent(&Event{Kind: "new_message", ChannelID: ch.ID, Payload: `{"message":{"id":"` + msg.ID + `"}}`})

	cursor, err := s.GetEventCursorForMessage(msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cursor == 0 {
		t.Fatal("expected non-zero cursor")
	}

	_, err = s.GetEventCursorForMessage("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent message")
	}
}

func TestGrantPermissionFunc(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "grantperm", "member")

	perm := &UserPermission{UserID: u.ID, Permission: "test.perm", Scope: "*"}
	if err := s.GrantPermission(perm); err != nil {
		t.Fatal(err)
	}

	perms, _ := s.ListUserPermissions(u.ID)
	found := false
	for _, p := range perms {
		if p.Permission == "test.perm" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected test.perm")
	}
}

func TestCreateMessageWithReplyTo(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "replyer", "member")
	ch := &Channel{Name: "reply-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: GenerateInitialRank()}
	s.CreateChannel(ch)
	s.AddChannelMember(&ChannelMember{ChannelID: ch.ID, UserID: u.ID})

	parent, _ := s.CreateMessageFull(ch.ID, u.ID, "parent msg", "text", nil, nil)
	reply, err := s.CreateMessageFull(ch.ID, u.ID, "reply msg", "text", &parent.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if reply.ReplyToID == nil || *reply.ReplyToID != parent.ID {
		t.Fatal("expected reply_to_id")
	}
}

func TestListChannelMessagesPagination(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "paginator", "member")
	ch := &Channel{Name: "page-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: GenerateInitialRank()}
	s.CreateChannel(ch)
	s.AddChannelMember(&ChannelMember{ChannelID: ch.ID, UserID: u.ID})

	for i := 0; i < 5; i++ {
		s.CreateMessageFull(ch.ID, u.ID, "msg", "text", nil, nil)
	}

	msgs, hasMore, err := s.ListChannelMessages(ch.ID, nil, nil, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3, got %d", len(msgs))
	}
	if !hasMore {
		t.Fatal("expected has_more")
	}

	before := msgs[0].CreatedAt + 1
	msgs2, _, err := s.ListChannelMessages(ch.ID, &before, nil, 10)
	if err != nil {
		t.Fatal(err)
	}
	_ = msgs2

	after := msgs[0].CreatedAt
	msgs3, _, err := s.ListChannelMessages(ch.ID, nil, &after, 10)
	if err != nil {
		t.Fatal(err)
	}
	_ = msgs3
}

func TestUpdateUserFields(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "updatefields", "member")

	s.UpdateUser(u.ID, map[string]any{
		"display_name":    "New Name",
		"role":            "admin",
		"require_mention": true,
		"disabled":        true,
	})

	updated, err := s.GetUserByID(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.DisplayName != "New Name" {
		t.Fatal("display_name not updated")
	}
	if !updated.Disabled {
		t.Fatal("disabled not updated")
	}
}

func TestWorkspaceFileEdgeCases(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "wsedge", "member")
	ch := &Channel{Name: "ws-edge-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: GenerateInitialRank()}
	s.CreateChannel(ch)

	dir, err := s.MkdirWorkspace(u.ID, ch.ID, nil, "parent-dir")
	if err != nil {
		t.Fatal(err)
	}

	wf := &WorkspaceFile{UserID: u.ID, ChannelID: ch.ID, ParentID: &dir.ID, Name: "nested.txt", MimeType: "text/plain", SizeBytes: 50, Source: "upload"}
	result, _ := s.InsertWorkspaceFile(wf)

	siblings, err := s.GetSiblingNames(u.ID, ch.ID, &dir.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(siblings) == 0 {
		t.Fatal("expected siblings")
	}

	moved, err := s.MoveWorkspaceFile(result.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if moved.ParentID != nil {
		t.Fatal("expected nil parent after move to root")
	}
}

func TestGenerateAPIKeyFunc(t *testing.T) {
	key1, err := GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	key2, err := GenerateAPIKey()
	if err != nil {
		t.Fatal(err)
	}
	if key1 == key2 {
		t.Fatal("expected unique keys")
	}
}

func TestResolveConflictEdgeCases(t *testing.T) {
	r := ResolveConflict("noext", []string{"noext"})
	if r != "noext (1)" {
		t.Fatalf("expected noext (1), got %s", r)
	}

	r2 := ResolveConflict("file.tar.gz", []string{"file.tar.gz"})
	if r2 != "file.tar (1).gz" {
		t.Fatalf("expected file.tar (1).gz, got %s", r2)
	}
}

func TestGetChannelIncludingDeletedNotFound(t *testing.T) {
	s := migratedStore(t)
	_, err := s.GetChannelIncludingDeleted("nonexistent")
	if err == nil {
		t.Fatal("expected error")
	}
}

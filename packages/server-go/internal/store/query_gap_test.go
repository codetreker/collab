package store

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
)

func createChannel(t *testing.T, s *Store, name, visibility, createdBy string) *Channel {
	t.Helper()
	ch := &Channel{Name: name, Visibility: visibility, CreatedBy: createdBy, Type: "channel", Position: GenerateInitialRank()}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatal(err)
	}
	return ch
}

func hasString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestQueryGapMessageCreationMentionNamesAndMasking(t *testing.T) {
	s := migratedStore(t)
	sender := createUser(t, s, "qgap_sender", "member")
	named := createUser(t, s, "qgap_named", "member")
	lineNamed := createUser(t, s, "qgap_line", "member")
	ch := createChannel(t, s, "qgap-msg-ch", "public", sender.ID)

	manual := &Message{ChannelID: ch.ID, SenderID: sender.ID, Content: "manual", ContentType: "text"}
	if err := s.CreateMessage(manual); err != nil {
		t.Fatal(err)
	}
	if manual.ID == "" || manual.CreatedAt == 0 {
		t.Fatal("expected CreateMessage to populate id and created_at")
	}

	mention := &Mention{MessageID: manual.ID, UserID: named.ID, ChannelID: ch.ID}
	if err := s.CreateMention(mention); err != nil {
		t.Fatal(err)
	}
	if mention.ID == "" {
		t.Fatal("expected CreateMention to populate id")
	}

	full, err := s.CreateMessageFull(ch.ID, sender.ID, "hello @qgap_named\n@qgap_line email@ignored @missing", "text", nil, []string{named.ID, "missing-user"})
	if err != nil {
		t.Fatal(err)
	}
	if !hasString(full.Mentions, named.ID) || !hasString(full.Mentions, lineNamed.ID) {
		t.Fatalf("expected parsed display-name mentions, got %#v", full.Mentions)
	}
	if hasString(full.Mentions, "missing-user") {
		t.Fatal("invalid client mention should be ignored")
	}

	results, err := s.SearchMessages(ch.ID, "hello", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || len(results[0].Mentions) != 2 {
		t.Fatalf("expected one search hit with mentions, got %#v", results)
	}

	if _, err := s.SoftDeleteMessage(full.ID); err != nil {
		t.Fatal(err)
	}
	deletedAt, err := s.SoftDeleteMessage(full.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deletedAt == 0 {
		t.Fatal("expected idempotent soft delete timestamp")
	}

	msgs, _, err := s.ListChannelMessages(ch.ID, nil, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, msg := range msgs {
		if msg.ID == full.ID && msg.Content != "" {
			t.Fatal("deleted message content should be masked")
		}
	}
}

func TestQueryGapAccessInviteAndLookupEdges(t *testing.T) {
	s := migratedStore(t)
	admin := createUser(t, s, "qgap_admin", "admin")
	member := createUser(t, s, "qgap_member", "member")
	privateCh := createChannel(t, s, "qgap-private", "private", admin.ID)
	publicCh := createChannel(t, s, "qgap-public", "public", admin.ID)

	if s.CanAccessChannel("missing-channel", admin.ID) {
		t.Fatal("missing channel should not be accessible")
	}
	if !s.CanAccessChannel(publicCh.ID, member.ID) {
		t.Fatal("public channel should be accessible")
	}
	if s.CanAccessChannel(privateCh.ID, member.ID) {
		t.Fatal("private channel should reject non-members")
	}
	if !s.CanAccessChannel(privateCh.ID, admin.ID) {
		t.Fatal("admin should access private channel")
	}

	if _, err := s.GetUserByEmail("missing@test.invalid"); err == nil {
		t.Fatal("expected missing email lookup to fail")
	}
	if _, err := s.GetUserByAPIKey("missing-key"); err == nil {
		t.Fatal("expected missing api key lookup to fail")
	}
	if _, err := s.GetInviteCode("missing-code"); err == nil {
		t.Fatal("expected missing invite code lookup to fail")
	}
	if err := s.ConsumeInviteCode("missing-code", member.ID); err == nil {
		t.Fatal("expected missing invite consume to fail")
	}

	expired := time.Now().UnixMilli() - 1000
	code, err := s.CreateInviteCode(admin.ID, &expired, "expired")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ConsumeInviteCode(code.Code, member.ID); err == nil {
		t.Fatal("expected expired invite consume to fail")
	}

	if _, err := s.GetChannelWithCounts("missing-channel", member.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected record-not-found for missing channel counts, got %v", err)
	}
}

func TestQueryGapWorkspaceRemoteEventNotFoundEdges(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "qgap_edges", "member")
	ch := createChannel(t, s, "qgap-edge-ch", "public", u.ID)

	if _, err := s.GetWorkspaceFile("missing-file"); err == nil {
		t.Fatal("expected missing workspace file lookup to fail")
	}
	if err := s.DeleteWorkspaceFile("missing-file"); err == nil {
		t.Fatal("expected missing workspace delete to fail")
	}
	if _, err := s.RenameWorkspaceFile("missing-file", "new-name"); err == nil {
		t.Fatal("expected missing workspace rename to fail")
	}
	if _, err := s.MoveWorkspaceFile("missing-file", nil); err == nil {
		t.Fatal("expected missing workspace move to fail")
	}

	root, err := s.MkdirWorkspace(u.ID, ch.ID, nil, "adir")
	if err != nil {
		t.Fatal(err)
	}
	file := &WorkspaceFile{UserID: u.ID, ChannelID: ch.ID, ParentID: &root.ID, Name: "child.txt", MimeType: "text/plain", Source: "upload"}
	if _, err := s.InsertWorkspaceFile(file); err != nil {
		t.Fatal(err)
	}
	children, err := s.ListWorkspaceFiles(u.ID, ch.ID, &root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(children) != 1 || children[0].Name != "child.txt" {
		t.Fatalf("expected nested workspace child, got %#v", children)
	}

	if _, err := s.GetAgent(u.ID); err == nil {
		t.Fatal("member should not be returned by GetAgent")
	}
	if err := s.RemoveReaction("missing-message", u.ID, "x"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected missing reaction record-not-found, got %v", err)
	}
	if _, err := s.GetRemoteNode("missing-node"); err == nil {
		t.Fatal("expected missing remote node lookup to fail")
	}
	if _, err := s.GetRemoteNodeByToken("missing-token"); err == nil {
		t.Fatal("expected missing remote token lookup to fail")
	}
	if _, err := s.GetRemoteBinding("missing-binding"); err == nil {
		t.Fatal("expected missing remote binding lookup to fail")
	}
	if _, err := s.GetEventByCursor(999999); err == nil {
		t.Fatal("expected missing event cursor lookup to fail")
	}
}

func TestQueryGapPositionAndPermissionBranches(t *testing.T) {
	s := migratedStore(t)
	if s.DB() == nil {
		t.Fatal("expected DB handle")
	}
	u := createUser(t, s, "qgap_pos", "agent")
	owner := createUser(t, s, "qgap_owner", "member")
	group := &ChannelGroup{Name: "qgap-group", Position: GenerateInitialRank(), CreatedBy: owner.ID}
	if err := s.CreateChannelGroup(group); err != nil {
		t.Fatal(err)
	}
	ch := createChannel(t, s, "qgap-grouped", "public", owner.ID)
	if err := s.UpdateChannelPosition(ch.ID, GenerateInitialRank(), &group.ID); err != nil {
		t.Fatal(err)
	}

	before, after, err := s.GetAdjacentChannelPositions(nil, &group.ID)
	if err != nil {
		t.Fatal(err)
	}
	if before != "" || after == "" {
		t.Fatalf("expected first grouped position as after, got before=%q after=%q", before, after)
	}

	before, after, err = s.GetAdjacentChannelPositions(&ch.ID, &group.ID)
	if err != nil {
		t.Fatal(err)
	}
	if before == "" || after != "" {
		t.Fatalf("expected grouped tail position, got before=%q after=%q", before, after)
	}

	if err := s.GrantCreatorPermissions(u.ID, "agent", ch.ID, &owner.ID); err != nil {
		t.Fatal(err)
	}
	perms, err := s.ListUserPermissions(owner.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(perms) == 0 {
		t.Fatal("expected owner to receive permissions for agent-created channel")
	}

	ids, err := s.UngroupChannels("missing-group")
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 0 {
		t.Fatalf("expected no channels for missing group, got %#v", ids)
	}
}

func TestQueryGapDMPreviewAndEmptyPositionBranches(t *testing.T) {
	s := migratedStore(t)
	u1 := createUser(t, s, "qgap_dm1", "member")
	u2 := createUser(t, s, "qgap_dm2", "member")
	dm, err := s.CreateDmChannel(u1.ID, u2.ID)
	if err != nil {
		t.Fatal(err)
	}

	beforeMessage, err := s.ListDmChannelsForUser(u1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(beforeMessage) != 1 || beforeMessage[0].LastMessage != nil {
		t.Fatalf("expected dm without last message, got %#v", beforeMessage)
	}

	if _, err := s.CreateMessageFull(dm.ID, u2.ID, "dm body", "text", nil, nil); err != nil {
		t.Fatal(err)
	}
	afterMessage, err := s.ListDmChannelsForUser(u1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(afterMessage) != 1 || afterMessage[0].LastMessage == nil || afterMessage[0].LastMessage.Content != "dm body" {
		t.Fatalf("expected dm last message, got %#v", afterMessage)
	}

	pub := createChannel(t, s, "qgap-preview", "public", u1.ID)
	now := time.Now().UnixMilli()
	if err := s.CreateMessage(&Message{ChannelID: pub.ID, SenderID: u1.ID, Content: "first preview", ContentType: "text", CreatedAt: now - 2000}); err != nil {
		t.Fatal(err)
	}
	if err := s.CreateMessage(&Message{ChannelID: pub.ID, SenderID: u1.ID, Content: "second preview", ContentType: "text", CreatedAt: now - 1000}); err != nil {
		t.Fatal(err)
	}
	preview, err := s.GetPreviewMessages(pub.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview) < 2 || preview[0].Content != "first preview" {
		t.Fatalf("expected preview messages reversed to ascending order, got %#v", preview)
	}

	empty := migratedStore(t)
	if got := empty.GetLastChannelPosition(); got != "" {
		t.Fatalf("expected empty last channel position, got %q", got)
	}
	if got := empty.GetLastGroupPosition(); got != "" {
		t.Fatalf("expected empty last group position, got %q", got)
	}
	missingGroupID := "missing-group"
	if _, _, err := empty.GetAdjacentGroupPositions(&missingGroupID); err == nil {
		t.Fatal("expected missing group adjacent lookup to fail")
	}
}

func TestQueryGapClosedDBErrors(t *testing.T) {
	s := migratedStore(t)
	u := createUser(t, s, "qgap_closed", "member")
	ch := createChannel(t, s, "qgap-closed", "public", u.ID)
	msg, err := s.CreateMessageFull(ch.ID, u.ID, "closed db seed", "text", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}

	expectErr := func(name string, err error) {
		t.Helper()
		if err == nil {
			t.Fatalf("expected %s to fail on closed db", name)
		}
	}

	expectErr("GetMessageByID", func() error { _, err := s.GetMessageByID(msg.ID); return err }())
	expectErr("AddUserToPublicChannels", s.AddUserToPublicChannels(u.ID))
	expectErr("GrantDefaultPermissions", s.GrantDefaultPermissions(u.ID, "member"))
	expectErr("ListChannelMessages", func() error { _, _, err := s.ListChannelMessages(ch.ID, nil, nil, 1); return err }())
	expectErr("SearchMessages", func() error { _, err := s.SearchMessages(ch.ID, "seed", 1); return err }())
	expectErr("CreateMessageFull", func() error { _, err := s.CreateMessageFull(ch.ID, u.ID, "x", "text", nil, nil); return err }())
	expectErr("UpdateMessage", func() error { _, err := s.UpdateMessage(msg.ID, "x"); return err }())
	expectErr("SoftDeleteMessage", func() error { _, err := s.SoftDeleteMessage(msg.ID); return err }())
	if s.CanAccessChannel(ch.ID, "missing-user") {
		t.Fatal("closed db should not grant private/public access")
	}
	expectErr("GetChannelWithCounts", func() error { _, err := s.GetChannelWithCounts(ch.ID, u.ID); return err }())
	expectErr("AddAllUsersToChannel", s.AddAllUsersToChannel(ch.ID))
	expectErr("GetPreviewMessages", func() error { _, err := s.GetPreviewMessages(ch.ID, 1); return err }())
	expectErr("GetAdjacentChannelPositions", func() error { _, _, err := s.GetAdjacentChannelPositions(&ch.ID, nil); return err }())
	expectErr("GrantCreatorPermissions", s.GrantCreatorPermissions(u.ID, "member", ch.ID, nil))
	expectErr("UngroupChannels", func() error { _, err := s.UngroupChannels("group"); return err }())
	expectErr("CreateDmChannel", func() error { _, err := s.CreateDmChannel(u.ID, "other-user"); return err }())
	expectErr("ListDmChannelsForUser", func() error { _, err := s.ListDmChannelsForUser(u.ID); return err }())

	expectErr("SoftDeleteUser", s.SoftDeleteUser(u.ID))
	expectErr("CreateInviteCode", func() error { _, err := s.CreateInviteCode(u.ID, nil, "closed"); return err }())
	expectErr("DeleteInviteCode", func() error { _, err := s.DeleteInviteCode("closed"); return err }())
	expectErr("ForceDeleteChannel", s.ForceDeleteChannel(ch.ID))
	expectErr("GetReactionsByMessage", func() error { _, err := s.GetReactionsByMessage(msg.ID); return err }())
	expectErr("InsertWorkspaceFile", func() error {
		_, err := s.InsertWorkspaceFile(&WorkspaceFile{UserID: u.ID, ChannelID: ch.ID, Name: "closed.txt", Source: "upload"})
		return err
	}())
	expectErr("RenameWorkspaceFile", func() error { _, err := s.RenameWorkspaceFile("file", "name"); return err }())
	expectErr("MkdirWorkspace", func() error { _, err := s.MkdirWorkspace(u.ID, ch.ID, nil, "dir"); return err }())
	expectErr("MoveWorkspaceFile", func() error { _, err := s.MoveWorkspaceFile("file", nil); return err }())
	expectErr("CreateRemoteNode", func() error { _, err := s.CreateRemoteNode(u.ID, "machine"); return err }())
	expectErr("CreateRemoteBinding", func() error { _, err := s.CreateRemoteBinding("node", ch.ID, "/tmp", "tmp"); return err }())

	expectErr("GetEventsSince", func() error { _, err := s.GetEventsSince(0, 1, []string{ch.ID}); return err }())
	expectErr("GetEventsSinceWithChanges", func() error {
		_, err := s.GetEventsSinceWithChanges(0, 1, []string{ch.ID}, []string{"kind"})
		return err
	}())
}

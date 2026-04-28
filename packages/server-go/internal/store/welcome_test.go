package store

import (
	"strings"
	"testing"

	"borgee-server/internal/migrations"
)

// TestCreateWelcomeChannelForUser_Success exercises the happy-path of
// CM-onboarding step 1 + step 2: a fresh user gets a type=system channel,
// a channel_member row, and exactly one system message carrying the
// quick_action payload.
func TestCreateWelcomeChannelForUser_Success(t *testing.T) {
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	email := "alice@example.com"
	u := &User{DisplayName: "Alice", Role: "member", Email: &email, PasswordHash: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}

	ch, sysOK, err := s.CreateWelcomeChannelForUser(u.ID, u.DisplayName)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if !sysOK {
		t.Fatalf("systemMessageOK = false, want true")
	}
	if ch == nil || ch.Type != "system" || ch.CreatedBy != u.ID {
		t.Fatalf("unexpected channel: %+v", ch)
	}
	if !strings.HasPrefix(ch.Name, "welcome-") {
		t.Fatalf("channel name = %q, want welcome-* prefix", ch.Name)
	}

	// channel_member exists.
	var mcount int64
	s.db.Raw("SELECT COUNT(*) FROM channel_members WHERE channel_id = ? AND user_id = ?", ch.ID, u.ID).Row().Scan(&mcount)
	if mcount != 1 {
		t.Fatalf("channel_members count = %d, want 1", mcount)
	}

	// Welcome system message present with quick_action populated.
	var (
		body string
		qa   *string
	)
	row := s.db.Raw(`
		SELECT content, quick_action FROM messages
		WHERE channel_id = ? AND sender_id = 'system'
	`, ch.ID).Row()
	if err := row.Scan(&body, &qa); err != nil {
		t.Fatalf("scan welcome message: %v", err)
	}
	if body != WelcomeMessageBody {
		t.Fatalf("body mismatch:\n got=%q\nwant=%q", body, WelcomeMessageBody)
	}
	if qa == nil || *qa != WelcomeQuickActionJSON {
		t.Fatalf("quick_action = %v, want %q", qa, WelcomeQuickActionJSON)
	}
}

// TestCreateWelcomeChannelForUser_Idempotent verifies re-running the helper
// for the same user does not create duplicate channels — the existing
// type=system row is returned.
func TestCreateWelcomeChannelForUser_Idempotent(t *testing.T) {
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	email := "bob@example.com"
	u := &User{DisplayName: "Bob", Role: "member", Email: &email, PasswordHash: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}

	ch1, _, err := s.CreateWelcomeChannelForUser(u.ID, u.DisplayName)
	if err != nil {
		t.Fatal(err)
	}
	ch2, _, err := s.CreateWelcomeChannelForUser(u.ID, u.DisplayName)
	if err != nil {
		t.Fatal(err)
	}
	if ch1.ID != ch2.ID {
		t.Fatalf("expected idempotent: ch1=%s ch2=%s", ch1.ID, ch2.ID)
	}

	var n int64
	s.db.Raw("SELECT COUNT(*) FROM channels WHERE created_by = ? AND type = 'system'", u.ID).Row().Scan(&n)
	if n != 1 {
		t.Fatalf("system channels per user = %d, want 1", n)
	}
}

// TestCreateWelcomeChannelForUser_GracefulMessageFailure simulates the
// message-insert failure branch (onboarding-journey.md §3 step 2 ❌). We force
// the failure by dropping the messages table just before the call. The
// channel + channel_member must still commit and the helper must return
// systemMessageOK=false without an error.
func TestCreateWelcomeChannelForUser_GracefulMessageFailure(t *testing.T) {
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	email := "carol@example.com"
	u := &User{DisplayName: "Carol", Role: "member", Email: &email, PasswordHash: "h"}
	if err := s.CreateUser(u); err != nil {
		t.Fatal(err)
	}

	// Break the message insert path.
	if err := s.db.Exec("DROP TABLE messages").Error; err != nil {
		t.Fatalf("drop messages: %v", err)
	}

	ch, sysOK, err := s.CreateWelcomeChannelForUser(u.ID, u.DisplayName)
	if err != nil {
		t.Fatalf("expected nil error (graceful), got %v", err)
	}
	if sysOK {
		t.Fatalf("expected systemMessageOK=false")
	}
	if ch == nil || ch.Type != "system" {
		t.Fatalf("channel must still commit: %+v", ch)
	}
	// channel_member also committed.
	var n int64
	s.db.Raw("SELECT COUNT(*) FROM channel_members WHERE channel_id = ? AND user_id = ?", ch.ID, u.ID).Row().Scan(&n)
	if n != 1 {
		t.Fatalf("channel_members count = %d, want 1 (channel must persist)", n)
	}
}

// TestWelcomeConstantsMirrorMigrations protects the duplicated literal in
// store/welcome.go from drifting away from migrations/cm_onboarding_welcome.go.
// Per onboarding-journey.md §3 the copy is locked; both packages must agree.
func TestWelcomeConstantsMirrorMigrations(t *testing.T) {
	if WelcomeMessageBody != migrations.WelcomeMessageBody {
		t.Fatalf("WelcomeMessageBody drift\n store: %q\n migr.: %q", WelcomeMessageBody, migrations.WelcomeMessageBody)
	}
	if WelcomeQuickActionJSON != migrations.WelcomeQuickActionJSON {
		t.Fatalf("WelcomeQuickActionJSON drift")
	}
}

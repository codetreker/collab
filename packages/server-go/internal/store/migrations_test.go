package store

import "testing"

func TestMigrateIdempotent(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	// Running twice should be idempotent
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateWithoutAdminSeedIsIdempotent(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	// Run migrate again - should not duplicate
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	users, err := s.ListUsers()
	if err != nil {
		t.Fatal(err)
	}
	for _, user := range users {
		if user.Role == "admin" {
			t.Fatal("admin should not be seeded into users table")
		}
	}
}

func TestMigrateWithExistingData(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	// Create some data
	u := createUser(t, s, "migdata", "admin")
	ch := &Channel{Name: "mig-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: ""}
	s.CreateChannel(ch)

	// Add member
	s.AddChannelMember(&ChannelMember{ChannelID: ch.ID, UserID: u.ID})

	// Create message
	s.CreateMessageFull(ch.ID, u.ID, "test", "text", nil, nil)

	// Run migration again - should handle backfills
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateWithDMChannel(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	u1 := createUser(t, s, "dmm1", "member")
	u2 := createUser(t, s, "dmm2", "member")

	dmCh, _ := s.CreateDmChannel(u1.ID, u2.ID)
	_ = dmCh

	// Re-migrate - should handle DM cleanup
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateDefaultPermissions(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	u := createUser(t, s, "permback", "member")
	// Don't grant permissions yet
	perms, _ := s.ListUserPermissions(u.ID)
	if len(perms) != 0 {
		t.Fatalf("expected 0 perms before backfill, got %d", len(perms))
	}

	// Re-migrate should backfill
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	perms2, _ := s.ListUserPermissions(u.ID)
	if len(perms2) == 0 {
		t.Fatal("expected permissions after backfill")
	}
}

func TestMigrateCreatorPermissions(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	u := createUser(t, s, "creator", "member")
	ch := &Channel{Name: "creator-ch", Visibility: "public", CreatedBy: u.ID, Type: "channel", Position: GenerateInitialRank()}
	s.CreateChannel(ch)

	// Re-migrate should backfill creator permissions
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

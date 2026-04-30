package store

import "testing"

func testStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestMigrate(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

func TestMigrateDoesNotSeedAdmin(t *testing.T) {
	t.Parallel()
	s := testStore(t)
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

func TestCreateAndGetUser(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	email := "test@example.com"
	user := &User{
		DisplayName:  "Test",
		Role:         "member",
		Email:        &email,
		PasswordHash: "hash",
	}
	if err := s.CreateUser(user); err != nil {
		t.Fatal(err)
	}
	if user.ID == "" {
		t.Fatal("expected ID to be set")
	}

	byEmail, err := s.GetUserByEmail(email)
	if err != nil {
		t.Fatal(err)
	}
	if byEmail.ID != user.ID {
		t.Fatal("ID mismatch")
	}

	byID, err := s.GetUserByID(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if byID.DisplayName != "Test" {
		t.Fatal("display name mismatch")
	}
}

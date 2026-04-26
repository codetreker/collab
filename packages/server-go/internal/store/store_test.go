package store

import (
	"os"
	"testing"
)

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
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
}

func TestSeedAdmin(t *testing.T) {
	os.Setenv("ADMIN_EMAIL", "admin@test.com")
	os.Setenv("ADMIN_PASSWORD", "testpassword123")
	t.Cleanup(func() {
		os.Unsetenv("ADMIN_EMAIL")
		os.Unsetenv("ADMIN_PASSWORD")
	})

	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}

	user, err := s.GetUserByEmail("admin@test.com")
	if err != nil {
		t.Fatal("admin not found:", err)
	}
	if user.Role != "admin" {
		t.Fatalf("expected admin role, got %s", user.Role)
	}
}

func TestCreateAndGetUser(t *testing.T) {
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

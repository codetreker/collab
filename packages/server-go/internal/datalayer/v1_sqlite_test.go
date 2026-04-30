package datalayer

// TEST-FIX-3-COV: GetByName / GetByAPIKey 0% direct cover.

import (
	"context"
	"errors"
	"testing"

	"borgee-server/internal/store"
)

func TestChannelRepository_GetByName(t *testing.T) {
	t.Parallel()
	dl := newTestDataLayer(t)
	u := newTestUser(t, dl, "ch-byname-user", "byname@example.com")
	ch := &store.Channel{Name: "byname-ch", CreatedBy: u.ID}
	if err := dl.ChannelRepo.Create(context.Background(), ch); err != nil {
		t.Fatalf("ChannelRepo.Create: %v", err)
	}
	got, err := dl.ChannelRepo.GetByName(context.Background(), "byname-ch")
	if err != nil {
		t.Fatalf("GetByName: %v", err)
	}
	if got.ID != ch.ID {
		t.Fatalf("ID mismatch")
	}
	// Missing-row path → ErrRepositoryNotFound.
	_, err = dl.ChannelRepo.GetByName(context.Background(), "no-such")
	if !errors.Is(err, ErrRepositoryNotFound) {
		t.Fatalf("want ErrRepositoryNotFound, got %v", err)
	}
}

func TestUserRepository_GetByAPIKey(t *testing.T) {
	t.Parallel()
	dl := newTestDataLayer(t)
	// Missing path: random key → not found.
	_, err := dl.UserRepo.GetByAPIKey(context.Background(), "no-such-key")
	if !errors.Is(err, ErrRepositoryNotFound) {
		t.Fatalf("want ErrRepositoryNotFound, got %v", err)
	}
}

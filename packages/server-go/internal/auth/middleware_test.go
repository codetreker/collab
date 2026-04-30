package auth

// TEST-FIX-3-COV: ContextWithUser 0% — direct call.

import (
	"context"
	"testing"

	"borgee-server/internal/store"
)

func TestContextWithUser_RoundTrip(t *testing.T) {
	t.Parallel()
	u := &store.User{ID: "user-x", DisplayName: "X", Role: "member"}
	ctx := ContextWithUser(context.Background(), u)
	got := UserFromContext(ctx)
	if got == nil {
		t.Fatal("UserFromContext: nil after ContextWithUser")
	}
	if got.ID != "user-x" {
		t.Fatalf("UserFromContext: got %q want user-x", got.ID)
	}
	// Empty ctx round-trip → nil.
	if UserFromContext(context.Background()) != nil {
		t.Fatal("UserFromContext: expected nil for empty ctx")
	}
}

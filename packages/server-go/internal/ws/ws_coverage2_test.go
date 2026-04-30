package ws_test

import (
	"testing"

	"borgee-server/internal/store"
)

func TestHubPluginAndRemoteRegistration(t *testing.T) {
	t.Parallel()
	hub, s := setupTestHub(t)

	user := &store.User{ID: "hub-reg-test", DisplayName: "HubRegTest", Role: "member"}
	s.CreateUser(user)

	p := hub.GetPlugin("nonexistent")
	if p != nil {
		t.Fatal("expected nil plugin")
	}

	r := hub.GetRemote("nonexistent")
	if r != nil {
		t.Fatal("expected nil remote")
	}
}

func TestHubUnsubscribeUserFromChannel(t *testing.T) {
	t.Parallel()
	hub, s := setupTestHub(t)

	user := &store.User{ID: "unsub-test", DisplayName: "UnsubTest", Role: "member"}
	s.CreateUser(user)

	hub.UnsubscribeUserFromChannel(user.ID, "some-channel")
	hub.BroadcastToChannel("some-channel", map[string]string{"type": "test"}, nil)
}

func TestHubAccessors(t *testing.T) {
	t.Parallel()
	hub, _ := setupTestHub(t)

	if hub.Store() == nil {
		t.Fatal("expected store")
	}
	if hub.Config() == nil {
		t.Fatal("expected config")
	}
	if hub.CommandStore() == nil {
		t.Fatal("expected command store")
	}
}

func TestHubEventBroadcastingExtended(t *testing.T) {
	t.Parallel()
	hub, s := setupTestHub(t)

	user := &store.User{ID: "evt-broad2", DisplayName: "EvtBroad2", Role: "member"}
	s.CreateUser(user)

	ch := &store.Channel{Name: "evt-ch2", Visibility: "public", CreatedBy: user.ID, Type: "channel", Position: store.GenerateInitialRank()}
	s.CreateChannel(ch)

	hub.BroadcastEventToChannel(ch.ID, "test_event", map[string]string{"hello": "world"})
	hub.BroadcastEventToAll("test_all", map[string]string{"hello": "all"})
	hub.BroadcastToUser(user.ID, map[string]string{"type": "test_user", "hello": "user"})
	hub.SignalNewEvents()
}

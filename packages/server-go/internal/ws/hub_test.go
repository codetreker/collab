package ws_test

import (
	"io"
	"log/slog"
	"testing"

	"borgee-server/internal/config"
	"borgee-server/internal/store"
	"borgee-server/internal/ws"
)

func setupTestHub(t *testing.T) (*ws.Hub, *store.Store) {
	t.Helper()
	s := store.MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := &config.Config{JWTSecret: "test", NodeEnv: "development"}
	return ws.NewHub(s, logger, cfg), s
}

func TestCommandStoreAgentOnly(t *testing.T) {
	t.Parallel()
	cs := ws.NewCommandStore()

	cmds := []ws.AgentCommand{
		{Name: "test-cmd", Description: "a test"},
	}
	cs.Register("conn-1", "agent-1", "TestAgent", cmds)

	all := cs.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 group, got %d", len(all))
	}
	if all[0].AgentID != "agent-1" {
		t.Fatalf("expected agent-1, got %s", all[0].AgentID)
	}
}

func TestCommandStorePerAgentLimit(t *testing.T) {
	t.Parallel()
	cs := ws.NewCommandStore()

	cmds := make([]ws.AgentCommand, 105)
	for i := range cmds {
		cmds[i] = ws.AgentCommand{Name: "cmd-" + string(rune('a'+i%26)) + string(rune('a'+i/26))}
	}
	cs.Register("conn-1", "agent-1", "Agent1", cmds)

	all := cs.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 group, got %d", len(all))
	}
	if len(all[0].Commands) > 100 {
		t.Fatalf("expected <= 100 commands, got %d", len(all[0].Commands))
	}
}

func TestCommandStoreDisconnectCleanup(t *testing.T) {
	t.Parallel()
	cs := ws.NewCommandStore()

	cs.Register("conn-1", "agent-1", "Agent1", []ws.AgentCommand{
		{Name: "cmd-a"},
	})
	cs.Register("conn-2", "agent-2", "Agent2", []ws.AgentCommand{
		{Name: "cmd-b"},
	})

	cs.UnregisterByConnection("conn-1")

	all := cs.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 group after disconnect, got %d", len(all))
	}
	if all[0].AgentID != "agent-2" {
		t.Fatalf("expected agent-2 to remain, got %s", all[0].AgentID)
	}
}

func TestEventFanOut(t *testing.T) {
	t.Parallel()
	s, _ := setupTestHub(t)
	_ = s

	ch1 := s.SubscribeEvents()
	ch2 := s.SubscribeEvents()
	defer s.UnsubscribeEvents(ch1)
	defer s.UnsubscribeEvents(ch2)

	s.SignalNewEvents()

	select {
	case <-ch1:
	default:
		t.Fatal("ch1 should have received signal")
	}

	select {
	case <-ch2:
	default:
		t.Fatal("ch2 should have received signal")
	}
}

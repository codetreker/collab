package ws

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"borgee-server/internal/config"
	"borgee-server/internal/store"

	"github.com/coder/websocket"
)

func newInternalHub(t *testing.T) (*Hub, *store.Store) {
	t.Helper()
	s := store.MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := &config.Config{JWTSecret: "test", NodeEnv: "development", DevAuthBypass: true}
	return NewHub(s, logger, cfg), s
}

func TestInternalClientSendAndAliveEdges(t *testing.T) {
	t.Parallel()
	c := &Client{
		send:       make(chan []byte, 1),
		done:       make(chan struct{}),
		subscribed: map[string]bool{},
		alive:      true,
	}

	c.SendJSON(map[string]string{"type": "first"})
	c.SendJSON(map[string]string{"type": "dropped"})
	if got := len(c.send); got != 1 {
		t.Fatalf("expected send buffer to stay at 1, got %d", got)
	}
	<-c.send

	c.SendJSON(func() {})
	if got := len(c.send); got != 0 {
		t.Fatalf("invalid json should not enqueue, got %d", got)
	}

	c.SendPing()
	var ping map[string]string
	if err := json.Unmarshal(<-c.send, &ping); err != nil {
		t.Fatal(err)
	}
	if ping["type"] != "ping" {
		t.Fatalf("expected ping, got %q", ping["type"])
	}

	if !c.CheckAlive() {
		t.Fatal("first alive check should pass")
	}
	if c.CheckAlive() {
		t.Fatal("second alive check should fail until pong")
	}
	c.setAlive()
	if !c.CheckAlive() {
		t.Fatal("alive check should pass after setAlive")
	}

	close(c.send)
	c.writePump(context.Background())

	c2 := &Client{send: make(chan []byte), done: make(chan struct{})}
	close(c2.done)
	c2.writePump(context.Background())
}

func TestInternalClientCloseWithWebSocket(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		_, _, _ = conn.Read(r.Context())
	}))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+server.URL[len("http"):], nil)
	if err != nil {
		t.Fatal(err)
	}

	c := &Client{conn: conn, done: make(chan struct{})}
	c.Close()
	c.Close()

	select {
	case <-c.done:
	default:
		t.Fatal("Close should close done channel")
	}
}

func TestInternalHubBroadcastBranches(t *testing.T) {
	t.Parallel()
	hub, _ := newInternalHub(t)
	c1 := &Client{userID: "u1", send: make(chan []byte, 4), subscribed: map[string]bool{"ch": true}}
	c2 := &Client{userID: "u1", send: make(chan []byte, 4), subscribed: map[string]bool{"ch": true}}
	c3 := &Client{userID: "u2", send: make(chan []byte, 4), subscribed: map[string]bool{}}

	hub.Register(c1)
	hub.Register(c2)
	hub.Register(c3)

	hub.BroadcastToChannel("ch", map[string]string{"type": "channel"}, c1)
	if got := len(c1.send); got != 0 {
		t.Fatalf("excluded client should not receive channel broadcast, got %d", got)
	}
	if got := len(c2.send); got != 1 {
		t.Fatalf("subscribed client should receive channel broadcast, got %d", got)
	}
	if got := len(c3.send); got != 0 {
		t.Fatalf("unsubscribed client should not receive channel broadcast, got %d", got)
	}

	hub.BroadcastToUser("u1", map[string]string{"type": "user"})
	if got := len(c1.send); got != 1 {
		t.Fatalf("user client should receive direct broadcast, got %d", got)
	}
	if got := len(c2.send); got != 2 {
		t.Fatalf("second user client should receive direct broadcast, got %d", got)
	}

	hub.BroadcastToAll(map[string]string{"type": "all"})
	if got := len(c3.send); got != 1 {
		t.Fatalf("all broadcast should reach every client, got %d", got)
	}

	hub.UnsubscribeUserFromChannel("u1", "ch")
	if c1.IsSubscribed("ch") || c2.IsSubscribed("ch") {
		t.Fatal("expected user clients to be unsubscribed from channel")
	}

	ids := hub.GetOnlineUserIDs()
	if len(ids) != 2 {
		t.Fatalf("expected 2 online users, got %d", len(ids))
	}

	hub.BroadcastToChannel("ch", func() {}, nil)
	hub.BroadcastToUser("u1", func() {})
	hub.BroadcastToAll(func() {})

	hub.Unregister(c2)
	hub.Unregister(c1)
	hub.Unregister(c3)
	if got := hub.ClientCount(); got != 0 {
		t.Fatalf("expected no clients after unregister, got %d", got)
	}
}

func TestInternalCommandStoreReplacementAndLimits(t *testing.T) {
	t.Parallel()
	cs := NewCommandStore()
	cs.Register("conn-1", "agent-1", "Agent", []AgentCommand{{Name: "same"}, {Name: "old"}})
	cs.Register("conn-1", "agent-1", "Agent", []AgentCommand{{Name: "same"}, {Name: "new"}})

	if got := len(cs.GetByName("old")); got != 0 {
		t.Fatalf("re-register should remove old command name, got %d", got)
	}
	if got := len(cs.GetAll()[0].Commands); got != 2 {
		t.Fatalf("expected replacement commands only, got %d", got)
	}
	if cs.UnregisterByConnection("missing") {
		t.Fatal("missing connection unregister should return false")
	}

	cmds := make([]AgentCommand, 100)
	for i := range cmds {
		cmds[i] = AgentCommand{Name: "cmd" + string(rune('a'+i/26)) + string(rune('a'+i%26))}
	}
	cs.Register("conn-2", "agent-2", "Agent2", cmds)
	cs.Register("conn-3", "agent-2", "Agent2", []AgentCommand{{Name: "overflow"}})
	if got := len(cs.GetByName("overflow")); got != 0 {
		t.Fatalf("overflow command should be clipped, got %d", got)
	}
}

func TestInternalPluginConnRequestResponseBranches(t *testing.T) {
	t.Parallel()
	hub, _ := newInternalHub(t)
	hub.SetHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/json" {
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"ok":true}`))
			return
		}
		_, _ = w.Write([]byte("plain body"))
	}))
	pc := &PluginConn{
		hub:     hub,
		apiKey:  "key",
		send:    make(chan []byte, 2),
		done:    make(chan struct{}),
		pending: make(map[string]chan PluginResponse),
	}

	pc.sendJSON(func() {})
	pc.Send([]byte(`{"type":"manual"}`))
	pc.Send([]byte(`{"type":"dropped"}`))
	if got := len(pc.send); got != 2 {
		t.Fatalf("expected full send buffer, got %d", got)
	}
	<-pc.send
	<-pc.send

	pc.handleAPIResponse("bad", json.RawMessage(`{`))
	pc.pending["resp-1"] = make(chan PluginResponse, 1)
	pc.handleAPIResponse("resp-1", json.RawMessage(`{"status":202,"body":{"done":true}}`))
	resp := <-pc.pending["resp-1"]
	if resp.Status != http.StatusAccepted || string(resp.Body) != `{"done":true}` {
		t.Fatalf("unexpected plugin response: %#v body=%s", resp, resp.Body)
	}

	pc.handleAPIRequest("bad-req", json.RawMessage(`{`))
	if msg := readPluginSend(t, pc); msg["type"] != "api_response" {
		t.Fatalf("expected api_response for invalid request, got %v", msg)
	}

	pc.handleAPIRequest("json-req", json.RawMessage(`{"method":"POST","path":"/json","body":{"x":1}}`))
	jsonMsg := readPluginSend(t, pc)
	if jsonMsg["id"] != "json-req" {
		t.Fatalf("expected json-req response, got %v", jsonMsg["id"])
	}
	if data := jsonMsg["data"].(map[string]any); data["status"].(float64) != http.StatusCreated {
		t.Fatalf("expected status 201, got %v", data["status"])
	}

	pc.handleAPIRequest("plain-req", json.RawMessage(`{"path":"/plain"}`))
	plainMsg := readPluginSend(t, pc)
	if data := plainMsg["data"].(map[string]any); data["body"] != "plain body" {
		t.Fatalf("expected plain body, got %#v", data["body"])
	}

	go func() {
		msg := readPluginSend(t, pc)
		id := msg["id"].(string)
		pc.resolveRequest(id, http.StatusTeapot, []byte(`{"tea":true}`))
	}()
	got, err := pc.SendRequest("GET", "/plugin", []byte(`{"q":1}`))
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if got.Status != http.StatusTeapot || string(got.Body) != `{"tea":true}` {
		t.Fatalf("unexpected SendRequest result: %#v body=%s", got, got.Body)
	}

	close(pc.send)
	pc.writePump(context.Background())
	pc2 := &PluginConn{send: make(chan []byte), done: make(chan struct{})}
	close(pc2.done)
	pc2.writePump(context.Background())
}

func readPluginSend(t *testing.T, pc *PluginConn) map[string]any {
	t.Helper()
	select {
	case data := <-pc.send:
		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatal(err)
		}
		return msg
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for plugin send")
	}
	return nil
}

func TestInternalRemoteConnRequestResponseBranches(t *testing.T) {
	t.Parallel()
	rc := &RemoteConn{
		send:    make(chan []byte, 2),
		done:    make(chan struct{}),
		pending: make(map[string]chan json.RawMessage),
	}

	rc.sendJSON(func() {})
	rc.Send([]byte(`{"type":"manual"}`))
	rc.Send([]byte(`{"type":"dropped"}`))
	if got := len(rc.send); got != 2 {
		t.Fatalf("expected full remote send buffer, got %d", got)
	}
	<-rc.send
	<-rc.send

	rc.pending["resp-1"] = make(chan json.RawMessage, 1)
	rc.resolveRequest("resp-1", json.RawMessage(`{"ok":true}`))
	if got := string(<-rc.pending["resp-1"]); got != `{"ok":true}` {
		t.Fatalf("unexpected remote response %s", got)
	}
	rc.resolveRequest("missing", json.RawMessage(`{"ignored":true}`))

	go func() {
		msg := readRemoteSend(t, rc)
		id := msg["id"].(string)
		rc.resolveRequest(id, json.RawMessage(`{"remote":true}`))
	}()
	got, err := rc.SendRequest(map[string]any{"action": "run"})
	if err != nil {
		t.Fatalf("SendRequest: %v", err)
	}
	if string(got) != `{"remote":true}` {
		t.Fatalf("unexpected SendRequest response %s", got)
	}

	close(rc.send)
	rc.writePump(context.Background())
	rc2 := &RemoteConn{send: make(chan []byte), done: make(chan struct{})}
	close(rc2.done)
	rc2.writePump(context.Background())
}

func readRemoteSend(t *testing.T, rc *RemoteConn) map[string]any {
	t.Helper()
	select {
	case data := <-rc.send:
		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatal(err)
		}
		return msg
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for remote send")
	}
	return nil
}

func TestInternalAuthenticateWSDevFallbacksAndHelpers(t *testing.T) {
	t.Parallel()
	hub, s := newInternalHub(t)
	email := "dev@example.com"
	user := &store.User{ID: "dev-user", Email: &email, DisplayName: "Dev User", Role: "member"}
	if err := s.CreateUser(user); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/ws?user_id=dev-user", nil)
	if got := authenticateWS(hub, req); got == nil || got.ID != user.ID {
		t.Fatalf("expected dev query auth, got %#v", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("X-Dev-User-Id", "dev-user")
	if got := authenticateWS(hub, req); got == nil || got.ID != user.ID {
		t.Fatalf("expected dev header auth, got %#v", got)
	}

	if mustJSON(func() {}) != "{}" {
		t.Fatal("mustJSON should return empty object on marshal failure")
	}
	if newID() == "" {
		t.Fatal("newID should not be empty")
	}
	if nowMs() <= 0 {
		t.Fatal("nowMs should be positive")
	}
}

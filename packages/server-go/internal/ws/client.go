package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"collab-server/internal/auth"
	"collab-server/internal/store"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

const (
	sendBufSize = 256
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID string
	user   *store.User
	send   chan []byte
	done   chan struct{}

	subscribedMu sync.RWMutex
	subscribed   map[string]bool

	aliveMu sync.Mutex
	alive   bool
}

func newClient(hub *Hub, conn *websocket.Conn, user *store.User) *Client {
	return &Client{
		hub:        hub,
		conn:       conn,
		userID:     user.ID,
		user:       user,
		send:       make(chan []byte, sendBufSize),
		done:       make(chan struct{}),
		subscribed: make(map[string]bool),
		alive:      true,
	}
}

func (c *Client) Send(data []byte) {
	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) SendJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	c.Send(data)
}

func (c *Client) SendPing() {
	c.SendJSON(map[string]string{"type": "ping"})
}

func (c *Client) IsSubscribed(channelID string) bool {
	c.subscribedMu.RLock()
	defer c.subscribedMu.RUnlock()
	return c.subscribed[channelID]
}

func (c *Client) Subscribe(channelID string) {
	c.subscribedMu.Lock()
	defer c.subscribedMu.Unlock()
	c.subscribed[channelID] = true
}

func (c *Client) Unsubscribe(channelID string) {
	c.subscribedMu.Lock()
	defer c.subscribedMu.Unlock()
	delete(c.subscribed, channelID)
}

func (c *Client) CheckAlive() bool {
	c.aliveMu.Lock()
	defer c.aliveMu.Unlock()
	if !c.alive {
		return false
	}
	c.alive = false
	return true
}

func (c *Client) setAlive() {
	c.aliveMu.Lock()
	defer c.aliveMu.Unlock()
	c.alive = true
}

func (c *Client) Close() {
	c.conn.Close(websocket.StatusNormalClosure, "closing")
	select {
	case <-c.done:
	default:
		close(c.done)
	}
}

func (c *Client) writePump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			c.conn.Write(ctx, websocket.MessageText, msg)
		}
	}
}

var builtinCommandNames = map[string]bool{
	"help": true, "leave": true, "topic": true, "invite": true,
	"dm": true, "status": true, "clear": true, "nick": true,
}

var commandNameRe = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,31}$`)

type wsMessage struct {
	Type      string          `json:"type"`
	ChannelID string          `json:"channel_id,omitempty"`
	Content   string          `json:"content,omitempty"`
	ClientID  string          `json:"client_id,omitempty"`
	ReplyToID string          `json:"reply_to_id,omitempty"`
	Mentions  []string        `json:"mentions,omitempty"`
	Commands  json.RawMessage `json:"commands,omitempty"`
}

func HandleClient(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := authenticateWS(hub, r)
		if user == nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			hub.logger.Error("ws accept failed", "error", err)
			return
		}

		client := newClient(hub, conn, user)
		hub.Register(client)

		hub.store.UpdateLastSeen(user.ID)

		hub.BroadcastToAll(map[string]any{
			"type":    "presence",
			"user_id": user.ID,
			"status":  "online",
		})

		ctx := r.Context()
		go client.writePump(ctx)

		defer func() {
			hub.Unregister(client)
			hub.cmdStore.UnregisterByConnection(client.userID)
			hub.BroadcastToAll(map[string]any{
				"type":    "presence",
				"user_id": user.ID,
				"status":  "offline",
			})
			conn.Close(websocket.StatusNormalClosure, "")
		}()

		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}

			var msg wsMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}

			client.setAlive()

			switch msg.Type {
			case "ping":
				client.SendJSON(map[string]string{"type": "pong"})
			case "pong":
				// alive already set
			case "subscribe":
				handleSubscribe(client, msg)
			case "unsubscribe":
				handleUnsubscribe(client, msg)
			case "typing":
				handleTyping(client, msg)
			case "send_message":
				handleSendMessage(client, msg)
			case "register_commands":
				handleRegisterCommands(client, msg)
			}
		}
	}
}

func authenticateWS(hub *Hub, r *http.Request) *store.User {
	if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		if user, err := hub.store.GetUserByAPIKey(apiKey); err == nil && user.DeletedAt == nil && !user.Disabled {
			return user
		}
	}

	if cookie, err := r.Cookie("collab_token"); err == nil {
		if user := auth.ValidateJWT(hub.store, hub.config.JWTSecret, cookie.Value); user != nil {
			return user
		}
	}

	if hub.config.IsDevelopment() && hub.config.DevAuthBypass {
		if devUserID := r.Header.Get("X-Dev-User-Id"); devUserID != "" {
			if user, err := hub.store.GetUserByID(devUserID); err == nil {
				return user
			}
		}
		users, err := hub.store.ListUsers()
		if err == nil {
			for i := range users {
				if users[i].Role == "admin" {
					return &users[i]
				}
			}
		}
	}

	return nil
}

func handleSubscribe(c *Client, msg wsMessage) {
	ch, err := c.hub.store.GetChannelByID(msg.ChannelID)
	if err != nil {
		c.SendJSON(map[string]any{"type": "error", "code": "NOT_FOUND", "message": "Channel not found"})
		return
	}
	if ch.Visibility == "private" && !c.hub.store.IsChannelMember(msg.ChannelID, c.userID) {
		c.SendJSON(map[string]any{"type": "error", "code": "NOT_MEMBER", "message": "Not a member"})
		return
	}
	c.Subscribe(msg.ChannelID)
	c.SendJSON(map[string]any{"type": "subscribed", "channel_id": msg.ChannelID})
}

func handleUnsubscribe(c *Client, msg wsMessage) {
	c.Unsubscribe(msg.ChannelID)
	c.SendJSON(map[string]any{"type": "unsubscribed", "channel_id": msg.ChannelID})
}

func handleTyping(c *Client, msg wsMessage) {
	c.hub.BroadcastToChannel(msg.ChannelID, map[string]any{
		"type":         "typing",
		"channel_id":   msg.ChannelID,
		"user_id":      c.userID,
		"display_name": c.user.DisplayName,
	}, c)
}

func handleSendMessage(c *Client, msg wsMessage) {
	nack := func(code, message string) {
		c.SendJSON(map[string]any{
			"type":      "message_nack",
			"client_id": msg.ClientID,
			"code":      code,
			"message":   message,
		})
	}

	content := strings.TrimSpace(msg.Content)
	if content == "" {
		nack("INVALID_CONTENT_TYPE", "Empty message")
		return
	}

	ch, err := c.hub.store.GetChannelByID(msg.ChannelID)
	if err != nil {
		nack("NOT_FOUND", "Channel not found")
		return
	}

	if ch.Visibility == "private" && !c.hub.store.CanAccessChannel(msg.ChannelID, c.userID) {
		nack("NOT_FOUND", "Channel not found")
		return
	}

	if !c.hub.store.IsChannelMember(msg.ChannelID, c.userID) {
		nack("NOT_MEMBER", "Not a member of this channel")
		return
	}

	ct := "text"
	if strings.HasPrefix(content, "/") {
		ct = "command"
	}

	var replyTo *string
	if msg.ReplyToID != "" {
		replyTo = &msg.ReplyToID
	}

	created, err := c.hub.store.CreateMessageFull(msg.ChannelID, c.userID, content, ct, replyTo, msg.Mentions)
	if err != nil {
		c.hub.logger.Error("ws message create failed", "error", err)
		nack("INTERNAL_ERROR", "Failed to create message")
		return
	}

	c.SendJSON(map[string]any{
		"type":       "message_ack",
		"client_id":  msg.ClientID,
		"message_id": created.ID,
	})

	payload := mustJSON(map[string]any{
		"message": created,
	})

	c.hub.store.CreateEvent(&store.Event{
		Kind:      "new_message",
		ChannelID: msg.ChannelID,
		Payload:   payload,
	})

	c.hub.SignalNewEvents()

	c.hub.BroadcastToChannel(msg.ChannelID, map[string]any{
		"type":    "new_message",
		"message": created,
	}, nil)
}

func handleRegisterCommands(c *Client, msg wsMessage) {
	var cmds []AgentCommand
	if err := json.Unmarshal(msg.Commands, &cmds); err != nil {
		c.SendJSON(map[string]any{"type": "error", "message": "Invalid commands payload"})
		return
	}

	for _, cmd := range cmds {
		if !commandNameRe.MatchString(cmd.Name) {
			c.SendJSON(map[string]any{"type": "error", "code": "INVALID_COMMAND", "message": "Invalid command name: " + cmd.Name})
			return
		}
		if builtinCommandNames[cmd.Name] {
			c.SendJSON(map[string]any{"type": "error", "code": "INVALID_COMMAND", "message": "Cannot override builtin command: " + cmd.Name})
			return
		}
	}

	c.hub.cmdStore.Register(c.userID, c.userID, c.user.DisplayName, cmds)

	c.SendJSON(map[string]any{"type": "commands_registered", "count": len(cmds)})

	c.hub.BroadcastToAll(map[string]any{"type": "commands_updated"})
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func newID() string {
	return uuid.NewString()
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

// exported for auth reuse
func AuthenticateWS(hub *Hub, r *http.Request) *store.User {
	return authenticateWS(hub, r)
}

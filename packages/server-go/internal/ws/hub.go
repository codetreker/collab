package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"collab-server/internal/config"
	"collab-server/internal/store"
)

type EventBroadcaster interface {
	BroadcastEventToChannel(channelID string, eventType string, payload any)
	BroadcastEventToAll(eventType string, payload any)
	SignalNewEvents()
}

type Hub struct {
	store   *store.Store
	logger  *slog.Logger
	config  *config.Config
	handler http.Handler

	cmdStore *CommandStore

	clients     map[*Client]bool
	onlineUsers map[string]map[*Client]bool

	plugins map[string]*PluginConn
	remotes map[string]*RemoteConn

	eventWaiters   map[chan struct{}]struct{}
	eventWaitersMu sync.Mutex

	mu sync.RWMutex
}

func NewHub(s *store.Store, logger *slog.Logger, cfg *config.Config) *Hub {
	return &Hub{
		store:        s,
		logger:       logger,
		config:       cfg,
		cmdStore:     NewCommandStore(),
		clients:      make(map[*Client]bool),
		onlineUsers:  make(map[string]map[*Client]bool),
		plugins:      make(map[string]*PluginConn),
		remotes:      make(map[string]*RemoteConn),
		eventWaiters: make(map[chan struct{}]struct{}),
	}
}

func (h *Hub) SetHandler(handler http.Handler) {
	h.handler = handler
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c] = true
	if h.onlineUsers[c.userID] == nil {
		h.onlineUsers[c.userID] = make(map[*Client]bool)
	}
	wasOffline := len(h.onlineUsers[c.userID]) == 0
	h.onlineUsers[c.userID][c] = true

	if wasOffline {
		h.logger.Info("user online", "user_id", c.userID)
	}
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c)
	if clients, ok := h.onlineUsers[c.userID]; ok {
		delete(clients, c)
		if len(clients) == 0 {
			delete(h.onlineUsers, c.userID)
			h.logger.Info("user offline", "user_id", c.userID)
		}
	}
}

func (h *Hub) BroadcastToChannel(channelID string, payload any, exclude *Client) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c == exclude {
			continue
		}
		if c.IsSubscribed(channelID) {
			c.Send(data)
		}
	}
}

func (h *Hub) BroadcastToUser(userID string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.onlineUsers[userID] {
		c.Send(data)
	}
}

func (h *Hub) BroadcastToAll(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		c.Send(data)
	}
}

func (h *Hub) UnsubscribeUserFromChannel(userID, channelID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.onlineUsers[userID] {
		c.Unsubscribe(channelID)
	}
}

func (h *Hub) GetOnlineUserIDs() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.onlineUsers))
	for id := range h.onlineUsers {
		ids = append(ids, id)
	}
	return ids
}

func (h *Hub) SignalNewEvents() {
	h.eventWaitersMu.Lock()
	for ch := range h.eventWaiters {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	h.eventWaitersMu.Unlock()
}

func (h *Hub) SubscribeEvents() chan struct{} {
	ch := make(chan struct{}, 1)
	h.eventWaitersMu.Lock()
	h.eventWaiters[ch] = struct{}{}
	h.eventWaitersMu.Unlock()
	return ch
}

func (h *Hub) UnsubscribeEvents(ch chan struct{}) {
	h.eventWaitersMu.Lock()
	delete(h.eventWaiters, ch)
	h.eventWaitersMu.Unlock()
}

func (h *Hub) BroadcastEventToChannel(channelID string, eventType string, payload any) {
	h.BroadcastToChannel(channelID, map[string]any{
		"type": eventType,
		"data": payload,
	}, nil)
	h.SignalNewEvents()
}

func (h *Hub) BroadcastEventToAll(eventType string, payload any) {
	h.BroadcastToAll(map[string]any{
		"type": eventType,
		"data": payload,
	})
	h.SignalNewEvents()
}

func (h *Hub) CommandStore() *CommandStore {
	return h.cmdStore
}

func (h *Hub) Store() *store.Store {
	return h.store
}

func (h *Hub) Config() *config.Config {
	return h.config
}

func (h *Hub) StartHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.mu.RLock()
			for c := range h.clients {
				if !c.CheckAlive() {
					go func(cl *Client) {
						cl.Close()
					}(c)
				} else {
					c.SendPing()
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) RegisterPlugin(agentID string, pc *PluginConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.plugins[agentID] = pc
}

func (h *Hub) UnregisterPlugin(agentID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.plugins, agentID)
}

func (h *Hub) GetPlugin(agentID string) *PluginConn {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.plugins[agentID]
}

func (h *Hub) RegisterRemote(nodeID string, rc *RemoteConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.remotes[nodeID] = rc
}

func (h *Hub) UnregisterRemote(nodeID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.remotes, nodeID)
}

func (h *Hub) GetRemote(nodeID string) *RemoteConn {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.remotes[nodeID]
}

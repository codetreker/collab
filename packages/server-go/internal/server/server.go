package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"borgee-server/internal/api"
	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"
	"borgee-server/internal/ws"
)

type Server struct {
	cfg       *config.Config
	logger    *slog.Logger
	store     *store.Store
	mux       *http.ServeMux
	hub       *ws.Hub
	startTime time.Time
}

func New(cfg *config.Config, logger *slog.Logger, s *store.Store) *Server {
	hub := ws.NewHub(s, logger, cfg)

	srv := &Server{
		cfg:       cfg,
		logger:    logger,
		store:     s,
		mux:       http.NewServeMux(),
		hub:       hub,
		startTime: time.Now(),
	}
	srv.SetupRoutes()

	hub.SetHandler(srv.Handler())

	ctx := context.Background()
	go hub.StartHeartbeat(ctx)

	return srv
}

func (s *Server) Hub() *ws.Hub {
	return s.hub
}

func (s *Server) SetupRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)

	authHandler := &api.AuthHandler{
		Store:  s.store,
		Config: s.cfg,
		Logger: s.logger,
	}
	authHandler.RegisterRoutes(s.mux)

	authMw := auth.AuthMiddleware(s.store, s.cfg)
	s.mux.Handle("GET /api/v1/users/me", authMw(http.HandlerFunc(authHandler.HandleGetMe)))

	broadcaster := &hubBroadcastAdapter{s.hub}

	// Messages
	msgHandler := &api.MessageHandler{
		Store:  s.store,
		Logger: s.logger,
		Hub:    broadcaster,
	}
	sendPerm := auth.RequirePermission(s.store, "message.send", func(r *http.Request) string {
		return "channel:" + r.PathValue("channelId")
	})
	msgHandler.RegisterRoutes(s.mux, authMw, sendPerm)

	// Users
	userHandler := &api.UserHandler{
		Store:  s.store,
		Logger: s.logger,
	}
	userHandler.RegisterRoutes(s.mux, authMw)

	// Channels
	channelHandler := &api.ChannelHandler{Store: s.store, Config: s.cfg, Logger: s.logger, Hub: broadcaster}
	channelHandler.RegisterRoutes(s.mux, authMw)

	// DMs
	dmHandler := &api.DmHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	dmHandler.RegisterRoutes(s.mux, authMw)

	// Admin
	adminHandler := &api.AdminHandler{Store: s.store, Logger: s.logger}
	adminHandler.RegisterRoutes(s.mux, authMw)

	// Agents
	agentHandler := &api.AgentHandler{Store: s.store, Logger: s.logger, Hub: &hubPluginAdapter{s.hub}}
	agentHandler.RegisterRoutes(s.mux, authMw)

	// Reactions
	reactionHandler := &api.ReactionHandler{Store: s.store, Logger: s.logger, Hub: broadcaster}
	reactionHandler.RegisterRoutes(s.mux, authMw)

	// Commands
	commandHandler := &api.CommandHandler{Store: s.store, Logger: s.logger, Hub: &hubCommandAdapter{s.hub}}
	commandHandler.RegisterRoutes(s.mux, authMw)

	// Upload
	uploadHandler := &api.UploadHandler{Config: s.cfg, Logger: s.logger}
	uploadHandler.RegisterRoutes(s.mux, authMw)

	// Workspace
	workspaceHandler := &api.WorkspaceHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	workspaceHandler.RegisterRoutes(s.mux, authMw)

	// Remote
	remoteHandler := &api.RemoteHandler{Store: s.store, Logger: s.logger, Hub: &hubRemoteAdapter{s.hub}}
	remoteHandler.RegisterRoutes(s.mux, authMw)

	// Poll/SSE
	pollHandler := &api.PollHandler{Store: s.store, Logger: s.logger, Hub: s.hub, Config: s.cfg}
	pollHandler.RegisterRoutes(s.mux, authMw)

	// WebSocket endpoints
	s.mux.HandleFunc("/ws", ws.HandleClient(s.hub))
	s.mux.HandleFunc("/ws/plugin", ws.HandlePlugin(s.hub))
	s.mux.HandleFunc("/ws/remote", ws.HandleRemote(s.hub))

	s.mux.HandleFunc("/api/v1/", respondNotImplemented)

	s.mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadDir))))

	s.mux.HandleFunc("/", s.handleStatic)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"timestamp":  time.Now().UnixMilli(),
		"uptime":     time.Since(s.startTime).Seconds(),
		"ws_clients": s.hub.ClientCount(),
	})
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws") {
		JSONError(w, http.StatusNotFound, "Not found")
		return
	}

	filePath := filepath.Join(s.cfg.ClientDist, filepath.Clean(r.URL.Path))

	if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
		http.ServeFile(w, r, filePath)
		return
	}

	// SPA fallback: serve index.html for routes without file extensions
	if filepath.Ext(r.URL.Path) == "" {
		indexPath := filepath.Join(s.cfg.ClientDist, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}
	}

	http.NotFound(w, r)
}

func (s *Server) Handler() http.Handler {
	rl := newRateLimiter()

	var handler http.Handler = s.mux
	handler = rateLimitMiddleware(rl, handler)
	handler = securityHeadersMiddleware(handler)
	handler = corsMiddleware(s.cfg.IsDevelopment(), s.cfg.CORSOrigin, handler)
	handler = loggerMiddleware(s.logger, handler)
	handler = requestIDMiddleware(handler)
	handler = recoverMiddleware(s.logger, handler)

	return handler
}

type hubCommandAdapter struct {
	hub *ws.Hub
}

func (a *hubCommandAdapter) GetAllCommands() []api.AgentCommandGroup {
	all := a.hub.CommandStore().GetAll()
	result := make([]api.AgentCommandGroup, len(all))
	for i, g := range all {
		cmds := make([]api.AgentCmdDef, len(g.Commands))
		for j, c := range g.Commands {
			cmds[j] = api.AgentCmdDef{
				Name:        c.Name,
				Description: c.Description,
				Usage:       c.Usage,
			}
		}
		result[i] = api.AgentCommandGroup{
			AgentID:   g.AgentID,
			AgentName: g.AgentName,
			Commands:  cmds,
		}
	}
	return result
}

type hubRemoteAdapter struct {
	hub *ws.Hub
}

func (a *hubRemoteAdapter) IsNodeOnline(nodeID string) bool {
	return a.hub.GetRemote(nodeID) != nil
}

func (a *hubRemoteAdapter) ProxyRequest(nodeID string, action string, params map[string]string) (json.RawMessage, error) {
	rc := a.hub.GetRemote(nodeID)
	if rc == nil {
		return nil, fmt.Errorf("node offline")
	}
	return rc.SendRequest(map[string]any{
		"action": action,
		"params": params,
	})
}

type hubBroadcastAdapter struct {
	hub *ws.Hub
}

func (a *hubBroadcastAdapter) BroadcastEventToChannel(channelID string, eventType string, payload any) {
	a.hub.BroadcastEventToChannel(channelID, eventType, payload)
}

func (a *hubBroadcastAdapter) BroadcastEventToAll(eventType string, payload any) {
	a.hub.BroadcastEventToAll(eventType, payload)
}

func (a *hubBroadcastAdapter) BroadcastEventToUser(userID string, eventType string, payload any) {
	a.hub.BroadcastToUser(userID, map[string]any{
		"type": eventType,
		"data": payload,
	})
	a.hub.SignalNewEvents()
}

func (a *hubBroadcastAdapter) SignalNewEvents() {
	a.hub.SignalNewEvents()
}

type hubPluginAdapter struct {
	hub *ws.Hub
}

func (a *hubPluginAdapter) ProxyPluginRequest(agentID string, method string, path string, body []byte) (int, []byte, error) {
	pc := a.hub.GetPlugin(agentID)
	if pc == nil {
		return 0, nil, fmt.Errorf("agent not connected")
	}
	resp, err := pc.SendRequest(method, path, body)
	if err != nil {
		return 0, nil, err
	}
	return resp.Status, resp.Body, nil
}

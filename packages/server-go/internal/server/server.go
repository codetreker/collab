package server

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"collab-server/internal/api"
	"collab-server/internal/auth"
	"collab-server/internal/config"
	"collab-server/internal/store"
)

type Server struct {
	cfg       *config.Config
	logger    *slog.Logger
	store     *store.Store
	mux       *http.ServeMux
	startTime time.Time
}

func New(cfg *config.Config, logger *slog.Logger, s *store.Store) *Server {
	srv := &Server{
		cfg:       cfg,
		logger:    logger,
		store:     s,
		mux:       http.NewServeMux(),
		startTime: time.Now(),
	}
	srv.SetupRoutes()
	return srv
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

	// Messages
	msgHandler := &api.MessageHandler{
		Store:  s.store,
		Logger: s.logger,
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
	channelHandler := &api.ChannelHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	channelHandler.RegisterRoutes(s.mux, authMw)

	// DMs
	dmHandler := &api.DmHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	dmHandler.RegisterRoutes(s.mux, authMw)

	// Admin
	adminHandler := &api.AdminHandler{Store: s.store, Logger: s.logger}
	adminHandler.RegisterRoutes(s.mux, authMw)

	// Agents
	agentHandler := &api.AgentHandler{Store: s.store, Logger: s.logger}
	agentHandler.RegisterRoutes(s.mux, authMw)

	// Reactions
	reactionHandler := &api.ReactionHandler{Store: s.store, Logger: s.logger}
	reactionHandler.RegisterRoutes(s.mux, authMw)

	// Commands
	commandHandler := &api.CommandHandler{Store: s.store, Logger: s.logger}
	commandHandler.RegisterRoutes(s.mux, authMw)

	// Upload
	uploadHandler := &api.UploadHandler{Config: s.cfg, Logger: s.logger}
	uploadHandler.RegisterRoutes(s.mux, authMw)

	// Workspace
	workspaceHandler := &api.WorkspaceHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	workspaceHandler.RegisterRoutes(s.mux, authMw)

	// Remote
	remoteHandler := &api.RemoteHandler{Store: s.store, Logger: s.logger}
	remoteHandler.RegisterRoutes(s.mux, authMw)

	// Poll/SSE
	pollHandler := &api.PollHandler{Store: s.store, Logger: s.logger}
	pollHandler.RegisterRoutes(s.mux, authMw)

	s.mux.HandleFunc("/api/v1/", respondNotImplemented)

	s.mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.cfg.UploadDir))))

	s.mux.HandleFunc("/", s.handleStatic)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().UnixMilli(),
		"uptime":    time.Since(s.startTime).Seconds(),
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

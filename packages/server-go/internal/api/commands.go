package api

import (
	"log/slog"
	"net/http"

	"borgee-server/internal/datalayer"
	"borgee-server/internal/store"
)

var builtinCommands = []map[string]string{
	{"name": "help", "description": "Show available commands"},
	{"name": "leave", "description": "Leave the current channel"},
	{"name": "topic", "description": "Set channel topic", "usage": "/topic <text>"},
	{"name": "invite", "description": "Invite a user to the channel", "usage": "/invite @user"},
	{"name": "dm", "description": "Open a direct message", "usage": "/dm @user"},
	{"name": "status", "description": "Set your status", "usage": "/status <text>"},
	{"name": "clear", "description": "Clear chat history"},
	{"name": "nick", "description": "Change your display name", "usage": "/nick <name>"},
}

type CommandStoreReader interface {
	GetAll() []struct {
		AgentID   string
		AgentName string
		Commands  []struct {
			Name        string
			Description string
			Usage       string
		}
	}
}

type CommandHandler struct {
	Store *store.Store
	// DataLayer — DL-1.2 SSOT 4-interface bundle (nil-safe; see UserHandler).
	DataLayer *datalayer.DataLayer
	Logger    *slog.Logger
	Hub       CommandSource
}

type CommandSource interface {
	GetAllCommands() []AgentCommandGroup
}

type AgentCommandGroup struct {
	AgentID   string        `json:"agent_id"`
	AgentName string        `json:"agent_name"`
	Commands  []AgentCmdDef `json:"commands"`
}

type AgentCmdDef struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Usage       string `json:"usage,omitempty"`
}

func (h *CommandHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/commands", authMw(http.HandlerFunc(h.handleListCommands)))
}

func (h *CommandHandler) handleListCommands(w http.ResponseWriter, r *http.Request) {
	_, ok := mustUser(w, r)
	if !ok {
		return
	}

	var agentGroups any
	if h.Hub != nil {
		agentGroups = h.Hub.GetAllCommands()
	}
	if agentGroups == nil {
		agentGroups = []AgentCommandGroup{}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"builtin": builtinCommands,
		"agent":   agentGroups,
	})
}

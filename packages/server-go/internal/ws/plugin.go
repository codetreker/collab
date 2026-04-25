package ws

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/coder/websocket"
)

type PluginConn struct {
	hub     *Hub
	conn    *websocket.Conn
	agentID string
	apiKey  string
	send    chan []byte
	done    chan struct{}
	alive   bool
}

func HandlePlugin(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		user, err := hub.store.GetUserByAPIKey(apiKey)
		if err != nil || user.DeletedAt != nil || user.Disabled {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true,
		})
		if err != nil {
			hub.logger.Error("plugin ws accept failed", "error", err)
			return
		}

		pc := &PluginConn{
			hub:     hub,
			conn:    conn,
			agentID: user.ID,
			apiKey:  apiKey,
			send:    make(chan []byte, sendBufSize),
			done:    make(chan struct{}),
			alive:   true,
		}

		hub.RegisterPlugin(user.ID, pc)

		ctx := r.Context()
		go pc.writePump(ctx)

		defer func() {
			hub.UnregisterPlugin(user.ID)
			conn.Close(websocket.StatusNormalClosure, "")
		}()

		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return
			}

			var msg struct {
				Type string          `json:"type"`
				ID   string          `json:"id,omitempty"`
				Data json.RawMessage `json:"data,omitempty"`
			}
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}

			pc.alive = true

			switch msg.Type {
			case "ping":
				pc.sendJSON(map[string]string{"type": "pong"})
			case "pong":
				// alive already set
			case "api_request":
				go pc.handleAPIRequest(msg.ID, msg.Data)
			}
		}
	}
}

func (pc *PluginConn) handleAPIRequest(id string, data json.RawMessage) {
	var req struct {
		Method string          `json:"method"`
		Path   string          `json:"path"`
		Body   json.RawMessage `json:"body,omitempty"`
	}
	if err := json.Unmarshal(data, &req); err != nil {
		pc.sendJSON(map[string]any{
			"type": "api_response",
			"id":   id,
			"data": map[string]any{"status": 400, "body": `{"error":"invalid request"}`},
		})
		return
	}

	method := req.Method
	if method == "" {
		method = "GET"
	}

	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = bytes.NewReader(req.Body)
	}

	httpReq := httptest.NewRequest(method, req.Path, bodyReader)
	httpReq.Header.Set("Authorization", "Bearer "+pc.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	pc.hub.handler.ServeHTTP(rec, httpReq)

	pc.sendJSON(map[string]any{
		"type": "api_response",
		"id":   id,
		"data": map[string]any{
			"status": rec.Code,
			"body":   rec.Body.String(),
		},
	})
}

func (pc *PluginConn) sendJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case pc.send <- data:
	default:
	}
}

func (pc *PluginConn) Send(data []byte) {
	select {
	case pc.send <- data:
	default:
	}
}

func (pc *PluginConn) writePump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-pc.done:
			return
		case msg, ok := <-pc.send:
			if !ok {
				return
			}
			pc.conn.Write(ctx, websocket.MessageText, msg)
		}
	}
}

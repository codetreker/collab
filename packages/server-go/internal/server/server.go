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

	"borgee-server/internal/admin"
	"borgee-server/internal/agent"
	"borgee-server/internal/api"
	"borgee-server/internal/auth"
	"borgee-server/internal/bpp"
	"borgee-server/internal/config"
	"borgee-server/internal/presence"
	"borgee-server/internal/push"
	"borgee-server/internal/store"
	"borgee-server/internal/testutil/clock"
	"borgee-server/internal/ws"
)

type Server struct {
	cfg          *config.Config
	logger       *slog.Logger
	store        *store.Store
	mux          *http.ServeMux
	hub          *ws.Hub
	agentTracker *agent.Tracker
	startTime    time.Time
	// clk is the time source for JWT mint (PERF-JWT-CLOCK). Defaults to Real
	// in New(); tests inject *clock.Fake via SetClock to advance JWT iat
	// without sleeping. nil-safe via getClock().
	clk clock.Clock
	// authHandler is held so SetClock can wire injected clock post-construction.
	authHandler *api.AuthHandler
}

// SetClock injects a clock for JWT mint. Tests use *clock.Fake to advance
// JWT iat (1s granularity) without time.Sleep. Production never calls this —
// New() leaves clk nil and AuthHandler falls back to time.Now() (byte-identical
// to pre-refactor path).
func (s *Server) SetClock(c clock.Clock) {
	s.clk = c
	// Re-wire AuthHandler.Clock — handler was constructed in SetupRoutes
	// with Clock=nil; we patch the field here so subsequent JWT mints use
	// the injected clock. Routes are only mounted once, AuthHandler is the
	// owner of /api/v1/auth/login so this is the single mutation point.
	if s.authHandler != nil {
		s.authHandler.Clock = c
	}
}

func New(cfg *config.Config, logger *slog.Logger, s *store.Store) *Server {
	hub := ws.NewHub(s, logger, cfg)

	// AL-3.2: wire the presence write end so /ws lifecycle hooks can
	// fan in TrackOnline / TrackOffline. NewSessionsTracker only errors
	// on a nil DB handle, which is a boot-time programming error.
	if pw, err := presence.NewSessionsTracker(s.DB()); err == nil {
		hub.SetPresenceWriter(pw)
	} else {
		logger.Error("presence tracker init failed (continuing without presence_sessions writes)", "err", err)
	}

	srv := &Server{
		cfg:          cfg,
		logger:       logger,
		store:        s,
		mux:          http.NewServeMux(),
		hub:          hub,
		agentTracker: agent.NewTracker(),
		startTime:    time.Now(),
	}
	srv.SetupRoutes()

	hub.SetHandler(srv.Handler())

	// BPP-3 plugin-upstream BPP frame dispatcher boundary. Wires the
	// AL-2b agent_config_ack frame ingress (deferred from #481 to BPP-3
	// per plugin.go default-case routing). Construction order:
	//   1. concrete api-side AgentConfigAckHandler + OwnerResolver
	//   2. typed bpp.AckDispatcher (validates Status/Reason/cross-owner)
	//   3. AckFrameAdapter wraps typed dispatcher into FrameDispatcher
	//   4. PluginFrameDispatcher registers (FrameTypeBPPAgentConfigAck → adapter)
	//   5. hub.SetPluginFrameRouter — plugin.go read loop default case
	//      now routes any non-RPC envelope frame here.
	ackHandler := &api.AgentConfigAckHandlerImpl{Store: s, Logger: logger}
	ownerResolver := &api.AgentOwnerResolver{Store: s}
	ackDispatcher := bpp.NewAckDispatcher(ackHandler, ownerResolver)
	pfd := bpp.NewPluginFrameDispatcher(logger)
	pfd.Register(bpp.FrameTypeBPPAgentConfigAck, bpp.NewAckFrameAdapter(ackDispatcher))

	// BPP-5 reconnect handshake — plugin upstream signals reconnect
	// with last_known_cursor; handler resolves cursor via RT-1.3
	// ResolveResume (incremental mode) + clears agent error (AL-1
	// 5-state error → online valid edge, agent.Tracker.Clear SSOT).
	// Reuses the BPP-3 PluginFrameDispatcher boundary.
	reconnectHandler := bpp.NewReconnectHandler(s,
		&channelScopeAdapter{store: s},
		ownerResolver,
		srv.agentTracker,
		logger)
	pfd.Register(bpp.FrameTypeBPPReconnectHandshake, reconnectHandler)

	// BPP-6 cold-start handshake — plugin upstream signals process restart
	// (state 全丢, 无 cursor; 反向 BPP-5 reconnect). handler 走 AL-1 #492
	// single-gate AppendAgentStateTransition any→online + agent.Tracker.Clear,
	// reason 复用 `runtime_crashed` 6-dict byte-identical (锁链第 11 处).
	// Reuses the BPP-3 PluginFrameDispatcher boundary.
	coldStartHandler := bpp.NewColdStartHandler(s, ownerResolver, srv.agentTracker, logger)
	pfd.Register(bpp.FrameTypeBPPColdStartHandshake, coldStartHandler)

	hub.SetPluginFrameRouter(&pluginFrameRouterAdapter{pfd: pfd})

	// BPP-4.1 heartbeat watchdog: 30s plugin liveness threshold, flips
	// stale agents to error/network_unreachable via agent.Tracker
	// (AL-1a 6-dict 第 9 处单测锁链承袭). Boot-only wire-up; nil-safe in
	// tests via separate (NewTestServer doesn't invoke this path).
	watchdog := bpp.NewHeartbeatWatchdog(&hubLivenessAdapter{hub}, srv.agentTracker, logger)

	ctx := context.Background()
	go hub.StartHeartbeat(ctx)
	go watchdog.Run(ctx)

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
		Clock:  s.clk, // nil → handler.now() falls back to time.Now() (production path)
	}
	s.authHandler = authHandler
	authHandler.RegisterRoutes(s.mux)

	authMw := auth.AuthMiddleware(s.store, s.cfg)
	s.mux.Handle("GET /api/v1/users/me", authMw(http.HandlerFunc(authHandler.HandleGetMe)))

	broadcaster := &hubBroadcastAdapter{s.hub}

	// Messages
	// DM-2.2 (#312): wire the mention dispatcher. PresenceTracker is the
	// AL-3 read side (#310 SessionsTracker); ws.Hub satisfies the
	// MentionFrameBroadcaster interface via PushMentionPushed (#NNN
	// mention_pushed_frame.go). Nil presence => skip dispatch (legacy
	// boot path, smoke survives without DM-2 fanout).
	//
	// DL-4.3 push gateway — server→browser fan-out via VAPID. Init early
	// so MentionDispatcher can pick up MentionPushNotifier seam. Falls
	// back to noop when VAPID env unset (跟 admin Bootstrap 区分: push
	// 是体验补丁不阻 server 启动).
	pushGW, err := push.NewGateway(s.store, s.logger)
	if err != nil {
		s.logger.Info("push.NewGateway: VAPID env unset, falling back to noop", "err", err)
		pushGW = push.NewNoopGateway(s.logger)
	}
	mentionPushNotifier := push.NewMentionNotifier(pushGW)

	var mentionDispatcher *api.MentionDispatcher
	if pt, err := presence.NewSessionsTracker(s.store.DB()); err == nil {
		mentionDispatcher = api.NewMentionDispatcher(s.store, pt, s.hub)
		// DL-4.6 cross-device fan-out — mention also fires push (best-
		// effort, browser SW handles visibility-based dedup).
		mentionDispatcher.PushNotifier = mentionPushNotifier
	} else {
		s.logger.Warn("mention dispatcher init skipped — presence tracker unavailable", "err", err)
	}

	msgHandler := &api.MessageHandler{
		Store:    s.store,
		Logger:   s.logger,
		Hub:      broadcaster,
		Mentions: mentionDispatcher,
	}
	sendPerm := auth.RequirePermission(s.store, "message.send", func(r *http.Request) string {
		return "channel:" + r.PathValue("channelId")
	})
	// AP-0-bis: agent default capability set 锁 [message.send, message.read].
	// Legacy agents are backfilled by migration v=8 (ap_0_bis_message_read).
	readPerm := auth.RequirePermission(s.store, "message.read", func(r *http.Request) string {
		return "channel:" + r.PathValue("channelId")
	})
	msgHandler.RegisterRoutes(s.mux, authMw, sendPerm, readPerm)

	// DM-4.1 — agent message edit 多端同步. PATCH /api/v1/channels/{channelId}/messages/{messageId}
	// 走 RT-3 既有 fan-out (events INSERT message_edited + Hub.BroadcastEventToChannel
	// 多端覆盖). DM-only 路径校验 (channel.Type != "dm" → 403). owner-only ACL.
	dm4EditHandler := &api.DM4MessageEditHandler{Store: s.store, Hub: broadcaster, Logger: s.logger}
	dm4EditHandler.RegisterRoutes(s.mux, authMw)

	// Users
	userHandler := &api.UserHandler{
		Store:  s.store,
		Logger: s.logger,
	}
	userHandler.RegisterRoutes(s.mux, authMw)

	// CHN-3.2 user_channel_layout — personal preferences (本人写本人读;
	// admin god-mode endpoint 白名单不含 user_channel_layout, ADM-0 §1.3 +
	// AL-3 #303 ⑦ 同模式).
	layoutHandler := &api.LayoutHandler{Store: s.store, Logger: s.logger}
	layoutHandler.RegisterRoutes(s.mux, authMw)

	// BPP-3.2.2 owner DM 一键 grant — POST /api/v1/me/grants
	// (蓝图 auth-permissions.md §1.3 主入口字面 + bpp-3.2-spec.md §1
	// 立场 ②). owner-only ACL + capability ∈ AP-1 14 项 const + scope ∈
	// v1 三层. action ∈ {grant, reject, snooze}; reject/snooze v1 仅 audit.
	meGrantsHandler := &api.MeGrantsHandler{Store: s.store, Logger: s.logger}
	meGrantsHandler.RegisterRoutes(s.mux, authMw)

	// AL-2a.2 agent_configs — SSOT REST endpoints (owner-only, fail-closed
	// runtime-field reject, acceptance #264 §4.1.a-d). 蓝图 §1.4 字段划界 +
	// §1.5 BPP frame `agent_config_update` AL-2b 已落 — PATCH 后 fanout
	// 走 hub.PushAgentConfigUpdate (best-effort, plugin 离线 frame 丢弃,
	// 重连后 GET /agents/:id/config 主动拉最新, 跟蓝图 "runtime 不缓存" 同源).
	agentConfigHandler := &api.AgentConfigHandler{
		Store:  s.store,
		Logger: s.logger,
		Pusher: s.hub, // AL-2b §2.1 server→plugin BPP fanout seam
	}
	agentConfigHandler.RegisterRoutes(s.mux, authMw)

	// HB-3.1 host_grants SSOT REST endpoints (蓝图 host-bridge.md §1.3
	// 情境化授权 4 类). Owner-only ACL (anchor #360 同模式); admin god-mode
	// 不入 (用户主权, ADM-0 §1.3 红线). audit log 5 字段 byte-identical 跟
	// HB-1 / HB-2 / BPP-4 dead-letter 跨四 milestone 同源.
	hostGrantsHandler := &api.HostGrantsHandler{
		Store:  s.store,
		Logger: s.logger,
	}
	hostGrantsHandler.RegisterRoutes(s.mux, authMw)

	// AL-1.4 agent state log — owner-only GET /api/v1/agents/:id/state-log
	// (蓝图 §2.3 "故障可解释" — owner 看 agent state 历史轨迹查病因).
	al14Handler := &api.AL14Handler{Store: s.store, Logger: s.logger}
	al14Handler.RegisterRoutes(s.mux, authMw)

	// AL-5 agent error recovery — owner-only POST /api/v1/agents/:id/recover
	// (蓝图 §2.3 5-state error → online recovery; 复用 AL-1 #492 single-gate
	// helper, 不裂状态机).
	al5Handler := &api.AL5Handler{Store: s.store, Logger: s.logger}
	al5Handler.RegisterRoutes(s.mux, authMw)

	// BPP-8.2 plugin lifecycle audit list — owner-only GET
	// /api/v1/agents/{agentId}/lifecycle (复用 admin_actions audit forward-only,
	// 跟 ADM-2.1 + AP-2 + BPP-4 跨四 milestone audit 同精神 锁链第 5 处;
	// admin god-mode 不挂 ADM-0 §1.3 红线).
	bpp8Handler := &api.BPP8LifecycleListHandler{Store: s.store, Logger: s.logger}
	bpp8Handler.RegisterRoutes(s.mux, authMw)
	// HB-3 v2 heartbeat decay list — owner-only GET
	// /api/v1/agents/{agentId}/heartbeat-decay (decay 状态从 agent_runtimes.
	// last_heartbeat_at 反向 derive, 0 schema 改; AL-1a 锁链第 14 处 复用
	// reasons.NetworkUnreachable; admin god-mode 不挂 ADM-0 §1.3 红线).
	hb3v2Handler := &api.HB3V2DecayListHandler{Store: s.store, Logger: s.logger}
	hb3v2Handler.RegisterRoutes(s.mux, authMw)

	// DL-4 web push subscriptions — POST/DELETE /api/v1/push/subscribe.
	// 蓝图 client-shape.md L22 (Mobile PWA + Web Push VAPID).
	pushSubsHandler := &api.PushSubscriptionsHandler{
		Store:  s.store,
		Logger: s.logger,
	}
	pushSubsHandler.RegisterRoutes(s.mux, authMw)

	// DL-4.4 PWA Web App Manifest — GET /api/v1/pwa/manifest (公开 endpoint,
	// 浏览器 install prompt 在 login 前 fetch). 蓝图 client-shape.md L42
	// (manifest + install prompt + Web Push + standalone).
	// ⚠️ 命名拆死锚: 跟 HB-1 #491 GET /api/v1/plugin-manifest (binary plugin
	// manifest, 双签必需) 不同 endpoint 不同安全模型 (zhanma-a drift audit).
	pwaManifestHandler := &api.PWAManifestHandler{}
	pwaManifestHandler.RegisterRoutes(s.mux)

	// (DL-4.3 push gateway init moved earlier — line ~85 — to feed
	// MentionDispatcher.PushNotifier.)

	// Channels
	channelHandler := &api.ChannelHandler{Store: s.store, Config: s.cfg, Logger: s.logger, Hub: broadcaster}
	channelHandler.RegisterRoutes(s.mux, authMw)
	// CHN-7 channel mute/unmute — owner-only user-rail POST/DELETE; 0 schema
	// 改 (复用 CHN-3.1 user_channel_layout, collapsed bitmap bit 1 = mute).
	// admin god-mode 不挂 (ADM-0 §1.3 红线 — mute 是 per-user preference).
	channelHandler.RegisterCHN7Routes(s.mux, authMw)

	// DMs
	dmHandler := &api.DmHandler{Store: s.store, Config: s.cfg, Logger: s.logger}
	dmHandler.RegisterRoutes(s.mux, authMw)

	// Admin (ADM-0.2: cookie拆 + RequirePermission去admin短路 + god-mode 元数据-only)
	// Bootstrap is fail-loud (panics on missing env). Tests inject env or use
	// testutil. The legacy api.AdminAuthHandler / api.AdminAuthMiddleware paths
	// are retired in this PR — admin auth is exclusively the borgee_admin_session
	// cookie backed by admin_sessions rows.
	if err := admin.Bootstrap(s.store.DB()); err != nil {
		s.logger.Error("admin bootstrap failed", "error", err)
	}
	adminAuthHandler := &admin.Handler{DB: s.store.DB(), Logger: s.logger, IsDevelopment: s.cfg.IsDevelopment()}
	adminAuthHandler.RegisterRoutes(s.mux)
	adminMw := admin.RequireAdmin(s.store.DB(), nil)
	adminHandler := &api.AdminHandler{Store: s.store, Logger: s.logger}
	adminHandler.RegisterRoutes(s.mux, adminMw)
	// AL-4.2 admin god-mode metadata read for agent_runtimes (acceptance
	// §2.6 — read-only white-list, last_error_reason omitted; ADM-0 §1.3
	// rail isolation + 立场 ⑦ same source).
	adminRuntimeHandler := &api.AdminRuntimeHandler{Store: s.store, Logger: s.logger}
	adminRuntimeHandler.RegisterRoutes(s.mux, adminMw)
	// ADM-2.2 audit log + impersonate grant — wires user-rail (走 authMw,
	// /api/v1/me/admin-actions + /api/v1/me/impersonation-grant CRUD) +
	// admin-rail (/admin-api/v1/audit-log) endpoints. 立场 ③+④+⑦.
	adm2Handler := &api.ADM2Handler{Store: s.store, Logger: s.logger}
	adm2Handler.RegisterUserRoutes(s.mux, authMw)
	adm2Handler.RegisterAdminRoutes(s.mux, adminMw)
	// DM-7 message edit history — sender-only user-rail GET + admin readonly
	// admin-rail GET (admin god-mode 不挂 PATCH/DELETE — ADM-0 §1.3 红线).
	dm7EditHistoryHandler := &api.DM7EditHistoryHandler{Store: s.store, Logger: s.logger}
	dm7EditHistoryHandler.RegisterUserRoutes(s.mux, authMw)
	dm7EditHistoryHandler.RegisterAdminRoutes(s.mux, adminMw)
	// AL-7.2 admin-rail audit retention override (admin-model.md §3 retention
	// + ADM-0 §1.3 红线 admin 操作必走 audit row). admin-rail only — 反向 grep
	// `audit_retention_override` 在 user-rail handler 0 hit.
	al7RetentionHandler := &api.AL7AuditRetentionHandler{Store: s.store, Logger: s.logger}
	al7RetentionHandler.RegisterAdminRoutes(s.mux, adminMw)
	// AL-7.2 retention sweeper goroutine (1h ticker, ctx-aware shutdown). Same
	// pattern as AP-2 ExpiresSweeper #525. Forward-only soft-archive via
	// admin_actions.archived_at column (立场 ① 不真删 / 不裂表).
	(&auth.RetentionSweeper{Store: s.store, Logger: s.logger}).Start(context.Background())
	// HB-5.2 heartbeat retention sweeper + admin override (复用 AL-7 既有
	// audit retention override action; metadata target='heartbeat' 字面区分,
	// 立场 ② 不挂 admin_actions CHECK 第 13 项 enum).
	hb5HeartbeatRetentionHandler := &api.HB5HeartbeatRetentionHandler{Store: s.store, Logger: s.logger}
	hb5HeartbeatRetentionHandler.RegisterAdminRoutes(s.mux, adminMw)
	(&auth.HeartbeatRetentionSweeper{Store: s.store, Logger: s.logger}).Start(context.Background())
	// Note: AdminHandler.RegisterAppRoutes (the legacy /api/v1/admin/* user-rail
	// god-mode mount) is intentionally NOT wired — review checklist §ADM-0.2 §1
	// 反向断言 2.B (user cookie 调 admin endpoints 必须 401).

	// Agents
	agentStateAdapter := &agentRuntimeAdapter{hub: s.hub, tracker: s.agentTracker}
	agentHandler := &api.AgentHandler{Store: s.store, Logger: s.logger, Hub: &hubPluginAdapter{s.hub}, State: agentStateAdapter}
	agentHandler.RegisterRoutes(s.mux, authMw)

	// AL-4.2 runtime registry user-rail (acceptance §2.1-§2.5 + §2.7) —
	// owner-only via inline OwnerID check (跟 agents.go handleDeleteAgent /
	// handleRotateAPIKey 同模式). admin god-mode 不入此 rail (admin path
	// 只 read 元数据 via AdminRuntimeHandler above).
	runtimeHandler := &api.RuntimeHandler{Store: s.store, Logger: s.logger}
	runtimeHandler.RegisterRoutes(s.mux, authMw)

	// Agent invitations (CM-4.1 + RT-0 #40 push wiring)
	agentInvitationHandler := &api.AgentInvitationHandler{Store: s.store, Logger: s.logger, Hub: s.hub}
	agentInvitationHandler.RegisterRoutes(s.mux, authMw)

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

	// CV-1.2 artifacts (canvas-vision §0; channel-scoped artifact CRUD +
	// commit + rollback + WS push). Pusher routes to ws.Hub which owns
	// the RT-1.1 ArtifactUpdated frame envelope (#290 byte-identical).
	// IterationPusher (CV-4.2 立场 ② commit 单源) routes the
	// running→completed transition push when commit carries
	// `?iteration_id=` query.
	artifactHandler := &api.ArtifactHandler{
		Store:           s.store,
		Logger:          s.logger,
		Hub:             broadcaster,
		Pusher:          &hubArtifactAdapter{s.hub},
		IterationPusher: &hubIterationAdapter{s.hub},
	}
	artifactHandler.RegisterRoutes(s.mux, authMw)

	// CV-2.2 anchor comments (canvas-vision §1.6; per-version anchor threads
	// + WS push). Pusher routes to ws.Hub which owns the AnchorCommentAdded
	// frame envelope (10 fields, byte-identical 跟 spec v2 字面).
	anchorHandler := &api.AnchorHandler{
		Store:  s.store,
		Logger: s.logger,
		Hub:    broadcaster,
		Pusher: &hubAnchorAdapter{s.hub},
	}
	anchorHandler.RegisterRoutes(s.mux, authMw)

	// CV-4.2 iterations (canvas-vision §1.4 + §1.5; owner-only iterate
	// orchestration + state machine + WS push). Pusher routes to ws.Hub
	// which owns the IterationStateChanged frame envelope (9 字段
	// byte-identical 跟 spec #365 字面).
	iterationHandler := &api.IterationHandler{
		Store:  s.store,
		Logger: s.logger,
		Pusher: &hubIterationAdapter{s.hub},
	}
	iterationHandler.RegisterRoutes(s.mux, authMw)

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
	if strings.HasPrefix(r.URL.Path, "/api/") || r.URL.Path == "/admin-api" || strings.HasPrefix(r.URL.Path, "/admin-api/") || strings.HasPrefix(r.URL.Path, "/ws") {
		JSONError(w, http.StatusNotFound, "Not found")
		return
	}

	if r.URL.Path == "/admin" || strings.HasPrefix(r.URL.Path, "/admin/") {
		adminPath := filepath.Join(s.cfg.ClientDist, "admin.html")
		if _, err := os.Stat(adminPath); err == nil {
			http.ServeFile(w, r, adminPath)
			return
		}
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
	handler = rateLimitMiddleware(rl, s.cfg.IsDevelopment(), handler)
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

// hubArtifactAdapter exposes ws.Hub.PushArtifactUpdated through the
// api.ArtifactPusher interface so internal/api does not import internal/ws
// (mirrors the AgentInvitationPusher / hubPluginAdapter pattern).
type hubArtifactAdapter struct {
	hub *ws.Hub
}

func (a *hubArtifactAdapter) PushArtifactUpdated(artifactID string, version int64, channelID string, updatedAt int64, kind string) (cursor int64, sent bool) {
	return a.hub.PushArtifactUpdated(artifactID, version, channelID, updatedAt, kind)
}

// hubAnchorAdapter exposes ws.Hub.PushAnchorCommentAdded through the
// api.AnchorCommentPusher interface so internal/api stays free of the
// internal/ws import (mirrors hubArtifactAdapter pattern).
type hubAnchorAdapter struct {
	hub *ws.Hub
}

func (a *hubAnchorAdapter) PushAnchorCommentAdded(
	anchorID string,
	commentID int64,
	artifactID string,
	artifactVersionID int64,
	channelID string,
	authorID string,
	authorKind string,
	createdAt int64,
) (cursor int64, sent bool) {
	return a.hub.PushAnchorCommentAdded(anchorID, commentID, artifactID, artifactVersionID, channelID, authorID, authorKind, createdAt)
}

// hubIterationAdapter exposes ws.Hub.PushIterationStateChanged through the
// api.IterationStatePusher interface so internal/api stays free of the
// internal/ws import (mirrors hubAnchorAdapter pattern). CV-4.2 立场 ②
// commit 单源 — same hub instance routes commit → completed push.
type hubIterationAdapter struct {
	hub *ws.Hub
}

func (a *hubIterationAdapter) PushIterationStateChanged(
	iterationID string,
	artifactID string,
	channelID string,
	state string,
	errorReason string,
	createdArtifactVersionID int64,
	completedAt int64,
) (cursor int64, sent bool) {
	return a.hub.PushIterationStateChanged(iterationID, artifactID, channelID, state, errorReason, createdArtifactVersionID, completedAt)
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

// agentRuntimeAdapter — AL-1a (#R3) wiring. Folds hub plugin presence
// (online vs offline) with the in-memory error tracker. ResolveAgentState
// is the single read path; SetAgentError is the runtime fault sidedoor
// the api package calls when ProxyPluginRequest reports a classified error.
type agentRuntimeAdapter struct {
	hub     *ws.Hub
	tracker *agent.Tracker
}

func (a *agentRuntimeAdapter) ResolveAgentState(agentID string) agent.Snapshot {
	return a.tracker.Resolve(agentID, a.hub.GetPlugin(agentID) != nil)
}

func (a *agentRuntimeAdapter) SetAgentError(agentID, reason string) {
	a.tracker.SetError(agentID, reason)
}

// pluginFrameRouterAdapter wires *bpp.PluginFrameDispatcher into the
// ws.PluginFrameRouter interface (跟 hubArtifactAdapter / hubAnchorAdapter
// 同模式 — internal/ws 不 import internal/bpp; bpp.PluginSessionContext
// 跟 ws.PluginSessionContext byte-identical 单字段 OwnerUserID).
type pluginFrameRouterAdapter struct {
	pfd *bpp.PluginFrameDispatcher
}

func (a *pluginFrameRouterAdapter) Route(raw []byte, sess ws.PluginSessionContext) (bool, error) {
	return a.pfd.Route(raw, bpp.PluginSessionContext{OwnerUserID: sess.OwnerUserID})
}

// hubLivenessAdapter wires *ws.Hub.SnapshotPluginLastSeen into the
// bpp.PluginLivenessSource interface (跟 pluginFrameRouterAdapter 同模式
// — internal/ws 不 import internal/bpp; 接口名差异 SnapshotPluginLastSeen
// vs SnapshotLastSeen 用 adapter 桥).
type hubLivenessAdapter struct {
	hub *ws.Hub
}

func (a *hubLivenessAdapter) SnapshotLastSeen() map[string]time.Time {
	return a.hub.SnapshotPluginLastSeen()
}

// channelScopeAdapter wires *store.Store.GetUserChannelIDs into the
// bpp.ChannelScopeResolver interface (跟 hubLivenessAdapter 同模式) —
// signature 差异: store 返 []string 无 error, interface 返 ([]string, error)
// 跟 RT-1.3 acceptance §2.5 同 scope.
type channelScopeAdapter struct {
	store *store.Store
}

func (a *channelScopeAdapter) ChannelIDsForOwner(ownerUserID string) ([]string, error) {
	return a.store.GetUserChannelIDs(ownerUserID), nil
}

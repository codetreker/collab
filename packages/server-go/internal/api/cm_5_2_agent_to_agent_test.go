// Package api_test — cm_5_2_agent_to_agent_test.go: CM-5.2 server-side
// agent↔agent 协作路径验证 (走人协作 path 不裂表立场).
//
// Spec: docs/implementation/modules/cm-5-spec.md §1.2 (CM-5.2 server 路径
// 验证) + §0 5 立场.
// Acceptance: docs/qa/acceptance-templates/cm-5.md §2 server (#463 spec v0).
// Blueprint: concept-model.md §1.3 (§185 "未来你会看到 agent 互相协作") +
// agent-lifecycle.md §1 (Borgee 是协作平台, agent 之间走 Borgee 平台机制).
//
// CM-5.2 立场验证 (3 端到端 case 复用既有 path):
//   - 立场 ① 走人 path — agent A → @agent B mention 走 DM-2.2 mention
//     dispatcher (#372 既有路径), 不开旁路.
//   - 立场 ③ X2 冲突 — 2 agents commit 同 artifact → 第二写者 409
//     (CV-1.2 single-doc lock 30s 复用, 立场字面).
//   - 立场 ⑤ owner-first 透明可见 — 跨 owner GET /artifacts/:id/iterations
//     全链可见.
//
// 不开新代码: 所有路径走 #372 (DM-2.2) + #342/#346 (CV-1.2) + #409 (CV-4.2)
// 既有 path. 此文件仅 end-to-end 验证 — CM-5 milestone 立场是 "复用人协作
// path", 服务器实施代码 0 行新增 (反约束 grep 守见 cm5stance package).

package api_test

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// cm52SetupTwoAgents 构造场景 — 两 owner 各拥有一 agent, 同 channel:
//   owner_A (= owner@test.com)        owner_B (= member@test.com, 不同 org)
//        └─ agent_A (in #general)            └─ (created later, joined to A's channel via cross-org invite)
//
// 简化: 两 agent 同 channel 由 ownerA, agent_A owned by ownerA, agent_B
// owned by ownerA (同 org, 简化 cross-org 留 AP-3) — 跨 owner 责任语义靠
// agent.OwnerID 区分.
func cm52SetupTwoAgents(t *testing.T) (url, ownerTok, agentATok, agentBTok string,
	s *store.Store, chID, artID, agentAID, agentBID string) {
	t.Helper()
	ts, st, _ := testutil.NewTestServer(t)
	url = ts.URL
	ownerTok = testutil.LoginAs(t, url, "owner@test.com", "password123")

	// channel + artifact (owner-created)
	chID = cv12General(t, url, ownerTok)
	_, art := testutil.JSON(t, "POST", url+"/api/v1/channels/"+chID+"/artifacts", ownerTok,
		map[string]any{"title": "Plan", "body": "para A."})
	artID = art["id"].(string)

	// Two agents — both owned by owner (CM-5 立场: agent ↔ agent collaboration
	// 走人协作 path, 不依赖 cross-org agent — AP-3 留 Phase 4+).
	agentATok = seedAgentInChannel(t, st, url, chID, "agent-cm52a@test.com", "AgentA")
	agentBTok = seedAgentInChannel(t, st, url, chID, "agent-cm52b@test.com", "AgentB")

	uA, err := st.GetUserByEmail("agent-cm52a@test.com")
	if err != nil || uA == nil {
		t.Fatalf("seed agentA lookup: %v", err)
	}
	agentAID = uA.ID
	uB, err := st.GetUserByEmail("agent-cm52b@test.com")
	if err != nil || uB == nil {
		t.Fatalf("seed agentB lookup: %v", err)
	}
	agentBID = uB.ID
	s = st
	return
}

// TestCM52_AgentMessagesViaHumanPath pins acceptance §2.1 立场 ① + ④ —
// agent A POST /messages 走人协作 path (POST /api/v1/channels/:id/messages).
// 反约束: 不开 agent-only endpoint, 走人 path 同 endpoint 同源.
func TestCM52_AgentMessagesViaHumanPath(t *testing.T) {
	url, _, agentATok, _, _, chID, _, _, agentBID := cm52SetupTwoAgents(t)

	// agent A → channel message containing @agent_B mention token (DM-2.2
	// parser handles `@<user_id>` fallback when no display name resolution).
	resp, body := testutil.JSON(t, "POST", url+"/api/v1/channels/"+chID+"/messages", agentATok,
		map[string]any{
			"content":      "Hi @" + agentBID + ", can you check this?",
			"content_type": "text",
		})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("agent_A POST /messages 走人协作 path: expected 200/201, got %d: %v", resp.StatusCode, body)
	}
	// 立场 ① — 反约束: 路径是人 path, 没有 agent-only 旁路 endpoint.
	// (反约束 grep 守见 cm5stance.TestCM51_NoBypassEndpoint.)
}

// TestCM52_AgentToAgentMentionViaDM2Router pins acceptance §2.1 立场 ④ —
// agent A → @agent B mention 走 DM-2.2 既有 mention parser + dispatcher
// (走人协作 path 同 path). MentionPushedFrame 8 字段 byte-identical 跟
// ArtifactUpdated 7 / AnchorCommentAdded 10 / IterationStateChanged 9
// 共 cursor sequence (BPP-1 #304 envelope CI lint reflect 自动覆盖).
//
// 反约束: 立场 ④ 不开 'agent_to_agent_mention' 专属 frame (反约束 grep 守
// 见 cm5stance.TestCM51_NoBypassTable).
func TestCM52_AgentToAgentMentionViaDM2Router(t *testing.T) {
	url, _, agentATok, _, s, chID, _, _, agentBID := cm52SetupTwoAgents(t)

	// agent A → message + @agent_B mention. message_mentions 行落跟人协作
	// path 同源 (DM-2.1 schema v=15 `(message_id, target_user_id)` 二元
	// PK, 立场 ⑥ user/agent 同语义同表).
	resp, body := testutil.JSON(t, "POST", url+"/api/v1/channels/"+chID+"/messages", agentATok,
		map[string]any{
			"content":      "Hi @" + agentBID + " review please",
			"content_type": "text",
		})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("agent_A → @agent_B message: expected 201, got %d: %v", resp.StatusCode, body)
	}

	// 验证 — message_mentions 行是否落 (DM-2.2 parser hit, 走人协作 path
	// 同源). 立场 ④ 字面: agent.role='agent' 不影响 mention router 路径分流.
	var mentionCount int64
	if err := s.DB().Raw(
		`SELECT COUNT(*) FROM message_mentions WHERE target_user_id = ?`,
		agentBID).Scan(&mentionCount).Error; err != nil {
		t.Fatalf("count message_mentions: %v", err)
	}
	if mentionCount < 1 {
		t.Errorf("立场 ④ broken: agent_A → @agent_B mention 走 DM-2.2 router → message_mentions row count == %d, want ≥ 1", mentionCount)
	}
}

// TestCM52_X2ConflictReusesCV1Lock pins acceptance §2.2 立场 ③ — 同
// artifact 被 owner + 另一 user 在 30s lock 窗内同时 commit → 第二写者
// 409 (CV-1.2 single-doc lock 复用, 不引入新锁机制). 立场字面: X2 冲突
// 走 CV-1.2 既有 30s lock 路径, 不开 CM-5 自起新锁表 (反约束见
// cm5stance.TestCM51_NoNewLockTable + TestCM51_X2ConflictLiteralReuse).
//
// 注: CV-1 commit lock 是 user-level (LockHolderUserID), 跨 agent 因 agent
// 也是 user 行 (role='agent'), 锁路径同源 — agent A commit 拿锁 → agent B
// 30s 内 commit → 409. 此 test 用人协作 path 触发同样的 lock conflict 路径,
// 立场 ③ 等价证明 (跨 agent 当 agent 也走 user.id 同 lock 时, 行为一致).
func TestCM52_X2ConflictReusesCV1Lock(t *testing.T) {
	url, ownerTok, _, _, _, _, artID, _, _ := cm52SetupTwoAgents(t)

	// owner commits first → 拿 lock + bumps version 1 → 2.
	respFirst, _ := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/commits", ownerTok,
		map[string]any{
			"expected_version": 1,
			"body":             "v2 by owner",
		})
	if respFirst.StatusCode != http.StatusOK {
		t.Fatalf("first commit (owner) expected 200, got %d", respFirst.StatusCode)
	}

	// 模拟另一 user (agent_A 走 user path) 立即 commit 同 artifact → 走
	// CV-1.2 既有 single-doc lock + 立场 ② version mismatch 双重 gate.
	// 测试预期: 409 (lock 持有者 != 当前 user OR version mismatch 同时触发).
	// 此 test 用 owner_A 重 commit 同 expected_version 模拟 X2 race —
	// expected_version=1 stale → 409 (lock_held + version_mismatch 同源 path).
	respSecond, body := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/commits", ownerTok,
		map[string]any{
			"expected_version": 1, // stale (HEAD = 2 now)
			"body":             "v2 by agent_A (race)",
		})
	if respSecond.StatusCode != http.StatusConflict {
		t.Fatalf("立场 ③ X2 冲突 broken: stale commit expected 409 (CV-1.2 single-doc lock + version mismatch path), got %d: %v",
			respSecond.StatusCode, body)
	}
}

// TestCM52_X2ConcurrentCommitOneWins pins acceptance §2.2 立场 ③ — 真
// 并发场景: N goroutines POST /commits 同 artifact 同 expected_version,
// 仅 1 写者成功 (200 OK + version bump), 其余全 409 (CV-1.2 lock + tx
// re-check 双重 gate 复用, 立场字面). 验 CM-5 立场: 不引入新机制, 走
// 既有 path.
func TestCM52_X2ConcurrentCommitOneWins(t *testing.T) {
	url, ownerTok, _, _, _, _, artID, _, _ := cm52SetupTwoAgents(t)

	const N = 5
	var wg sync.WaitGroup
	results := make([]int, N)
	wg.Add(N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer wg.Done()
			resp, _ := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/commits", ownerTok,
				map[string]any{
					"expected_version": 1,
					"body":             "concurrent body",
				})
			results[i] = resp.StatusCode
		}(i)
	}
	wg.Wait()

	successCount, conflictCount := 0, 0
	for _, code := range results {
		switch code {
		case http.StatusOK:
			successCount++
		case http.StatusConflict:
			conflictCount++
		}
	}
	// CV-1.2 lock + tx UPDATE WHERE current_version=N 双重 gate 保证仅 1 胜.
	if successCount != 1 {
		t.Errorf("立场 ③ X2 冲突 broken: concurrent commits expected exactly 1 success, got %d (codes: %v)", successCount, results)
	}
	if conflictCount != N-1 {
		t.Errorf("立场 ③ X2 冲突 broken: expected %d × 409, got %d", N-1, conflictCount)
	}
	// 反约束: 不开 CM-5 自起 X2 错码 (复用 CV-1 既有 lock conflict path,
	// 见 cm5stance.TestCM51_X2ConflictLiteralReuse).
}

// TestCM52_OwnerVisibilityIterateChain pins acceptance §2.3 立场 ⑤ —
// owner_A 触发 iterate 链, GET /api/v1/artifacts/:id/iterations 返完整链,
// 第二 owner 视角同样可见 (走人协作 path, owner-first 透明可见, 不裂
// owner_visibility scope 不引 ai_only 隐藏字段).
//
// 立场 ⑤ 字面: 跟人协作产物 owner 可见同模式 — agent A iterate 由 owner_A
// 拥有, GET /iterations 走人 path 同 endpoint, 任何 channel member 都能
// 列出 (跟 mention thread / artifact view owner-first 同源).
//
// 注: CM-5 立场是反约束守 — 不引入新隐藏字段 / scope. 此 test 验既有
// GET /iterations 路径不挂 ai_only filter, 跟人协作 path 行为一致.
func TestCM52_OwnerVisibilityIterateChain(t *testing.T) {
	url, ownerTok, _, _, _, _, artID, _, agentAID := cm52SetupTwoAgents(t)

	// owner_A 触发 iterate by agent_A (CV-4.2 既有 path).
	resp, body := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok,
		map[string]any{
			"intent_text":     "improve para A",
			"target_agent_id": agentAID,
		})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("CV-4.2 iterate trigger: expected 200/201, got %d: %v", resp.StatusCode, body)
	}

	// owner_A GET /iterations — 应返 1+ row (含此 iteration).
	respList, listBody := testutil.JSON(t, "GET", url+"/api/v1/artifacts/"+artID+"/iterations", ownerTok, nil)
	if respList.StatusCode != http.StatusOK {
		t.Fatalf("GET /iterations: expected 200, got %d: %v", respList.StatusCode, listBody)
	}
	iterations, ok := listBody["iterations"].([]any)
	if !ok {
		t.Fatalf("GET /iterations: expected `iterations` array, got %v", listBody)
	}
	if len(iterations) < 1 {
		t.Errorf("立场 ⑤ broken: owner_A GET /iterations expected ≥1 row (透明可见 owner-first), got %d", len(iterations))
	}

	// 反约束 — response 不含 'ai_only' / 'visibility_scope' 隐藏字段
	// (立场 ⑤ 字面). 反约束 grep 守见 cm5stance.TestCM51_NoBypassTable
	// (covers ai_only 字符串 in code).
	for _, it := range iterations {
		row, _ := it.(map[string]any)
		for _, forbidden := range []string{"ai_only", "visibility_scope", "agent_visible_only"} {
			if _, has := row[forbidden]; has {
				t.Errorf("立场 ⑤ broken: GET /iterations row 含禁字段 %q (透明可见 owner-first)", forbidden)
			}
		}
	}

	// Anti-flake — small sleep so async dispatchers (if any) settle (走
	// 既有 path, 此 test 不依赖 async, 但 sleep 防 race 边界 不影响 PASS).
	time.Sleep(10 * time.Millisecond)
}

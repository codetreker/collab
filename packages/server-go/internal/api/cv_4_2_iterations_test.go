// Package api_test — cv_4_2_iterations_test.go: CV-4.2 acceptance tests
// (#405 schema v=18 → CV-4.2 server iterate API + state machine + WS push).
//
// Stance pins exercised (cv-4-spec.md §0 + acceptance §2 + §4 + 文案锁
// #380):
//   - ① 域隔离 — messages 不污染 (acceptance §1.5 + §4.2 反向 grep, repo-
//     level CI lint, 非 unit).
//   - ② CV-1 commit 单源 — POST /commits?iteration_id= atomic UPDATE
//     running→completed; 反约束 不开 /iterations/:id/commit 旁路
//     (acceptance §2.2 + §4.1).
//   - ③ server 不算 diff — 反向 grep CI (acceptance §2.6 + §4.4).
//   - ④ state machine 4 态前向锁 — 反 completed→running / failed→pending
//     等回退 reject (acceptance §2.3 + §4.3).
//   - ⑤ AL-4 stub fail-closed — agent_runtimes.status != 'running' →
//     state='failed' + error_reason='runtime_not_registered' byte-identical
//     跟 AL-1a #249 6 reason 同源 (acceptance §2.5).
//   - ⑥ owner-only — non-owner POST /iterate → 403 (acceptance §2.1).
package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/api"
	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// cv42Setup builds a fresh server, creates an artifact in `general`, seeds
// a role='agent' channel-member, and returns
// (ts.URL, ownerTok, store, channelID, artifactID, agentID).
func cv42Setup(t *testing.T) (url string, ownerTok string, s *store.Store, chID string, artID string, agentID string) {
	t.Helper()
	ts, st, _ := testutil.NewTestServer(t)
	ownerTok = testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	chID = cv12General(t, ts.URL, ownerTok)
	_, art := testutil.JSON(t, "POST", ts.URL+"/api/v1/channels/"+chID+"/artifacts", ownerTok, map[string]any{
		"title": "Plan", "body": "para A.",
	})
	artID = art["id"].(string)
	_ = seedAgentInChannel(t, st, ts.URL, chID, "agent-cv42@test.com", "AgentZ")
	// look up agent's user id
	u, err := st.GetUserByEmail("agent-cv42@test.com")
	if err != nil || u == nil {
		t.Fatalf("seed agent lookup failed: %v", err)
	}
	url = ts.URL
	s = st
	agentID = u.ID
	return
}

// TestCV42_IterateOwnerOnly pins acceptance §2.1: only the channel owner
// (channel.created_by) may POST /iterate. Non-owner = 403 — admin
// god-mode does not enter this rail (ADM-0 §1.3, anchors / artifacts 同
// rail 隔离).
func TestCV42_IterateOwnerOnly(t *testing.T) {
	url, _, s, chID, artID, agentID := cv42Setup(t)

	// Seed second human (non-owner) channel member.
	otherTok := func() string {
		hash := mustHash(t, "password123")
		em := "other-cv42@test.com"
		u := &store.User{DisplayName: "Other", Role: "user", Email: &em, PasswordHash: hash}
		if err := s.CreateUser(u); err != nil {
			t.Fatalf("create other: %v", err)
		}
		_ = s.UpdateUser(u.ID, map[string]any{"org_id": mustOrgID(t, s, "owner@test.com")})
		_ = s.GrantDefaultPermissions(u.ID, "member")
		_ = s.AddChannelMember(&store.ChannelMember{ChannelID: chID, UserID: u.ID})
		return testutil.LoginAs(t, url, em, "password123")
	}()

	resp, _ := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", otherTok, map[string]any{
		"intent_text":     "make it shorter",
		"target_agent_id": agentID,
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("non-owner iterate not 403: got %d", resp.StatusCode)
	}
}

// TestCV42_AL4StubFailClosed_RuntimeNotRegistered pins acceptance §2.5:
// when no agent_runtimes row with status='running' exists, iteration
// transitions pending→failed atomically with error_reason byte-identical
// 'runtime_not_registered' (AL-1a #249 6 reason 同源 不另起字典).
func TestCV42_AL4StubFailClosed_RuntimeNotRegistered(t *testing.T) {
	url, ownerTok, _, _, artID, agentID := cv42Setup(t)

	resp, data := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
		"intent_text":     "rewrite section 1",
		"target_agent_id": agentID,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("iterate stub-fail not 201: got %d (%v)", resp.StatusCode, data)
	}
	if data["state"] != api.IterationStateFailed {
		t.Errorf("state byte-identical lock failed: got %v, want %q", data["state"], api.IterationStateFailed)
	}
	if data["error_reason"] != api.IterationErrorReasonRuntimeNotRegistered {
		t.Errorf("error_reason byte-identical lock failed: got %v, want %q",
			data["error_reason"], api.IterationErrorReasonRuntimeNotRegistered)
	}
}

// TestCV42_AL4Live_StateRunning pins acceptance §2.5 second branch: when
// agent_runtimes row exists with status='running', AL-4 stub treats this
// as "live" and persists state='running' (real plugin dispatch lands
// when AL-4 runtime hub plugin path is wired — out of scope CV-4.2,
// the seam is here so AL-4 follow-up does NOT need to re-thread the
// switch).
func TestCV42_AL4Live_StateRunning(t *testing.T) {
	url, ownerTok, s, _, artID, agentID := cv42Setup(t)
	// Seed agent_runtimes with status='running'.
	if err := s.DB().Exec(`INSERT INTO agent_runtimes
  (id, agent_id, endpoint_url, process_kind, status, created_at, updated_at)
  VALUES (?, ?, 'ws://test', 'openclaw', 'running', 1700000000000, 1700000000000)`,
		"rt-cv42", agentID).Error; err != nil {
		t.Fatalf("seed runtime: %v", err)
	}

	resp, data := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
		"intent_text":     "rewrite section 1",
		"target_agent_id": agentID,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("iterate live not 201: got %d (%v)", resp.StatusCode, data)
	}
	if data["state"] != api.IterationStateRunning {
		t.Errorf("state byte-identical lock failed: got %v, want %q", data["state"], api.IterationStateRunning)
	}
}

// TestCV42_TargetAgentMustBeChannelMember pins acceptance §2.1 反断:
// target_agent_id 不是 channel member → 400 byte-identical error code
// 'iteration.target_not_in_channel'.
func TestCV42_TargetAgentMustBeChannelMember(t *testing.T) {
	url, ownerTok, s, _, artID, _ := cv42Setup(t)

	// Seed an unrelated agent NOT in the channel.
	hash := mustHash(t, "password123")
	em := "stranger-agent@test.com"
	stranger := &store.User{DisplayName: "Stranger", Role: "agent", Email: &em, PasswordHash: hash}
	if err := s.CreateUser(stranger); err != nil {
		t.Fatalf("create stranger agent: %v", err)
	}

	resp, data := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
		"intent_text":     "do thing",
		"target_agent_id": stranger.ID,
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("non-member target not 400: got %d (%v)", resp.StatusCode, data)
	}
	if data["code"] != api.IterationErrCodeTargetNotInChannel {
		t.Errorf("error code byte-identical lock failed: got %v, want %q",
			data["code"], api.IterationErrCodeTargetNotInChannel)
	}
}

// TestCV42_CommitWithIterationIDAtomicUpdate pins acceptance §2.2 (CV-1
// commit 单源): POST /commits?iteration_id= transitions
// running→completed atomically + writes created_artifact_version_id.
// 反约束: 不开 /iterations/:id/commit 旁路 (verified by CI grep §4.1).
func TestCV42_CommitWithIterationIDAtomicUpdate(t *testing.T) {
	url, ownerTok, s, _, artID, agentID := cv42Setup(t)
	// Seed running runtime so iterate produces state=running.
	if err := s.DB().Exec(`INSERT INTO agent_runtimes
  (id, agent_id, endpoint_url, process_kind, status, created_at, updated_at)
  VALUES (?, ?, 'ws://test', 'openclaw', 'running', 1700000000000, 1700000000000)`,
		"rt-cv42-c", agentID).Error; err != nil {
		t.Fatalf("seed runtime: %v", err)
	}
	_, itData := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
		"intent_text":     "rewrite",
		"target_agent_id": agentID,
	})
	iterationID := itData["id"].(string)
	if itData["state"] != api.IterationStateRunning {
		t.Fatalf("setup precondition: state=%v, want running", itData["state"])
	}

	// Owner commits with ?iteration_id=.
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/artifacts/"+artID+"/commits?iteration_id="+iterationID,
		ownerTok, map[string]any{
			"expected_version": float64(1),
			"body":             "rewritten body v2",
		})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("commit?iteration_id 没成功: got %d", resp.StatusCode)
	}

	// Verify atomic UPDATE: state='completed' + created_artifact_version_id != NULL.
	var row struct {
		State                    string  `gorm:"column:state"`
		CreatedArtifactVersionID *int64  `gorm:"column:created_artifact_version_id"`
		CompletedAt              *int64  `gorm:"column:completed_at"`
		ErrorReason              *string `gorm:"column:error_reason"`
	}
	if err := s.DB().Raw(`SELECT state, created_artifact_version_id, completed_at, error_reason
FROM artifact_iterations WHERE id = ?`, iterationID).Scan(&row).Error; err != nil {
		t.Fatalf("query iteration: %v", err)
	}
	if row.State != api.IterationStateCompleted {
		t.Errorf("state not completed: got %q", row.State)
	}
	if row.CreatedArtifactVersionID == nil || *row.CreatedArtifactVersionID == 0 {
		t.Errorf("created_artifact_version_id not set: %v", row.CreatedArtifactVersionID)
	}
	if row.CompletedAt == nil {
		t.Errorf("completed_at not set")
	}
	if row.ErrorReason != nil {
		t.Errorf("error_reason not NULL on success: %v", *row.ErrorReason)
	}
}

// TestCV42_StateMachine_RejectsCommitOnFailedIteration pins acceptance
// §2.3 反断: state machine forward-only — committing with an
// iteration_id whose state is 'failed' (or any state != 'running') →
// 409 conflict. 反约束: completed→running / failed→pending 等回退绝对
// reject (CompleteIterationOnCommit 的 WHERE state='running' clause 是
// 唯一闸位).
func TestCV42_StateMachine_RejectsCommitOnFailedIteration(t *testing.T) {
	url, ownerTok, _, _, artID, agentID := cv42Setup(t)
	// No runtime seeded → iterate fails immediately (state='failed').
	_, itData := testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
		"intent_text":     "rewrite",
		"target_agent_id": agentID,
	})
	iterationID := itData["id"].(string)
	if itData["state"] != api.IterationStateFailed {
		t.Fatalf("precondition: state=%v, want failed", itData["state"])
	}

	// Now try to commit referencing the failed iteration_id → 409.
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/artifacts/"+artID+"/commits?iteration_id="+iterationID,
		ownerTok, map[string]any{
			"expected_version": float64(1),
			"body":             "should not land",
		})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("commit on failed iteration accepted: got %d, want 409", resp.StatusCode)
	}
}

// TestCV42_CommitWithoutIterationID_LegacyPathUnchanged pins acceptance
// §2.2 反断: when ?iteration_id= absent, commit follows CV-1.2 legacy
// behaviour exactly (反约束 旧路径不破). No iteration row is created or
// touched. 跟 cv_1_2_artifacts_test.go::TestCV12_CommitArtifact 同模式.
func TestCV42_CommitWithoutIterationID_LegacyPathUnchanged(t *testing.T) {
	url, ownerTok, s, _, artID, _ := cv42Setup(t)
	resp, _ := testutil.JSON(t, "POST",
		url+"/api/v1/artifacts/"+artID+"/commits",
		ownerTok, map[string]any{
			"expected_version": float64(1),
			"body":             "legacy commit",
		})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("legacy commit not 200: got %d", resp.StatusCode)
	}
	// Confirm no iteration row exists.
	var n int64
	if err := s.DB().Raw(`SELECT COUNT(*) FROM artifact_iterations WHERE artifact_id = ?`, artID).Scan(&n).Error; err != nil {
		t.Fatalf("count iterations: %v", err)
	}
	if n != 0 {
		t.Errorf("legacy commit polluted artifact_iterations: %d rows", n)
	}
}

// TestCV42_ListIterationsHistory pins GET history shape (ORDER BY
// created_at DESC + intent_text 含 — channel-member rail; admin path
// 不入 acceptance §2.7 反断 是 admin*.go 责任, 此 endpoint 在
// channel-member rail intent_text 必须返).
func TestCV42_ListIterationsHistory(t *testing.T) {
	url, ownerTok, _, _, artID, agentID := cv42Setup(t)
	for i := 0; i < 2; i++ {
		_, _ = testutil.JSON(t, "POST", url+"/api/v1/artifacts/"+artID+"/iterate", ownerTok, map[string]any{
			"intent_text":     "iter" ,
			"target_agent_id": agentID,
		})
	}
	resp, data := testutil.JSON(t, "GET", url+"/api/v1/artifacts/"+artID+"/iterations", ownerTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list not 200: got %d", resp.StatusCode)
	}
	rows := data["iterations"].([]any)
	if len(rows) != 2 {
		t.Fatalf("expected 2 history rows, got %d", len(rows))
	}
	// Shape sanity: intent_text returned (channel-member rail).
	row0 := rows[0].(map[string]any)
	if row0["intent_text"] != "iter" {
		t.Errorf("intent_text not returned on member rail: %v", row0["intent_text"])
	}
}

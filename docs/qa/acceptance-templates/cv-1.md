# Acceptance Template — CV-1: artifact schema + commit/rollback API + canvas UI

> 蓝图: `docs/blueprint/canvas-vision.md` §0 (一句话 — channel 围 artifact 协作) + §1.1-§1.6 (五条立场) + §2 (v1 做/不做)
> Spec: `docs/implementation/modules/cv-1-spec.md` (飞马 #306, 3 立场 + 3 拆段 + 7 grep 反查 + 6 反约束)
> 立场反查: `docs/qa/cv-1-stance-checklist.md` v0 (野马 #282, 7 项立场 + 5 黑名单 grep + v0/v1 切换三条件) + `docs/qa/cv-1-stance-v1-supplement.md` v1 (野马 #307, ②③⑤⑦ 字段/边界/反断细化)
> v1 解封三条件 (#295 §5): RT-1 三段 ✅ (#290+#292+#296) + AL-3 三轨 ✅ (#301+#302+#303+#305) + BPP-1 envelope CI lint ✅ (#304, G2.6 ⏸️→✅ DONE commit `4724efa`) — 全满足
> 拆 PR: **CV-1.1** schema (`artifacts` + `artifact_versions` 表 + migration v=13) — TBD / **CV-1.2** server API (POST 创 + PATCH 编辑 30s TTL 锁 + POST rollback + WS push) — TBD / **CV-1.3** client SPA canvas UI — TBD
> Owner: 战马A 实施 / 烈马 验收

## 验收清单

### §1 schema (CV-1.1) — artifacts + artifact_versions 数据契约

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 `artifacts` 表: `channel_id NOT NULL FK channels(id)` + `type CHECK='markdown'` 唯一枚举 (立场 ①+④) + `current_version NOT NULL` + `lock_holder_user_id` (nullable) + `lock_acquired_at` (timestamp, v1 supplement ②) + `archived_at` (nullable, channel archived 随删) + 无 `owner_id` 主权列 (反约束 立场 ①); migration v=12 → v=13 双向 | migration drift test | 战马A / 烈马 | `internal/migrations/cv_1_1_artifacts_test.go::TestCV11_CreatesArtifactsTable` + `TestCV11_RejectsNonMarkdownType` (反向 INSERT type='code' → reject) + 反向 `owner_id` / `cursor` 列名 reflect count==0 (独立 `TestCV11_NoOwnerIdColumn` **或** 合并到 `CreatesArtifactsTable` 内双 negative assert 等价) (TBD) |
| 1.2 `artifact_versions` 表: `id PK AUTOINCREMENT` 单调 (立场 ③ 线性, 无 fork) + `artifact_id FK` + `version` 跟 PK 同向 + `committer_kind CHECK in ('agent','human')` (立场 ⑥) + `committer_id` (user_id 或 agent_id, 跟 `committer_kind` 'id'/'kind' 对仗 — 不用 `committer_user_id` 因 agent commit 时是 agent_id 误导) + `body` + `rolled_back_from_version` (nullable, v1 supplement ⑦) + `created_at`; UNIQUE(artifact_id, version) | migration test | 战马A / 烈马 | `cv_1_1_artifacts_test.go::TestCV11_VersionsTablePKMonotonic` + `TestCV11_RejectsDuplicateArtifactVersion` + `TestCV11_RejectsCommitterKindOutsideEnum` (TBD) |

### §2 server API + WS push (CV-1.2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 `POST /channels/:id/artifacts` 创 → channel 成员可见 (跟 channel 权限继承); 跨 channel 调用 → 403; 跨 org 调用 → 403 (跟 CHN-1 双轴隔离同) | unit | 战马A / 烈马 | `internal/api/cv_1_2_artifacts_test.go::TestCV12_CreateArtifactInChannel` + `TestCV12_CrossChannel403` + `TestCV12_CrossOrg403` (TBD) |
| 2.2 `PATCH /artifacts/:id` 单文档锁: T+0 acquire → T+29s 持有 → T+30s lazy expire (UPDATE WHERE lock_acquired_at < now-30s, v1 supplement ②) → 旧 holder 后写收 409 conflict + reload hint (反约束: 不上 CRDT, 不 range lock) | unit (clock fixture) | 战马A / 烈马 | `cv_1_2_artifacts_test.go::TestCV12_LockTTL30sBoundary` (mock clock, 跟 G2.3 节流模式同) + `TestCV12_ConflictReturns409` + `TestCV12_LazyExpireOn31s` (TBD) |
| 2.3 `POST /artifacts/:id/rollback {to_version:N}` action endpoint (非 PATCH body 字段, v1 supplement ⑦): admin cookie → 401 (admin 不入写动作, ADM-0 红线) / 非 owner member → 403 (channel-model §1.4 owner-only) / 锁持有=别人 → 409; 成功 = 产新 row `INSERT artifact_versions ... body=(SELECT body FROM ... WHERE version=N)` 旧版本不删 + `rolled_back_from_version=N` 列填; system message 不发 (反约束 ⑦ 不污染 fanout) | unit (3 反断) | 战马A / 烈马 | `cv_1_2_artifacts_test.go::TestCV12_RollbackOwnerOnly` 三反向断言 (admin 401 + non-owner 403 + lock-conflict 409) + `TestCV12_RollbackProducesNewVersionNotDelete` (TBD) |
| 2.4 agent commit fanout system message 文案锁 byte-identical (立场 ⑥): `{agent_name} 更新 {artifact_name} v{n}`; sender_id='system'; ChannelMember 渲染 silent agent 不刷屏 (跟 CHN-1.2 #286 silent join 同模式) | unit + grep | 战马A / 烈马 | `cv_1_2_artifacts_test.go::TestCV12_AgentCommitSystemMessage` 字面 + `grep -n "更新 .* v" packages/server-go/internal/api/artifacts.go` count≥1 (TBD) |
| 2.5 `ArtifactUpdated` frame 字段顺序 byte-identical 跟 RT-1.1 #290 envelope: `{type:"artifact.updated", cursor, channel_id, artifact_id, version, committer_id, committer_kind, updated_at}` (立场 ⑤ + v1 supplement ⑤); 走 RT-1.1 共用 server cursor 单调, 不另起 artifact-only cursor; envelope 内不带 body (push 仅信号, 内容走 GET /artifacts/:id 拉, 反约束 ⑤); BPP-1 #304 envelope CI lint 自动 enforce | unit (golden JSON) + reflection | 飞马 / 烈马 | `internal/ws/artifact_updated_frame_test.go::TestArtifactUpdatedFrameFieldOrder` (json.Marshal byte-equality vs literal want) + `TestArtifactUpdatedSharesRT11Cursor` + BPP-1 `bpp/frame_schemas_test.go::TestBPPEnvelopeFieldOrder` 自动覆盖 (TBD) |
| 2.6 audit_log 跟 ADM-2 #266 同源 schema (v1 supplement ③): `artifact_versions` delete 路径加 `RequirePermission('artifact.delete_history')` 闸 (agent 默认无 grant) + 任何 delete 落 `audit_log` 行 (action='artifact.version.delete'); 反向断言: agent runtime 自 grant 路径 count==0 | unit + CI grep | 战马A / 烈马 | `cv_1_2_artifacts_test.go::TestCV12_AgentDefaultNoDeleteHistoryPerm` + `TestCV12_DeleteVersionWritesAuditLog` (字段跟 ADM-2 同源) + `grep -rnE "GrantPermission.*artifact\.delete_history.*FromAgent\|self_grant" internal/` count==0 (TBD) |

### §3 client SPA canvas UI (CV-1.3)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 channel 内 `Workspace` tab 跟 chat 平级 (蓝图 §1.3 "channel 自带"); markdown 编辑器 + `<MarkdownPreview>` 渲染; 仅 markdown 类型 (立场 ④ 反约束: 上传非 markdown → 走老 `workspace_files` 附件路径, 跟 artifact 分轨) | e2e | 战马A / 烈马 | `packages/e2e/tests/cv-1-3-canvas.spec.ts::立场 ① workspace tab + markdown only` (TBD) |
| 3.2 版本列表侧栏线性 (立场 ③, 无 fork) + 点 "回滚到此版本" → 触发 POST rollback; 仅 owner 看到该按钮 (非 owner DOM 不渲染); rollback 成功 → 新版本行渲染 "v{N+1} (rollback from v{M})" (v1 supplement ⑦ `rolled_back_from_version` 字面) | e2e + grep | 战马A / 烈马 | `cv-1-3-canvas.spec.ts::立场 ⑦ rollback owner-only` + `grep -n "rollback from v" packages/client/src/components/ArtifactVersionList.tsx` count≥1 (TBD) |
| 3.3 WS `ArtifactUpdated` 实时刷新 (立场 ⑤, 跟 RT-1.2 #292 reconnect→backfill 同模式 + 共用 last_seen_cursor); conflict 409 toast 文案锁 byte-identical: `内容已更新, 请刷新查看`; client 不能用 `updated_at` 排序 (RT-1 ① 反约束: server cursor 唯一可信序) | e2e + grep | 战马A / 烈马 | `cv-1-3-canvas.spec.ts::立场 ② conflict toast` + `grep -n "内容已更新, 请刷新查看" packages/client/src/components/ArtifactEditor.tsx` count≥1 (TBD) |

### §4 蓝图行为对照 (反查锚, 每 PR 必带)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 反向 grep 立场 ① 无 owner_id 主权: `grep -rnE 'artifacts.*owner_id\|workspace_artifacts.*owner_id' packages/server-go/internal/store/` count==0 | CI grep | 飞马 / 烈马 | spec lint job, CV-1.1 PR 必跑 (TBD) |
| 4.2 反向 grep 立场 ④ Markdown ONLY: `grep -rnE "artifact\.type.*=.*\"(code\|image\|pdf\|kanban)\"" packages/server-go/internal/` count==0 + CHECK 约束 reject 反向断言 | CI grep + unit | 飞马 / 烈马 | spec lint job + 1.1 reject 单测 (TBD) |
| 4.3 反向 grep 立场 ② 不上 CRDT: `grep -rnE 'yjs\|automerge\|y-protocols' packages/client/ packages/server-go/` count==0 | CI grep | 飞马 / 烈马 | spec lint job, CV-1.2/1.3 PR 必跑 (TBD) |
| 4.4 反向 grep 立场 ⑤ 不自造 envelope: `grep -rnE "type:.*'artifact\.updated'\|ArtifactUpdated.*Envelope\{" packages/server-go/internal/ws/ --exclude='*_test.go' --exclude=frame_schemas*` 仅命中 BPP-1 whitelist 注册路径 | CI grep | 飞马 / 烈马 | BPP-1 #304 envelope CI lint 自动覆盖 + spec lint job (TBD) |
| 4.5 反向 grep 立场 ⑦ rollback 不是 PATCH body 字段: `grep -rnE 'PATCH.*/artifacts.*rollback\|body\.rollback_to' packages/server-go/internal/api/ --exclude='*_test.go'` count==0 | CI grep | 飞马 / 烈马 | spec lint job, CV-1.2 PR 必跑 (TBD) |
| 4.6 反向 grep admin 不看 body (ADM-0 §1.3 红线复用): `grep -rnE 'lock_holder_user_id\|artifact.*body' packages/server-go/internal/api/admin*.go --exclude='*_test.go'` count==0 (admin god-mode 元数据白名单, 不返回 artifact body) | CI grep | 飞马 / 烈马 | spec lint job + REG-ADM0 反向断言复用 (TBD) |

## 退出条件

- §1 schema (1.1-1.2) + §2 server (2.1-2.6) + §3 client (3.1-3.3) **全绿** (一票否决)
- 反查锚 (4.1-4.6) 每 PR 必跑 0 命中 (无 owner_id / 非 markdown / CRDT / 自造 envelope / PATCH-rollback / admin body)
- agent commit fanout system message (2.4) + conflict toast (3.3) + rollback metadata (3.2) — 三处文案 byte-identical 锁
- audit_log schema (2.6) 跟 ADM-2 #266 同源, 字段名/枚举 byte-identical
- 登记 `docs/qa/regression-registry.md` REG-CV1-001..010 (待战马A 实施 PR 落后开号回填)
- v1 supplement ②③⑤⑦ 四项细化 (字段名 + 边界 + REST + 反向断言) 全挂闸
- 不在 v1 范围 (锁 holder 头像 / owner grant UI / 版本 GC / 锚点对话 / 跨 channel 共享 / 非 markdown 类型) 不挡 CV-1 闭合
- 飞马 spec #306 + 野马 stance #282 v0 + #307 v1 supplement 已锚, 烈马复审 patch 回填实施 PR # / 测试路径

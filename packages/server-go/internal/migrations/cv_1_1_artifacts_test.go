package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runCV11 runs migration v=13 (CV-1.1) on a memory DB. v=13 is a clean
// CREATE — no upstream tables required (channel_id is a logical FK, not
// enforced by SQLite default), so we don't seed anything.
func runCV11(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	e.Register(cv11Artifacts)
	if err := e.Run(0); err != nil {
		t.Fatalf("run cv_1_1: %v", err)
	}
}

// TestCV11_CreatesArtifactsTable pins acceptance §1 (cv-1.md §1.1):
// artifacts has the contract columns with the right NOT NULL / nullable
// shape. Drift here breaks workspace tab list correctness or schema
// equivalence with the CV-1.2 server API.
func TestCV11_CreatesArtifactsTable(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	cols := pragmaColumns(t, db, "artifacts")
	if len(cols) == 0 {
		t.Fatal("artifacts table not created")
	}

	idCol, ok := cols["id"]
	if !ok {
		t.Fatalf("artifacts missing id (have %v)", keys(cols))
	}
	if !idCol.pk {
		t.Error("artifacts.id must be PRIMARY KEY")
	}

	for _, name := range []string{"channel_id", "type", "title", "body", "current_version", "created_at"} {
		c, ok := cols[name]
		if !ok {
			t.Fatalf("artifacts missing %q (have %v)", name, keys(cols))
		}
		if !c.notNull {
			t.Errorf("artifacts.%s must be NOT NULL", name)
		}
	}

	archivedAt, ok := cols["archived_at"]
	if !ok {
		t.Fatalf("artifacts missing archived_at (have %v)", keys(cols))
	}
	if archivedAt.notNull {
		t.Error("artifacts.archived_at must be nullable (软删, 蓝图 §2)")
	}

	// 反约束: owner_id MUST NOT exist (立场 ① 归属=channel, 非 author).
	if _, has := cols["owner_id"]; has {
		t.Error("artifacts.owner_id exists — 反约束 broken (立场 ① channel-scoped, no author owner)")
	}
	// 反约束: cursor MUST NOT exist (跟 RT-1 cursor 序列拆死,
	// ArtifactUpdated frame 走 RT-1.1 cursor 不在 schema 层).
	if _, has := cols["cursor"]; has {
		t.Error("artifacts.cursor exists — 反约束 broken (RT-1 envelope cursor, not schema column)")
	}
}

// TestCV11_RejectsNonMarkdownType pins 立场 ④: type CHECK = 'markdown'
// is the v1 gate — 代码/图片/PDF/看板 留 v2+. Insert with any other type
// must reject so the v0/v1 split stays enforced at schema layer.
func TestCV11_RejectsNonMarkdownType(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	insert := func(typ string) error {
		return db.Exec(`INSERT INTO artifacts
			(id, channel_id, type, title, body, current_version, created_at)
			VALUES (?, 'chan-A', ?, 'T', '', 1, 1700000000000)`,
			"art-"+typ, typ).Error
	}

	// markdown allowed
	if err := insert("markdown"); err != nil {
		t.Fatalf("markdown insert rejected: %v", err)
	}
	// non-markdown rejected
	for _, bad := range []string{"code", "image", "pdf", "kanban"} {
		if err := insert(bad); err == nil {
			t.Errorf("type=%q accepted — CHECK ('markdown') missing", bad)
		}
	}
}

// TestCV11_CreatesArtifactVersionsTable pins acceptance §1.1 second-table
// contract: artifact_versions captures committer_kind ('agent','human')
// for 立场 ⑥ system message 路径 + UNIQUE(artifact_id, version) for 立场 ③
// 版本线性.
func TestCV11_CreatesArtifactVersionsTable(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	cols := pragmaColumns(t, db, "artifact_versions")
	if len(cols) == 0 {
		t.Fatal("artifact_versions table not created")
	}
	for _, name := range []string{"artifact_id", "version", "body", "committer_kind", "committer_id", "created_at"} {
		c, ok := cols[name]
		if !ok {
			t.Fatalf("artifact_versions missing %q (have %v)", name, keys(cols))
		}
		if !c.notNull {
			t.Errorf("artifact_versions.%s must be NOT NULL", name)
		}
	}
}

// TestCV11_RejectsInvalidCommitterKind pins 立场 ⑥: committer_kind
// CHECK in ('agent','human'). Drift here breaks the agent-commit fanout
// system message routing.
func TestCV11_RejectsInvalidCommitterKind(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	insert := func(kind string, version int) error {
		return db.Exec(`INSERT INTO artifact_versions
			(artifact_id, version, body, committer_kind, committer_id, created_at)
			VALUES ('art-A', ?, '', ?, 'committer-1', 1700000000000)`,
			version, kind).Error
	}
	if err := insert("agent", 1); err != nil {
		t.Fatalf("agent insert rejected: %v", err)
	}
	if err := insert("human", 2); err != nil {
		t.Fatalf("human insert rejected: %v", err)
	}
	for _, bad := range []string{"admin", "system", "bot", ""} {
		if err := insert(bad, 99); err == nil {
			t.Errorf("committer_kind=%q accepted — CHECK ('agent','human') missing", bad)
		}
	}
}

// TestCV11_RejectsDuplicateArtifactVersion pins 立场 ③ 版本线性:
// UNIQUE(artifact_id, version) enforces strictly increasing version per
// artifact. CV-1.2 commit 路径必须 transactional bump current_version
// + insert new artifact_versions row; dup → reject.
func TestCV11_RejectsDuplicateArtifactVersion(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	insert := func(version int) error {
		return db.Exec(`INSERT INTO artifact_versions
			(artifact_id, version, body, committer_kind, committer_id, created_at)
			VALUES ('art-A', ?, '', 'human', 'user-1', 1700000000000)`,
			version).Error
	}
	if err := insert(1); err != nil {
		t.Fatalf("first version: %v", err)
	}
	if err := insert(2); err != nil {
		t.Fatalf("second version: %v", err)
	}
	if err := insert(2); err == nil {
		t.Fatal("duplicate (artifact_id, version) accepted — UNIQUE constraint missing")
	}
	// Different artifact, same version is legal.
	other := db.Exec(`INSERT INTO artifact_versions
		(artifact_id, version, body, committer_kind, committer_id, created_at)
		VALUES ('art-B', 1, '', 'human', 'user-1', 1700000000000)`).Error
	if other != nil {
		t.Fatalf("cross-artifact same version rejected: %v", other)
	}
}

// TestCV11_HasIndexes pins acceptance §1.1 — channel-scoped list +
// version sidebar lookup require both indexes.
func TestCV11_HasIndexes(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)

	for _, idx := range []string{
		"idx_artifacts_channel_id",
		"idx_artifact_versions_artifact_id",
	} {
		var name string
		err := db.Raw(`SELECT name FROM sqlite_master
			WHERE type='index' AND name=?`, idx).Scan(&name).Error
		if err != nil || name != idx {
			t.Errorf("missing index %s (got %q, err=%v)", idx, name, err)
		}
	}
}

// TestCV11_Idempotent pins forward-only safety: re-running v=13 is no-op.
func TestCV11_Idempotent(t *testing.T) {
	db := openMem(t)
	runCV11(t, db)
	e := New(db)
	e.Register(cv11Artifacts)
	if err := e.Run(0); err != nil {
		t.Fatalf("re-run cv_1_1: %v", err)
	}
}

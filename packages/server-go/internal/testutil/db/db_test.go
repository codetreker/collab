package db

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenReturnsUsableHandle(t *testing.T) {
	d := Open(t)
	if err := d.Exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)").Error; err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := d.Exec("INSERT INTO t (name) VALUES (?)", "alice").Error; err != nil {
		t.Fatalf("insert: %v", err)
	}
	var name string
	row := d.Raw("SELECT name FROM t WHERE id = 1").Row()
	if err := row.Scan(&name); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if name != "alice" {
		t.Fatalf("got %q want alice", name)
	}
}

func TestOpenIsolatesParallelTests(t *testing.T) {
	// Two databases opened in the same test process must not see each
	// other's tables — proves nonce + cache=shared scoping works.
	d1 := Open(t)
	d2 := Open(t)
	if err := d1.Exec("CREATE TABLE only_in_d1 (id INTEGER)").Error; err != nil {
		t.Fatalf("d1 create: %v", err)
	}
	err := d2.Exec("SELECT 1 FROM only_in_d1").Error
	if err == nil {
		t.Fatal("expected error querying only_in_d1 from d2; saw nil")
	}
}

func TestForeignKeysOn(t *testing.T) {
	d := Open(t)
	if err := d.Exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY)`).Error; err != nil {
		t.Fatalf("parent: %v", err)
	}
	if err := d.Exec(`CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id))`).Error; err != nil {
		t.Fatalf("child: %v", err)
	}
	err := d.Exec(`INSERT INTO child (pid) VALUES (999)`).Error
	if err == nil {
		t.Fatal("expected FK violation; pragma foreign_keys=ON not honoured")
	}
}

func TestSeedExecutesFixtureFile(t *testing.T) {
	d := Open(t)
	if err := d.Exec("CREATE TABLE u (id INTEGER PRIMARY KEY, name TEXT)").Error; err != nil {
		t.Fatalf("schema: %v", err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "seed.sql")
	body := `-- comment line
INSERT INTO u (id, name) VALUES (1, 'alice');
-- another comment
INSERT INTO u (id, name) VALUES (2, 'bob');
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	Seed(t, d, path)
	var n int64
	if err := d.Raw("SELECT COUNT(*) FROM u").Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("got %d rows, want 2", n)
	}
}

func TestSeedRejectsBadStatement(t *testing.T) {
	d := Open(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.sql")
	if err := os.WriteFile(path, []byte("NOT VALID SQL;"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	// Use a sub-test with a fake testing.TB so we can capture the Fatalf.
	tt := &fakeT{}
	defer func() { _ = recover() }()
	Seed(tt, d, path)
	if !tt.failed {
		t.Fatal("expected Seed to fail on invalid SQL")
	}
}

func TestSeedMissingFile(t *testing.T) {
	d := Open(t)
	tt := &fakeT{}
	defer func() { _ = recover() }()
	Seed(tt, d, "does/not/exist.sql")
	if !tt.failed {
		t.Fatal("expected Seed to fail on missing file")
	}
}

func TestOpenSeededEndToEnd(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fixture.sql")
	body := `CREATE TABLE marker (n INTEGER);
INSERT INTO marker (n) VALUES (42);
`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}
	d := OpenSeeded(t, path)
	var n int64
	if err := d.Raw("SELECT n FROM marker").Row().Scan(&n); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if n != 42 {
		t.Fatalf("got %d, want 42", n)
	}
}

func TestSplitSQLStripsCommentsAndEmpties(t *testing.T) {
	got := splitSQL(`-- top comment
SELECT 1;

-- another
SELECT 2;
`)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %v", len(got), got)
	}
	if got[0] != "SELECT 1" || got[1] != "SELECT 2" {
		t.Fatalf("unexpected split: %v", got)
	}
}

// fakeT stubs testing.TB so we can probe Fatalf paths without aborting the
// real test. Only methods we need are wired; the rest panic so misuse is
// caught loudly.
type fakeT struct {
	testing.TB
	failed bool
}

func (f *fakeT) Helper()                                {}
func (f *fakeT) Fatalf(format string, args ...any)      { f.failed = true; panic("fakeT.Fatalf") }
func (f *fakeT) Errorf(format string, args ...any)      { f.failed = true }
func (f *fakeT) Cleanup(fn func())                      {}
func (f *fakeT) Logf(format string, args ...any)        {}

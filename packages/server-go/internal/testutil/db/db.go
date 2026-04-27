// Package db provides test-only helpers for spinning up an isolated, in-memory
// sqlite database via GORM and seeding it with fixture SQL.
//
// INFRA-1b.2 — see docs/current/server/testing.md (testutil/db section).
//
// The two main entry points:
//
//   - Open(t)            : returns a fresh *gorm.DB on a unique in-memory DSN
//                          and registers t.Cleanup to close the handle.
//   - Seed(t, db, paths) : executes one or more fixture .sql files against db.
//
// Each test gets a separate database (DSN includes a per-test nonce) so tests
// can run in parallel without cross-contamination. The package intentionally
// has no production dependency beyond the gorm driver: it is only imported
// from *_test.go.
//
// Migration integration: callers wishing to apply the schema_migrations engine
// before seeding should call `migrations.Default(db).Run(0)` themselves. We
// deliberately do not import the migrations package here so this helper stays
// usable from any *_test.go regardless of merge order.
package db

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open returns a brand-new in-memory sqlite *gorm.DB scoped to t. The handle
// is closed automatically via t.Cleanup. The DSN uses sqlite shared-cache mode
// with a unique name so concurrent tests don't share state.
//
// Pragmas mirror the production Open path (foreign_keys=ON, busy_timeout=5000)
// minus journal_mode=WAL — WAL is meaningless for `:memory:` and would emit a
// warning under sqlite.
func Open(t testing.TB) *gorm.DB {
	t.Helper()
	nonce := randomNonce()
	dsn := fmt.Sprintf("file:testdb_%s?mode=memory&cache=shared", nonce)
	gdb, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("testutil/db.Open: gorm.Open: %v", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Fatalf("testutil/db.Open: db handle: %v", err)
	}
	// Single connection so the shared in-memory DB isn't lost between txns.
	sqlDB.SetMaxOpenConns(1)
	for _, pragma := range []string{
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	} {
		if _, err := sqlDB.Exec(pragma); err != nil {
			t.Fatalf("testutil/db.Open: pragma %q: %v", pragma, err)
		}
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return gdb
}

// Seed reads each path as raw SQL and executes the contents against db.
// Statements are split on `;` followed by newline; lines starting with `--`
// are stripped. Empty fragments are ignored. This is good enough for fixture
// data; do NOT use it for production migrations.
//
// Paths are resolved relative to the test's working directory. Convention is
// `internal/<pkg>/testdata/<milestone>/seed.sql`.
func Seed(t testing.TB, db *gorm.DB, paths ...string) {
	t.Helper()
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("testutil/db.Seed: read %s: %v", p, err)
		}
		stmts := splitSQL(string(raw))
		for i, stmt := range stmts {
			if err := db.Exec(stmt).Error; err != nil {
				t.Fatalf("testutil/db.Seed: %s stmt %d: %v\n--- sql ---\n%s",
					p, i, err, stmt)
			}
		}
	}
}

// OpenSeeded combines Open + Seed for the common case. Callers that want
// migrations applied first should run them between Open and Seed.
func OpenSeeded(t testing.TB, paths ...string) *gorm.DB {
	t.Helper()
	d := Open(t)
	Seed(t, d, paths...)
	return d
}

// splitSQL is a deliberately tiny parser: strip `--` line comments, split on
// `;`. Good enough for hand-authored fixture files. If a fixture needs
// semicolons inside string literals, switch to multi-Exec or a real parser.
func splitSQL(raw string) []string {
	var b strings.Builder
	for _, line := range strings.Split(raw, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "--") || trim == "" {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	parts := strings.Split(b.String(), ";")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		s := strings.TrimSpace(p)
		if s == "" {
			continue
		}
		out = append(out, s)
	}
	return out
}

func randomNonce() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		// Extremely unlikely; fall back to a constant — tests still get
		// isolation via t.Cleanup closing the conn.
		return "fallback"
	}
	return hex.EncodeToString(buf[:])
}

// hub_presence_grep_test.go — reverse-grep guard for AL-3.2 §301 spec
// "internal/ws/ does NOT directly query presence_sessions" reverse
// constraint. The hub goes through the PresenceWriter / PresenceTracker
// interfaces; any raw SQL string containing `presence_sessions` here
// is a layering violation (the table is a presence-package private).
//
// This test scans the package's own .go files (excluding _test.go and
// excluding comment-only mentions) for the table name in a string
// literal context. It's an AST walk so docstrings don't trip it.
package ws

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPresenceLifecycle_NoDirectTableRead(t *testing.T) {
	t.Parallel()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	fset := token.NewFileSet()
	hits := []string{}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		// Parse without comments so docstring mentions of the table
		// name (which are intentional, not code) don't trip the check.
		af, err := parser.ParseFile(fset, f, src, parser.SkipObjectResolution)
		if err != nil {
			t.Fatalf("parse %s: %v", f, err)
		}
		ast.Inspect(af, func(n ast.Node) bool {
			lit, ok := n.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			if strings.Contains(lit.Value, "presence_sessions") {
				hits = append(hits, f+":"+fset.Position(lit.Pos()).String())
			}
			return true
		})
	}
	if len(hits) > 0 {
		t.Fatalf("internal/ws/ must NOT contain raw SQL referring to presence_sessions; hits: %v\n"+
			"AL-3.2 §301 反约束: hub talks to presence package via PresenceWriter / PresenceTracker, not raw SQL.", hits)
	}
}

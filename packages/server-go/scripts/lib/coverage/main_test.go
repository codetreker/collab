package main

import (
	"strings"
	"testing"
)

func TestParseCoverFunc(t *testing.T) {
	input := strings.NewReader(`collab-server/internal/api/auth.go:35: handleLogin 75.0%
collab-server/internal/store/queries.go:12: ListUsers 100.0%
total: (statements) 88.4%
`)

	funcs, total, err := parseCoverFunc(input)
	if err != nil {
		t.Fatalf("parseCoverFunc: %v", err)
	}
	if total != 88.4 {
		t.Fatalf("total: got %.1f", total)
	}
	if len(funcs) != 2 {
		t.Fatalf("func count: got %d", len(funcs))
	}
	if !funcs[0].Critical {
		t.Fatalf("expected %s to be critical", funcs[0].Name)
	}
	if funcs[1].Percent != 100 {
		t.Fatalf("coverage: got %.1f", funcs[1].Percent)
	}
}

func TestCoverageHelpers(t *testing.T) {
	if pct, ok := parsePercent("82.5%"); !ok || pct != 82.5 {
		t.Fatalf("parsePercent: got %.1f %v", pct, ok)
	}
	if _, ok := parsePercent("bad"); ok {
		t.Fatal("expected invalid percent")
	}
	if !isCritical("collab-server/internal/api/messages.go:1:", "handleListMessages") {
		t.Fatal("expected API handler to be critical")
	}
	if isCritical("collab-server/internal/model/model.go:1:", "PlainValue") {
		t.Fatal("did not expect model value to be critical")
	}
}

func TestInputReader(t *testing.T) {
	reader, closeFn, err := inputReader("-")
	if err != nil {
		t.Fatalf("inputReader stdin: %v", err)
	}
	closeFn()
	if reader == nil {
		t.Fatal("expected stdin reader")
	}

	_, closeFn, err = inputReader(t.TempDir() + "/missing")
	closeFn()
	if err == nil {
		t.Fatal("expected missing file error")
	}
}
